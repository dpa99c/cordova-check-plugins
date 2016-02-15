#!/usr/bin/env node

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
    cordovaCommon = require('cordova-common'),
    PluginInfoProvider = cordovaCommon.PluginInfoProvider,
    pluginInfoProvider = new PluginInfoProvider(),
    inquirer = require('inquirer'),
    xml2js = require('xml2js').parseString;

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
            var msg = "Failed to read plugins/fetch.json - ensure you're running this command from the root of a Cordova project\n\n"+err;
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
            console.log(msg.yellow);
            checkedRemoteVersion(); // continue
        }
    }
}

function checkRegistrySource(id, source){
    debug("Checking latest npm registry version for '"+id+"' using '"+source.id+"'");

    exec('npm view '+source.id+' version', function(err, stdout, stderr) {
        if(err){
            var msg = "Failed to check npm registry for plugin '"+id+"'";
            plugins[id]['error'] = msg + ": "+ err;
            msg += "\n\n" + err;
            console.error(msg.red);
            checkedRemoteVersion(); // continue
            return -1;
        }
        debug("Retrieved latest npm registry version for '"+id);
        var version;
        if(stdout.match('@')){
            var versions = stdout.split('\n');
            versions.pop();
            version = versions.pop().match(/@([\d.]+)/)[1];
        }else{
            version = stdout;
        }
        plugins[id]['remote'] = version.replace('\n','');
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


    function handleError(err){
        var msg = "Failed to read version from github repo for plugin '"+id+"'";
        plugins[id]['error'] = msg + ": "+ err;
        msg += "\n\n" + err;
        console.error(msg.red);
        checkedRemoteVersion(); // continue
    }

    debug("Checking latest github version for '"+id+"' using '"+source.url+"'");
    ghrepo.contents('plugin.xml', ref, function(err, data){
        if(err){
            if(err.toString().match("Not Found")){
                err = "plugin.xml not found - make sure the specified repo contains a Cordova plugin";
            }
            handleError(err);
            return;
        }
        debug("Retrieved latest github version for '"+id);
        var xml = Base64.decode(data.content);

        xml2js(xml, function(err, js){
            if(err){
                handleError(err);
                return;
            }
            plugins[id]['remote'] = js.plugin.$.version;
            checkedRemoteVersion();
        });
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
        console.log(getTitle("Installed plugin version newer than remote default").yellow);
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
        console.log(getTitle("Unknown plugin version mismatch").yellow);
        unknown.forEach(function(plugin){
            console.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).yellow);
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
            updateAll(outdated, function(success){
                if(success){
                    console.log("\nAutomatically updated all outdated plugins".green);
                }else{
                    console.log("\nFailed to update some outdated plugins".yellow);
                }

            });
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

    if(installedVersion == "UNKNOWN" && remoteVersion != "UNKNOWN"){
        installedVersion += " - check plugins/fetch.json for orphaned entries";
    }else if(remoteVersion == "UNKNOWN" && installedVersion != "UNKNOWN"){
        installedVersion += " - check remote source is valid";
    }

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
    spinner.stop(true);
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
                var msg = "Failed to find cordova or phonegap CLI command when listing installed plugins - ensure you have cordova/phonegap npm module installed either locally in your project folder or globally.\n\n"+err;
                console.error(msg.red);
                return -1;
            }else{
                cb('phonegap');
            }
        });
    }
    resolveCordova();
}

function updatePlugin(plugin, complete){
    var cliCommand;
    console.log("\n");
    startProgress("Updating '"+plugin.id+"'");
    function finish(result){
        endProgress();
        complete(result);
    }
    function remove(){
        exec(cliCommand+' plugin rm '+plugin.id, function(err, stdout, stderr) {
            if(err){
                var msg = "\nError removing plugin '"+plugin.id+"'" + "\n\n" + err;
                console.error(msg.red);
                finish(-1);
                return;
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
                var msg = "\nError adding plugin '"+plugin.id+"'" + "\n\n" + err;
                console.error(msg.red);
                finish(-1);
                return;
            }
            debug("Re-added plugin '"+plugin.id+"'");
            finish(0);
        });
    }

    resolveCliCommand(function(command){
        cliCommand =  command;
        remove();
    });
}

function updateAll(plugins, cb){
    var pluginIds = [];
    plugins.forEach(function(plugin){
        pluginIds.push(plugin.id);
        total = pluginIds.length;
    });
    debug("Updating all plugins: "+pluginIds.join(", "));

    var success = true;

    function nextPlugin(){
        if(plugins.length == 0){
            cb(success);
            return;
        }
        var plugin = plugins.pop();
        updatePlugin(plugin, function(result){
            updatedPlugin(plugin, result);
            if(result == -1 && success) success = false;
            nextPlugin();
        });
    }
    nextPlugin();
}

function updatedPlugin(plugin, result){
    if(result == 0){
        console.log("\nUpdated '"+plugin.id+"'"+" from "+plugin.installed+" to "+plugin.remote);
    }else{
        var msg = "Failed to update plugin '"+plugin.id+"'";
        console.error(msg.red);
    }
}

function updateInteractive(plugins){
    function finished(){
        console.log("\nInteractive update complete".green);
    }
    function nextPlugin(){
        if(plugins.length == 0){
            finished();
            return;
        }

        var plugin = plugins.pop();
        inquirer.prompt([
            {
                type: "expand",
                message: "Update '"+plugin.id+"'? ",
                name: "choice",
                choices: [
                    {
                        key: "y",
                        name: "Yes",
                        value: "yes"
                    },
                    {
                        key: "n",
                        name: "No",
                        value: "no"
                    },
                    {
                        key: "a",
                        name: "All",
                        value: "all"
                    },
                    new inquirer.Separator(),
                    {
                        key: "x",
                        name: "Abort",
                        value: "abort"
                    }
                ]
            }
        ], function(answer){
            switch(answer.choice){
                case "yes":
                    updatePlugin(plugin, nextPlugin);
                    break;
                case "no":
                    nextPlugin();
                    break;
                case "all":
                    plugins.push(plugin);
                    updateAll(plugins, finished);
                    break;
                case "abort":
                    finished();
                    break;
            }
        });
    }
    nextPlugin();
}

// Dev
function debug(msg){
    if(!verbose) return;
    if(spinning) msg = '\n'+msg;
    console.log(msg.cyan);
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
        debug("Verbose output enabled");
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
