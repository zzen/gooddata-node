var  http = require('http')
    ,sys  = require('sys');


var  HOSTNAME = 'secure.gooddata.com'
    ,PORT     = 443;

var acceptedCookies = ['GDCAuthSST','GDCAuthTT'];


exports.createClient = function(debug) { return new Client(debug); };
var Client = exports.Client = function Client(debug) {
    if (debug) this.debug = true;
    this.httpClient = http.createClient(PORT, HOSTNAME, (PORT === 443));
    this.data = { cookies: {}};
};

Client.prototype.request = function(method, uri, postData, callback) {
        
    if (!callback) { // shift arguments if there is no data
        callback = postData;
        postData = null;
    }
    
    var headers = {
        'Host': HOSTNAME
        ,'Accept': 'application/json'
        ,'Content-Type': 'application/json; charset=utf-8'
    };
    
    if (postData) {
        postData = JSON.stringify(postData);
        headers['Content-Length'] = postData.length;
    }
    
    var cookies = this.sendCookies(this.data.cookies);
    if (cookies) {
        headers['Cookie'] = cookies;
    }

    var request = this.httpClient.request(method, uri, headers);

    if (this.debug) {
        sys.debug('>>>> REQUEST');
        sys.debug(request._header);
        (postData) && sys.debug(postData);
    }
    if (postData) request.end(postData,'utf8');
    else request.end();

    var data = '', that = this;
    request.on('response', function(response) {
        response.on('data', function(chunk) { data+=chunk; });
        response.on('end', function() {
            if (that.debug) {
                sys.debug('<<<< RESPONSE');
                sys.debug(response.statusCode);
                sys.debug(sys.inspect(response.headers));
                sys.debug(data);
            }

            if (response.headers['content-type'] == 'application/json') data = JSON.parse(data);
            if (Array.isArray(response.headers['set-cookie'])) that.processSetCookie(response.headers['set-cookie']);
            callback(response, data);
        });
    });

};
Client.prototype.get  = function(uri, callback) { this.request('GET', uri, callback); };
Client.prototype.post = function(uri, data, callback) { this.request('POST', uri, data, callback); };
Client.prototype.login = function(username, password, callback) {
    var that = this;
    this.post('/gdc/account/login', {"postUserLogin":{"password":password,"login":username,"remember":"0"}}, function(res, data) {
        if (res.statusCode < 300) {
            that.data['login'] = data.userLogin;
            that.getToken(callback);
        } else {
            callback(true, res.data);
        }
    });
};
Client.prototype.getToken = function(callback) {
    this.get('/gdc/account/token', function(res, data) {
        if (res.statusCode < 300 ) {
            callback(false);
        } else {
            callback(true, res.data);
        }
    });
};
Client.prototype.listProjects = function(callback) {
    this.get(this.data.login.profile+'/projects', function(res, data) {
        callback(res, data.projects);
    });
};
Client.prototype.getProject = Client.prototype.get;
Client.prototype.inviteIntoProject = function(project, users, role, callback) {
    role = role.toLowerCase() || 'editor';
    var that = this;
    this.get(project+'/roles', function(resp, data) { // find all roles in the project (returns just URIs)
        var roles     = data.projectRoles.roles
           ,rolesBody = {}
           ,roleName  = role;
        
        var storeRole = function(uri) { // store role info when retrieved (and check if we have all roles already)
            return function(resp, data) {
                rolesBody[uri] = data;
                if (Object.keys(rolesBody).length == roles.length) findRole(rolesBody);
            };
        };
        
        var findRole = function(roles) { // find role matching the name I'm looking for
            var filteredRoles = [];
            Object.keys(roles).forEach(function(role) {
                var roleObj = roles[role].projectRole;
                if (roleObj.meta.title.toLowerCase() == roleName.toLowerCase()) {
                    roleObj.links.self = role;
                    filteredRoles.push(roleObj);
                }
            });
            if (filteredRoles.length) { // if desired role is found, invite
                var body = { "invitations": []};
                users.forEach(function(user) {
                    body['invitations'].push(
                        { "invitation": { "content": { "email": user, "role": filteredRoles[0].links.self, "firstname": "", "lastname": "", "action": { "setMessage": "some message" }}}}
                    );
                });
                if (that.debug) sys.log('Sending invitation: '+JSON.stringify(body));
                that.post(project+'/invitations', body, function(resp, data) {
                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        callback(false, resp, data);
                    } else callback(true);
                });
            } else callback(true);
        };
        
        roles.forEach(function(role) { // retrieve info for all roles in the project
            that.get(role, storeRole(role));
        });
    });
};
Client.prototype.disableUsers = function(project, users, callback) {
    var json = {"users":[]};
    users.forEach(function(user) {
        json['users'].push({"user":{"content":{"status":"DISABLED"},"links":{"self":user}}});
    });
    this.post(project+'/users', json, callback);
};
Client.prototype.processSetCookie = function(cookies) {
    var that = this;
    cookies.forEach(function(cookie) {
        parts = cookie.split(";")[0].split('=');
        if (acceptedCookies.indexOf(parts[0])!= -1) { // only accept certain cookies
            that.data['cookies'][parts[0].trim()]=parts[1].trim();
        }
    });
};
Client.prototype.sendCookies = function(cookies) {
    arr = [];

    Object.keys(cookies).forEach(function(cookie) {
        arr.push(cookie+'='+cookies[cookie]);
    });
    if (arr.length) return arr.join('; ');
    else return false;
};