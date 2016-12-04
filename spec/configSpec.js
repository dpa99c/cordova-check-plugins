/*********
 * Modules
 *********/

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

    it("should log an error and continue if a <plugin> tag specified in the config.xml is malformed (missing either 'name' or 'spec')", function(done){

        fileHelper.addPlugin(
            'cordova-plugin-geolocation@1.0.0',
            function(results){
                var configXml = fileHelper.readConfigXml();
                configXml = configXml.replace('</widget>', '<plugin invalid="attributes" /></widget>');
                fileHelper.writeConfigXml(configXml);
                toolHelper.run('--target=config', function(err, stdout, stderr, output){
                    expect(err).toBeFalsy();
                    expect(stdout).toContain('Malformed <plugin> tag found in config.xml');
                    done();
                });
            },{
                save: true
            }
        );

    });

    describe("when updating plugins from config.xml", function() {

    
        it("should log an error and continue if a plugin ID specified in the config.xml does not exist remotely", function(done){
            fileHelper.addPlugin(
                'cordova-plugin-geolocation@1.0.0',
                function(results){
                    var configXml = fileHelper.readConfigXml();
                    configXml = configXml.replace('</widget>', '<plugin name="cordova-plugin-invalid" spec="~1.0.0" /></widget>');
                    fileHelper.writeConfigXml(configXml);
                    toolHelper.run('--target=config --update=auto', function(err, stdout, stderr, output){
                        expect(err).toBeFalsy();
                        expect(stdout).toContain("Failed to update plugin 'cordova-plugin-invalid'");
                        done();
                    });
                },{
                    save: true
                }
            );
        });
 

         it("should log an error and continue if the plugin version/spec specified in the config.xml does not exist remotely", function(done){
             fileHelper.addPlugin(
                 'cordova-plugin-geolocation@2.0.0',
                 function(results){

                     fileHelper.forceLocalPluginVersion('cordova-plugin-geolocation', '1.0.0'); // newer config
                     fileHelper.addPluginToConfigXml('cordova-plugin-device', '~100.0.0'); // invalid npm version
                     fileHelper.addPluginToConfigXml('cordova.plugins.diagnostic', 'https://github.com/dpa99c/cordova-diagnostic-plugin#invalid_branch'); // invalid git branch
                     
                     toolHelper.run('--target=config --update=auto', function(err, stdout, stderr, output){
                         expect(err).toBeFalsy();
                         expect(stdout).toContain("Failed to update plugin 'cordova.plugins.diagnostic'");
                         expect(stdout).toContain("Failed to update plugin 'cordova-plugin-device'");
                         fileHelper.listPlugins(function(plugins){
                             expect(semver.eq(plugins['cordova-plugin-geolocation'].version, '2.0.0')).toBeTruthy(); //successfully updated from 1.0.0 to 2.0.0
                             done();
                         });
                     });
                 },{
                     save: true
                 }
             );          
         });

         it("should preserve any plugin variables specified when updating plugins from config.xml", function(done){
             fileHelper.addPlugin('cordova-plugin-file', function(err, stdout, stderr){
                 fileHelper.forceLocalPluginVersion('cordova-plugin-file', '2.0.0');
                 toolHelper.run('--target=config --update=auto --save', function(err, stdout, stderr, output){
                     expect(fileHelper.readConfigXml().match('<variable name="FOO" value="bar" />')).toBeTruthy();
                     done();
                 });
             },{
                 save: true,
                 variables:{
                     "FOO": "bar"
                 }
             });
         });

    });

});