
/**
 * Module dependencies.
 */

var  express  = require('express')
    ,connect  = require('connect')
    ,gooddata = require('./lib/gooddata')
    ,sys      = require('sys')
    ,memstore = require('connect/middleware/session/memory');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.use(connect.cookieDecoder());
    app.use(connect.session({ store: new memstore({ reapInterval: 60000 * 10, cookie: { path: '/', httpOnly: false } }) }));
    app.use(connect.bodyDecoder());
    app.use(connect.compiler({ src: __dirname + '/public', enable: ['less'] }));
    app.use(app.router);
    app.use(connect.staticProvider(__dirname + '/public'));
});

app.configure('development', function(){
    app.use(connect.errorHandler({ dumpExceptions: true, showStack: true, textMateUrls: true })); 
});

app.configure('production', function(){
   app.use(connect.errorHandler()); 
});

// Routes

var GD_username = process.env.GD_USER;
var GD_password = process.env.GD_PASS;

app.get('/', function(req, res) { res.render('index'); });

app.post('/login', function(req, res){
    var user = req.body.email;
    var pass = req.body.password;
    
    if (!user || !pass) res.redirect('/');
    else {
        var gdc = gooddata.createClient(true);
        gdc.login(user, pass, function(err, msg) {
            if (err) res.redirect('/');
            else {
                req.session['client'] = gdc;
                res.redirect('/projects');
            }
        });
    }
});

app.get('/projects', function(req, res) {
    var gdc = req.session['client'];
    if (!gdc) res.redirect('/');
    else {
        
        if(req.session['projects']) {
            res.render('projects', { locals: req.session['projects'] });
        } else gdc.listProjects(function(resp, projects) {
            
            projects = projects.map(function(project) {
                if (project.project.meta.author == gdc.data.login.profile) {
                    project.project.meta['myProject'] = true; // for template display purposes, enhance project with myProject boolean
                }
                return project;
            });

            var editableProjects = projects.filter(function(project) { return project.project.meta['myProject']; });
            var readonlyProjects = projects.filter(function(project) { return !project.project.meta['myProject']; });
            var projectUsers = {};
            
            editableProjects.forEach(function(project) {
                var projUrl = project.project.links.self;
                gdc.get(projUrl+'/users', function(resp, data) {
                    projectUsers[projUrl] = data.users;
                    if (Object.keys(projectUsers).length == editableProjects.length) {
                        req.session['projects'] = { editableProjects: editableProjects, readonlyProjects: readonlyProjects, users: JSON.stringify(projectUsers) };
                        res.render('projects', { locals: req.session['projects'] });
                    }
                });
            });
        });
    }
});

app.post('/add', function(req, res) {
    var gdc = req.session['client'];
    if (!gdc) res.redirect('/');
    else {
        var guests = req.body.guests;
        var projects = req.body.projects;
    
        if (!guests || !Array.isArray(projects) || !projects.length) {
            // throw new Error('You haven\' entered guest email address(es) or checked any projects!');
            res.redirect('/projects');
        }
    
        guests = guests.split(',').map(function(guest) { return guest.trim(); });

        projects.forEach(function(project) {
            gdc.inviteIntoProject(project, guests, 'editor', function(err, resp, data) {
                res.send('<code>'+sys.inspect(data,false,10)+'</code>');
            });
        });
    }
});

// Only listen on $ node app.js

if (!module.parent) app.listen(3000);
