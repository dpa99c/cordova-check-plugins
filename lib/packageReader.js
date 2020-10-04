#!/usr/bin/env node

var config = (function() {

    /**********
     * Modules
     **********/
        // Core
    var path = require('path');

    // lib
    var logger = require('./logger.js')();
    var errorHandler = require('./errorHandler.js')();
    var progress = require('./progress.js')();
    var remote = require('./remote.js')();
    var local = require('./local.js')();

    // 3rd party
    try {
        var _ = require('lodash');
        var semver = require('semver');
    } catch (e) {
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }


    /**********************
     * Internal properties
     *********************/
    var config = {};

    var plugins, onFinish;


    function readPackage(){
        logger.verbose("Finding configured plugins");

        local.readPackageJson(function(err, js){
            var _plugins = Object.keys(js.cordova.plugins);
            var dev = Object.assign(js.dependencies, js.devDependencies);

            _plugins.forEach( function (_plugin){
                var name = _plugin;
                var version = dev[_plugin];
                Object.keys(dev).forEach( function (x) {
                    var value = dev[x].replace('git+','');
                    if (value === plugins[_plugin].source.id) {
                        plugins[name]['target'] = value;
                    }
                });
                if (dev.hasOwnProperty(_plugin) ){
                    if(!_.isNil(plugins[name])){
                        plugins[name]['target'] = version;
                    }
                }else{
                    logger.verbose("Couldn't find installed plugin '"+_plugin+"' as specified in config.xml - assuming it's a new addition to the config");
                }
            });
            compareVersions();
        });
    }

    function compareVersions(){
        try{
            progress.end();
            var plugin;
            for(var id in plugins){
                plugin = plugins[id];

                try{
                    if(plugin.error || (!plugin.target && !plugin.installed)){
                        plugin.status = "error";
                    }else if(!plugin.installed){
                        plugin.status = "new-target";
                    }else if(!plugin.target){
                        plugin.status = "new-installed";
                    } else if((plugin.source.type === "local" && plugin.source.path === plugin.target)
                        || plugin.installed ===  plugin.target
                        || (plugin.source.type === "git" && remote.normalizeGithubSource(plugin.source) === remote.normalizeGithubURL(plugin.target))
                        || (!!plugin.source.id && plugin.source.id.match(remote.GITHUB_REGEX) && remote.normalizeGithubSource(plugin.source) === remote.normalizeGithubURL((plugin.target)))
                        || (semver.validRange(plugin.target) && semver.satisfies(plugin.installed, plugin.target))
                        || (semver.valid(plugin.target) && semver.eq(plugin.installed, plugin.target))) {
                        plugin.status = "equal";
                    }else if((semver.validRange(plugin.target) && semver.ltr(plugin.installed, plugin.target))
                        || (semver.valid(plugin.target) && semver.lt(plugin.installed, plugin.target))) {
                        plugin.status = "newer-target";
                    }else if((semver.validRange(plugin.target) && semver.gtr(plugin.installed, plugin.target))
                        || (semver.valid(plugin.target) && semver.gt(plugin.installed, plugin.target))) {
                        plugin.status = "newer-installed";
                    }else{
                        plugin.status = "unknown-mismatch";
                    }
                }catch(e){
                    plugin.status = "error";
                    plugin.error = "Error comparing versions: local version="+plugin.installed+"; target version="+plugin.target+"; version error="+ e.message;
                }
            }
            onFinish('package.json');
        }catch(e){
            errorHandler.handleFatalException(e);
        }
    }


    /************
     * Public API
     ************/
    config.check = function(opts){
        plugins = opts.plugins;
        onFinish = opts.onFinish;
        readPackage();
    };

    return config;
})();

module.exports = function(){
    return config;
};
