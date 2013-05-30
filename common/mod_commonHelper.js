/* JSHint config*/
/* global _u*/

/**
 * Common helper: This module contains generic helper functions are (potentially) useful to both the background scripts
 * and the content scripts. (Content script specific helper functions, i.e. ones which generally depend on the DOM, are
 * defined in mod_contentHelper.js)
 *
 * This module is meant to be a collection of miscellaneous helper functions, rather than a single
 * cohesive module with a particular role.
 */

_u.mod_commonHelper = (function() {
    "use strict";

    /*-- Public interface --*/
    var thisModule = {
        makeImmutable: makeImmutable,
        executeWhenConditionMet: executeWhenConditionMet,
        stringifyFunctions: stringifyFunctions,
        destringifyFunctions: destringifyFunctions,
        stringifyRegexps_inSettings: stringifyRegexps_inSettings,
        stringifyJSONUnsupportedTypes_inSettings: stringifyJSONUnsupportedTypes_inSettings,
        destringifyJsonUnsupportedTypes_inSettings: destringifyJsonUnsupportedTypes_inSettings,
        getHostname: getHostname
    };

    /**
     * Make the the specified object (deeply) immutable or "read-only", so that none of its properties (or
     * sub-properties) can be modified. The converted object is returned.
     * @param {object} obj Input object
     */
    function makeImmutable (obj) {
        if ((typeof obj === "object" && obj !== null) ||
            (Array.isArray? Array.isArray(obj): obj instanceof Array) ||
            (typeof obj === "function")) {

            Object.freeze(obj);

            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    makeImmutable(obj[key]);
                }
            }
        }
        return obj;
    }

    /**
     * This function allows a passed function to be executed only after a specific condition is satisfied.
     * @param {function} functionToExecute The function to execute after a certain condition has been met
     * @param {function} testFunction This function should is a wrapper for the logic to test whether the condition for
     * functionToExecute has been met. It should return false till the condition is unmet, and true once it is met.
     * @param {int|undefined} timeOutMillisec Optional time out value. Default is 1 minute.
     *  If this value is zero or negative, functionToExecute won't be executed at all
     */
    function executeWhenConditionMet (functionToExecute, testFunction, timeOutMillisec) {
        if (typeof(timeOutMillisec) === "undefined") {
            timeOutMillisec = 60000; //1 min
        }

        if (testFunction()){
            functionToExecute();
        }
        else if (timeOutMillisec > 0){
            setTimeout(executeWhenConditionMet.bind(null, functionToExecute, testFunction, timeOutMillisec-50),50);
        }
        else {
            console.warn("UnitsProj: executeWhenConditionMet() timed out for function..:\n", functionToExecute, "\n... and testFunction:\n", testFunction);
        }
    }

    /***
     * Stringifies any property in the obj that is a function (including in the nested/inner objects within it).
     * (Functions must be stringified before they can be passed to the content script, because only JSON type messages are
     * allowed between the background and content scripts)
     * @param obj
     */
    function stringifyFunctions(obj) {

        // retruns the strigified version of the function passed
        var _stringifyFn = function(fn) {
            return "(" + fn.toString() + ")";
        };

        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === "object") {
                    stringifyFunctions(obj[key]);
                }
                else if (typeof obj[key] === "function") {
                    obj[key] = _stringifyFn(obj[key]);
                }
            }
        }
    }

    /***
     * De-stringifies any property in the obj that is a stringfied function (including in the nested/inner objects within it).
     * @param obj
     */
    function destringifyFunctions(obj) {

        // Returns the de-stringifed version of the function passed. If something other than a stringified function is passed in,
        // it is returned back unmodified.
        var _destringifyFn = function(stringifiedFn) {
            var returnVal;
            try {
                returnVal = eval(stringifiedFn);
                if (typeof returnVal === "function") {
                    return returnVal;
                }
                else {
                    return stringifiedFn; // return the input back unmodified
                }
            } catch (e) {
                return stringifiedFn; // return the input back unmodified
            }
        };

        var stringifiedFn,
            initialSubstr = "(function"; // this would be the initial part of any function stringified by us.

        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === "object") {
                    destringifyFunctions(obj[key]);
                }
                else if (typeof (stringifiedFn = obj[key]) === "string" &&
                    stringifiedFn.slice(0, initialSubstr.length) === initialSubstr) {
                    obj[key] = _destringifyFn(obj[key]);
                }
            }
        }
    }

    /***
     * Stringifies regular expressions in a settings object.
     * Stringify regular expressions at specific known locations in the settings object:
     * settingsObj.urlDataMap[{key}][{index}].urlRegexps
     * @param settingsObj
     */
    function stringifyRegexps_inSettings(settingsObj) {
        var stringifyRegexp_inUrlData = function(urlData) {
            var getStringifiedRegexp = function(regexp) {
                if (regexp && regexp instanceof RegExp) {
                    return regexp.source;
                }
            };

            if (!urlData || !urlData.urlRegexps) {
                return;
            }
            var urlRegexps = urlData.urlRegexps,
                regexStr;

            if (Array.isArray(urlRegexps)) {
                for (var index in urlRegexps) {
                    regexStr = getStringifiedRegexp(urlRegexps[index]);
                    if (regexStr) {
                        urlRegexps[index] = regexStr;
                    }
                }
            }
            else {
                regexStr = getStringifiedRegexp(urlRegexps);
                if (regexStr) {
                    urlData.urlRegexps = regexStr;
                }
            }

        };

        var urlDataMap = settingsObj && settingsObj.urlDataMap;

        if (!urlDataMap) {
            return;
        }

        var urlData;
        for (var key in urlDataMap) {
            urlData = urlDataMap[key];

            if (Array.isArray(urlData)) {
                for (var index in urlData) {
                    stringifyRegexp_inUrlData(urlData[index]);
                }

            }
            else {
                stringifyRegexp_inUrlData(urlData);
            }
        }
    }

    /***
     * Destringifies regular expressions in a settings object.
     * Destringify regular expressions at specific known locations in the settings object:
     * settingsObj.urlDataMap[{key}][{index}].urlRegexps
     * @param settingsObj
     */
    function destringifyRegexps_inSettings (settingsObj) {

        var destringifyRegexp_inUrlData = function(urlData) {
            var getDestringifiedRegexp = function(regexpStr) {
                if (regexpStr && (regexpStr instanceof String || typeof regexpStr === "string")) {
                    return new RegExp(regexpStr);
                }
            };

            if (!urlData || !urlData.urlRegexps) {
                return;
            }
            var urlRegexps = urlData.urlRegexps,
                regexp;

            if (Array.isArray(urlRegexps)) {
                for (var index in urlRegexps) {
                    regexp = getDestringifiedRegexp(urlRegexps[index]);
                    if (regexp) {
                        urlRegexps[index] = regexp;
                    }
                }
            }
            else {
                regexp = getDestringifiedRegexp(urlRegexps);
                if (regexp) {
                    urlData.urlRegexps = regexp;
                }
            }

        };

        var urlDataMap = settingsObj && settingsObj.urlDataMap;

        if (!urlDataMap) {
            return;
        }

        var urlData;
        for (var key in urlDataMap) {
            urlData = urlDataMap[key];
            if (Array.isArray(urlData)) {
                for (var index in urlData) {
                    destringifyRegexp_inUrlData(urlData[index]);
                }

            }
            else {
                destringifyRegexp_inUrlData(urlData);
            }
        }
    }

    /***
     * Stringifies all the functions and regular expressions in a settings object (defaultSettings or userSettings)
     * @param {object} settingsObj
     */
    function stringifyJSONUnsupportedTypes_inSettings(settingsObj) {
        stringifyFunctions(settingsObj);
        stringifyRegexps_inSettings(settingsObj);
    }

    /***
     * De-stringifies all the functions and regular expressions in a settings object (defaultSettings or userSettings)
     * @param {object} settingsObj
     */
    function destringifyJsonUnsupportedTypes_inSettings(settingsObj) {
        destringifyFunctions(settingsObj);
        destringifyRegexps_inSettings(settingsObj);
    }

    function getHostname(url) {
        var a = document.createElement('a');
        a.href = url;
        return a.hostname;
    }

    return thisModule;
})();
