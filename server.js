
/**
 * Module dependencies.
 */

var  express  = require('express')
    ,connect  = require('connect')
    ,gooddata = require('./lib/gooddata')
    ,sys      = require('sys');

var app = module.exports = express.createServer();

// Configuration

app.configure(function(){
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
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

app.get('/', function(req, res){
    
    var gdc = gooddata.createClient();
    gdc.login('jakub@gooddata.com', '', function(resp,data) {
        gdc.listProjects(function(resp, projects) {
            projects = projects.map(function(project) {
                if (project.project.meta.author == gdc.data.login.profile) project.project.meta['myProject'] = true;
                return project;
            });
            res.render('index', { locals: { projects: projects } });
        });
    });

});

app.post('/add', function(req, res) {
    var guests = req.body.guests;
    var projects = req.body.projects;
    
    if (!guests || !Array.isArray(projects) || !projects.length) {
        throw new Error('You haven\' entered guest email address(es) or checked any projects!');
    }
    
    guests = guests.split(',').map(function(guest) { return guest.trim(); });

    var gdc = gooddata.createClient();
    gdc.login('jakub@gooddata.com', '', function(resp,data) {
        projects.forEach(function(project) {
            gdc.inviteIntoProject(project, guests, 'editor', function(err, resp, data) {
                res.send('<code>'+sys.inspect(data,false,10)+'</code>');
            });
        });
    });
});

// Only listen on $ node app.js

if (!module.parent) app.listen(3000);
