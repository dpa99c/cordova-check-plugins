var path = require('path');
var fs = require('fs');

var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();
var logger = require(path.resolve('spec/helper/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for updating plugins", function() {

    beforeAll(function(done) {
        fileHelper.reset(done);
    });


    it("should NOT force the update of dependent plugins when the '--force-update' CLI option is NOT supplied", function(done) {
        fileHelper.addPlugin('cordova-plugin-file-transfer', function(err, stdout, stderr){
            fileHelper.forceLocalPluginVersion('cordova-plugin-file', '1.0.0');

            toolHelper.run('--update=cordova-plugin-file', function(err, stdout, stderr, output){
                expect(err).toBeFalsy();
                expect(stderr).toContain("Error: The plugin 'cordova-plugin-file' is required by (cordova-plugin-file-transfer)");
                expect(stdout).toContain("Failed to update all specified plugins");
                done();
            });
        });
    });

    it("should force the update of dependent plugins when the '--force-update' CLI option is supplied", function(done) {
        fileHelper.addPlugin('cordova-plugin-file-transfer', function(err, stdout, stderr){
            fileHelper.forceLocalPluginVersion('cordova-plugin-file', '1.0.0');

            toolHelper.run('--force-update --update=cordova-plugin-file', function(err, stdout, stderr, output){
                expect(err).toBeFalsy();
                expect(stdout).toContain("Updated 'cordova-plugin-file'");
                expect(stdout).toContain("Successfully updated all specified plugins");
                done();
            });
        });
    });

    it("should save update changes to the config.xml when the '--save' CLI option is supplied", function(done) {
        fileHelper.addPlugin('cordova-plugin-file', function(err, stdout, stderr){
            fileHelper.forceLocalPluginVersion('cordova-plugin-file', '1.0.0');
            expect(fileHelper.readConfigXml().match('<plugin name="cordova-plugin-file"')).toBeFalsy();
            toolHelper.run('--update=cordova-plugin-file --save', function(err, stdout, stderr, output){
                expect(fileHelper.readConfigXml().match('<plugin name="cordova-plugin-file"')).toBeTruthy();
                done();
            });
        });
    });

    it("should not update any outdated plugins when the '--update=none' CLI option is supplied", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic',
            'cordova-plugin-device'

        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
            fileHelper.forceLocalPluginVersion('cordova-plugin-device', '1.0.0');

            toolHelper.run('--update=none', function(err, stdout, stderr, output){
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();
                expect(output.section.updateAvailable['cordova-plugin-device']).toBeDefined();
                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeTruthy();
                    expect(plugins['cordova-plugin-device'].version === '1.0.0').toBeTruthy();
                    done();
                });
            });
        });
    });


    it("should automatically update all outdated plugins when the '--update=auto' CLI option is supplied", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic',
            'cordova-plugin-device'

        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
            fileHelper.forceLocalPluginVersion('cordova-plugin-device', '1.0.0');

            toolHelper.run('--update=auto', function(err, stdout, stderr, output){
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();
                expect(output.section.updateAvailable['cordova-plugin-device']).toBeDefined();

                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova.plugins.diagnostic' from 2.0.0 to "+plugins['cordova.plugins.diagnostic'].version);

                    expect(plugins['cordova-plugin-device'].version === '1.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova-plugin-device' from 1.0.0 to "+plugins['cordova-plugin-device'].version);
                    done();
                });
            });
        });
    });



    it("should update the specified outdated plugin when the '--update=pluginId' CLI option is supplied", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic',
            'cordova-plugin-device'

        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
            fileHelper.forceLocalPluginVersion('cordova-plugin-device', '1.0.0');

            toolHelper.run('--update=cordova.plugins.diagnostic', function(err, stdout, stderr, output){
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();
                expect(output.section.updateAvailable['cordova-plugin-device']).toBeDefined();

                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova.plugins.diagnostic' from 2.0.0 to "+plugins['cordova.plugins.diagnostic'].version);

                    expect(plugins['cordova-plugin-device'].version === '1.0.0').toBeTruthy();
                    done();
                });
            });
        });
    });

    it("should update the specified outdated plugins when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic',
            'cordova-plugin-device',
            'cordova-custom-config'

        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
            fileHelper.forceLocalPluginVersion('cordova-plugin-device', '1.0.0');
            fileHelper.forceLocalPluginVersion('cordova-custom-config', '1.0.0');

            toolHelper.run('--update="cordova.plugins.diagnostic cordova-plugin-device"', function(err, stdout, stderr, output){
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();
                expect(output.section.updateAvailable['cordova-plugin-device']).toBeDefined();
                expect(output.section.updateAvailable['cordova-custom-config']).toBeDefined();

                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova.plugins.diagnostic' from 2.0.0 to "+plugins['cordova.plugins.diagnostic'].version);

                    expect(plugins['cordova-plugin-device'].version === '1.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova-plugin-device' from 1.0.0 to "+plugins['cordova-plugin-device'].version);

                    expect(plugins['cordova-custom-config'].version === '1.0.0').toBeTruthy();
                    done();
                });
            });
        });
    });

    it("should log a warning but continue when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied, where pluginId_1 corresponds to a plugin which is not installed in the project", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic'
        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');

            toolHelper.run('--update="cordova-plugin-device cordova.plugins.diagnostic"', function(err, stdout, stderr, output){
                expect(err).toBeFalsy();
                expect(stderr).toContain("Cannot update plugin 'cordova-plugin-device' as it is not installed in the project");
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();

                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova.plugins.diagnostic' from 2.0.0 to "+plugins['cordova.plugins.diagnostic'].version);
                    done();
                });
            });
        });
    });

    it("should log a warning but continue when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied, where pluginId_1 corresponds to a plugin which is installed in the project but is not outdated", function(done) {
        fileHelper.addPlugins([
            'cordova.plugins.diagnostic',
            'cordova-plugin-device'

        ], function(results){
            fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');

            toolHelper.run('--update="cordova-plugin-device cordova.plugins.diagnostic"', function(err, stdout, stderr, output){
                expect(err).toBeFalsy();
                expect(stderr).toContain("Cannot update plugin 'cordova-plugin-device' as no newer remote version is available");
                expect(output.section.updateAvailable['cordova.plugins.diagnostic']).toBeDefined();
                expect(output.section.upToDate['cordova-plugin-device']).toBeDefined();

                fileHelper.listPlugins(function(plugins){
                    expect(plugins['cordova.plugins.diagnostic'].version === '2.0.0').toBeFalsy();
                    expect(stdout).toContain("Updated 'cordova.plugins.diagnostic' from 2.0.0 to "+plugins['cordova.plugins.diagnostic'].version);
                    done();
                });
            });
        });
    });
});




