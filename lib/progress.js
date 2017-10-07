#!/usr/bin/env node

var progress = (function () {

    /**********
     * Modules
     **********/
    // Core
    var path = require('path');

    // lib
    var errorHandler = require('./errorHandler.js')();

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
        spinning = false,
        disabled = false;

    /************
     * Public API
     ************/
    progress.start = function (msg) {
        if(disabled) return;
        if(spinning) progress.end();
        spinner = new Spinner(msg + '... %s');
        spinner.start();
        spinning = true;
    };

    progress.end = function () {
        if(disabled) return;
        spinner.stop(true);
        spinning = false;
    };

    progress.disable = function(){
        disabled = true;
    };


    return progress;
})();

module.exports = function () {
    return progress;
};