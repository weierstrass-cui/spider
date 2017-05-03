'use strict'

var request = require('request'),
	cheerio = require('cheerio'),
	connection = require('./sql.js'),
	configs = require('./config.js');
var userPool = {}, searchLevel = configs.searchLevel,
	dbOption = configs.dbOption;

var headers = {
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
	'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1',
    'Cookie': 'q_c1=8911399a93ee4a99b0ab2e8bddda1784|1489296819000|1489296819000; nweb_qa=heifetz; d_c0="AFCCBi1UcAuPThtP58EDcMJVndvHGcAaDB8=|1489296819"; _zap=2ed101dd-f0cf-4cb4-b4db-10128cf76ca9; _xsrf=19e2dceb4d8653a14e50a6874ff72cef; aliyungf_tc=AQAAAOGhBDh6XwQA3IHtdHBIeRs7VCRM; r_cap_id="NDY4YTFmMjU0YjkzNGU3ZDhiNzc3MDMwZGNmOTBjMTg=|1491618474|ba4d3ab7442db050eb64f027c44f6410973cbff4"; cap_id="Mzk4YzQwMTNjYjBkNGU5Mzg2NWI0NTE0Y2E0ODY5YTg=|1491618474|e294e35d65f23e76f5cf295f074cbdeddf23914b"; l_n_c=1; z_c0=Mi4wQUdDQ2ZoMDlZd3NBVUlJR0xWUndDeGNBQUFCaEFsVk51dGNQV1FDSkZEcll3OUJQck4xSHd2Z3pVMFdDXzlpUnF3|1491618636|7e42bf8ed0c4e69a46b586f0008ca87918511902; __utma=51854390.255859250.1489296825.1489748801.1491618319.4; __utmb=51854390.0.10.1491618319; __utmc=51854390; __utmz=51854390.1489296825.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmv=51854390.100--|2=registration_date=20170302=1^3=entry_date=20170302=1',
    'Connection': 'keep-alive'
}

var dateFormat = function(date){
	var addZero = function( num ){
		return num > 9 ? num : ('0' + num);
	}

	var dateString = date.getFullYear() + '-';
		dateString += addZero(date.getMonth() + 1) + '-';
		dateString += addZero(date.getDate()) + ' ';
		dateString += addZero(date.getHours()) + ':';
		dateString += addZero(date.getMinutes()) + ':';
		dateString += addZero(date.getSeconds()) + '';
	return dateString;
}

var getPage = function(url, callback){
	request({
		url: url,
		headers: headers
	}, function(error, response, body){
		if(error){
			console.log(error);
			setTimeout(function(){
				getPage(url, callback);
			}, 3000);
			return false;
		}
		typeof callback === 'function' && callback(body);
	});
}

var getUser = function(userName, level){
	if( level > searchLevel ){
		return false;
	}
	var thisLevel = level + 1;
	getPage('https://www.zhihu.com/people/' + userName + '/following', function(res){
		var $ = cheerio.load(res), rawString = $('#data').attr('data-state');
		if( rawString ){
			var rawData = JSON.parse(rawString);
			var userList = rawData.entities.users;
			for(var i in userList){
				if( userPool[i] ){
					continue;
				}
				userPool[i] = {
					nickname: userList[i].name,
					uid: i
				};
				(function(index){
					var con = new connection(dbOption);
					con.count('sp_user', {
						where: {
							uid: index
						}
					}, function(countRes){
						if( countRes && countRes.data && countRes.data.totalRows > 0 ){
							con.update('sp_user', {
								where: {
									uid: index
								},
								values: {
									nickname: userList[index].name,
									sex: userList[index].gender,
									followed: userList[index].followerCount
								}
							}, function(updateRes){
								getUser(index, thisLevel);
								con.release();
							});
						}else{
							con.insert('sp_user', {
								nickname: userList[index].name,
								uid: index,
								sex: userList[index].gender,
								followed: userList[index].followerCount
							}, function(insertRresult){
								if( insertRresult && insertRresult.data && insertRresult.data.rows ){
									getUser(index, thisLevel);
								}
								con.release();
							});
						}
					});
				})(i);
			}
		}
	});
}

var getUserInformation = function(body){
	try{
		var $ = cheerio.load(body),
			user = $('a.name'),
			followerList = $('.zm-item-link-avatar'),
			questionLink = $('.zm-profile-section-main');

		var userName = user.text(),
			userId = user.attr('href').split('/')[2],
			gender = $('span.gender'), sex = -1;
		if( gender.find('.icon-profile-male').length ){
			sex = 1;
		}else if( gender.find('.icon-profile-female').length ){
			sex = 0;
		}
		var location = $('span.location').length ? $('span.location').text() : '';
		var followerCount = $('.zm-profile-side-following').find('a').eq(1).find('strong').text();
		var profile = $('.profile-navbar'),
			asks = profile.find('a').eq(1).find('span').text() || 0,
			answers = profile.find('a').eq(2).find('span').text() || 0;
		var asksList = [];
		if( questionLink.length ){
			questionLink.each(function(){
				var question = $(this).find('.question_link');
				asksList.push({
					id: question.attr('href').split('/')[2],
					title: question.text(),
					answerCount: $(this).find('.zg-bull').eq(0),
					followerCount: $(this).find('.zg-bull').eq(1)
				});
			});
		}
		return {
			nickname: userName,
			uid: userId,
			sex: sex,
			followed: followerCount,
			asks: asks,
			location: location,
			answers: answers,
			followerList: '0' == followerList.length ? null : followerList,
			asksList: '0' == asksList.length ? null : asksList
		}
	}catch(e){
		cosole.log(e);
		return null;
	}
}

var updateUser = function(){
	var userList = null;
	var updateUserInformation = function(userIndex){
		if( userList && userList[userIndex] ){
			var uid = userList[userIndex].uid;
			getPage('https://www.zhihu.com/people/' + uid + '/followers', function(res){
				try{
					var user = getUserInformation(res);
					if( user ){
						var con = new connection(dbOption);
						con.update('sp_user', {
							where: {
								uid: uid
							},
							values: {
								nickname: user.nickname,
								sex: user.sex,
								followed: user.followed,
								location: user.location,
								asks: user.asks,
								answers: user.answers,
								updateTime: dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss')
							}
						}, function(updateRes){
							updateUserInformation(++userIndex);
							con.release();
						});
					}else{
						updateUserInformation(++userIndex);
					}
				}catch(e){
					updateUserInformation(++userIndex);
				}
			});
		}
	}
	var con = new connection(dbOption);
	con.find('sp_user', {
		colums: ['uid', 'updateTime'],
		order: {
			id: 'desc'
		}
	}, function(findRes){
		if( findRes && findRes.data && findRes.data && findRes.data.rows.length ){
			userList = findRes.data.rows;
			updateUserInformation(0);
		}
		con.release();
	});
}

var updateUserQuestion = function(){
	var userList = null;
	var getQuestion = function(userIndex){
		if( userList && userList[userIndex] ){
			var uid = userList[userIndex].uid;
			if( userList[userIndex].asks > 0 ){
				getPage('https://www.zhihu.com/people/' + uid + '/asks', function(res){
					try{
						var user = getUserInformation(res);
						if( user ){
							var con = new connection(dbOption);
							con.update('sp_user', {
								where: {
									uid: uid
								},
								values: {
									nickname: user.nickname,
									sex: user.sex,
									followed: user.followed,
									asks: user.asks,
									answers: user.answers,
									updateTime: dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss')
								}
							}, function(updateRes){
								if( user.asksList ){
									for(var i in user.asksList ){
										(function(data){
											
										})(user.asksList[i]);
									}
								}
								// updateUserInformation(++userIndex);
								// con.release();
							});
						}
					}catch(e){
						console.log(e);
					}
					var $ = cheerio.load(res), rawString = $('#data').attr('data-state');
					if( rawString ){
						var rawData = JSON.parse(rawString);
						var questionList = rawData.entities.questions;
						for(var i in questionList){
							(function(index, data){
								var con = new connection(dbOption);
								con.count('sp_questions', {
									where: {
										qid: index
									}
								}, function(countRes){
									if( countRes && countRes.data && countRes.data.totalRows > 0 ){
										con.update('sp_questions', {
											where: {
												qid: index
											},
											values: {
												answerCount: data.answerCount,
												followerCount: data.followerCount,
												createTime: data.created,
												updateTime: data.updatedTime
											}
										}, function(){
											con.release();
										});
									}else{
										con.insert('sp_questions', {
											qid: index,
											uid: uid,
											title: data.title.replace(/"/g, '\''),
											answerCount: data.answerCount,
											followerCount: data.followerCount,
											createTime: data.created,
											updateTime: data.updatedTime
										}, function(insertRresult){
											con.release();
										});
									}
								});
							})(i, questionList[i]);
						}
					}
					getQuestion(++userIndex);
				});
			}
			
		}
	}

	var con = new connection(dbOption);
	con.find('sp_user', {
		colums: ['uid', 'asks']
	}, function(findRes){
		if( findRes && findRes.data && findRes.data.rows.length ){
			userList = findRes.data.rows;
			getQuestion(0);
		}
		con.release();
	});
}

// getUser('yu-fu-80', 0);

updateUser();

// updateUserQuestion();


