#!/usr/bin/env node

/**********
 * Modules
 **********/

// Core
var path = require('path');

// lib
var logger = require(path.resolve('lib/logger.js'))();
var update = require(path.resolve('lib/update.js'))();
var errorHandler = require(path.resolve('lib/errorHandler.js'))();
var progress = require(path.resolve('lib/progress.js'))();
var cliArgs = require(path.resolve('lib/cliArgs.js'))().args;

// 3rd party
try{
    var fs = require('fs-extra');
    var colors = require('colors');
    var jsonfile = require('jsonfile');
    var exec = require('child_process').exec;
    var github = require('octonode');
    var Base64 = require('js-base64').Base64;
    var _ = require('lodash');
    var semver = require('semver');
    var cordovaCommon = require('cordova-common');
    var PluginInfoProvider = cordovaCommon.PluginInfoProvider;
    var pluginInfoProvider = new PluginInfoProvider();
    var xml2js = require('xml2js').parseString;

}catch(e){
    errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
}


/***********
 * Constants
 ***********/
var PLUGINS_DIR = './plugins/',
    FETCH_FILE = PLUGINS_DIR + 'fetch.json',
    CONFIG_FILE = './config.xml',
    GITHUB_HTTPS_REGEX = /^https:\/\/(?:\w*:?\w*@?)github\.com\/([^\/]+)\/([^\/.]+)(?:\.git)?$/,
    GITHUB_GIT_REGEX = /^git:\/\/(?:\w*:?\w*@?)github\.com\/([^\/]+)\/([^\/.]+)(?:\.git)?$/;

/******************
 * Global variables
 ******************/
var verbose = false,
    unconstrainVersions = false,
    updateMode = null,
    cliArgs,
    plugins = {},
    pluginCount,
    checkCount,
    ghClient,
    target;

function start(){
  readJson();
}

function readJson(){

    logger.verbose("Finding installed plugins");
    progress.start("Checking local versions");
    jsonfile.readFile(FETCH_FILE, function(err, json){
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
    var installedPlugins = pluginInfoProvider.getAllWithinSearchPath(PLUGINS_DIR);

    installedPlugins.forEach(function(plugin){
        if(plugins[plugin.id]){
            plugins[plugin.id]['installed'] = plugin.version;
        }else{
            var msg = "Plugin '"+plugin.id+"' is present in /plugins folder but not in fetch.json";
            logger.error(msg);
        }
    });
    getTargetVersions();
}


function getTargetVersions(){
  if(target === "config"){
    getConfigVersions();
  }else{
    checkRemoteVersions();
  }
}

function getConfigVersions(){
  readConfigXml();
}

function readConfigXml(){
    logger.verbose("Finding configured plugins");

    var xml = fs.readFileSync(path.resolve(CONFIG_FILE), 'utf-8');
    xml2js(xml, function(err, js){
        if(err){
            return handleError(err);
        }
        var _plugins = js['widget']['plugin'];
        if(_plugins && _plugins.length > 0){
            _plugins.forEach(function(_plugin){
              _plugin = _plugin.$;
                var name = _plugin.name;
                var version = _plugin.spec;
                var found = false;
                if(!_.isNil(plugins[name])){
                    plugins[name]['target'] = version;
                    found = true;
                }else{
                    for(var id in plugins){
                        plugin = plugins[id];
                        if(plugin.source && plugin.source.type === "registry" && name === plugin.source.id){
                            plugins[id]['target'] = version;
                            found = true;
                            break;
                        }else if(plugin.source && plugin.source.type === "git" && name.match(plugin.source.url)){
                            plugins[id]['target'] = version;
                            found = true;
                            break;
                        }
                    }
                }
                if(!found){
                    logger.warn("Couldn't find installed plugin of name '"+name+"' as specified in config.xml - assuming it's a new addition to the config");
                    plugins[name] = {
                      'target': name.match(GITHUB_HTTPS_REGEX) || name.match(GITHUB_GIT_REGEX) ? name : version
                    };
                }
            });
        }
        compareVersions();
    });
}



function checkRemoteVersions(){
    var plugin;
    checkCount = 0;
    progress.end();
    progress.start("Checking remote versions");
    for(var id in plugins){
        plugin = plugins[id];
        if(plugin.source.type === "registry"){
            checkRegistrySource(id, plugin.source);
        }else if(plugin.source.type === "git"){
            checkGitSource(id, plugin.source);
        }else if(plugin.source.type === "local"){
            checkLocalSource(id, plugin.source);
        }else{
            var msg = "Plugin '"+id+"' has source.type='"+plugin.source.type+"' which is currently not supported";
            plugin.error = msg;
            logger.log(msg.yellow);
            checkedRemoteVersion(); // continue
        }
    }
}

function handleRemoteVersionCheckError(id, msg, err){
    msg += " for plugin '"+id+"'";
    plugins[id]['error'] = msg;
    if(err){
        plugins[id]['error'] += ": "+ err;
        msg += "\n\n" + err;
    }
    logger.error(msg);
    checkedRemoteVersion(); // continue
}

function checkRegistrySource(id, source){
    var idToCheck = unconstrainVersions ? source.id.replace(/(@([^~]?).*)$/, '') : source.id;
    logger.verbose("Checking latest npm registry version for '"+id+"' using '"+idToCheck+"'");
    var command = 'npm view "'+idToCheck+'" version';
    logger.debug(command);

    exec(command, function(err, stdout, stderr) {
        try{
            if(err){
                handleRemoteVersionCheckError(id, "Failed to check npm registry", err);
                return -1;
            }
            logger.verbose("Retrieved latest npm registry version for '"+id);
            var version;
            if(stdout.match('@')){
                var versions = stdout.split('\n');
                while (versions.length) {
                    version = versions.pop() || "";
                    version = version.match(/'([^']+)'/);
                    if (version && version.length > 0 && version[1]) {
                        version = version[1];
                        break;
                    }
                }
                if(!version){
                    handleRemoteVersionCheckError(id, "Couldn't determine a remote registry version");
                }
            }else{
                version = stdout;
            }
            plugins[id]['target'] = version.replace('\n','');
            checkedRemoteVersion();
        }catch(e){
            handleRemoteVersionCheckError(id, "Exception trying to retrieve remote registry version", err);
        }
    });
}

function checkGitSource(id, source){
    function handleError(err){
        handleRemoteVersionCheckError(id, "Failed to read version from github repo", err);
    }

    try{
        if(!ghClient){
            var ghOpts = {};
            if(cliArgs["github-username"] && cliArgs["github-password"]){
                ghOpts.username = cliArgs["github-username"];
                ghOpts.password = cliArgs["github-password"];
                logger.verbose("Using specified GitHub credentials to authenticate access to the GitHub API");
            }
            ghClient = github.client(ghOpts);
        }
        if(source.url.match(GITHUB_GIT_REGEX)){
            source.url = parseGitProtocolUrl(source.url);
        }
        if(!source.url.match(GITHUB_HTTPS_REGEX)){
            return handleError("source.url '"+source.url+"' is not a valid github repo URL in the form 'https://github.com/username/reponame' or 'git://github.com/username/reponame.git'");
        }
        source.url = source.url.replace(/\.git/, '');
        var parts = source.url.match(GITHUB_HTTPS_REGEX),
            user = parts[1],
            repo = parts[2],
            ref = source.ref,
            ghrepo = ghClient.repo(user+'/'+repo);

        logger.verbose("Checking latest github version for '"+id+"' using '"+source.url+(source.ref ? "#"+source.ref : "")+"'");
        ghrepo.contents('plugin.xml', ref, function(err, data){
            if(err){
                if(err.toString().match("Not Found")){
                    err = "plugin.xml not found - make sure the specified repo contains a Cordova plugin";
                }
                return handleError(err);
            }
            logger.verbose("Retrieved latest github version for '"+id);
            var xml = Base64.decode(data.content);

            xml2js(xml, function(err, js){
                if(err){
                    return handleError(err);
                }
                plugins[id]['target'] = js.plugin.$.version;
                checkedRemoteVersion();
            });
        });
    }catch(e){
        handleError("Exception occurred: "+e.message);
    }
}

function checkLocalSource(id, source){
    function handleError(err){
        handleRemoteVersionCheckError(id, "Failed to read version from local source", err);
    }

    try{
        var fileContents;
        try{
            fileContents = fs.readFileSync(source.path+"/plugin.xml", 'utf-8');
        }catch(e){
            return handleError("plugin.xml not found - make sure the specified local source contains a Cordova plugin");
        }

        xml2js(fileContents, function(err, js){
            if(err){
                return handleError(err);
            }
            plugins[id]['target'] = js.plugin.$.version;
            checkedRemoteVersion();
        });
    }catch(e){
        handleError("Exception occurred: "+e.message);
    }
}

/**
 * Parses a git URL in the form git://github.com/some/repo.git#r1.0.0 and returns it as https equivalent
 * @param {string} gitUrl - URL using git:// protocol
 * @return {string} equivalent URL using https:// protocol
 */
function parseGitProtocolUrl(gitUrl){
    var parts = gitUrl.match(GITHUB_GIT_REGEX),
        user = parts[1],
        repo = parts[2];
    return "https://github.com/"+user+"/"+repo;
}

function checkedRemoteVersion(){
    checkCount++;
    if(checkCount === pluginCount){
        progress.end();
        compareVersions();
    }
}

function compareVersions(){
    try{
        var plugin;
        for(var id in plugins){
            plugin = plugins[id];
            try{
                if(!plugin.target || (!plugin.installed && target === "remote" )){
                    plugin.status = "error";
                }else if(plugin.installed ===  plugin.target || semver.eq(plugin.installed, plugin.target)){
                    plugin.status = "equal";
                }else if(semver.lt(plugin.installed, plugin.target)) {
                    plugin.status = "newer-target";
                }else if(semver.gt(plugin.installed, plugin.target)) {
                    plugin.status = "newer-installed";
                }else{
                    plugin.status = "unknown-mismatch";
                }
            }catch(e){
                plugin.status = "error";
                plugin.error = "Error comparing versions: local version="+plugin.installed+"; target version="+plugin.target+"; version error="+ e.message;
            }
        }
    displayResults();
    }catch(e){
        errorHandler.handleFatalException(e);
    }
}

function displayResults(){
    // Outdated local
    var outdated = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-target";
    });
    if(outdated.length > 0){
        logger.log(getTitle("Plugin update available").green);
        outdated.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.target).green);
        });
    }


    // newer local/unknown mismatch
    var newer = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-installed";
    });
    if(newer.length > 0){
        logger.log(getTitle("Installed plugin version newer than target default").yellow);
        newer.forEach(function(plugin){
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

    if(outdated.length > 0){
        update.doUpdate(plugins, outdated, {
            updateMode: updateMode,
            unconstrainVersions: unconstrainVersions,
            save: cliArgs["save"],
            forceUpdate: cliArgs["force-update"]
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
    if(source.type === "git"){
        source = source.url;
    }else if(source.type === "registry"){
        source = "npm://"+source.id;
    }else if(source.type === "local"){
        source = source.path;
    }else{
        source = "UNKNOWN";
    }
    installedVersion = installedVersion ? installedVersion : "UNKNOWN";
    targetVersion = targetVersion ? targetVersion : "UNKNOWN";

    if(installedVersion === "UNKNOWN" && targetVersion !== "UNKNOWN"){
        installedVersion += " - check plugins/fetch.json for orphaned entries";
    }else if(targetVersion === "UNKNOWN" && installedVersion !== "UNKNOWN"){
        installedVersion += " - check target source is valid";
    }

    var snippet =  "plugin: "+id+
            "\nsource: "+source+
            "\ninstalled version: "+installedVersion+
            "\ntarget version: "+targetVersion;
    if(error){
        snippet += "\nerror: "+error;
    }
    snippet += "\n";
    return snippet;
}




function help(){
    function log(msg){
        logger.log(msg);
    }
    function linebreak(){
        log("");
    }

    function tabIndent(msg){
        return "    " + msg;
    }

    function displayOption(args, description){
        log(tabIndent(args+" ...... "+description));
    }

    linebreak();
    log("Synopsis");
    linebreak();
    log(tabIndent("cordova-check-plugins [options]"));
    linebreak();
    log("Options");

    displayOption("-h, --help", "Displays this help list.");
    displayOption("-v, --version", "Displays currently installed version of this module.");
    displayOption("--verbose", "Displays detailed log output.");
    displayOption("--update={mode|pluginIds}", "Specifies update mode for plugins which have updates available.");
        log(tabIndent("Valid modes are:"));
        log(tabIndent((tabIndent("none - (default) don't update plugins"))));
        log(tabIndent((tabIndent("interactive - using interactive CLI to choose which plugins to update manually"))));
        log(tabIndent((tabIndent("auto - automatically update any plugins for which an update is available"))));
        log(tabIndent("Or where pluginIds is the ID of a single specific plugin to update, or a space-separated list of multiple plugin IDs"));
    displayOption("--force-update", "Forces the update of dependent plugins.");
    displayOption("--unconstrain-versions", "Unconstrains checking of remote version so the highest remote version will be displayed regardless of locally specified version.");
    displayOption("--github-username", "Username to use for authenticated access to GitHub API. Specification of user credentials for GitHub increases API request limit to 5000 requests/hour.");
    displayOption("--github-password", "Password to use for authenticated access to GitHub API. Specification of user credentials for GitHub increases API request limit to 5000 requests/hour.");

    linebreak();
    log("For more details see the Github page: http://github.com/dpa99c/cordova-check-plugins");

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
