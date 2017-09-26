#!/usr/bin/env node

var update = (function(){

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
    var local = require('./local.js')();

    // 3rd party
    try{
        var fs = require('fs-extra');
        var _ = require('lodash');
        var inquirer = require('inquirer');
        var plugman = require('plugman');

    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var update = {};
    var opts;

    var localCordova = "node node_modules/cordova/bin/cordova";
    var globalCordova = "cordova";
    var globalPhonegap = "phonegap";

    /**********************
     * Internal functions
     *********************/
    function updateModeIsPluginIds(){
        return opts.updateMode && opts.updateMode !== "auto" && opts.updateMode !== "interactive" && opts.updateMode !== "none" && opts.updateMode !== null;
    }

    function resolveCliCommand(cb){
        function resolveLocalCordova(){
            exec(localCordova + ' -v', {cwd: opts.cwd}, function(err, stdout, stderr) {
                if(err){
                    logger.verbose("local cordova command not found - checking for global cordova.\n\n"+err);
                    resolveGlobalCordova();
                }else{
                    cb(localCordova);
                }
            });
        }

        function resolveGlobalCordova(){
            exec(globalCordova + ' -v', {cwd: opts.cwd}, function(err, stdout, stderr) {
                if(err){
                    logger.verbose("global cordova command not found - checking for global phonegap.\n\n"+err);
                    resolveGlobalPhonegap();
                }else{
                    cb(globalCordova);
                }
            });
        }
        function resolveGlobalPhonegap(){
            exec(globalPhonegap + ' -v', {cwd: opts.cwd}, function(err, stdout, stderr) {
                if(err){
                    errorHandler.handleFatalError( "Failed to find local/global cordova or global phonegap CLI command when listing installed plugins - ensure you have cordova npm module installed either locally in your project folder or globally.\n\n"+err);
                }else{
                    cb(globalPhonegap);
                }
            });
        }
        resolveLocalCordova();
    }
    function updatePlugin(plugin, complete){
        var cliCommand;
        logger.log("\n");
        progress.start("Updating '"+plugin.id+"'");

        function finish(result){
            progress.end();
            complete(result);
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
                if(opts.unconstrainVersions && pluginSource.match('@')){
                    pluginSource = pluginSource.split('@')[0] + '@' + plugin.target;
                }
            }
            var args = '';
            if(opts.save){
                args += ' --save';
            }else{
                args += ' --nosave';
            }

            if(opts.nofetch){
                args += ' --nofetch';
            }else{
                args += ' --fetch';
            }

            for(var name in plugin.variables){
                args += ' --variable '+name+'="'+plugin.variables[name]+'"';
            }

            updateCommand = cliCommand+' plugin add '+pluginSource+args;
            logger.verbose('Update command: '+updateCommand);

            exec(updateCommand, {cwd: opts.cwd}, function(err, stdout, stderr) {
                if(err){
                    var msg = "\nError adding plugin '"+plugin.id+"'" + "\n\n" + err;
                    logger.error(msg);
                    finish(-1);
                    return;
                }
                logger.verbose("Re-added plugin '"+plugin.id+"'");
                finish(0);
            });
        }

        resolveCliCommand(function(command){
            cliCommand =  command;
        if(plugin.installed){
            remove(plugin.id, function(err){
                if(err !== 0){
                    return finish(-1);
                }else{
                    add();
                }
            }, opts.force);
        }else{
            add();
        }
        });
    }

    function updatePlugins(plugins, cb){
        var pluginIds = [];
        plugins.forEach(function(plugin){
            pluginIds.push(plugin.id);
            total = pluginIds.length;
        });
        logger.verbose("Updating plugins: "+pluginIds.join(", "));

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
            logger.log("\nUpdated '"+plugin.id+"'"+" from "+plugin.installed+" to "+plugin.target);
        }else{
            var msg = "Failed to update plugin '"+plugin.id+"'";
            logger.error(msg);
        }
    }


    function updateInteractive(plugins){
        logger.verbose("Interactive update started");
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
                    message: "Update '"+plugin.id+" from "+plugin.installed+" to "+plugin.target+"?",
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

    function forceRemove(pluginId, save){
        logger.verbose("Forcibly removing plugin '"+pluginId+"'");
        try{
            // remove from platforms/
            var platforms = local.getPlatforms();
            _.each(platforms, function (platform) {
                plugman.raw.uninstall(platform, "platforms/"+platform, pluginId, "plugins", {
                    www_dir: "www",
                    force: true
                });
            });

            // remove from plugins/
            rmdirRfSync(local.PLUGINS_DIR+pluginId);

            var complete = function (){
                logger.verbose("Forcibly removed plugin '"+pluginId+"'");
            };

            var processConfigXml = function (){
                if(save){
                    // remove from config.xml
                    local.readConfigXmlAsJs(function(js){
                        var _plugins = js['widget']['plugin'];
                        if(_plugins && _plugins.length > 0){
                            var deleted = false;
                            for(var i=0; i<_plugins.length; i++){
                                var _plugin = _plugins[i].$;
                                var name = _plugin.name;
                                if(name === pluginId){
                                    delete _plugins[i];
                                    deleted = true;
                                    break;
                                }
                            }
                            if(deleted){
                                local.writeConfigXmlFromJs(js);
                                logger.verbose("Removed plugin entry for '"+pluginId+"' from config.xml");
                            }
                        }
                        complete();
                    });
                }else{
                    complete();
                }
            };

            // remove from fetch.json
            local.readFetchJson(function(err, json){
                if(err){
                    logger.error("Failed to read fetch.json to remove plugin entry for '"+pluginId+"': "+err);
                    return processConfigXml();
                }
                var deleted = false;
                for(var id in json){
                    if(id === pluginId){
                        delete json[id];
                        deleted = true;
                        break;
                    }
                }
                if(deleted){
                    local.writeFetchJson(json, function(err){
                        if(err){
                            logger.error("Failed to write fetch.json after removing plugin entry for '"+pluginId+"': "+err);
                        }else{
                            logger.verbose("Removed plugin entry for '"+pluginId+"' from fetch.json");
                        }
                        processConfigXml();
                    });
                }else{
                    processConfigXml();
                }
            });

        }catch(e){
            logger.error("Failed to forcibly removed plugin '"+pluginId+"': "+e.message);
        }
    }

    function remove (pluginId, callback, force, save){
        resolveCliCommand(function(cliCommand){
            var command = cliCommand+' plugin rm '+pluginId;
        if(save){
            command += ' --save';
        }else{
            command += ' --nosave';
        }
        exec(command, {cwd: opts.cwd}, function(err, stdout, stderr) {
            if(err){
                var msg = "\nError removing plugin '"+pluginId+"'" + "\n\n" + err;
                if(force){
                    logger.verbose(msg);
                    forceRemove(pluginId, save);
                    return callback(0);
                }else{
                    logger.error(msg);
                    return callback(-1);
                }
            }
            logger.verbose("Removed plugin '"+pluginId+"'");
            callback(0);
            });
        });
    }

    var rmdirRfSync; rmdirRfSync = function(path) {
        var files = [];
        if( fs.existsSync(path.resolve(opts.cwd, path)) ) {
            files = fs.readdirSync(path.resolve(opts.cwd, path));
            files.forEach(function(file,index){
                var curPath = path.resolve(opts.cwd, path + "/" + file);
                if(fs.lstatSync(curPath).isDirectory()) {
                    rmdirRfSync(curPath); // recurse
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path.resolve(opts.cwd, path));
        }
    };


    /************
     * Public API
     ************/

    /**
     * @param {array} plugins - list of all known plugins
     * @param {array} outdated - list of outdated plugins
     * @param {object} _opts - update options
     */
    update.doUpdate = function (plugins, outdated, _opts){
        opts = _opts;

        if(opts.updateMode === "auto" && outdated){
            updatePlugins(outdated, function(success){
                if(success){
                    logger.log("\nAutomatically updated all outdated plugins".green);
                }else{
                    logger.log("\nFailed to update all outdated plugins".yellow);
                }

            });
        }else if(opts.updateMode === "interactive" && outdated){
            updateInteractive(outdated);
        }
        else if(updateModeIsPluginIds()){
            var pluginIds, valid = true, specifiedPlugins = [];
            logger.verbose("opts.updateMode: "+opts.updateMode);
            if(opts.updateMode.match && opts.updateMode.match(/\ /)){
                logger.debug("opts.updateMode is multiple ");
                pluginIds = opts.updateMode.split(' ');
            }else{
                logger.debug("opts.updateMode is single ");
                pluginIds = [opts.updateMode];
            }

            pluginIds.forEach(function(pluginId){
                if(!plugins[pluginId]){
                    valid = false;
                    return logger.warn("Cannot update plugin '"+pluginId+"' as it is not installed in the project");
                }

                if(plugins[pluginId].status !== "newer-target" && (opts.target !== "config" || !opts.allowDowndate)){
                    valid = false;
                    return logger.warn("Cannot update plugin '"+pluginId+"' as no newer target version is available");
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
    };

    update.removeAll = function(plugins, force, save){
        var succeededForAll = true;
        var pluginsRemaining = plugins.length;

        function finish(){
            progress.end();
            if(succeededForAll){
                logger.log("\Successfully removed all installed plugins".green);
            }else{
                logger.log("\nFailed to remove all installed plugins".yellow);
            }
        }
        progress.start("Removing all plugins");
        plugins.forEach(function(plugin){
            remove(plugin.id, function(res){
                if(res !== 0){
                    succeededForAll = false;
                }
                pluginsRemaining--;
                if(pluginsRemaining === 0){
                    finish();
                }
            }, force, save);
        });

    };

    return update;
})();

module.exports = function(){
    return update;
};