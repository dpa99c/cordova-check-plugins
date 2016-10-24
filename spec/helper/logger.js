#!/usr/bin/env node

var logger = (function(){

    /**********************
     * Internal properties
     *********************/
    var logger, hasColors = true;

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
            console.log(title+": "+require('util').inspect(obj));
        },
        debug: function(msg){
            msg = "DEBUG: " + msg;
            console.log(msg);
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