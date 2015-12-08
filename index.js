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
    npmview = require('npmview'),
    github = require('octonode'),
    Base64 = require('js-base64').Base64,
    _ = require('underscore'),
    semver = require('semver'),
    Spinner = require('cli-spinner').Spinner,
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
    cliArgs,
    cliCommand,
    plugins = {},
    pluginCount,
    checkCount,
    ghClient,
    spinner;

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
    npmview(source.id, function(err, version, moduleInfo) {
        if(err){
            var msg = "Error checking npm registry for plugin '"+id+"'";
            plugins[id]['error'] = msg + ": "+ err;
            msg += "\n\n" + err;
            console.error(msg.red);
            checkedRemoteVersion(); // continue
            return -1;
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
        console.log(getTitle("Plugin updates available").green);
        outdated.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).green);
        });
    }


    // newer local/unknown mismatch
    var newer = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status == "newer-local";
    });
    if(newer.length > 0){
        console.log(getTitle("Installed plugins version newer than remote").yellow);
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
        console.log(getTitle("Unknown plugin version mismatches").orange);
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
        console.log(getTitle("Error checking plugin versions").red);
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
}

function endProgress(){
    spinner.stop(true);
}


// Dev
function debug(msg){
    if(!verbose) return;
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
    Spinner.setDefaultSpinnerString('|/-\\');
    // Start
    readJson();
}

run();