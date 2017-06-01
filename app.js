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
	'Cookie': 'd_c0="AECCiYo-mwuPTnQDgIa-8ELL559tEVuU1OI=|1492176829"; _zap=a66fa8f4-11c6-4fbf-a20a-82f948797854; aliyungf_tc=AQAAAKmQhWog4AoACo/2OjNYm3Px9rNL; acw_tc=AQAAADLmqksFmwsACo/2OjDogzUWpCRI; q_c1=0c5d679fd4774202aa9bf49d1bb68a83|1494990311000|1492176828000; _xsrf=8b8c45899e02c469e63f885bd6a5335a; r_cap_id="YTg1MTllYjViYzFlNDVkNmE3MDI1YTJjOTBiOTk0M2U=|1496281083|48bd0f143745dddacc1e2cb81d02b35a98d72d63"; cap_id="YzI4Mzc4YjU0YjZhNDkxOWI2YThiNDM4ZWVmYWFhZDg=|1496281083|529dddcc5f659c2bcfe461ad834408df0611decb"; __utma=51854390.1142255077.1495705467.1495705467.1496279871.2; __utmb=51854390.0.10.1496279871; __utmc=51854390; __utmz=51854390.1496279871.2.2.utmcsr=zhihu.com|utmccn=(referral)|utmcmd=referral|utmcct=/; __utmv=51854390.000--|2=registration_date=20170302=1^3=entry_date=20170414=1; z_c0=Mi4wQUdDQ2ZoMDlZd3NBUUlLSmlqNmJDeGNBQUFCaEFsVk5IUDFXV1FDOHlxTXprREVkV2syLXdlWFBBYTRLNGdXcGdB|1496281135|a8ef1312962ba56081bb32036994cf1a680d3bf6',
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
				console.log(res);
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
								setTimeout(function(){
									updateUserInformation(++userIndex);
								}, 60000);
							}
							con.release();
						});
					}else{
						setTimeout(function(){
							updateUserInformation(++userIndex);
						}, 60000);
					}
				}catch(e){
					setTimeout(function(){
						updateUserInformation(++userIndex);
					}, 60000);
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
			page: pageNum,
			where: {
				updateTime: 'CURRENT_TIMESTAMP'
			}
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


