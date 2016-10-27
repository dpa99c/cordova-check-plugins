#!/usr/bin/env node

var update = (function(){

    /**********
     * Modules
     **********/
    // lib
    var logger = require('lib/logger.js')();
    var errorHandler = require('lib/errorHandler.js')();
    var progress = require('lib/progress.js')();

    // 3rd party
    try{
        
        var path = require('path'),
            fs = require('fs-extra'),
            exec = require('child_process').exec,
            _ = require('lodash'),
            inquirer = require('inquirer'),
            plugman = require('plugman');

    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var update = {};
    var updateMode;

    /**********************
     * Internal functions
     *********************/
    function updateModeIsPluginIds(){
        return updateMode !== "auto" && updateMode !== "interactive" && updateMode !== "none" && updateMode !== null;
    }

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
                    pluginSource = pluginSource.split('@')[0] + '@' + plugin.target;
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
            logger.log("\nUpdated '"+plugin.id+"'"+" from "+plugin.installed+" to "+plugin.target);
        }else{
            var msg = "Failed to update plugin '"+plugin.id+"'";
            logger.error(msg);
        }
    }


    function updateInteractive(plugins){
        logger.debug("Interactive update started");
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
    update.doUpdate = function (outdated, _updateMode){
        updateMode = _updateMode;

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

                if(plugins[pluginId].status !== "newer-target"){
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