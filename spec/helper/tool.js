#!/usr/bin/env node

var toolHelper = (function(){

    /**********************
     * Modules
     *********************/
    var exec = require('child_process').exec;
    var path = require('path');
    var logger = require(path.resolve('spec/helper/logger.js'))();

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
        var command = "cordova-check-plugins " + args + ' ' + staticArgs;
        logger.log("Running tool: "+toolHelper.obfuscateCliArgs(command));
        exec(command, function(err, stdout, stderr) {
            if(err){
                return onFinish(-1, stdout, stderr);
            }
            onFinish(0, stdout, stderr, toolHelper.parseOutput(stdout));
        });
    };

    toolHelper.parseOutput = function(stdout){
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
                updateAvailable: getSection('Plugin update available'),
                upToDate: getSection('Up-to-date plugins'),
                installedNewer: getSection('Installed plugin version newer than remote default'),
                unknownVersion: getSection('Unknown plugin version mismatch'),
                error: getSection('Error checking plugin version')
            }
        };
        return result;
    };
    return toolHelper;
})();

module.exports = function(){
    return toolHelper;
};