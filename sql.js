var mysql = require('mysql'),
	log4js = require('./loger.js');
var limitNum = 20;

var SqlClass = function(options, tableName){
	if( !options || typeof options !== 'object' ){
		log4js('error', 'NO DATABASE INFORMATION');
		return false;
	}
	this.connection = mysql.createConnection({
		host: options.host,
		user: options.user,
		password: options.password,
		database: options.database
	});
	// log4js('info', 'CONNECTED CONNECTION');
	var TBN = tableName, WHERE = [], ORDER = '';

	var getWhere = function(){
		var _there = ' where 1 = 1';
		if( WHERE.length ){
			_there += ' and ' + WHERE.join(' and ');
			WHERE = [];
		}
		return _there;
	}
	var getOrder = function(){
		var orderString = ORDER;
		ORDER = '';
		return orderString;
	}
	this.release = function(){
		this.connection.end();
		// log4js('info', 'RELEASE CONNECTION');
		return this;
	}
	this.insert = function(){
		return this;
	}
	this.update = function(opts, callBack){
		if( !TBN || typeof TBN !== 'string' ){
			log4js('error', 'NO TABLE');
			return;
		}else{
			var SET = [], _this = this, where = getWhere();
			for(var i in opts){
				SET.push(i + '= "' + opts[i] + '"');
			}
			SET = SET.join(', ');
			var nql = 'update ' + TBN + ' set ' + SET + where;
			log4js('info', nql);
			this.connection.query(nql, function(err, rows, fields){
				if( err ){
					log4js('error', err);
					if( callBack ){
						callBack('ERROR');
					}
					return;
				}
				if( rows && callBack ){
					nql = 'select * from ' + TBN + where;
					log4js('info', nql);
					_this.connection.query(nql, function(findErr, findRows, findFields){
						if( findErr ){
							log4js('error', err);
							if( callBack ){
								callBack('ERROR');
							}
							return;
						}
						if( findRows ){
							callBack({
								rows: findRows.length == 1 ? findRows[0] : findRows
							});
						}
					});
				}
			});
		}
		return this;
	}
	this.find = function(colums, pageNum, callBack){
		if( !TBN || typeof TBN !== 'string' ){
			log4js('error', 'NO TABLE');
		}else{
			var where = getWhere(), con = this.connection;
			var nql = 'select count(*) as count from ' + TBN + where;
			con.query(nql, function(err, rows, fields){
				if( err ){
					log4js('error', err);
					if( callBack ){
						callBack('ERROR');
					}
					return;
				}
				if( rows ){
					var count = rows[0].count, totalPages = Math.ceil(count / limitNum),
						colums = colums && colums.length ? colums.join(', ') : '*',
						startNum = pageNum * limitNum || 0;
					nql = 'select ' + colums + ' from ' + TBN + where  + getOrder() + ' limit ' + startNum + ', ' + limitNum;
					log4js('info', nql);
					con.query(nql, function(err, rows, fields){
						if( err ){
							log4js('error', err);
							if( callBack ){
								callBack('ERROR');
							}
							return;
						}
						if( rows && callBack ){
							callBack({
								totalPages: totalPages,
								totalRows: count,
								rows: rows
							});
						}
					});
				}
			});
		}
		return this;
	}
	this.where = function(opts){
		WHERE = [];
		for(var i in opts){
			WHERE.push(i + '= "' + opts[i] + '"');
		}
		return this;
	}
	this.setOrder = function(opts){
		ORDER = ' order by ' + opts.orderField + ' ' + opts.orderType;
		return this;
	}
	this.queryTable = function(callBack){
		log4js('info', 'show tables');
		this.connection.query('show tables', function(err, rows, fields){
			if( err ){
				log4js('error', err);
				if( callBack ){
					callBack('ERROR');
				}
				return;
			}
			if( rows && callBack ){
				callBack(rows);
			}
		});
		return this;
	}
	this.queryFields = function(callBack){
		if( !TBN || typeof TBN !== 'string' ){
			log4js('error', 'NO TABLE');
		}else{
			log4js('info', 'show fields from ' + TBN);
			this.connection.query('show fields from ' + TBN, function(err, rows, fields){
				if( err ){
					log4js('error', err);
					if( callBack ){
						callBack('ERROR');
					}
					return;
				}
				if( rows && callBack ){
					callBack(rows);
				}
			});
		}
		return this;
	}
}

module.exports = SqlClass;
