/**********
 * Modules
 **********/

// Core
var path = require('path');
var fs = require('fs');

// helper
var fileHelper = require('./helper/file.js')();
var toolHelper = require('./helper/tool.js')();
var reporter = require('./helper/reporter.js');

//lib
var credentialsToObfuscate = [
    process.env.GITHUB_PASSWORD,
    process.env.GITHUB_ACCESS_TOKEN
];
var logger = require('../lib/logger.js')();
logger.setCredentialsToObfuscate(credentialsToObfuscate);

jasmine.DEFAULT_TIMEOUT_INTERVAL = 240000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"'+
    ' --obfuscate-credentials="'+credentialsToObfuscate.join(' ')+'"');

describe("A spec for plugin source format", function() {

    var err, stdout, stderr, output;

    beforeAll(function(done) {
        fileHelper.reset(fileHelper.resetPlatforms.bind(this, function(){
            fileHelper.addPlugins([
                'cordova-plugin-camera',
                'cordova-plugin-geolocation@*',
                'uk.co.workingedge.phonegap.plugin.launchnavigator@2',
                'cordova-plugin-file@3.0.0',
                'cordova.plugins.diagnostic@~2.0.0',
                'cordova-plugin-device-orientation@^1.0.0',
                'https://github.com/apache/cordova-plugin-network-information',
                'https://github.com/apache/cordova-plugin-battery-status#r1.0.0',
                'git://github.com/apache/cordova-plugin-statusbar.git#r1.0.1',
                'https://'+process.env.GITHUB_USERNAME+':'+process.env.GITHUB_PASSWORD+'@github.com/dpa99c/phonegap-istablet',
                'https://'+process.env.GITHUB_ACCESS_TOKEN+':@github.com/dpa99c/cordova-sqlite-porter',
                path.resolve('./spec/local_plugin')

            ], function(results){
                fileHelper.forceLocalPluginVersion('uk.co.workingedge.phonegap.plugin.launchnavigator', '2.6.0');
                fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
                fileHelper.forceLocalPluginVersion('cordova-plugin-device-orientation', '1.0.0');

                toolHelper.run(null, function(_err, _stdout, _stderr, _parsed_stdout){
                    err = _err;
                    stdout = _stdout;
                    stderr = _stderr;
                    output = _parsed_stdout;
                    done();
                });
            });
        }));
    });

    // Plugin sources
    it("should handle plugin sources in the format 'cordova-plugin-camera'", function() {
        expect(output.section.upToDate['cordova-plugin-camera']).toBeDefined();
    });

    it("should handle plugin sources in the format 'cordova-plugin-geolocation@*'", function() {
        expect(output.section.upToDate['cordova-plugin-geolocation']).toBeDefined();
    });

    it("should handle plugin sources in the format 'cordova-plugin-file@3.0.0'", function() {
        expect(output.section.upToDate['cordova-plugin-file']).toBeDefined();
    });

    it("should handle plugin sources in the format 'uk.co.workingedge.phonegap.plugin.launchnavigator@2'", function() {
        var plugin = output.section.newerTarget['uk.co.workingedge.phonegap.plugin.launchnavigator'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d/))).toBeFalsy();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });

    it("should handle plugin sources in the format 'cordova.plugins.diagnostic@~2.0.0'", function() {
        var plugin = output.section.newerTarget['cordova.plugins.diagnostic'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });

    it("should handle plugin sources in the format 'cordova-plugin-device-orientation@^1.0.0'", function() {
        var plugin = output.section.newerTarget['cordova-plugin-device-orientation'];
        expect(plugin).toBeDefined();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d/))).toBeTruthy();
        expect(plugin['installed version'].match(plugin['remote version'].match(/^\d\.\d\.\d/))).toBeFalsy();
    });

    it("should handle plugin sources in the format 'https://github.com/apache/cordova-plugin-network-information'", function() {
        expect(output.section.upToDate['cordova-plugin-network-information']).toBeDefined();
    });

    it("should handle plugin sources in the format 'https://github.com/apache/cordova-plugin-battery-status#r1.0.0'", function() {
        expect(output.section.upToDate['cordova-plugin-battery-status']).toBeDefined();
    });

    it("should handle plugin sources in the format 'https://username:password@github.com/dpa99c/phonegap-istablet'", function() {
        expect(output.section.upToDate['uk.co.workingedge.phonegap.plugin.istablet']).toBeDefined();
    });

    it("should handle plugin sources in the format 'https://access_token:@github.com/dpa99c/phonegap-istablet'", function() {
        expect(output.section.upToDate['uk.co.workingedge.cordova.plugin.sqliteporter']).toBeDefined();
    });

    it("should handle plugin sources in the format 'git://github.com/apache/cordova-plugin-statusbar.git#r1.0.1'", function() {
        expect(output.section.upToDate['cordova-plugin-statusbar']).toBeDefined();
    });

    it("should handle plugin sources in the format '/path/to/local/plugin'", function() {
        expect(output.section.upToDate['local_plugin']).toBeDefined();
    });

});
