var request = require('request');
const Hero = require('@ulixee/hero');

let _heroClient = undefined
function getHeroClient() {
	if (_heroClient === undefined) {
		_heroClient = new Hero({
			connectionToCore: {
				host: process.env.ULIXEE_CLOUD_HOST
			}
		});
	}
	return _heroClient;	
}

var baseUrl = "https://a.4cdn.org";
var api = {};

var requestOptions = {
	json: true,
	headers: {
		'if-modified-since': 0,
		'User-Agent': 'curl/8.4.0'
	}
};

api.boards = function(cb) {
	var uri = [baseUrl, "boards.json"].join("/");

	request(uri, requestOptions, function(err, res, body){
		if (err) return cb(err);
		cb(null, body.boards);
	});

	return api;
};

api.board = function(board) {
	var subapi = {};
	subapi._board = board;
	
	subapi.image = function(tim, ext) {
		// no-cache query due to: https://github.com/4chan/4chan-API/issues/99
		return ["https://i.4cdn.org", board, "src", tim + ext].join("/") + `?no-cache=${Date.now()}`;
	};
	
	subapi.downloadImage = async function(tim, ext) {
		const url = this.image(tim, ext);
		const hero = getHeroClient();
		const page = await hero.goto(url, {
			waitForLoad: true,
			waitForRessourcesToComplete: true,
		});
		if (page.response.statusCode < 200 || page.response.statusCode >= 300) {
			throw new Error(`Failed to download image: ${page.response.url}${page.response.url !== url ? ` (requested: ${url})` : ''} - Status Code: ${page.response.statusCode}`);
		}
		return page.buffer
	};

	subapi.catalog = function(cb) {
		var uri = [baseUrl, board, "catalog.json"].join("/");

		request(uri, requestOptions, function(err, res, body){
			if (err) return cb(err);
			cb(null, body);
		});

		return api;
	};

	subapi.threads = function(cb) {
		var uri = [baseUrl, board, "threads.json"].join("/");

		request(uri, requestOptions, function(err, res, body){
			if (res.statusCode === 404) {
				return cb(new Error('board_not_found'))
			}
			if (err) return cb(err);
			cb(null, body);
		});

		return api;
	};

	subapi.page = function(num, cb) {
		var uri = [baseUrl, board, num+".json"].join("/");

		request(uri, requestOptions, function(err, res, body){
			if (err) return cb(err);
			cb(null, body.threads);
		});

		return api;
	};

	subapi.thread = function(num, cb) {
		// To avoid any breaking changes thread() continues to
		// take the same arguments and return the same result
		// as previously but if lastModified is supplied then
		// call the new function, threadChanges().
		if (arguments.length === 3) {
			return threadChanges.apply(subapi, arguments)
		}
		var uri = [baseUrl, board, "thread", num+".json"].join("/");

		request(uri, requestOptions, function(err, res, body){
			if (err) return cb(err);
			if (res.statusCode === 404) {
				return cb(new Error('thread_not_found'));
			}
			cb(null, body.posts);
		});

		return api;
	};

	function threadChanges(num, lastModified, cb) {
		console.log(arguments)
		var uri = [baseUrl, board, "thread", num+".json"].join("/");

		requestOptionsLocal = JSON.parse(JSON.stringify(requestOptions)); // clone global request options
		if( lastModified ) requestOptionsLocal.headers['if-modified-since'] = lastModified;

		request(uri, requestOptionsLocal, function(err, res, body){
			if (err) return cb(err);
			if (res.statusCode === 404) {
				return cb(new Error('thread_not_found'));
			}
			var result = {
				lastModified: res.headers['last-modified']
			};
			if(res.statusCode === 304) {
				result.status = 'not_modified_since_last_fetch';
			} else {
				result.status = 'got_changed_posts'
				result.posts = body.posts;
			}
			cb(null, result);
		});

		return api;
	};

	return subapi;
};

module.exports = api;