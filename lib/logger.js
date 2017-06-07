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
    var logger, hasColors = true, credentials;

    // 3rd party modules
    try{
        require('colors');
    }catch(e){
        hasColors = false;
    }

    /**********************
     * Internal functions
     *********************/
    var obfuscateCredentials = function(msg){
        if(credentials && typeof credentials === "object" && typeof credentials.length !== "undefined"){
            credentials.forEach(function(credential){
                msg = msg.replace(new RegExp(credential, "g"), "{obfuscated}");
            });
        }
        return msg;
    };

    /************
     * Public API
     ************/
    logger = {
        dump: function (obj, title){
            title = title || "DUMP";
            console.log(title + ": " + obfuscateCredentials(logger.getDump(obj)));
        },
        getDump: function(obj){
            return require('util').inspect(obj);
        },
        debug: function(msg){
            msg = obfuscateCredentials(msg);
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
            msg = obfuscateCredentials(msg);
            if(cliArgs["verbose"] || cliArgs["debug"]) {
                if(hasColors){
                    console.log(msg.green);
                }else{
                    console.log(msg);
                }
            }
        },
        log: function(msg){
            msg = obfuscateCredentials(msg);
            if(hasColors){
                console.log(msg.white);
            }else{
                console.log(msg);
            }
        },
        info: function(msg){
            msg = obfuscateCredentials(msg);
            if(hasColors){
                console.log(msg.blue);
            }else{
                console.info(msg);
            }
        },
        warn: function(msg){
            msg = obfuscateCredentials(msg);
            if(hasColors){
                console.log(msg.yellow);
            }else{
                console.warn(msg);
            }
        },
        error: function(msg){
            msg = obfuscateCredentials(msg);
            if(hasColors){
                console.log(msg.red);
            }else{
                console.error(msg);
            }
        },
        setCredentialsToObfuscate: function(_credentials){
            credentials = _credentials;
        }

    };
    return logger;
})();

module.exports = function(){
    return logger;
};