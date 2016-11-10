#!/usr/bin/env node

var logger = (function(){

    /**********
     * Modules
     **********/

    // Core
    var path = require('path');

    //lib
    var cliArgs = require('./cliArgs.js')().args;

    /**********************
     * Internal properties
     *********************/
    var logger, hasColors = true;

    // 3rd party modules
    try{
        require('colors');
    }catch(e){
        hasColors = false;
    }

    /************
     * Public API
     ************/
    logger = {
        dump: function (obj, title){
            title = title || "DUMP";
            console.log(title + ": " + require('util').inspect(obj));
        },
        debug: function(msg){
            if(cliArgs["debug"]) {
                msg = "DEBUG: " + msg;
                if(hasColors){
                    console.log(msg.magenta);
                }else{
                    console.log(msg);
                }
            }
        },
        verbose: function(msg){
            if(cliArgs["verbose"]) {
                if(hasColors){
                    console.log(msg.green);
                }else{
                    console.log(msg);
                }
            }
        },
        log: function(msg){
            if(hasColors){
                console.log(msg.white);
            }else{
                console.log(msg);
            }
        },
        info: function(msg){
            if(hasColors){
                console.log(msg.blue);
            }else{
                console.info(msg);
            }
        },
        warn: function(msg){
            if(hasColors){
                console.log(msg.yellow);
            }else{
                console.warn(msg);
            }
        },
        error: function(msg){
            if(hasColors){
                console.log(msg.red);
            }else{
                console.error(msg);
            }
        }
    };
    return logger;
})();

module.exports = function(){
    return logger;
};