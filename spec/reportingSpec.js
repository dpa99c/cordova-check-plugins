
var path = require('path');
var fs = require('fs');

var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();
var logger = require(path.resolve('spec/helper/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for reporting", function() {


    var err, stdout, stderr, output;

    beforeAll(function(done) {

        fileHelper.reset(function(){
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
