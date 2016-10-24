/**
 * Modules
 */
var path = require('path');
var fs = require('fs');

var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();
var logger = require(path.resolve('spec/helper/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

describe("A spec for reporting", function() {


    var err, stdout, stderr, output;

    beforeAll(function(done) {

        fileHelper.reset();
        fileHelper.addPlugins([
            'cordova-plugin-camera@latest', //up-to-date
            'cordova-plugin-geolocation@1', //update available
            'cordova-plugin-device@1', // newer local version
            'cordova-plugin-whitelist' // unknown mismatch
        ], function(results){
            // Manipulate versions
            var fetchJson = fileHelper.readFetchJson();
            fetchJson['cordova-plugin-geolocation']['source']['id'] = 'cordova-plugin-geolocation'; // reset version to be unconstrained so update is available
            fileHelper.writeFetchJson(fetchJson);
            
            fileHelper.forceLocalPluginVersion('cordova-plugin-device', '2.0.0'); // set local version to be newer than remote
            fileHelper.forceLocalPluginVersion('cordova-plugin-whitelist', 'invalid'); // set local version to be unmatchable to remote

            toolHelper.run(null, function(_err, _stdout, _stderr, _parsed_stdout){
                err = _err;
                stdout = _stdout;
                stderr = _stderr;
                output = _parsed_stdout;
                done();
            });

        });
    });

    it("should report successfully", function() {
        expect(err).toEqual(0);
    });

    it("should report 'Plugin update available' for installed plugins for which a new remote version is available", function() {
        expect(output.section.updateAvailable['cordova-plugin-geolocation']).toBeDefined();
        expect(output.section.upToDate['cordova-plugin-geolocation']).toBeFalsy();
        expect(output.section.installedNewer['cordova-plugin-geolocation']).toBeFalsy();
        expect(output.section.unknownVersion['cordova-plugin-geolocation']).toBeFalsy();
        expect(output.section.error['cordova-plugin-geolocation']).toBeFalsy();
    });
    it("should report 'Up-to-date plugins' for installed plugins which are up-to-date with the detected remote version", function() {
        expect(output.section.upToDate['cordova-plugin-camera']).toBeDefined();
        expect(output.section.updateAvailable['cordova-plugin-camera']).toBeFalsy();
        expect(output.section.installedNewer['cordova-plugin-camera']).toBeFalsy();
        expect(output.section.unknownVersion['cordova-plugin-camera']).toBeFalsy();
        expect(output.section.error['cordova-plugin-camera']).toBeFalsy();
    });

    it("should report 'Installed plugin version newer than remote default' for installed plugins for which the installed version is newer than the default remote version", function() {
        expect(output.section.installedNewer['cordova-plugin-device']).toBeDefined();
        expect(output.section.upToDate['cordova-plugin-device']).toBeFalsy();
        expect(output.section.updateAvailable['cordova-plugin-device']).toBeFalsy();
        expect(output.section.unknownVersion['cordova-plugin-device']).toBeFalsy();
        expect(output.section.error['cordova-plugin-device']).toBeFalsy();
    });

    it("should report 'Error checking plugin version' for installed plugins for which an error occurred while checking the plugin versions ", function() {
        expect(output.section.error['cordova-plugin-whitelist']).toBeDefined();
        expect(output.section.unknownVersion['cordova-plugin-whitelist']).toBeFalsy();
        expect(output.section.installedNewer['cordova-plugin-whitelist']).toBeFalsy();
        expect(output.section.upToDate['cordova-plugin-whitelist']).toBeFalsy();
        expect(output.section.updateAvailable['cordova-plugin-whitelist']).toBeFalsy();
    });

    // Not sure we can emulate this
    //it("should report 'Unknown plugin version mismatch' for installed plugins for which the remote version could not be determined as older/newer", function() {});
});

describe("A spec for plugin source format", function() {


    var err, stdout, stderr, output;

    beforeAll(function(done) {

        fileHelper.reset();
        fileHelper.addPlugins([
            'cordova-plugin-camera',
            'cordova-plugin-geolocation@*',
            'cordova-plugin-whitelist@1',
            'cordova-plugin-file@4.0.0',
            'cordova-plugin-inappbrowser@~1.1.1',
            'https://github.com/dpa99c/cordova-custom-config',
            'https://github.com/apache/cordova-plugin-battery-status#r1.0.0',
            'git://github.com/apache/cordova-plugin-statusbar.git#r1.0.1',
            path.resolve('./spec/local_plugin')
            
        ], function(results){
            toolHelper.run(null, function(_err, _stdout, _stderr, _parsed_stdout){
                err = _err;
                stdout = _stdout;
                stderr = _stderr;
                output = _parsed_stdout;
                done();
            });

        });
    });


    // Plugin sources
    it("should handle plugin sources in the format 'cordova-plugin-camera'", function() {
        //logger.dump(output);
        expect(output.section.upToDate['cordova-plugin-camera']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-geolocation@*'", function() {
        expect(output.section.upToDate['cordova-plugin-geolocation']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-whitelist@1'", function() {
        expect(output.section.upToDate['cordova-plugin-whitelist']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-file@4.0.0'", function() {
        expect(output.section.upToDate['cordova-plugin-file']).toBeDefined();
    });
    it("should handle plugin sources in the format 'cordova-plugin-inappbrowser@~1.1.1'", function() {
        expect(output.section.upToDate['cordova-plugin-inappbrowser']).toBeDefined();
    });
    it("should handle plugin sources in the format 'https://github.com/dpa99c/cordova-custom-config'", function() {
        expect(output.section.upToDate['cordova-custom-config']).toBeDefined();
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
return;
// CLI options
it("should display online help when the '-h' CLI option is supplied", function() {});
it("should display online help when the '--help' CLI option is supplied", function() {});
it("should display the current version when the '-v' CLI option is supplied", function() {});
it("should display the current version when the '--version' CLI option is supplied", function() {});
it("should display verbose output when the '--verbose' CLI option is supplied", function() {});
it("should unconstrain checking of remote version when the '--unconstrain-versions' CLI option is supplied", function() {});
it("should force the update of dependent plugins when the '--force-update' CLI option is supplied", function() {});
it("should save changes to the config.xml when the '--save' CLI option is supplied", function() {});
it("should use the specified Github user credentials when the '--github-username' and '--github-password' CLI options are supplied", function() {});
it("should  when the '-' CLI option is supplied", function() {});

// Updates
it("should not update any outdated plugins when the '--update=none' CLI option is supplied", function() {});
it("should automatically update all outdated plugins when the '--update=auto' CLI option is supplied", function() {});
it("should allow interactive updating of outdated plugins when the '--update=interactive' CLI option is supplied", function() {});
it("should update the specified outdated plugin when the '--update=pluginId' CLI option is supplied", function() {});
it("should update the specified outdated plugins when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied", function() {});

it("should log a warning but continue when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied, where pluginId_1 corresponds to a plugin which is not installed in the project", function() {});
it("should log a warning but continue when the '--update=\"pluginId_1 pluginId_2\"' CLI option is supplied, where pluginId_1 corresponds to a plugin which is installed in the project but is not outdated", function() {});


/*
it( "should list plugins", function(done) {
    fileHelper.listPlugins(function(err, result){
        expect( result ).toBeDefined();
        if(err){
            return logger.error("ERROR: "+ result);
        }
        logger.dump(result);
        done();
    });
} );
return;*/
