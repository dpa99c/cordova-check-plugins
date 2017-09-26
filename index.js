#!/usr/bin/env node

/**********
 * Modules
 **********/

// Core
var path = require('path');
var exec = require('child_process').exec;

// lib
var logger = require('./lib/logger.js')();
var update = require('./lib/update.js')();
var errorHandler = require('./lib/errorHandler.js')();
var progress = require('./lib/progress.js')();
var cliArgs = require('./lib/cliArgs.js')().args;
var config = require('./lib/config.js')();
var remote = require('./lib/remote.js')();
var local = require('./lib/local.js')();

// 3rd party
try{
    var fs = require('fs-extra');
    var colors = require('colors');
    var jsonfile = require('jsonfile');
    var _ = require('lodash');
    var cordovaCommon = require('cordova-common');
    var PluginInfoProvider = cordovaCommon.PluginInfoProvider;
    var pluginInfoProvider = new PluginInfoProvider();

}catch(e){
    errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
}



/******************
 * Global variables
 ******************/
var verbose = false;
var unconstrainVersions = false;
var updateMode = null;
var plugins = {};
var cliArgs,
    pluginCount,
    target;

function start(){
  readJson();
}

function readJson(){

    logger.verbose("Finding installed plugins");
    progress.start("Checking local versions");
    local.readFetchJson(function(err, json){
        try{
            if(err){
                errorHandler.handleFatalError( "Failed to read plugins/fetch.json - ensure you're running this command from the root of a Cordova project.\n\n"+err);
            }
            pluginCount = 0;
            for(var id in json){
                var plugin = json[id];
                plugins[id] = {
                    source: plugin['source'],
                    variables: plugin['variables']
                };
                pluginCount++;
            }
            getInstalledVersions();
        }catch(e){
            errorHandler.handleFatalException(e);
        }
    });
}

function getInstalledVersions(){
    logger.verbose("Reading installed plugin versions");
    var installedPlugins = pluginInfoProvider.getAllWithinSearchPath(local.PLUGINS_DIR);

    installedPlugins.forEach(function(plugin){
        if(plugins[plugin.id]){
            plugins[plugin.id]['installed'] = plugin.version;
        }else{
            var msg = "Plugin '"+plugin.id+"' is present in /plugins folder but not in fetch.json";
            logger.error(msg);
        }
    });

    if(cliArgs["remove-all"]){
        update.removeAll(installedPlugins, true, cliArgs["save"]);
    }else{
        getTargetVersions();
    }
}


function getTargetVersions(){
    var targetModule = target === "config" ? config : remote;
    targetModule.check({
        plugins: plugins, 
        onFinish: displayResults,
        pluginCount: pluginCount,
        unconstrainVersions: unconstrainVersions
    });
}

function displayResults(){
    var pluginsForUpdate = [];

    // Up-to-date (verbose)
    var equal = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "equal";
    });
    if(equal.length > 0){
        logger.log(getTitle("Up-to-date plugins").grey);
        equal.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).grey);
        });
    }

    // newer installed
    var newerInstalled = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-installed";
    });
    if(newerInstalled.length > 0){
        var title = target === "config" ? "config.xml version older than installed" : "Installed plugin version newer than remote default";
        logger.log(getTitle(title).yellow);
        newerInstalled.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).yellow);
        });
        if(target === "config" && cliArgs["allow-downdate"]){
            pluginsForUpdate = pluginsForUpdate.concat(newerInstalled);
        }
    }

    // new installed (config only)
    var newInstalled = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "new-installed";
    });
    if(newInstalled.length > 0){
        logger.log(getTitle("Locally installed plugins not in config.xml").yellow);
        newInstalled.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).yellow);
        });
    }

    // unknown mismatch
    var unknown = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "unknown-mismatch";
    });
    if(unknown.length > 0){
        logger.log(getTitle("Unknown plugin version mismatch").yellow);
        unknown.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).yellow);
        });
    }

    // error
    var error = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "error";
    });
    if(error.length > 0){
        logger.log(getTitle("Error checking plugin version").red);
        error.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target, plugin.error).red);
        });
    }

    // newer target
    var newerTarget = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-target";
    });
    if(newerTarget.length > 0){
        var title = target === "config" ? "config.xml version newer than installed" : "Plugin update available";
        logger.log(getTitle(title).green);
        newerTarget.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).green);
        });
        pluginsForUpdate = pluginsForUpdate.concat(newerTarget);
    }

    // new target (config only)
    var newTarget = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "new-target";
    });
    if(newTarget.length > 0){
        logger.log(getTitle("New plugins in config.xml").green);
        newTarget.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).green);
        });
        pluginsForUpdate = pluginsForUpdate.concat(newTarget);
    }

    if(pluginsForUpdate.length > 0){
        update.doUpdate(plugins, pluginsForUpdate, {
            updateMode: updateMode,
            unconstrainVersions: unconstrainVersions,
            save: cliArgs["save"],
            force: cliArgs["force"] || cliArgs["force-update"],
            target: target,
            allowDowndate: cliArgs["allow-downdate"]
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

function getPluginSnippet(id, source, installedVersion, targetVersion, error){
    if(!source){
        source = "N/A";
    }else if(source.type === "git"){
        source = remote.normalizeGithubSource(source);
    }else if(source.type === "registry"){
        if(source.id.match(remote.GITHUB_REGEX)){
            source = remote.normalizeGithubSource(source);
        }else{
            source = "npm://"+source.id;
        }
    }else if(source.type === "local"){
        source = source.path;
    }else{
        source = "UNKNOWN";
    }
    installedVersion = installedVersion ? installedVersion : "UNKNOWN";
    targetVersion = targetVersion ? targetVersion : "UNKNOWN";

    if(installedVersion === "UNKNOWN" && targetVersion !== "UNKNOWN"){
        if(target === "config"){
            installedVersion = "N/A";
        }else{
            installedVersion += " - check plugins/fetch.json for orphaned entries";
        }
    }else if(targetVersion === "UNKNOWN" && installedVersion !== "UNKNOWN"){
        if(target === "config"){
            targetVersion = "N/A";
        }else{
            targetVersion += " - check "+target+" source is valid";
        }
    }

    if(targetVersion.match(remote.GITHUB_REGEX)){
        targetVersion = remote.normalizeGithubURL(targetVersion);
    }

    var snippet =  "plugin: "+id+
            "\nsource: "+source+
            "\ninstalled version: "+installedVersion+
            "\n"+target+" version: "+targetVersion;
    if(error){
        snippet += "\nerror: "+error;
    }
    snippet += "\n";
    return snippet;
}


function help(){
    var helpText = fs.readFileSync(path.resolve(__dirname, 'usage.txt'), 'utf-8');
    logger.log(helpText);
}

/***********
 * Main
 ***********/
function run(){
    try{
        logger.verbose("Running cordova-check-plugins...");

        if(cliArgs["v"] || cliArgs["version"]){
            return logger.log(require('./package.json').version);
        }

        if(cliArgs["h"] || cliArgs["help"]){
            return help();
        }

        if(cliArgs["obfuscate-credentials"]){
            logger.setCredentialsToObfuscate(cliArgs["obfuscate-credentials"].split(' '));
        }

        if(cliArgs["verbose"]){
            verbose = true;
            logger.verbose("Verbose output enabled");
        }
        if(cliArgs["unconstrain-versions"]){
            unconstrainVersions = true;
            logger.verbose("Unconstraining version checks: highest remote version will be displayed regardless of locally specified version");
        }
        if(cliArgs["update"]){
            updateMode = cliArgs["update"];
        }

        target = cliArgs["target"] === "config" ? "config" : "remote";

        start();
    }catch(e){
        errorHandler.handleFatalException(e);
    }
}

/*******************
 * Module invocation
 *******************/
run();
