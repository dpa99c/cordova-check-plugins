#!/usr/bin/env node

var errorHandler = (function(){

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');

    // lib
    var logger = require(path.resolve('lib/logger.js'))();

    /**********************
     * Internal properties
     *********************/
    var errorHandler = {};

     /************
     * Public API
     ************/
     errorHandler.handleFatalException = function(e, _msg){
         var msg = "FATAL EXCEPTION: ";
         if(_msg) msg += _msg + "; ";
         msg += e.message;
         logger ? logger.error(msg) : console.error(msg);
         process.exit(1); // exit on fatal error
     };

    errorHandler.handleFatalError = function(msg){
        var msg = "FATAL ERROR: " + msg;
        logger ? logger.error(msg) : console.error(msg);
        process.exit(1); // exit on fatal error
    };
    
    return errorHandler;
})();

module.exports = function(){
    return errorHandler;
};