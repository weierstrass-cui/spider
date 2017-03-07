var request = require('request'),
	cheerio = require('cheerio'),
	connection = require('./sql.js'),
	configs = require('./config.js');
var userPool = [], searchLevel = configs.searchLevel,
	dbOption = configs.dbOption;

var getPage = function(url, callback){
	request({
		url: url,
		headers: {
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36',
		    'Cookie': 'aliyungf_tc=AQAAAO3w5yrSFAkAFY32OpDAwyD4qK8L; q_c1=e642a472472642b0ab7e21635b7b62d5|1488419552000|1488419552000; _xsrf=12e47601701d59ebae024b94963bfdae; cap_id="ZjFiNGRjMzNlZGM3NDg1YThiZWVlOWJkNTc3MjAwMmE=|1488419552|ddd75fbfbda48edde377357f51c3aa5017c0bbc6"; l_cap_id="NTJkMWU1NjFjYTJhNGUyMzk5MjAyMzk0YmRjMGZlNGY=|1488419552|83196e4c2805491dda8e52dd4132b89fbbb989cd"; d_c0="AFBCFa5BYwuPTrV_ZYPiaLlFadsM7DDFOhA=|1488419556"; _zap=ee852a44-121d-4399-aaa3-53438bc2102c; __utmt=1; login="ZjFkMDA2MGVkMWFlNDVjM2IxZDdmZDQzNGNjMWU1MmY=|1488419564|777793b49ad4558c26f3d19bf1ce1cb8b431f1f4"; nweb_qa=heifetz; z_c0=Mi4wQUdDQ2ZoMDlZd3NBVUVJVnJrRmpDeGNBQUFCaEFsVk43QWZmV0FCNm92RDBPT2YzZ21WYTgweHYtRUp5QXg0X1BB|1488419583|b88d4cdc33a8acfcb13d99b1d27611248dd7853b; __utma=51854390.744340117.1488419562.1488419562.1488419562.1; __utmb=51854390.6.10.1488419562; __utmc=51854390; __utmz=51854390.1488419562.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __utmv=51854390.100--|2=registration_date=20170302=1^3=entry_date=20170302=1',
		    'Connection': 'keep-alive'
		}
	}, function(error, response, body){
		if(error){
			console.log(error);
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
				var isExist = false;
				for(var j in userPool){
					if( i === userPool[j].url ){
						isExist = true;
						break;
					}
				}
				if( isExist ){
					continue;
				}
				(function(index){
					var con = new connection(dbOption, 'sp_user');
					con.where({
						uid: index
					}).find(null, null, function(findRes){
						if( findRes.rows.length ){
							con.release();
						}else{
							con.insert({
								nickname: userList[index].name,
								uid: index,
								sex: userList[index].gender
							}, function(insertRes){
								if( insertRes.rows ){
									getUser(index, thisLevel);
									userPool.push({
										name: userList[index].name,
										url: index
									});
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


getUser('cui-xiao-piao-66', 0);
