// This file is part of the Corinthia project (http://corinthia.io).
//
// See the COPYRIGHT.txt file distributed with this work for
// information regarding copyright ownership.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

define("tests.OutlineTests",function(require,exports) {

    var DOM = require("DOM");
    var Formatting = require("Formatting");
    var Outline = require("Outline");
    var PostponedActions = require("PostponedActions");
    var Selection = require("Selection");
    var TestLib = require("tests.TestLib");
    var Tables = require("Tables");

    function createTestSections(topChildren) {
        var index = 1;

        processChildren(1,topChildren);

        PostponedActions.perform();

        TestLib.setNumbering(true);

        function processChildren(level,children) {
            if (typeof children == "number") {
                for (var i = 0; i < children; i++)
                    recurse(level,null);
            }
            else if (children instanceof Array) {
                for (var i = 0; i < children.length; i++)
                    recurse(level,children[i]);
            }
        }

        function recurse(level,children) {
            var heading = DOM.createElement(document,"H"+level);

            DOM.appendChild(heading,DOM.createTextNode(document,"Section "+index));

            var p1 = DOM.createElement(document,"P");
            var p2 = DOM.createElement(document,"P");

            DOM.appendChild(p1,DOM.createTextNode(document,"Content "+index+" A"));
            DOM.appendChild(p2,DOM.createTextNode(document,"Content "+index+" B"));


            DOM.appendChild(document.body,heading);
            DOM.appendChild(document.body,p1);
            DOM.appendChild(document.body,p2);
            index++;

            processChildren(level+1,children);
        }
    }

    function setupOutline(topChildren) {
        Outline.init();
        PostponedActions.perform();
        createTestSections(topChildren);
    }

    function createTestFigures(count) {
        for (var i = 0; i < count; i++) {
            var figure = DOM.createElement(document,"FIGURE");
            var figcaption = DOM.createElement(document,"FIGCAPTION");
            var content = DOM.createTextNode(document,"(figure content)");
            var text = DOM.createTextNode(document,"Test figure "+String.fromCharCode(65+i));
            DOM.appendChild(figcaption,text);
            DOM.appendChild(figure,content);
            DOM.appendChild(figure,figcaption);
            DOM.appendChild(document.body,figure);
        }
    }

    function createTestTables(count) {
        for (var i = 0; i < count; i++) {
            var offset = document.body.childNodes.length;
            Selection.set(document.body,offset,document.body,offset);
            Tables.insertTable(1,1,"100%",true,"Test table "+String.fromCharCode(65+i));
        }
        PostponedActions.perform();
    }

    function removeOutlineHTML(node) {
        if ((node.nodeName == "SPAN") &&
            (node.getAttribute("class") == "uxwrite-heading-number")) {
            DOM.removeNodeButKeepChildren(node);
        }
        else {
            for (var child = node.firstChild; child != null; child = child.nextSibling)
                removeOutlineHTML(child);
            for (var child = node.firstChild; child != null; child = child.nextSibling)
                Formatting.mergeWithNeighbours(child,Formatting.MERGEABLE_INLINE);
        }
    }

    function cleanupOutline() {
        PostponedActions.perform();
        removeOutlineHTML(document.body);
    }

    exports.createTestSections = createTestSections;
    exports.setupOutline = setupOutline;
    exports.createTestFigures = createTestFigures;
    exports.createTestTables = createTestTables;
    exports.cleanupOutline = cleanupOutline;

});