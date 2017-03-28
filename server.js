var https = require('https');
var http = require('http');
var url = require('url');
var postalcodes = require('datasets-fi-postalcodes');

var config = require('./config');

function handleRequest(request, response) {
    var params = url.parse(request.url, true);
    console.log(new Date() + ' New request from ' + (request.headers['x-forwarded-for'] || request.connection.remoteAddress) + ': ' + params.href);
    
    if (request.method === 'GET') {
        switch(params.query.reqtype) {
            case 'companyid':
                ytjRequest('/bis/v1?totalResults=false&maxResults=10&resultsFrom=0&name=' + params.query.companyname, response, companyIds);
                break;
            case 'companyinfo':
                ytjRequest('/bis/v1/' + params.query.companyid, response, companyInfo);
                break;
            case 'postcode':
                postalcodeLocation(response, params.query.postcode);
                break;
            default:
                console.log(new Date() + ' Unsupported request type: ' + params.query.reqtype);
        }
    }
    else {
        console.log(new Date() + ' Unsupported HTTP method: ' + request.method);
        returnError(response, 501);
    }
}

function ytjRequest(uri, resp, callback) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Until broken certificate chain is fixed in avoindata.prh.fi.
    https.get({
        host: config.ytjApiAddress,
        path: uri,
        headers: {
            accept: 'application/json'
        }
    }, function(response) {
        var body = "";
        response.on('data', function(d) {
            body += d;
        });
        response.on('end', function() {
            try {
                var ytjResponse = JSON.parse(body);
                if (ytjResponse == undefined) {
                    console.log(new Date() + ' Server returned a Bad Request. Are any parameters missing?');
                    returnError(resp, 500);
                    return;
                }
            }
            catch (err) {
                if (body === "Bad Request") {
                    console.log(new Date() + ' Server returned a Bad Request. Are any parameters missing?');
                    returnError(resp, 422);
                    return;
                }
                else {
                    console.log(new Date() + " Error parsing JSON data: " + body + "\nError: " + err);
                    returnError(resp, 500);
                    return;
                }
            }
            
            callback(resp, ytjResponse.results);
        });
    });
}

function companyIds(response, results) {
    if (results.length > 0) {
        var companies = [];
        for (var key in results) {
            if (results.hasOwnProperty(key)) {
                companies.push({label: results[key].name + ' (' + results[key].businessId + ')', value: results[key].name, id: results[key].businessId});
            }
        }

        returnResult(response, companies);
    }
    else {
        console.log(new Date() + ' No results were found.');
        returnError(response, 404);
    }
}

function companyInfo(response, results) {
    if (results.length == 1) {
        var info = {};
        var result = results[0];
        info['name'] = result.name;
        for(var key in result.addresses) {
            if (result.addresses.hasOwnProperty(key)) {
                if (result.addresses[key].endDate == null) {
                    info['street'] = result.addresses[key].street;
                    info['city'] = toStandardNameForm(result.addresses[key].city);
                    info['postcode'] = result.addresses[key].postCode;
                    break;
                }
            }
        }

        returnResult(response, info);
    }
    else {
        console.log(new Date() + ' No results or too many, signaling API malfunction: ' + JSON.stringify(results));
        returnError(response, 404);
    }
}

function postalcodeLocation(response, postcode) {
    var location = postalcodes[postcode];

    if (location != null) {
        var locResult = {};
        locResult['postalcode'] = postcode;
        locResult['location'] = toStandardNameForm(location);
        returnResult(response, locResult);
    }
    else {
        console.log(new Date() + ' Unexistent postal code: ' + postcode);
        returnError(response, 404);
    }
}

function toStandardNameForm(name) {
    return name.substr(0, 1) + name.substr(1).toLowerCase();
}

function returnResult(res, result) {
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
}

function returnError(res, httpcode) {
    res.statusCode = httpcode;
    res.setHeader('Access-Control-Allow-Origin', config.origin);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify('{ error: true }'));
}

var server = http.createServer(handleRequest);
server.listen(config.serverport || 8080, function() {
	console.log("Server listening on port " + server.address().port);
});