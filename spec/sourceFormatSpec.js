/**********
 * Modules
 **********/

// Core
var path = require('path');
var fs = require('fs');

// helper
var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();

//lib
var logger = require(path.resolve('lib/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for plugin source format", function() {


    var err, stdout, stderr, output;

    beforeAll(function(done) {
        fileHelper.reset(function(){
            fileHelper.addPlugins([
                'cordova-plugin-camera',
                'cordova-plugin-geolocation@*',
                'uk.co.workingedge.phonegap.plugin.launchnavigator@2',
                'cordova-plugin-file@4.0.0',
                'cordova.plugins.diagnostic@~2.0.0',
                'cordova-custom-config@^1.0.0',
                'https://github.com/apache/cordova-plugin-network-information',
                'https://github.com/apache/cordova-plugin-battery-status#r1.0.0',
                'git://github.com/apache/cordova-plugin-statusbar.git#r1.0.1',
                path.resolve('./spec/local_plugin')

            ], function(results){
                fileHelper.forceLocalPluginVersion('uk.co.workingedge.phonegap.plugin.launchnavigator', '2.6.0');
                fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
                fileHelper.forceLocalPluginVersion('cordova-custom-config', '1.0.0');

                toolHelper.run(null, function(_err, _stdout, _stderr, _parsed_stdout){
                    err = _err;
                    stdout = _stdout;
                    stderr = _stderr;
                    output = _parsed_stdout;
                    done();
                });
            });
        });
    });


    // Plugin sources
    it("should handle plugin sources in the format 'cordova-plugin-camera'", function() {
        expect(output.section.upToDate['cordova-plugin-camera']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-geolocation@*'", function() {
        expect(output.section.upToDate['cordova-plugin-geolocation']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-file@4.0.0'", function() {
        expect(output.section.upToDate['cordova-plugin-file']).toBeDefined();
    });
    it("should handle plugin sources in the format 'uk.co.workingedge.phonegap.plugin.launchnavigator@2'", function() {
        var plugin = output.section.updateAvailable['uk.co.workingedge.phonegap.plugin.launchnavigator'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d/))).toBeFalsy();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });
    it("should handle plugin sources in the format 'cordova.plugins.diagnostic@~2.0.0'", function() {
        var plugin = output.section.updateAvailable['cordova.plugins.diagnostic'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });
    it("should handle plugin sources in the format 'cordova-custom-config@^1.0.0'", function() {
        var plugin = output.section.updateAvailable['cordova-custom-config'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d/))).toBeFalsy();
        expect(plugin['installed version'].match(plugin['target version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });
    it("should handle plugin sources in the format 'https://github.com/apache/cordova-plugin-network-information'", function() {
        expect(output.section.upToDate['cordova-plugin-network-information']).toBeDefined();
    });
    it("should handle plugin sources in the format 'https://github.com/apache/cordova-plugin-battery-status#r1.0.0'", function() {
        expect(output.section.upToDate['cordova-plugin-battery-status']).toBeDefined();
    });
    it("should handle plugin sources in the format 'git://github.com/apache/cordova-plugin-statusbar.git#r1.0.1'", function() {
        expect(output.section.upToDate['cordova-plugin-statusbar']).toBeDefined();
    });
    it("should handle plugin sources in the format '/path/to/local/plugin'", function() {
        expect(output.section.upToDate['local_plugin']).toBeDefined();
    });

});
