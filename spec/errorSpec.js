var path = require('path');
var fs = require('fs');

var fileHelper = require(path.resolve('spec/helper/file.js'))();
var toolHelper = require(path.resolve('spec/helper/tool.js'))();
var logger = require(path.resolve('spec/helper/logger.js'))();

jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

toolHelper.setStaticArgs(
    ' --github-username="'+process.env.GITHUB_USERNAME+'"'+
    ' --github-password="'+process.env.GITHUB_PASSWORD+'"');

describe("A spec for error handling", function() {

    beforeAll(function(done) {
        fileHelper.reset(done);
    });

    // Error handling
    it("should exit with a fatal error if run in a directory that doesn't appear to be a valid Cordova project with plugins", function(done){
        toolHelper.run(null, function(err, stdout, stderr, output){
            expect(err).toBeTruthy();
            expect(stderr).toContain('FATAL ERROR: Failed to read plugins/fetch.json - ensure you\'re running this command from the root of a Cordova project');
            done();
        });
    });

});

