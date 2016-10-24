#!/usr/bin/env node

var fileHelper = (function(){

    /**********************
     * Internal properties
     *********************/
    var fileHelper;

    var fs = require('fs-extra');
    var path = require('path');
    var exec = require('child_process').exec;
    var logger = require(path.resolve('spec/helper/logger.js'))();

    /************
     * Public API
     ************/
    fileHelper = {
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
            logger.log("Removed plugins/");
        },
        restoreConfigXml: function(){
            fs.copySync(path.resolve('spec/config.xml'), path.resolve('./config.xml'));
            logger.log("Restored original config.xml");
        },
        reset: function(){
            fileHelper.removePluginsDir();
            fileHelper.restoreConfigXml();
            logger.log("Reset complete");
        },
        addPlugin: function(pluginSource, onFinish, opts){
            opts = opts || {};
            var command  = 'cordova plugin add '+pluginSource;
            if(opts.save) command += ' --save';

            logger.log("Adding plugin: "+pluginSource);
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
                if(pluginSources.length == 0) return onFinish(results);

                var pluginSource = pluginSources.pop();
                fileHelper.addPlugin(pluginSource, addNextPlugin.bind(this, pluginSource), opts);
            };
            addNextPlugin();
        },
        listPlugins: function(onFinish){
            exec('cordova plugin ls', function(err, stdout, stderr) {
                if(err){
                    return onFinish(-1, stderr);
                }
                var plugins = {};
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
                    }
                });
                onFinish(0, plugins, stderr);
            });
        },
        readFetchJson: function(){
            var fileContents = fs.readFileSync(path.resolve('./plugins/fetch.json'), 'utf-8');
            return JSON.parse(fileContents);
        },
        writeFetchJson: function(fileContents){
            fs.writeFileSync(path.resolve('./plugins/fetch.json'), JSON.stringify(fileContents), 'utf-8');
        },
        forceLocalPluginVersion: function(pluginId, version){
            var fileContents = fs.readFileSync(path.resolve('./plugins/'+pluginId+'/plugin.xml'), 'utf-8');
            var plugin_orig = fileContents.match(/<plugin ([^>]+)>/)[0];
            var plugin_new = plugin_orig.replace(/version="[^"]+"/, 'version="'+version+'"');
            fileContents = fileContents.replace(plugin_orig, plugin_new);
            fs.writeFileSync(path.resolve('./plugins/'+pluginId+'/plugin.xml'), fileContents, 'utf-8');
        }
    };
    return fileHelper;
})();

module.exports = function(){
    return fileHelper;
};