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

// 3rd party
var semver = require('semver');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for targeting config.xml", function() {

    beforeEach(function(done) {
        fileHelper.reset(done);
    });

    it("should use config.xml as the target for plugin versions when the --target=config CLI argument is specified", function(done){
        fileHelper.addPlugins([
            'cordova-plugin-camera', // up-to-date
            'cordova-plugin-geolocation@1.0.0', // newer installed
            'cordova.plugins.diagnostic@3' //newer config
        ], function(results){
            fileHelper.addPlugins([
                'cordova-plugin-network-information' // new installed
            ], function(results){
                fileHelper.forceLocalPluginVersion('cordova-plugin-geolocation', '2.0.0'); // newer installed
                fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0'); // newer config
                fileHelper.addPluginToConfigXml('cordova-plugin-device', '~1.1.3'); // new config
                toolHelper.run('--target=config', function(err, stdout, stderr, output){

                    expect(output.section.upToDate['cordova-plugin-camera']).toBeDefined();
                    expect(output.section.newerInstalled['cordova-plugin-geolocation']).toBeDefined();
                    expect(output.section.newerTarget['cordova.plugins.diagnostic']).toBeDefined();
                    expect(output.section.newInstalled['cordova-plugin-network-information']).toBeDefined();
                    expect(output.section.newTarget['cordova-plugin-device']).toBeDefined();
                    done();
                });
            },{
                save: false
            });

        },{
            save: true
        });
    });

    it("should NOT downdate plugins when the --allow-downdate argument is NOT specified", function(done){
        fileHelper.addPlugin(
            'cordova-plugin-geolocation@1.0.0', // newer installed
            function(results){
                fileHelper.forceLocalPluginVersion('cordova-plugin-geolocation', '2.0.0'); // newer installed
                    toolHelper.run('--target=config --update=cordova-plugin-geolocation', function(err, stdout, stderr, output){
                        expect(output.section.newerInstalled['cordova-plugin-geolocation']).toBeDefined();
                        fileHelper.listPlugins(function(plugins){
                            expect(semver.eq(plugins['cordova-plugin-geolocation'].version, '2.0.0')).toBeTruthy();
                            expect(true).toBeTruthy();
                            done();
                        });
                    }
                );
            },{
                save: true
            }
        );
    });

    it("should downdate plugins when the --allow-downdate argument is specified", function(done){
        fileHelper.addPlugin(
            'cordova-plugin-geolocation@1.0.0', // newer installed
            function(results){
                fileHelper.forceLocalPluginVersion('cordova-plugin-geolocation', '2.0.0'); // newer installed
                    toolHelper.run('--target=config --update=cordova-plugin-geolocation --allow-downdate', function(err, stdout, stderr, output){
                        expect(output.section.newerInstalled['cordova-plugin-geolocation']).toBeDefined();
                        fileHelper.listPlugins(function(plugins){
                            expect(semver.eq(plugins['cordova-plugin-geolocation'].version, '1.0.0')).toBeTruthy();
                            done();
                        });
                    }
                );
            },{
                save: true
            }
        );
    });

});

