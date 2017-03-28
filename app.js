'use strict'

var request = require('request'),
	cheerio = require('cheerio'),
	connection = require('./sql.js'),
	configs = require('./config.js');
var userPool = {}, searchLevel = configs.searchLevel,
	dbOption = configs.dbOption;

var headers = {
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36',
    'Cookie': 'aliyungf_tc=AQAAAO3w5yrSFAkAFY32OpDAwyD4qK8L; q_c1=e642a472472642b0ab7e21635b7b62d5|1488419552000|1488419552000; _xsrf=12e47601701d59ebae024b94963bfdae; cap_id="ZjFiNGRjMzNlZGM3NDg1YThiZWVlOWJkNTc3MjAwMmE=|1488419552|ddd75fbfbda48edde377357f51c3aa5017c0bbc6"; l_cap_id="NTJkMWU1NjFjYTJhNGUyMzk5MjAyMzk0YmRjMGZlNGY=|1488419552|83196e4c2805491dda8e52dd4132b89fbbb989cd"; d_c0="AFBCFa5BYwuPTrV_ZYPiaLlFadsM7DDFOhA=|1488419556"; _zap=ee852a44-121d-4399-aaa3-53438bc2102c; __utmt=1; login="ZjFkMDA2MGVkMWFlNDVjM2IxZDdmZDQzNGNjMWU1MmY=|1488419564|777793b49ad4558c26f3d19bf1ce1cb8b431f1f4"; nweb_qa=heifetz; z_c0=Mi4wQUdDQ2ZoMDlZd3NBVUVJVnJrRmpDeGNBQUFCaEFsVk43QWZmV0FCNm92RDBPT2YzZ21WYTgweHYtRUp5QXg0X1BB|1488419583|b88d4cdc33a8acfcb13d99b1d27611248dd7853b; __utma=51854390.744340117.1488419562.1488419562.1488419562.1; __utmb=51854390.6.10.1488419562; __utmc=51854390; __utmz=51854390.1488419562.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmv=51854390.100--|2=registration_date=20170302=1^3=entry_date=20170302=1',
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
var updateUser = function(){
	var userList = null;
	var updateUserInformation = function(userIndex){
		if( userList && userList[userIndex] ){
			var uid = userList[userIndex].uid;
			getPage('https://www.zhihu.com/people/' + uid + '/following', function(res){
				var $ = cheerio.load(res), rawString = $('#data').attr('data-state');
				if( rawString ){
					var rawData = JSON.parse(rawString);
					var users = rawData.entities.users;
					if( users && users[uid] ){
						var con = new connection(dbOption);
						con.update('sp_user', {
							where: {
								uid: uid
							},
							values: {
								sex: users[uid].gender,
								followed: users[uid].followerCount,
								updateTime: dateFormat(new Date(), 'yyyy-MM-dd hh:mm:ss')
							}
						}, function(updateRes){
							updateUserInformation(++userIndex);
							con.release();
						});
					}else{
						updateUserInformation(++userIndex);
					}
				}
			});
		}
	}
	var con = new connection(dbOption);
	con.find('sp_user', {
		where: {
			followed: '0'
		},
		order: {
			id: 'desc'
		},
		colums: ['uid', 'updateTime']
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
			getPage('https://www.zhihu.com/people/' + uid + '/asks', function(res){
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

	var con = new connection(dbOption);
	con.find('sp_user', {
		colums: ['uid']
	}, function(findRes){
		if( findRes && findRes.data && findRes.data.rows.length ){
			userList = findRes.data.rows;
			getQuestion(0);
		}
		con.release();
	});
}

// getUser('an-rui-dong-98', 0);

updateUser();

// updateUserQuestion();


