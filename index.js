#! /usr/bin/env node

/**********
 * Modules
 **********/
var path = require('path'),
    fs = require('fs-extra'),
    colors = require('colors'),
    jsonfile = require('jsonfile'),
    exec = require('child_process').exec,
    minimist = require('minimist'),
    github = require('octonode'),
    Base64 = require('js-base64').Base64,
    _ = require('underscore'),
    semver = require('semver'),
    Spinner = require('cli-spinner').Spinner,
    cordovaLib = require('cordova-lib'),
    cordovaCommon = require('cordova-common'),
    PluginInfoProvider = cordovaCommon.PluginInfoProvider,
    pluginInfoProvider = new PluginInfoProvider();

/***********
 * Constants
 ***********/
var PLUGINS_DIR = './plugins/',
    FETCH_FILE = PLUGINS_DIR + 'fetch.json';


/******************
 * Global variables
 ******************/
var verbose = false,
    updateMode,
    cliArgs,
    plugins = {},
    pluginCount,
    checkCount,
    ghClient,
    spinner,
    spinning = false;

function readJson(){

    debug("Finding installed plugins");
    startProgress("Checking local versions");
    jsonfile.readFile(FETCH_FILE, function(err, json){

        if(err){
            var msg = "Error reading plugins/fetch.json - ensure you're running this command from the root of a Cordova project\n\n"+err;
            console.error(msg.red);
            return -1;
        }
        pluginCount = 0;
        for(var id in json){
            var plugin = json[id];
            plugins[id] = {source: plugin['source']};
            pluginCount++;
        }
        getCurrentVersions();
    })
}

function getCurrentVersions(){
    debug("Reading installed plugin versions");
    var installedPlugins = pluginInfoProvider.getAllWithinSearchPath(PLUGINS_DIR);
    installedPlugins.forEach(function(plugin){
        plugins[plugin.id]['installed'] = plugin.version;
    });
    checkRemoteVersions();
}

function checkRemoteVersions(){
    var plugin;
    checkCount = 0;
    endProgress();
    startProgress("Checking remote versions");
    for(var id in plugins){
        plugin = plugins[id];
        if(plugin.source.type == "registry"){
            checkRegistrySource(id, plugin.source);
        }else if(plugin.source.type == "git"){
            checkGitSource(id, plugin.source);
        }else{
            var msg = "Plugin '"+id+"' has source.type='"+plugin.source.type+"' which is currently not supported";
            plugin.error = msg;
            console.error(msg);
        }
    }
}

function checkRegistrySource(id, source){
    debug("Checking latest npm registry version for '"+id+"' using '"+source.id+"'");

    exec('npm view '+source.id+' version', function(err, stdout, stderr) {
        if(err){
            var msg = "Error checking npm registry for plugin '"+id+"'";
            plugins[id]['error'] = msg + ": "+ err;
            msg += "\n\n" + err;
            console.error(msg.red);
            checkedRemoteVersion(); // continue
            return -1;
        }
        var version;
        if(stdout.match('@')){
            var versions = stdout.split('\n');
            versions.pop();
            version = versions.pop().match(/@([\d.]+)/)[1];
        }else{
            version = stdout;
        }
        plugins[id]['remote'] = version;
        checkedRemoteVersion();

    });
}

function checkGitSource(id, source){
    if(!ghClient){
        ghClient = github.client();
    }
    var parts = source.url.match(/https:\/\/github.com\/([^\/]+)\/([^\/]+)$/),
        user = parts[1],
        repo = parts[2],
        ref = source.ref,
        ghrepo = ghClient.repo(user+'/'+repo);

    debug("Checking latest github version for '"+id+"' using '"+source.url+"'");
    ghrepo.contents('package.json', ref, function(err, data){
        if(err){
            var msg = "Error reading version from github repo for plugin '"+id+"'";
            plugins[id]['error'] = msg + ": "+ err;
            msg += "\n\n" + err;
            console.error(msg.red);
            checkedRemoteVersion(); // continue
            return -1;
        }
        var content = Base64.decode(data.content),
            json = JSON.parse(content),
            version = json.version;
        plugins[id]['remote'] = version;
        checkedRemoteVersion();
    });
}

function checkedRemoteVersion(){
    checkCount++;
    if(checkCount == pluginCount){
        endProgress();
        compareVersions();
    }
}

function compareVersions(){
    var plugin;
    for(var id in plugins){
        plugin = plugins[id];
        if(!plugin.installed || !plugin.remote){
            plugin.status = "error";
        }else if(semver.eq(plugin.installed, plugin.remote)){
            plugin.status = "equal";
        }else if(semver.lt(plugin.installed, plugin.remote)) {
            plugin.status = "newer-remote";
        }else if(semver.gt(plugin.installed, plugin.remote)) {
            plugin.status = "newer-installed";
        }else{
            plugin.status = "unknown-mismatch";
        }
    }
    displayResults();
}

function displayResults(){
    // Outdated local
    var outdated = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "newer-remote";
    });
    if(outdated.length > 0){
        console.log(getTitle("Plugin update available").green);
        outdated.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).green);
        });
    }


    // newer local/unknown mismatch
    var newer = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "newer-installed";
    });
    if(newer.length > 0){
        console.log(getTitle("Installed plugin version newer than remote").yellow);
        newer.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).yellow);
        });
    }

    // unknown mismatch
    var unknown = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "unknown-mismatch";
    });
    if(unknown.length > 0){
        console.log(getTitle("Unknown plugin version mismatch").orange);
        unknown.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).orange);
        });
    }

    // error
    var error = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "error";
    });
    if(error.length > 0){
        console.log(getTitle("Error checking plugin version").red);
        error.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote, plugin.error).red);
        });
    }

    // Up-to-date (verbose)
    var equal = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "equal";
    });
    if(equal.length > 0 && verbose){
        console.log(getTitle("Up-to-date plugins").cyan);
        equal.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).cyan);
        });
    }

    if(outdated.length > 0){
        if(updateMode == "auto"){
            updateAll(outdated);
        }else if(updateMode == "interactive"){
            updateInteractive(outdated);
        }
    }
}

function getTitle(msg){
    var title = "";
    var lineLength = msg.length+4;
    function addLine(){
        for(var i=0; i<lineLength; i++){
            title += "*";
        }
    }
    title += "\n";
    addLine();
    title += "\n";
    title += "* "+msg+" *";
    title += "\n";
    addLine();
    title += "\n";
    return title;
}

function getPluginSnippet(id, source, installedVersion, remoteVersion, error){
    if(source.type == "git"){
        source = source.url;
    }else if(source.type == "registry"){
        source = "npm://"+source.id;
    }else{
        source = "UNKNOWN";
    }
    installedVersion = installedVersion ? installedVersion : "UNKNOWN";
    remoteVersion = remoteVersion ? remoteVersion : "UNKNOWN";
    var snippet =  "plugin: "+id+
            "\nsource: "+source+
            "\ninstalled version: "+installedVersion+
            "\nremote version: "+remoteVersion;
    if(error){
        snippet += "\nerror: "+error;
    }
    snippet += "\n";
    return snippet
}

function startProgress(msg){
    spinner = new Spinner(msg+'... %s');
    spinner.start();
    spinning = true;
}

function endProgress(){
    spinner.stop();
    spinning = false;
}

/*
 * Updates
 */

function resolveCliCommand(cb){
    function resolveCordova(){
        exec('cordova -v', function(err, stdout, stderr) {
            if(err){
                debug("cordova command not found - checking for phonegap");
                resolvePhonegap();
            }else{
                cb('cordova');
            }
        });
    }
    function resolvePhonegap(){
        exec('phonegap -v', function(err, stdout, stderr) {
            if(err){
                var msg = "Error listing installed plugins - ensure you have cordova or phonegap CLI npm module installed either locally in your project folder or globally.\n\n"+err;
                console.error(msg.red);
                return -1;
            }else{
                cb('phonegap');
            }
        });
    }
    resolveCordova();
}

function updatePlugin(plugin, success){
    var cliCommand;
    startProgress("Updating '"+plugin.id+"'");
    function remove(){
        exec(cliCommand+' plugin rm '+plugin.id, function(err, stdout, stderr) {
            if(err){
                var msg = "Error checking npm registry for plugin '"+id+"'" + "\n\n" + err;
                console.error(msg.red);
                return -1;
            }
            debug("Removed plugin '"+plugin.id+"'");
            add();
        });
    }
    function add(){
        var pluginSource;
        if(plugin.source.type == "git"){
            pluginSource = plugin.source.url;
            if(plugin.source.ref){
                pluginSource += '#'+plugin.source.ref;
            }
        }else{
            pluginSource = plugin.source.id;
        }
        exec(cliCommand+' plugin add '+pluginSource, function(err, stdout, stderr) {
            if(err){
                var msg = "Error checking npm registry for plugin '"+id+"'" + "\n\n" + err;
                console.error(msg.red);
                return -1;
            }
            debug("Re-added plugin '"+plugin.id+"'");
            success(plugin);
            endProgress();
        });
    }

    resolveCliCommand(function(command){
        cliCommand =  command;
        remove();
    });
}

function updateAll(plugins){
    plugins.forEach(function(plugin){
        updatePlugin(plugin, updatedPlugin);
    })
}

function updatedPlugin(plugin){
    debug("Updated '"+plugin.id+"'"+" from "+plugin.installed+" to "+plugin.remote);
}

function updateInteractive(plugins){

}


// Dev
function debug(msg){
    if(!verbose) return;
    if(spinning) msg = '\n'+msg;
    console.log(msg);
}

function dump(obj){
    var util = require('util');
    console.log(util.inspect(obj));
}

// Main
function run(){
    // Setup
    cliArgs = minimist(process.argv.slice(2));
    if(cliArgs["verbose"]){
        verbose = true;
        debug("Verbose output enabled".cyan);
    }
    if(cliArgs["update"]){
        updateMode = cliArgs["update"];
    }else{
        updateMode = "none";
    }
    Spinner.setDefaultSpinnerString('|/-\\');
    // Start
    readJson();
}

run();