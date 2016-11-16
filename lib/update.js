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

    /**********************
     * Internal functions
     *********************/
    function updateModeIsPluginIds(){
        return opts.updateMode !== "auto" && opts.updateMode !== "interactive" && opts.updateMode !== "none" && opts.updateMode !== null;
    }

    function resolveCliCommand(cb){
        function resolveCordova(){
            exec('cordova -v', function(err, stdout, stderr) {
                if(err){
                    logger.verbose("cordova command not found - checking for phonegap");
                    resolvePhonegap();
                }else{
                    cb('cordova');
                }
            });
        }
        function resolvePhonegap(){
            exec('phonegap -v', function(err, stdout, stderr) {
                if(err){
                    errorHandler.handleFatalError( "Failed to find cordova or phonegap CLI command when listing installed plugins - ensure you have cordova/phonegap npm module installed either locally in your project folder or globally.\n\n"+err);
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
        progress.start("Updating '"+plugin.id+"'");
        function finish(result){
            progress.end();
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
            logger.verbose("Forcibly removed plugin '"+plugin.id+"'");
            add();
        }


        function remove(){
            exec(cliCommand+' plugin rm '+plugin.id, function(err, stdout, stderr) {
                if(err){
                    var msg = "\nError removing plugin '"+plugin.id+"'" + "\n\n" + err;
                    if(opts.forceUpdate){
                        logger.verbose(msg);
                        forceRemove();
                        return;
                    }else{
                        logger.error(msg);
                        finish(-1);
                        return;
                    }
                }
                logger.verbose("Removed plugin '"+plugin.id+"'");
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
                if(opts.unconstrainVersions && pluginSource.match('@')){
                    pluginSource = pluginSource.split('@')[0] + '@' + plugin.target;
                }
            }
            var args = '';
            if(opts.save) args += ' --save';
            for(var name in plugin.variables){
                args += ' --variable '+name+'="'+plugin.variables[name]+'"';
            }

            updateCommand = cliCommand+' plugin add '+pluginSource+args;
            logger.verbose('Update command: '+updateCommand);

            exec(updateCommand, function(err, stdout, stderr) {
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
            remove();
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
            if(opts.updateMode.match(/\ /)){
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
    
    return update;
})();

module.exports = function(){
    return update;
};