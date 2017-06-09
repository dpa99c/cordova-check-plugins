#!/usr/bin/env node

var config = (function(){

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
    try{
        var _ = require('lodash');
        var semver = require('semver');
        var semverRegex = require('semver-regex');
    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var config = {};

    var plugins, onFinish;

    /**********************
     * Internal functions
     *********************/

    function readConfigXml(){
        logger.verbose("Finding configured plugins");

        local.readConfigXmlAsJs(function(js){
            var _plugins = js['widget']['plugin'];
            if(_plugins && _plugins.length > 0){
                _plugins.forEach(function(_plugin){
                    _plugin = _plugin.$;
                    var name = _plugin.name;
                    var version = _plugin.spec;
                    if(!name || !version){
                        return logger.error("Malformed <plugin> tag found in config.xml - missing 'name' and/or 'spec': " + logger.getDump(_plugin));
                    }

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
                        logger.verbose("Couldn't find installed plugin '"+name+"' as specified in config.xml - assuming it's a new addition to the config");
                        if(semverRegex().test(version)){
                            plugins[name] = {
                                target: version,
                                source:{
                                    type: "registry",
                                    id: version
                                }
                            };
                        }else if(name.match(remote.GITHUB_GIT_REGEX)){
                            plugins[name] = {
                                target: name,
                                source:{
                                    type: "git",
                                    url: name
                                }
                            };
                        }else if(version.match(remote.GITHUB_GIT_REGEX)){
                            plugins[name] = {
                                target: version,
                                source:{
                                    type: "git",
                                    url: version
                                }
                            };
                        }else{
                            logger.error("Unknown plugin source - cannot install: " + name);
                        }
                    }
                });
                compareVersions();
            }
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
                    } else if(plugin.installed ===  plugin.target
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
            onFinish();
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
        readConfigXml();
    };

    return config;
})();

module.exports = function(){
    return config;
};