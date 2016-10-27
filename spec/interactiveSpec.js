/*
var path = require('path');
var fs = require('fs');
//var bddStdin = require('bdd-stdin');
require('mock-stdin').stdin();

var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();
var logger = require(path.resolve('spec/helper/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
 ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
 ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for interactive updating of outdated plugins", function() {
    beforeAll(function(done) {
        fileHelper.reset(done);
    });

    beforeEach(function(done) {
        fileHelper.addPlugins([
            //'cordova.plugins.diagnostic',
            //'cordova-plugin-device',
            'cordova-custom-config'

        ], function(results){
            toolHelper.setStaticArgs('--verbose');
            done();
        });
    });

     it("should not enter interactive mode when the '--update=interactive' CLI option is supplied and there are no outdated plugins", function(done) {
        toolHelper.run('--update=interactive', function(err, stdout, stderr, output){
             expect(err).toBeFalsy();
         expect(stdout.match('Interactive update started')).toBeFalsy();
         expect(stdout.match('Interactive update complete')).toBeFalsy();
         done();
        });
     });

    it("should allow interactive updating of outdated plugins when the '--update=interactive' CLI option is supplied", function(done) {
        // Simulate outdated plugins
        //fileHelper.forceLocalPluginVersion('cordova.plugins.diagnostic', '2.0.0');
        //fileHelper.forceLocalPluginVersion('cordova-plugin-device', '1.0.0');
        fileHelper.forceLocalPluginVersion('cordova-custom-config', '1.0.0');

        //bddStdin('x'); // prepare exit keystroke
        process.nextTick(function mockResponse() {
            stdin.send("x");
            stdin.end();
        });
        toolHelper.run('--update=interactive', function(err, stdout, stderr, output){


            expect(stdout.match('Interactive update started')).toBeTruthy();
            logger.dump(stdout);

            done();
        });

    });

});



*/
