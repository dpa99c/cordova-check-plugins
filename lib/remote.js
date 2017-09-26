#!/usr/bin/env node

var remote = (function(){

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');
    var exec = require('child_process').exec;

    // lib
    var logger = require('./logger.js')();
    var errorHandler = require('./errorHandler.js')();
    var progress = require('./progress.js')();
    var cliArgs = require('./cliArgs.js')().args;

    // 3rd party
    try{
        var fs = require('fs-extra');
        var xml2js = require('xml2js').parseString;
        var _ = require('lodash');
        var semver = require('semver');
        var github = require('octonode');
        var Base64 = require('js-base64').Base64;
    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var remote = {};

    var opts, plugins, onFinish, pluginCount, unconstrainVersions,
        checkCount, ghClient;

    /**********************
     * Internal functions
     *********************/

    function checkRemoteVersions(){
        var plugin;
        checkCount = 0;
        progress.end();
        progress.start("Checking remote versions");
        for(var id in plugins){
            plugin = plugins[id];
            if(plugin.source.type === "git" || (plugin.source.id && plugin.source.id.match(remote.GITHUB_REGEX))){
                checkGitSource(id, plugin.source);
            }else if(plugin.source.type === "local"){
                checkLocalSource(id, plugin.source);
            }else if(plugin.source.type === "registry"){
                checkRegistrySource(id, plugin.source);
            }else {
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

        exec(command, {cwd: opts.cwd}, function(err, stdout, stderr) {
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
        var key = source.url ? "url" : "id";
        if(source[key].match(remote.GITHUB_REGEX)){
            checkGitHubSource(id, source, key);
        }else{
            // TODO support Git sources other than github.com
            return handleRemoteVersionCheckError(id, "source."+key+" '"+source[key]+"' is not a valid github repo URL in the form 'https://github.com/username/reponame' or 'git://github.com/username/reponame.git'");
        }
    }
    
    function parseGithubUrl(url){
        var parts = url.match(remote.GITHUB_REGEX);
        if(!parts) return null;
        return {
            protocol: parts[1],
            username: parts[2],
            password: parts[3],
            user: parts[4],
            repo: parts[5],
            ref: parts[6]
        };
    }

    function checkGitHubSource(id, source, key){
        function handleError(err){
            handleRemoteVersionCheckError(id, "Failed to read version from github repo", err);
        }

        try{
            var urlParts = parseGithubUrl(source[key]),
                username = urlParts.username,
                password = urlParts.password,
                user = urlParts.user,
                repo = urlParts.repo,
                ref = urlParts.ref || source.ref;


            var ghOpts = {},
                credsSpecified = false;
            if(username){
                credsSpecified = true;
                logger.verbose("Using explicit GitHub credentials to authenticate access to the GitHub API");
                if(password){
                    ghOpts.username = username;
                    ghOpts.password = password;
                }else{
                    ghOpts = username; // assume username is access token
                }
            }

            if(!credsSpecified && cliArgs["github-username"] && cliArgs["github-password"]){
                ghOpts.username = cliArgs["github-username"];
                ghOpts.password = cliArgs["github-password"];
                logger.verbose("Using configured GitHub credentials to authenticate access to the GitHub API");
            }
            ghClient = github.client(ghOpts);
            ghrepo = ghClient.repo(user+'/'+repo);

            logger.verbose("Checking latest github version for '"+id+"' using '"+source[key]+(source.ref ? "#"+source.ref : "")+"'");
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
                fileContents = fs.readFileSync(path.resolve(opts.cwd, source.path, "plugin.xml"), 'utf-8');
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

    function checkedRemoteVersion(){
        checkCount++;
        if(checkCount === pluginCount){
            compareVersions();
        }
    }

    function compareVersions(){
        try{
            progress.end();
            var plugin;
            for(var id in plugins){
                plugin = plugins[id];
                try{
                    if(plugin.error || !plugin.target || !plugin.installed) {
                        plugin.status = "error";
                    }
                    else if(plugin.installed ===  plugin.target || semver.eq(plugin.installed, plugin.target)){
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
            onFinish();
        }catch(e){
            errorHandler.handleFatalException(e);
        }
    }

    /**********************
     * Public properties
     *********************/
    remote.GITHUB_REGEX = /^(?:(?:[^@]+)@)?(?:(?:git\+)?(https|git)):\/\/(?:([^:@]*):?([^@:]*)@?)github\.com\/([^\/#]+)\/([^\/.#]+)(?:\.git)?(?:#([^#]+))?$/;

    /************
     * Public API
     ************/
    remote.check = function(_opts){
        opts = _opts;
        plugins = opts.plugins;
        onFinish = opts.onFinish;
        pluginCount = opts.pluginCount;
        unconstrainVersions = opts.unconstrainVersions;
        checkRemoteVersions();
    };

    remote.normalizeGithubURL = function(url){
        var parts = parseGithubUrl(url);
        if(!parts) return '';
        var normalizedUrl = parts.protocol + "://" + ((parts.username && parts.password) ? (parts.username + ":" + parts.password + "@") : '') + "github.com/" + parts.user + "/" + parts.repo;
        if(parts.ref) normalizedUrl += "#" + parts.ref;
        return normalizedUrl;
    };

    remote.normalizeGithubSource = function(source){
        var url = '';
        if(source.type === "git"){
            url = remote.normalizeGithubURL(source.url);
            if(source.ref) url += "#" + source.ref;
        }else{
            url = remote.normalizeGithubURL(source.id);
        }
        return url;
    };

    return remote;
})();

module.exports = function(){
    return remote;
};