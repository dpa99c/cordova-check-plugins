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
var logger = require('../lib/logger.js')();


jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for CLI options", function() {

    beforeAll(function(done) {
        fileHelper.reset(fileHelper.resetPlatforms.bind(this, done));
    });

    it("should display online help when the '-h' CLI option is supplied", function(done) {
        toolHelper.run('-h', function(err, stdout, stderr){
            expect(stdout).toContain('cordova-check-plugins [options]');
            done();
        });
    });
    it("should display online help when the '--help' CLI option is supplied", function(done) {
        toolHelper.run('--help', function(err, stdout, stderr){
            expect(stdout).toContain('cordova-check-plugins [options]');
            done();
        });
    });

    it("should display the current version when the '-v' CLI option is supplied", function(done) {
        toolHelper.run('-v', function(err, stdout, stderr){
            expect(stdout).toMatch(/^[\d]+\.[\d]+\.[\d]+/);
            done();
        });
    });
    it("should display the current version when the '--version' CLI option is supplied", function(done) {
        toolHelper.run('--version', function(err, stdout, stderr){
            expect(stdout).toMatch(/^[\d]+\.[\d]+\.[\d]+/);
            done();
        });
    });

    it("should display verbose output when the '--verbose' CLI option is supplied", function(done) {
        toolHelper.run('--verbose', function(err, stdout, stderr){
            expect(stdout).toContain('Verbose output enabled');
            done();
        });
    });

    it("should unconstrain checking of remote version when the '--unconstrain-versions' CLI option is supplied", function(done) {
        fileHelper.addPlugins([
            'cordova-plugin-device@1.0.0',
            'cordova-plugin-camera@1.0',
            'cordova-plugin-geolocation@1',
            'cordova.plugins.diagnostic@~2.0.0',
            'cordova-plugin-device-orientation@^1.0.0'
        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
            fileHelper.forceLocalPluginVersion('cordova-plugin-device-orientation', '1.0.0');

            toolHelper.run('--unconstrain-versions', function(err, stdout, stderr, output){
                expect(output.section.newerTarget['cordova-plugin-device']).toBeDefined();
                expect(output.section.newerTarget['cordova-plugin-camera']).toBeDefined();
                expect(output.section.newerTarget['cordova-plugin-geolocation']).toBeDefined();

                var diagnosticPlugin = output.section.newerTarget['cordova.plugins.diagnostic'];
                expect(diagnosticPlugin).toBeDefined();

                expect(diagnosticPlugin['installed version'].match(diagnosticPlugin['remote version'].match(/^\d/))).toBeFalsy();

                var configPlugin = output.section.newerTarget['cordova-plugin-device-orientation'];
                expect(configPlugin).toBeDefined();
                expect(configPlugin['installed version'].match(configPlugin['remote version'].match(/^\d/))).toBeFalsy();
                done();
            });

        });
    });


    it("should use the specified Github user credentials when the '--github-username' and '--github-password' CLI options are supplied", function(done) {
        fileHelper.addPlugin('https://github.com/apache/cordova-plugin-network-information', function(err, stdout, stderr){
            toolHelper.run(
                ' --verbose',
                function(err, stdout, stderr, output){
                    expect(err).toBeFalsy();
                    expect(stderr).toBeFalsy();
                    expect(stdout).toContain('Using specified GitHub credentials to authenticate access to the GitHub API');
                    done();
                }
            );
        });
    });
});
