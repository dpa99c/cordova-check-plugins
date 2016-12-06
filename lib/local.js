#!/usr/bin/env node

var local = (function () {

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');

    // lib
    var logger = require('./logger.js')();
    var errorHandler = require('./errorHandler.js')();

    // 3rd party
    try {
        var jsonfile = require('jsonfile');
        var fs = require('fs-extra');
        var xml2js = require('xml2js').parseString;
        var _ = require('lodash');
    } catch (e) {
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    /**********************
     * Internal properties
     *********************/
    var local = {};

    /*******************
     * Public properties
     *******************/
    local.PLUGINS_DIR = './plugins/';
    local.FETCH_FILE = local.PLUGINS_DIR + 'fetch.json';
    local.CONFIG_FILE = './config.xml';

    /************
     * Public API
     ************/
    local.readFetchJson = function (cb) {
        jsonfile.readFile(local.FETCH_FILE, cb);
    };

    local.writeFetchJson = function (json, cb) {
        jsonfile.writeFile(local.FETCH_FILE, json, cb);
    };
    
    local.readConfigXmlAsJs = function(cb){
        var xml = fs.readFileSync(path.resolve(local.CONFIG_FILE), 'utf-8');
        xml2js(xml, function(err, js){
            if(err){
                return errorHandler.handleFatalError("Failed to parse config.xml: "+err);
            }
            cb(js);
        });
    };
    
    local.writeConfigXmlFromJs = function(js){
        var builder = new xml2js.Builder();
        var xml = builder.buildObject(js);
        fs.writeFileSync(path.resolve(local.CONFIG_FILE), xml, 'utf-8');
    };

    local.getPlatforms = function(){
        return _.filter(fs.readdirSync('platforms'), function (file) {
            return fs.statSync(path.resolve('platforms', file)).isDirectory();
        });
    };

    return local;
})();

module.exports = function () {
    return local;
};