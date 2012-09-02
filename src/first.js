// Copyright (c) 2012 UX Productivity Pty Ltd. All rights reserved.
// If you're successfully able to decipher all this and figure out what it
// does, please send a copy of your resume to peter@uxproductivity.com.

var trace;

var OFFICE_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
var STYLE_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
var TEXT_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
var TABLE_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
var FO_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
var SVG_NAMESPACE = "urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0";
var XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

var OFFICE_PREFIX = "office:";
var STYLE_PREFIX = "style:";
var TEXT_PREFIX = "text:";
var TABLE_PREFIX = "table:";
var FO_PREFIX = "fo:";
var SVG_PREFIX = "svg:";
var XLINK_PREFIX = "xlink:";

(function() {

    function valueString(arg)
    {
        try {
            if (arg == null) {
                return "null";
            }
            else if (typeof(arg) == "object") {
                if (arg instanceof Node) {
                    return "[node "+arg.nodeName+"]";
                }
                else {
                    var str = arg.toString();
                    return "[object "+arg.constructor.name+"]";
                }
            }
            else if (typeof(arg) == "string") {
                return JSON.stringify(arg);
            }
            else if (typeof(arg) == "function") {
                if (arg.name)
                    return "<function "+arg.name+">";
                else
                    return "<anonymous function>";
            }
            else {
                return arg;
            }
        }
        catch (e) {
            return "?"; // in case object or array element's toString() fails
        }
    }

    function stackEntryString(fun,args,thisObject)
    {
        var components = new Array();
        if ((thisObject != null) && (thisObject.constructor.name != null)) {
            components.push(thisObject.constructor.name+".");
        }
        components.push(fun.name+"(");
        for (var argno = 0; argno < args.length; argno++) {
            var arg = args[argno];
            if (argno > 0)
                components.push(",");
            components.push(valueString(arg));
        }
        components.push("): this = "+valueString(thisObject));
        return components.join("");
    }

    trace = function(fun)
    {
        var result = function() {
            try {
                return fun.apply(this,arguments);
            }
            catch (e) {
                var error = e;
                if (!error.custom) {
                    error = new Error(e.toString()+"\n");
                    error.custom = true;
                }
                error.message += stackEntryString(fun,arguments,this)+"\n";
                throw error;
            }
        }
        result.wrappedName = fun.name;
        return result;
    }

})();
