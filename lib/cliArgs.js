#!/usr/bin/env node

var cliArgs = (function(){

    /**********
     * Modules
     **********/
    var minimist = require('minimist');

    /**********************
     * Internal properties
     *********************/
    var cliArgs = {};

     /******************
     * Public properties
     *******************/
     cliArgs.args = minimist(process.argv.slice(2));
    
    return cliArgs;
})();

module.exports = function(){
    return cliArgs;
};