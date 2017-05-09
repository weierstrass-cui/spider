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
	'Cookie': 'd_c0="AFCCBi1UcAuPThtP58EDcMJVndvHGcAaDB8=|1489296819"; _zap=2ed101dd-f0cf-4cb4-b4db-10128cf76ca9; aliyungf_tc=AQAAAAoLrGiLVg4ACo/2OoxL/bIQuOzz; acw_tc=AQAAAKPdQluGHwEACo/2OgeArc5NPR3D; q_c1=8911399a93ee4a99b0ab2e8bddda1784|1494297341000|1489296819000; _xsrf=b7fa0cc816cd0accf5d68494e93df381; r_cap_id="MTAwNzI3NmY5ZGEwNDNjM2JiNTNmYjZkMGUzMDVkZjU=|1494297341|fed0eb0f35726182f8da85804a2afebbc9499950"; cap_id="MWMwODQwNTNmODljNGIwOWIzNzk3M2I3ZjlhZDc0ZGI=|1494297341|4f464e0886085a58951d8c4628f60ce9c537fe91"; l_n_c=1; z_c0=Mi4wQUdDQ2ZoMDlZd3NBVUlJR0xWUndDeGNBQUFCaEFsVk5EYmc0V1FBMTRBblVBZ2lqX3ZGWEdhcF9fVl9aSlF2c1NR|1494297376|95eb73709eb7ccc3ddba1332ed25b5ddfb448889; __utma=51854390.1673115600.1491829411.1491829411.1494297397.2; __utmb=51854390.0.10.1494297397; __utmc=51854390; __utmz=51854390.1491829411.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmv=51854390.110--|2=registration_date=20170302=1^3=entry_date=20170302=1',
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
		var location = '0' == $('span.location').length ? '' : $('span.location').text();
		var education = '0' == $('span.education').length ? '' : $('span.education').attr('title');
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
			education: education,
			answers: answers,
			followerList: '0' == followerList.length ? null : followerList,
			asksList: '0' == asksList.length ? null : asksList
		}
	}catch(e){
		cosole.log(e);
		return null;
	}
}

var getFollowers = function(body){
	try{
		var $ = cheerio.load(body), followerList = [],
			followerQuery = $('a.zm-item-link-avatar');
		if( followerQuery.length ){
			followerQuery.each(function(){
				followerList.push({
					nickname: $(this).attr('title'),
					uid: $(this).attr('href').split('/')[2],
					followed: 0
				});
			});
		}
		return followerList;
	}catch(e){
		cosole.log(e);
		return null;
	}
}

var updateUser = function(){
	var userList = null, totalPage = 0, currentPage = 1, followerList = null;
	var insertNewUser = function(userIndex, parentIndex){
		if( followerList && followerList[userIndex] ){
			var newUser = followerList[userIndex];
			var con = new connection(dbOption);
			con.count('sp_user', {
				where: {
					uid: newUser.uid
				}
			}, function(countRes){
				if( countRes && countRes.data && countRes.data.totalRows == 0 ){
					con.insert('sp_user', {
						nickname: newUser.nickname,
						uid: newUser.uid,
						followed: newUser.followed
					}, function(insertRresult){
						insertNewUser(++userIndex, parentIndex);
						con.release();
					});
				}else{
					insertNewUser(++userIndex, parentIndex);
					con.release();
				}
			});
		}else{
			updateUserInformation(parentIndex);
		}
	}
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
								education: user.education,
								asks: user.asks,
								answers: user.answers,
								updateTime: dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss')
							}
						}, function(updateRes){
							var followers = getFollowers(res);
							if( followers && followers.length ){
								followerList = followers;
								insertNewUser(0, ++userIndex);
							}else{
								updateUserInformation(++userIndex);
							}
							con.release();
						});
					}else{
						updateUserInformation(++userIndex);
					}
				}catch(e){
					updateUserInformation(++userIndex);
				}
			});
		}else{
			if( currentPage < totalPage ){
				getUserList(++currentPage);
			}else{
				console.log('Finish update.');
				return;
			}
		}
	}
	var getUserList = function(pageNum){
		var con = new connection(dbOption);
		con.find('sp_user', {
			colums: ['uid', 'updateTime'],
			page: pageNum
		}, function(findRes){
			totalPage = findRes.data.totalPages;
			if( findRes && findRes.data && findRes.data && findRes.data.rows.length ){
				userList = findRes.data.rows;
				console.log('Current page number: ' + currentPage + '/' + totalPage);
				console.log('Total: ' + userList.length + ' users in query.');
				console.log('*************************************');
				updateUserInformation(0);
			}
			con.release();
		});
	}
	getUserList(currentPage);
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

updateUser();

// updateUserQuestion();


