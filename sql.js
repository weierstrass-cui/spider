'use strict'

var mysql = require('mysql');
var log4nql = function(logType, logMsg, callback){
	switch( logType ){
		case 'info':
			typeof callback === 'function' && callback({'code': '100', msg: 'success', data: logMsg});
			break;
		case 'error':
			console.log(logType + ': ' + logMsg);
			typeof callback === 'function' && callback({'code': '101', 'msg': logMsg});
			break;
	}
}

var SqlClass = function(options){
	if( !options || typeof options !== 'object' ){
		log4nql('error', 'NO DB INFORMATION');
		return false;
	}

	this.limitNum = options.limit || 20;

	this.connection = mysql.createConnection({
		host: options.host,
		user: options.user,
		port: options.port || '3306',
		password: options.password,
		database: options.database
	});
}
SqlClass.prototype.release = function(){
	this.connection.end();
}
SqlClass.prototype.buildNql = function(options){
	var limitNum = this.limitNum, columString = '*', whereString = '', groupString = '', orderString = '', startNum = 0,
		whereArray = ['1 = 1'];
	try{
		if( options ){
			if( options.colums && 'object' === typeof options.colums ){
				if( options.colums.constructor === Array && options.colums.length ){
					columString = options.colums.join(', ');
				}else if( options.colums.constructor === Object ){
					var columArray = [];
					for( var i in options.colums ){
						columArray.push( i + ' as ' + options.colums[i] );
					}
					columString = columArray.join(', ');
				}
			}

			if( options.where && options.where.constructor === Object ){
				var getWhereQuery = function(optObjs){
					var whereQuery = [];
					for(var key in optObjs ){
						switch( key ){
							case 'isEquals':
								for(var isEqualsKey in optObjs[key]){
									whereQuery.push(isEqualsKey + ' = "' + optObjs[key][isEqualsKey] + '"');
								}
								break;
							case 'isNull':
								for(var isNullKey in optObjs[key]){
									whereQuery.push(optObjs[key][isNullKey] + ' is NULL');
								}
								break;
							case 'isGt':
								for(var isGtKey in optObjs[key]){
									whereQuery.push(isGtKey + ' > "' + optObjs[key][isGtKey] + '"');
								}
								break;
							case 'isLt':
								for(var isLtKey in optObjs[key]){
									whereQuery.push(isLtKey + ' < "' + optObjs[key][isLtKey] + '"');
								}
								break;
							default:
								if( optObjs[key] && 'string' === optObjs[key] ){
									whereQuery.push(key + ' = "' + optObjs[key] + '"');
								}
								break;
						}
					}
					return whereQuery;
				}
				for(var whereKey in options.where){
					switch( whereKey ){
						case 'isOr':
								whereArray.push(' ( ' + getWhereQuery(options.where[whereKey]).join(' or ') + ' ) ');
							break;
						case 'isAnd':
								whereArray.push(' ( ' + getWhereQuery(options.where[whereKey]).join(' and ') + ' ) ');
							break;
						default:
							whereArray.push(whereKey + ' = "' + options.where[whereKey] + '"');
							break;
					}
				}
			}

			if( options.group ){
				if( typeof options.group === 'string' ){
					groupString = options.group;
				}else if( options.group.constructor === Array ){
					groupString = options.group.join(', ');
				}
			}

			if( options.order && options.order.constructor === Object ){
				var orderArray = [];
				for( var i in options.order ){
					orderArray.push(i + ' ' + options.order[i]);
				}
				orderString = orderArray.join(', ');
			}
			if( 'number' === typeof options.page && 'number' === typeof limitNum && limitNum > 0 ){
				startNum = (options.page - 1) * limitNum;
			}
		}
		whereString = whereArray.join(' and ');
		return {
			columString: columString,
			whereString: whereString,
			groupString: groupString,
			orderString: orderString,
			startNum: startNum
		}
	}catch(e){
		log4nql('error', e);
	}
}
SqlClass.prototype.insert = function(table){
	var connection = this.connection, callback = null, options = null;
	if( table && 'string' === typeof table ){
		if( arguments[1] ){
			if( 'object' === typeof arguments[1] ){
				options = arguments[1];
				if( arguments[2] && 'function' === typeof arguments[2] ){
					callback = arguments[2];
				}
			}else if( 'function' === typeof arguments[1] ){
				callback = arguments[1];
			}
		}
		
		if( options && 'object' === typeof options ){
			try{
				var colums = [], datas = [];
				for(var i in options){
					colums.push(i);
					datas.push('"' + options[i] + '"');
				}
				var nql = 'insert into ' + table + '(' + colums.join(', ') + ') values (' + datas.join(', ') + ');';
				connection.query(nql, function(insertErr, insertResult){
					if( insertErr ){
						log4nql('error', insertErr, callback);
						return;
					}
					nql = 'select * from ' + table + ' limit ' + (insertResult.insertId - 1) + ', 1';
					connection.query(nql, function(selectErr, selectResult){
						if( selectErr ){
							log4nql('error', selectErr, callback);
							return;
						}
						log4nql('info', selectResult[0], callback);
					});
				});
			}catch(e){
				log4nql('error', e, callback);
			}
		}else{
			log4nql('error', 'INSERT NO VALUES', callback);
		}
	}else{
		log4nql('error', 'INSERT NO TABLE', callback);
	}
	return this;
}
SqlClass.prototype.update = function(table){
	var _this = this, connection = this.connection, callback = null, options = null;
	if( table && 'string' === typeof table ){
		try{
			if( arguments[1] ){
				if( 'object' === typeof arguments[1] ){
					options = arguments[1];
					if( arguments[2] && 'function' === typeof arguments[2] ){
						callback = arguments[2];
					}
				}else if( 'function' === typeof arguments[1] ){
					callback = arguments[1];
				}
			}
			
			if( options.values && 'object' === typeof options.values ){
				var nqlQuery = this.buildNql(options), updateValueArray = [];
				for(var i in options.values){
					updateValueArray.push(i + '= "' + options.values[i] + '"');
				}
				var nql = 'update ' + table + ' set ' + updateValueArray.join(', ') + ' where ' + nqlQuery.whereString;
				connection.query(nql, function(updateErr, updateResult){
					if( updateErr ){
						log4nql('error', updateErr, callback);
						return;
					}
					log4nql('info', {
						changeRows: updateResult.changedRows
					}, callback);
				});
			}else{
				log4nql('error', 'UPDATE NO VALUES', callback);
			}
		}catch(e){
			log4nql('error', e, callback);
		}
	}else{
		log4nql('error', 'FIND NO TABLE', callback);
	}
	return this;
}
SqlClass.prototype.find = function(table){
	var _this = this, limitNum = this.limitNum, connection = this.connection, callback = null, options = null;
	if( table && 'string' === typeof table ){
		try{
			if( arguments[1] ){
				if( 'object' === typeof arguments[1] ){
					options = arguments[1];
					if( arguments[2] && 'function' === typeof arguments[2] ){
						callback = arguments[2];
					}
				}else if( 'function' === typeof arguments[1] ){
					callback = arguments[1];
				}
			}
			
			this.count(table, options || {}, function(countResult){
				if( countResult && countResult.data && countResult.data.totalRows > 0 ){
					var totalRows = countResult.data.totalRows, totalPages = Math.ceil(totalRows / limitNum);
					var nqlQuery = _this.buildNql(options);
					var nql = 'select ' + nqlQuery.columString + ' from ' + table + ' where ' + nqlQuery.whereString;
					if( nqlQuery.groupString ) nql += ' group by ' + nqlQuery.groupString;
					if( nqlQuery.orderString ) nql += ' order by ' + nqlQuery.orderString;
					if( limitNum > 0 ) nql += ' limit ' + nqlQuery.startNum + ', ' + limitNum;

					connection.query(nql, function(selectErr, selectResult){
						if( selectErr ){
							log4nql('error', selectErr, callback);
							return;
						}
						log4nql('info', {
							totalPages: totalPages,
							totalRows: totalRows,
							rows: selectResult
						}, callback);
					});
				}else{
					log4nql('info', {
						totalPages: 0,
						totalRows: 0,
						rows: null
					}, callback);
				}
			});
		}catch(e){
			log4nql('error', e, callback);
		}
	}else{
		log4nql('error', 'FIND NO TABLE', callback);
	}
	return this;
}
SqlClass.prototype.count = function(table){
	var connection = this.connection, callback = null, options = null;
	if( table && 'string' === typeof table ){
		try{
			if( arguments[1] ){
				if( 'object' === typeof arguments[1] ){
					options = arguments[1];
					if( arguments[2] && 'function' === typeof arguments[2] ){
						callback = arguments[2];
					}
				}else if( 'function' === typeof arguments[1] ){
					callback = arguments[1];
				}
			}
			var nqlQuery = this.buildNql(options);
			var nql = 'select count(*) as count from ' + table + ' where ' + nqlQuery.whereString;
			if( nqlQuery.groupString ) nql += ' group by ' + nqlQuery.groupString;
			
			connection.query(nql, function(countErr, countResult){
				if( countErr ){
					log4nql('error', countErr, callback);
					return;
				}
				log4nql('info', {
					totalRows: countResult[0].count
				}, callback);
			});
		}catch(e){
			log4nql('error', e, callback);
		}
	}else{
		log4nql('error', 'FIND NO TABLE', callback);
	}
	return this;
}

module.exports = SqlClass;
