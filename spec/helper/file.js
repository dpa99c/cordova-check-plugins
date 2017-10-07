#!/usr/bin/env node

var fileHelper = (function(){

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');
    var exec = require('child_process').exec;

    // lib
    var logger = require('../../lib/logger.js')();
    var local = require('../../lib/local.js')();

    // 3rd party
    try{
        var fs = require('fs-extra');
    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var fileHelper;

    /************
     * Public API
     ************/
    fileHelper = {
        listPlugins: function(onFinish){
            exec('cordova plugin ls', function(err, stdout, stderr) {
                if(err){
                    return onFinish(null, err, stderr);
                }
                var plugins = {};
                if(!stdout.match('No plugins added')){
                    var entries = stdout.split(/\n/g);
                    entries.forEach(function(entry){
                        if(!entry) return;
                        var fields = entry.split(/\ /g);
                        var id = fields.shift();
                        var version = fields.shift();
                        plugins[id] = {
                            id: id,
                            version: version,
                            title: fields.join(' ').replace(/[\r\"]/g,'')
                        };
                    });
                }
                onFinish(plugins, 0, stderr);
            });
        },
        rmdirRfSync: function(path) {
            var files = [];
            if( fs.existsSync(path) ) {
                files = fs.readdirSync(path);
                files.forEach(function(file,index){
                    var curPath = path + "/" + file;
                    if(fs.lstatSync(curPath).isDirectory()) { // recurse
                        fileHelper.rmdirRfSync(curPath);
                    } else { // delete file
                        fs.unlinkSync(curPath);
                    }
                });
                fs.rmdirSync(path);
            }
        },
        removePluginsDir: function(){
            fileHelper.rmdirRfSync(path.resolve('plugins'));
            logger.verbose("Removed plugins/");
        },
        restoreConfigXml: function(){
            fs.copySync(path.resolve('spec/config.xml'), path.resolve('./config.xml'));
            logger.verbose("Restored original config.xml");
        },
        restorePackageJson: function(){
            fs.copySync(path.resolve('spec/package.json'), path.resolve('./package.json'));
            logger.verbose("Restored original package.json");
        },
        reset: function(onFinish){
            fileHelper.removeAllPlugins(function(){
                fileHelper.removePluginsDir();
                fileHelper.restoreConfigXml();
                fileHelper.restorePackageJson();
                logger.verbose("Reset complete");
                onFinish();
            });
        },
        resetPlatforms: function(onFinish){
            var platforms = local.getPlatforms();
            
            var _resetPlatforms; _resetPlatforms = function(){
                if(platforms.length === 0){
                    logger.verbose("Platforms reset");
                    return onFinish();
                }
                var platform = platforms.pop();
                exec("cordova platform rm "+platform+" && cordova platform add "+platform, function(err, stdout, stderr) {
                    logger.verbose("Platform reset: "+platform);
                    _resetPlatforms();
                });
            };
            _resetPlatforms();
        },

        addPlugin: function(pluginSource, onFinish, opts){
            opts = opts || {};
            var command  = 'cordova plugin add "'+pluginSource+'" --nofetch';
            if(opts.save){
                command += ' --save';
            }else{
                command += ' --nosave';
            }
            if(opts.variables){
                for(var name in opts.variables){
                    var value = opts.variables[name];
                    command += ' --variable '+name+'="'+value+'"';
                }
            }

            logger.verbose("Adding plugin: '"+command+"'");
            exec(command, function(err, stdout, stderr) {
                if(err){
                    return onFinish(-1, stdout, stderr);
                }
                onFinish(0, stdout, stderr);
            });
        },
        addPlugins: function(pluginSources, onFinish, opts){
            var addNextPlugin; var results = {};
            addNextPlugin = function(pluginSource, err, stdout, stderr){
                if(pluginSource){
                    results[pluginSource] = [err, stdout, stderr];
                }
                if(pluginSources.length === 0) return onFinish(results);

                var pluginSource = pluginSources.shift();
                fileHelper.addPlugin(pluginSource, addNextPlugin.bind(this, pluginSource), opts);
            };
            addNextPlugin();
        },
        removePlugin: function(pluginId, onFinish, opts){
            opts = opts || {};
            var command  = 'cordova plugin rm "'+pluginId+'"';
            if(opts.save){
                command += ' --save';
            }else{
                command += ' --nosave';
            }

            logger.verbose("Removing plugin: '"+command+"'");
            exec(command, function(err, stdout, stderr) {
                if(err){
                    return onFinish(-1, stdout, stderr);
                }
                onFinish(0, stdout, stderr);
            });
        },
        removePlugins: function(pluginIds, onFinish, opts){
            var doNextPlugin; var results = {};
            doNextPlugin = function(pluginId, err, stdout, stderr){
                if(pluginId){
                    results[pluginId] = [err, stdout, stderr];
                }
                if(pluginIds.length === 0) return onFinish(results);

                var pluginId = pluginIds.shift();
                fileHelper.removePlugin(pluginId, doNextPlugin.bind(this, pluginId), opts);
            };
            doNextPlugin();
        },
        removeAllPlugins: function(onFinish, opts){
            fileHelper.listPlugins(function(plugins){
                var pluginIds = [];
                for(var pluginId in plugins){
                    pluginIds.push(pluginId);
                }
                fileHelper.removePlugins(pluginIds, onFinish, opts);
            });
        },
        readFetchJson: function(){
            var fileContents = fs.readFileSync(path.resolve('./plugins/fetch.json'), 'utf-8');
            return JSON.parse(fileContents);
        },
        writeFetchJson: function(fileContents){
            fs.writeFileSync(path.resolve('./plugins/fetch.json'), JSON.stringify(fileContents), 'utf-8');
        },
        readPackageJson: function(dir){
            dir = dir || '.';
            var fileContents = fs.readFileSync(path.resolve(dir + '/package.json'), 'utf-8');
            return JSON.parse(fileContents);
        },
        writePackageJson: function(fileContents, dir){
            dir = dir || '.';
            fs.writeFileSync(path.resolve(dir + '/package.json'), JSON.stringify(fileContents), 'utf-8');
        },
        setPluginInProjectPackageJson: function(pluginId, version, add){
            var packageJson = fileHelper.readPackageJson();
            var dependencies = packageJson.dependencies || {};
            if(dependencies[pluginId] || add){
                dependencies[pluginId] = version;
                packageJson.dependencies = dependencies;

                var cordova = packageJson.cordova || {};
                var plugins = cordova.plugins || {};
                plugins[pluginId] = {};
                cordova.plugins = plugins;
                packageJson.cordova = cordova;
                fileHelper.writePackageJson(packageJson);
            }
        },
        readConfigXml: function(){
          return fs.readFileSync(path.resolve('./config.xml'), 'utf-8');
        },
        writeConfigXml: function(fileContents){
            fs.writeFileSync(path.resolve('./config.xml'), fileContents, 'utf-8');
        },
        setPluginInConfigXml: function(pluginId, version, add){
            var configXml = fileHelper.readConfigXml();
            var source = '<plugin name="'+pluginId+'" spec="[^"]+" />';
            var target = '<plugin name="'+pluginId+'" spec="'+version+'" />';

            if(configXml.match(source)){
                configXml = configXml.replace(source, target);
                fileHelper.writeConfigXml(configXml);
            }else if(add){
                configXml = configXml.replace('</widget>', target+'\n</widget>');
                fileHelper.writeConfigXml(configXml);
            }
        },
        forceLocalPluginVersion: function(pluginId, version) {
            //plugin.xml
            var fileContents = fs.readFileSync(path.resolve('./plugins/' + pluginId + '/plugin.xml'), 'utf-8');
            var plugin_orig = fileContents.match(/<plugin(?: )*([^>]+)>/)[0];
            var plugin_new = plugin_orig.replace(/version="[^"]+"/, 'version="' + version + '"');
            fileContents = fileContents.replace(plugin_orig, plugin_new);
            fs.writeFileSync(path.resolve('./plugins/' + pluginId + '/plugin.xml'), fileContents, 'utf-8');

            //package.json
            var packageJson = fileHelper.readPackageJson('./plugins/' + pluginId);
            packageJson.version = version;
            fileHelper.writePackageJson(packageJson, './plugins/' + pluginId);
        },

        addPluginToConfig: function(name, spec){
            //config.xml
            fileHelper.setPluginInConfigXml(name, spec, true);

            //package.json
            fileHelper.setPluginInProjectPackageJson(name, spec, true);
        }
    };
    return fileHelper;
})();

module.exports = function(){
    return fileHelper;
};