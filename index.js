#!/usr/bin/env node

/**********
 * Modules
 **********/
try{
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
        xml2js = require('xml2js').parseString,
        plugman = require('plugman');
}catch(e){
    handleFatalException(e, "Failed to acquire module dependencies");
}


/***********
 * Constants
 ***********/
var PLUGINS_DIR = './plugins/',
    FETCH_FILE = PLUGINS_DIR + 'fetch.json',
    GITHUB_HTTPS_REGEX = /^https:\/\/(?:\w*:?\w*@?)github\.com\/([^\/]+)\/([^\/.]+)(?:\.git)?$/,
    GITHUB_GIT_REGEX = /^git:\/\/(?:\w*:?\w*@?)github\.com\/([^\/]+)\/([^\/.]+)(?:\.git)?$/;

/******************
 * Global variables
 ******************/
var verbose = false,
    unconstrainVersions = false,
    save = false,
    updateMode = null,
    cliArgs,
    plugins = {},
    pluginCount,
    checkCount,
    ghClient,
    spinner,
    spinning = false;

function readJson(){

    logger.debug("Finding installed plugins");
    startProgress("Checking local versions");
    jsonfile.readFile(FETCH_FILE, function(err, json){
        try{
            if(err){
                var msg = "FATAL ERROR: Failed to read plugins/fetch.json - ensure you're running this command from the root of a Cordova project\n\n"+err;
                logger.error(msg);
                return -1;
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
            getCurrentVersions();
        }catch(e){
            handleFatalException(e);
        }
    })
}

function getCurrentVersions(){
    logger.debug("Reading installed plugin versions");
    var installedPlugins = pluginInfoProvider.getAllWithinSearchPath(PLUGINS_DIR);

    installedPlugins.forEach(function(plugin){
        if(plugins[plugin.id]){
            plugins[plugin.id]['installed'] = plugin.version;
        }else{
            var msg = "Plugin '"+plugin.id+"' is present in /plugins folder but not in fetch.json";
            logger.error(msg);
        }
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
    var idToCheck = unconstrainVersions ? source.id.replace(/(@.*)$/, '') : source.id;
    logger.debug("Checking latest npm registry version for '"+id+"' using '"+idToCheck+"'");

    exec('npm view '+idToCheck+' version', function(err, stdout, stderr) {
        try{
            if(err){
                handleRemoteVersionCheckError(id, "Failed to check npm registry", err);
                return -1;
            }
            logger.debug("Retrieved latest npm registry version for '"+id);
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
            plugins[id]['remote'] = version.replace('\n','');
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
                logger.debug("Using specified GitHub credentials to authenticate access to the GitHub API");
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

        logger.debug("Checking latest github version for '"+id+"' using '"+source.url+(source.ref ? "#"+source.ref : "")+"'");
        ghrepo.contents('plugin.xml', ref, function(err, data){
            if(err){
                if(err.toString().match("Not Found")){
                    err = "plugin.xml not found - make sure the specified repo contains a Cordova plugin";
                }
                return handleError(err);
            }
            logger.debug("Retrieved latest github version for '"+id);
            var xml = Base64.decode(data.content);

            xml2js(xml, function(err, js){
                if(err){
                    return handleError(err);
                }
                plugins[id]['remote'] = js.plugin.$.version;
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
            plugins[id]['remote'] = js.plugin.$.version;
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
        endProgress();
        compareVersions();
    }
}

function compareVersions(){
    try{
        var plugin;
        for(var id in plugins){
            plugin = plugins[id];
            try{
                if(!plugin.installed || !plugin.remote){
                    plugin.status = "error";
                }else if(plugin.installed ===  plugin.remote || semver.eq(plugin.installed, plugin.remote)){
                    plugin.status = "equal";
                }else if(semver.lt(plugin.installed, plugin.remote)) {
                    plugin.status = "newer-remote";
                }else if(semver.gt(plugin.installed, plugin.remote)) {
                    plugin.status = "newer-installed";
                }else{
                    plugin.status = "unknown-mismatch";
                }
            }catch(e){
                plugin.status = "error";
                plugin.error = "Error comparing versions: local version="+plugin.installed+"; remote version="+plugin.remote+"; version error="+ e.message;
            }
        }
    displayResults();
    }catch(e){
        handleFatalException(e);
    }
}

function displayResults(){
    // Outdated local
    var outdated = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-remote";
    });
    if(outdated.length > 0){
        logger.log(getTitle("Plugin update available").green);
        outdated.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).green);
        });
    }


    // newer local/unknown mismatch
    var newer = _.filter(plugins, function(plugin, id){
        plugin.id = id;
        return plugin.status === "newer-installed";
    });
    if(newer.length > 0){
        logger.log(getTitle("Installed plugin version newer than remote default").yellow);
        newer.forEach(function(plugin){
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).yellow);
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
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).yellow);
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
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote, plugin.error).red);
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
            logger.log(getPluginSnippet(plugin.id, plugin.source, plugin.installed, plugin.remote).grey);
        });
    }

    if(outdated.length > 0){
        doUpdate(outdated);
    }
}

function updateModeIsPluginIds(){
    return updateMode !== "auto" && updateMode !== "interactive" && updateMode !== "none" && updateMode !== null;
}

function doUpdate(outdated){
    if(updateMode === "auto" && outdated){
        updatePlugins(outdated, function(success){
            if(success){
                logger.log("\nAutomatically updated all outdated plugins".green);
            }else{
                logger.log("\nFailed to update all outdated plugins".yellow);
            }

        });
    }else if(updateMode === "interactive" && outdated){
        updateInteractive(outdated);
    }
    else if(updateModeIsPluginIds()){
        var pluginIds, valid = true, specifiedPlugins = [];
        logger.debug("updateMode: "+updateMode);
        if(updateMode.match(/\ /)){
            logger.debug("updateMode is multiple ");
            pluginIds = updateMode.split(' ');
        }else{
            logger.debug("updateMode is single ");
            pluginIds = [updateMode];
        }

        pluginIds.forEach(function(pluginId){
            if(!plugins[pluginId]){
                valid = false;
                return logger.warn("Cannot update plugin '"+pluginId+"' as it is not installed in the project");
            }

            if(plugins[pluginId].status !== "newer-remote"){
                valid = false;
                return logger.warn("Cannot update plugin '"+pluginId+"' as no newer remote version is available");
            }
            specifiedPlugins.push(plugins[pluginId]);
        });

        updatePlugins(specifiedPlugins, function(success){
            if(success && valid){
                logger.log("\Successfully updated all specified plugins".green);
            }else{
                logger.log("\nFailed to update all specified plugins".yellow);
            }
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
    remoteVersion = remoteVersion ? remoteVersion : "UNKNOWN";

    if(installedVersion === "UNKNOWN" && remoteVersion !== "UNKNOWN"){
        installedVersion += " - check plugins/fetch.json for orphaned entries";
    }else if(remoteVersion === "UNKNOWN" && installedVersion !== "UNKNOWN"){
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
                logger.debug("cordova command not found - checking for phonegap");
                resolvePhonegap();
            }else{
                cb('cordova');
            }
        });
    }
    function resolvePhonegap(){
        exec('phonegap -v', function(err, stdout, stderr) {
            if(err){
                handleFatalError( "Failed to find cordova or phonegap CLI command when listing installed plugins - ensure you have cordova/phonegap npm module installed either locally in your project folder or globally.\n\n"+err);
            }else{
                cb('phonegap');
            }
        });
    }
    resolveCordova();
}

function updatePlugin(plugin, complete){
    var cliCommand;
    logger.log("\n");
    startProgress("Updating '"+plugin.id+"'");
    function finish(result){
        endProgress();
        complete(result);
    }

    function forceRemove(){
        var platforms = _.filter(fs.readdirSync('platforms'), function (file) {
            return fs.statSync(path.resolve('platforms', file)).isDirectory();
        });
        _.each(platforms, function (platform) {
            plugman.raw.uninstall(platform, "platforms/"+platform, plugin.id, "plugins", {
                www_dir: "www",
                force: true
            });
        });
        logger.debug("Forcibly removed plugin '"+plugin.id+"'");
        add();
    }


    function remove(){
        exec(cliCommand+' plugin rm '+plugin.id, function(err, stdout, stderr) {
            if(err){
                var msg = "\nError removing plugin '"+plugin.id+"'" + "\n\n" + err;
                if(cliArgs["force-update"]){
                    logger.debug(msg);
                    forceRemove();
                    return;
                }else{
                    logger.error(msg);
                    finish(-1);
                    return;
                }
            }
            logger.debug("Removed plugin '"+plugin.id+"'");
            add();
        });
    }

    function add(){
        var pluginSource;
        if(plugin.source.type === "git"){
            pluginSource = plugin.source.url;
            if(plugin.source.ref){
                pluginSource += '#'+plugin.source.ref;
            }
        }else{
            pluginSource = plugin.source.id;
            if(unconstrainVersions && pluginSource.match('@')){
                pluginSource = pluginSource.split('@')[0] + '@' + plugin.remote;
            }
        }
        var args = '';
        if(save) args += ' --save';
        for(var name in plugin.variables){
            args += ' --variable '+name+'="'+plugin.variables[name]+'"';
        }

        updateCommand = cliCommand+' plugin add '+pluginSource+args;
        logger.debug('Update command: '+updateCommand);

        exec(updateCommand, function(err, stdout, stderr) {
            if(err){
                var msg = "\nError adding plugin '"+plugin.id+"'" + "\n\n" + err;
                logger.error(msg);
                finish(-1);
                return;
            }
            logger.debug("Re-added plugin '"+plugin.id+"'");
            finish(0);
        });
    }

    resolveCliCommand(function(command){
        cliCommand =  command;
        remove();
    });
}

function updatePlugins(plugins, cb){
    var pluginIds = [];
    plugins.forEach(function(plugin){
        pluginIds.push(plugin.id);
        total = pluginIds.length;
    });
    logger.debug("Updating plugins: "+pluginIds.join(", "));

    var success = true;

    function nextPlugin(){
        if(plugins.length === 0){
            cb(success);
            return;
        }
        var plugin = plugins.pop();
        updatePlugin(plugin, function(result){
            updatedPlugin(plugin, result);
            if(result === -1 && success) success = false;
            nextPlugin();
        });
    }
    nextPlugin();
}

function updatedPlugin(plugin, result){
    if(result === 0){
        logger.log("\nUpdated '"+plugin.id+"'"+" from "+plugin.installed+" to "+plugin.remote);
    }else{
        var msg = "Failed to update plugin '"+plugin.id+"'";
        logger.error(msg);
    }
}


function updateInteractive(plugins){
    function finished(){
        logger.log("\nInteractive update complete".green);
    }
    function nextPlugin(){
        if(plugins.length === 0){
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
                    updatePlugins(plugins, finished);
                    break;
                case "abort":
                    finished();
                    break;
            }
        });
    }
    nextPlugin();
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
 * Logging
 ***********/
var logger = {
    log: function(msg){
        console.log(msg);
    },
    warn: function(msg){
        console.warn(msg.yellow);
    },
    error: function(msg){
        console.warn(msg.red);
    },
    debug: function(msg){
        if(!verbose) return;
        if(spinning) msg = '\n'+msg;
        logger.log(msg.cyan);
    },
    dump: function (obj){
        var util = require('util');
        logger.log(util.inspect(obj));
    }
};


/**************************
 * Global exception handler
 **************************/
function handleFatalException(e, _msg){
    var msg = "FATAL EXCEPTION: ";
    if(_msg) msg += _msg + "; ";
    msg += e.message;
    logger ? logger.error(msg) : console.error(msg);
    process.exit(1); // exit on fatal error
}

function handleFatalError(msg){
    var msg = "FATAL ERROR: " + msg;
    logger ? logger.error(msg) : console.error(msg);
    process.exit(1); // exit on fatal error
}

/***********
 * Main
 ***********/
function run(){
    try{
        logger.debug("Running cordova-check-plugins...");

        // Setup
        cliArgs = minimist(process.argv.slice(2));

        if(cliArgs["v"] || cliArgs["version"]){
            return logger.log(require('./package.json').version);
        }

        if(cliArgs["h"] || cliArgs["help"]){
            return help();
        }

        if(cliArgs["verbose"]){
            verbose = true;
            logger.debug("Verbose output enabled");
        }
        if(cliArgs["unconstrain-versions"]){
            unconstrainVersions = true;
            logger.debug("Unconstraining version checks: highest remote version will be displayed regardless of locally specified version");
        }
        if(cliArgs["update"]){
            updateMode = cliArgs["update"];
        }
        if(cliArgs["save"]){
            save = true;
        }
        Spinner.setDefaultSpinnerString('|/-\\');

        readJson();
    }catch(e){
        handleFatalException(e);
    }
}

/*******************
 * Module invocation
 *******************/
run();