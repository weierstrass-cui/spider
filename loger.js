var log4js = require('log4js');
	log4js.configure({
		appenders: [
			{
				category: 'logger',
				type: 'dateFile',
				alwaysIncludePattern: true,
				filename: '/var/log/node/log-', 
				pattern: "yyyyMMdd.log"
			}
		]
	});
	
module.exports = function(type, logBody){
	var LogFile = log4js.getLogger('logger');
	LogFile[type](logBody);
}
