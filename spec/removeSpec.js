/**********
 * Modules
 **********/

// Core
var path = require('path');
var fs = require('fs');

// helper
var fileHelper = require('./helper/file.js')();
var toolHelper = require('./helper/tool.js')();

//lib
var credentialsToObfuscate = [
    process.env.GITHUB_PASSWORD,
    process.env.GITHUB_ACCESS_TOKEN
];
var logger = require('../lib/logger.js')();
logger.setCredentialsToObfuscate(credentialsToObfuscate);

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"'+
    ' --obfuscate-credentials="'+credentialsToObfuscate.join(' ')+'"');

describe("A spec for removing plugins", function() {

    beforeAll(function(done) {
        fileHelper.resetPlatforms(done);
    });

    beforeEach(function(done) {
        fileHelper.reset(done);
    });

    it("should remove all locally installed plugins when the --remove-all CLI argument is specified", function(done) {
        fileHelper.addPlugins([
            'cordova-plugin-file-transfer',
            'cordova-plugin-geolocation'

        ], function(results){
            toolHelper.run('--remove-all', function(err, stdout, stderr, output){
                expect(stdout).toContain("Successfully removed all installed plugins");
                fileHelper.listPlugins(function(plugins){
                    expect(plugins).toEqual({});
                    done();
                });
            });
        });
    });

    it("should remove all <plugin> entries from the config.xml when the --save CLI argument is specified with --remove-all", function(done) {
        fileHelper.addPlugins([
            'cordova-plugin-file-transfer',
            'cordova-plugin-geolocation'

        ], function(results){
            toolHelper.run('--remove-all --save', function(err, stdout, stderr, output){
                expect(stdout).toContain("Successfully removed all installed plugins");
                fileHelper.listPlugins(function(plugins){
                    expect(plugins).toEqual({});
                    expect(fileHelper.readConfigXml().match('<plugin"')).toBeFalsy();
                    done();
                });
            });
        },{
            save: true
        });
    });

    it("should NOT remove <plugin> entries from the config.xml when the --save CLI argument is NOT specified with --remove-all", function(done) {
        fileHelper.addPlugins([
            'cordova-plugin-file-transfer',
            'cordova-plugin-geolocation'

        ], function(results){
            toolHelper.run('--remove-all', function(err, stdout, stderr, output){
                expect(stdout).toContain("Successfully removed all installed plugins");
                fileHelper.listPlugins(function(plugins){
                    expect(plugins).toEqual({});
                    expect(fileHelper.readConfigXml().match('<plugin"')).toEqual(null);
                    done();
                });
            });
        },{
            save: false
        });
    });
    
});
