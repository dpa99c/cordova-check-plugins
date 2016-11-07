#!/usr/bin/env node

var progress = (function () {

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');

    // lib
    var errorHandler = require(path.resolve('lib/errorHandler.js'))();

    // 3rd party
    try{
        var Spinner = require('cli-spinner').Spinner;
    }catch(e){
        errorHandler.handleFatalException(e, "Failed to acquire module dependencies");
    }

    Spinner.setDefaultSpinnerString('|/-\\');

    /**********************
     * Internal properties
     *********************/
    var progress = {},
        spinner,
        spinning = false;

    /************
     * Public API
     ************/
    progress.start = function (msg) {
        spinner = new Spinner(msg + '... %s');
        spinner.start();
        spinning = true;
    };

    progress.end = function () {
        spinner.stop(true);
        spinning = false;
    };


    return progress;
})();

module.exports = function () {
    return progress;
};