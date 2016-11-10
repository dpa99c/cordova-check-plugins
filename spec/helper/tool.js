#!/usr/bin/env node

var toolHelper = (function(){

    /**********************
     * Modules
     *********************/
    // Core
    var path = require('path');
    var exec = require('child_process').exec;

    // lib
    var logger = require('../../lib/logger.js')();

    /**********************
     * Internal properties
     *********************/
    var toolHelper = {};

    var staticArgs = '';

    /**********************
     * Internal functions
     *********************/
    function getSectionRegExp(sectionTitle){
        return new RegExp(sectionTitle+'\\ \\*\\n\\*{3,}(((?!\\*\\*)[\\s\\S])+)');
    }

    /************
     * Public API
     ************/
    toolHelper.setStaticArgs = function(args){
        staticArgs = args;
    };

    toolHelper.obfuscateCliArgs = function(command){
        return command.replace(/github-password=[^ ]+/,'github-password={obfuscated}');
    };

    toolHelper.run = function(args, onFinish){
        args = args || '';
        var target = args.match('target=config') ? 'config' : 'remote';
        var command = "node index.js " + args + ' ' + staticArgs;
        logger.log("Running tool: "+toolHelper.obfuscateCliArgs(command));
        exec(command, function(err, stdout, stderr) {
            if(err){
                return onFinish(-1, stdout, stderr);
            }
            onFinish(0, stdout, stderr, toolHelper.parseOutput(stdout, target));
        });
    };

    toolHelper.parseOutput = function(stdout, target){
        function getSection(title){
            var section = stdout.match(getSectionRegExp(title));
            section = section ? section[1] : false;
            return parseSection(section);
        }

        function parseSection(section){
            var result = {};
            if(!section) return result;

            var plugins = section.split('\n\n');
            plugins.forEach(function(plugin){
                if(!plugin || !plugin.match(/./)) return;
                var pluginData = {};
                var lines = plugin.split('\n');
                lines.forEach(function(line){
                    if(!line) return;
                    var parts = line.split(': ');
                    if(!parts[0] || !parts[1]) return;
                    pluginData[parts[0]] = parts[1];

                });
                result[pluginData['plugin']] = pluginData;
            });
            return result;
        }

        var result = {
            section:{
                newerTarget: getSection(target === 'config' ? "Config version newer than installed" : "Plugin update available"),
                upToDate: getSection("Up-to-date plugins"),
                newerInstalled: getSection(target === 'config' ? "Config version older than installed" : "Installed plugin version newer than remote default"),
                unknownVersion: getSection('Unknown plugin version mismatch'),
                error: getSection('Error checking plugin version')
            }
        };
        if(target === 'config'){
            result.section.newTarget = getSection("New plugins in config.xml (not installed locally)");
            result.section.newInstalled = getSection("Locally installed plugins not in config.xml");
        }
        return result;
    };
    return toolHelper;
})();

module.exports = function(){
    return toolHelper;
};