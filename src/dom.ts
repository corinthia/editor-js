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

define("DOM",function(require,exports) {
"use strict";

var ElementTypes = require("ElementTypes");
var Traversal = require("Traversal");
var Types = require("Types");
var UndoManager = require("UndoManager");
var Util = require("Util");

var nextNodeId = 0;
var nodeData = new Object();
var ignoreMutations = 0;

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
//                                    DOM Helper Functions                                    //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////

function addUndoAction(...args) {
    if (UndoManager.undoSupported)
        UndoManager.addAction.apply(null,Util.arrayCopy(arguments));
}

function assignNodeId(node) {
    if (node._nodeId != null)
        throw new Error(node+" already has id");
    node._nodeId = nextNodeId++;
    node._type = ElementTypes.fromString[node.nodeName];
    return node;
}

function checkNodeId(node) {
    if (node._nodeId == null)
        throw new Error(node.nodeName+" lacks _nodeId");
}

// public
function assignNodeIds(root) {
    if (root._nodeId != null)
        throw new Error(root+" already has id");
    recurse(root);
    return;

    function recurse(node) {
        node._nodeId = nextNodeId++;
        node._type = ElementTypes.fromString[node.nodeName];
        for (var child = node.firstChild; child != null; child = child.nextSibling)
            recurse(child);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
//                                  Primitive DOM Operations                                  //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////

/*

  The following functions are considered "primitive", in that they are the core functions
  through which all manipulation of the DOM ultimately occurs. All other DOM functions call
  these, either directly or indirectly, instead of making direct method calls on node objects.
  These functions are divided into two categories: node creation and mode mutation.

  The creation functions are as follows:

  * createElement(document,elementName)
  * createElementNS(document,namespaceURI,qualifiedName)
  * createTextNode(document,data)
  * createComment(document,data)
  * cloneNode(original,deep,noIdAttr)

  The purpose of these is to ensure that a unique _nodeId value is assigned to each node object,
  which is needed for using the NodeSet and NodeMap classes. All nodes in a document must have
  this set; we use our own functions for this because DOM provides no other way of uniquely
  identifying nodes in a way that allows them to be stored in a hash table.

  The mutation functions are as follows:

  * insertBeforeInternal(parent,newChild,refChild)
  * deleteNodeInternal(node,deleteDescendantData)
  * setAttribute(element,name,value)
  * setAttributeNS(element,namespaceURI,qualifiedName,value)
  * setStyleProperties(element,properties)
  * insertCharacters(textNode,offset,characters)
  * deleteCharacters(textNode,startOffset,endOffset)
  * moveCharacters(srcTextNode,srcStartOffset,srcEndOffset,destTextNode,destOffset)
  * setNodeValue(textNode,value)

  These functions exist to allow us to record undo information. We can't use DOM mutation events
  for this purpose they're not fully supported in WebKit.

  Every time a mutation operation is performed on a node, we add an action to the undo stack
  corresponding to the inverse of that operaton, i.e. an action that undoes the operaton. It
  is absolutely critical that all changes to a DOM node go through these functions, regardless
  of whether or not the node currently resides in the tree. This ensures that the undo history
  is able to correctly revert the tree to the same state that it was in at the relevant point
  in time.

  By routing all DOM modifications through these few functions, virtually all of the other
  javascript code can be ignorant of the undo manager, provided the only state they change is
  in the DOM. Parts of the code which maintain their own state about the document, such as the
  style manager, must implement their own undo-compliant state manipulation logic.

  *** IMPORTANT ***

  Just in case it isn't already clear, you must *never* make direct calls to methods like
  appendChild() and createElement() on the node objects themselves. Doing so will result in
  subtle and probably hard-to-find bugs. As far as all javascript code for UX Write is
  concerned, consider the public functions defined in this file to be the DOM API. You can use
  check-dom-methods.sh to search for any cases where this rule has been violated.

  */

// public
function createElement(document,elementName) {
    return assignNodeId(document.createElement(elementName)); // check-ok
}

// public
function createElementNS(document,namespaceURI,qualifiedName) {
    return assignNodeId(document.createElementNS(namespaceURI,qualifiedName)); // check-ok
}

// public
function createTextNode(document,data) {
    return assignNodeId(document.createTextNode(data)); // check-ok
}

// public
function createComment(document,data) {
    return assignNodeId(document.createComment(data)); // check-ok
}

// public
function cloneNode(original,deep,noIdAttr) {
    var clone = original.cloneNode(deep); // check-ok
    assignNodeIds(clone);
    if (noIdAttr)
        clone.removeAttribute("id"); // check-ok
    return clone;
}

function insertBeforeInternal(parent,newChild,refChild) {
    if (newChild.parentNode == null) {
        addUndoAction(deleteNodeInternal,newChild)
    }
    else {
        var oldParent = newChild.parentNode;
        var oldNext = newChild.nextSibling;
        addUndoAction(insertBeforeInternal,oldParent,newChild,oldNext);
    }

    parent.insertBefore(newChild,refChild); // check-ok
}

function deleteNodeInternal(node,deleteDescendantData) {
    checkNodeId(node);

    addUndoAction(insertBeforeInternal,node.parentNode,node,node.nextSibling);

    if (node.parentNode == null)
        throw new Error("Undo delete "+Util.nodeString(node)+": parent is null");
    node.parentNode.removeChild(node); // check-ok

    // Delete all data associated with the node. This is not preserved across undo/redo;
    // currently the only thing we are using this data for is tracked positions, and we
    // are going to be recording undo information for the selection separately, so this is
    // not a problem.
    if (deleteDescendantData)
        deleteNodeDataRecursive(node);
    else
        deleteNodeData(node);

    return;

    function deleteNodeData(current) {
        delete nodeData[current._nodeId];
    }

    function deleteNodeDataRecursive(current) {
        deleteNodeData(current);
        for (var child = current.firstChild; child != null; child = child.nextSibling)
            deleteNodeDataRecursive(child);
    }
}

// public
function setAttribute(element,name,value) {
    if (element.hasAttribute(name))
        addUndoAction(setAttribute,element,name,element.getAttribute(name));
    else
        addUndoAction(setAttribute,element,name,null);

    if (value == null)
        element.removeAttribute(name); // check-ok
    else
        element.setAttribute(name,value); // check-ok
}

// public
function setAttributeNS(element,namespaceURI,qualifiedName,value) {
    var localName = qualifiedName.replace(/^.*:/,"");
    if (element.hasAttributeNS(namespaceURI,localName)) {
        var oldValue = element.getAttributeNS(namespaceURI,localName);
        var oldQName = element.getAttributeNodeNS(namespaceURI,localName).nodeName; // check-ok
        addUndoAction(setAttributeNS,element,namespaceURI,oldQName,oldValue)
    }
    else {
        addUndoAction(setAttributeNS,element,namespaceURI,localName,null);
    }

    if (value == null)
        element.removeAttributeNS(namespaceURI,localName); // check-ok
    else
        element.setAttributeNS(namespaceURI,qualifiedName,value); // check-ok
}

// public
function setStyleProperties(element,properties) {
    if (Object.getOwnPropertyNames(properties).length == 0)
        return;

    if (element.hasAttribute("style"))
        addUndoAction(setAttribute,element,"style",element.getAttribute("style"));
    else
        addUndoAction(setAttribute,element,"style",null);

    for (var name in properties)
        element.style.setProperty(name,properties[name]); // check-ok

    if (element.getAttribute("style") == "")
        element.removeAttribute("style"); // check-ok
}

// public
function insertCharacters(textNode,offset,characters) {
    if (textNode.nodeType != Node.TEXT_NODE)
        throw new Error("insertCharacters called on non-text node");
    if ((offset < 0) || (offset > textNode.nodeValue.length))
        throw new Error("insertCharacters called with invalid offset");
    trackedPositionsForNode(textNode).forEach(function (position) {
        if (position.offset > offset)
            position.offset += characters.length;
    });
    textNode.nodeValue = textNode.nodeValue.slice(0,offset) +
                         characters +
                         textNode.nodeValue.slice(offset);
    var startOffset = offset;
    var endOffset = offset + characters.length;
    addUndoAction(deleteCharacters,textNode,startOffset,endOffset);
}

// public
function deleteCharacters(textNode,startOffset,endOffset) {
    if (textNode.nodeType != Node.TEXT_NODE)
        throw new Error("deleteCharacters called on non-text node "+Util.nodeString(textNode));
    if (endOffset == null)
        endOffset = textNode.nodeValue.length;
    if (endOffset < startOffset)
        throw new Error("deleteCharacters called with invalid start/end offset");
    trackedPositionsForNode(textNode).forEach(function (position) {
        var deleteCount = endOffset - startOffset;
        if ((position.offset > startOffset) && (position.offset < endOffset))
            position.offset = startOffset;
        else if (position.offset >= endOffset)
            position.offset -= deleteCount;
    });

    var removed = textNode.nodeValue.slice(startOffset,endOffset);
    addUndoAction(insertCharacters,textNode,startOffset,removed);

    textNode.nodeValue = textNode.nodeValue.slice(0,startOffset) +
                         textNode.nodeValue.slice(endOffset);
}

// public
function moveCharacters(srcTextNode,srcStartOffset,srcEndOffset,destTextNode,destOffset,
                        excludeStartPos,excludeEndPos) {
    if (srcTextNode == destTextNode)
        throw new Error("src and dest text nodes cannot be the same");
    if (srcStartOffset > srcEndOffset)
        throw new Error("Invalid src range "+srcStartOffset+" - "+srcEndOffset);
    if (srcStartOffset < 0)
        throw new Error("srcStartOffset < 0");
    if (srcEndOffset > srcTextNode.nodeValue.length)
        throw new Error("srcEndOffset beyond end of src length");
    if (destOffset < 0)
        throw new Error("destOffset < 0");
    if (destOffset > destTextNode.nodeValue.length)
        throw new Error("destOffset beyond end of dest length");

    var length = srcEndOffset - srcStartOffset;

    addUndoAction(moveCharacters,destTextNode,destOffset,destOffset+length,
                  srcTextNode,srcStartOffset,excludeStartPos,excludeEndPos);

    trackedPositionsForNode(destTextNode).forEach(function (pos) {
        var startMatch = excludeStartPos ? (pos.offset > destOffset)
                                         : (pos.offset >= destOffset);
        if (startMatch)
            pos.offset += length;
    });
    trackedPositionsForNode(srcTextNode).forEach(function (pos) {

        var startMatch = excludeStartPos ? (pos.offset > srcStartOffset)
                                         : (pos.offset >= srcStartOffset);
        var endMatch = excludeEndPos ? (pos.offset < srcEndOffset)
                                     : (pos.offset <= srcEndOffset);

        if (startMatch && endMatch) {
            pos.node = destTextNode;
            pos.offset = destOffset + (pos.offset - srcStartOffset);
        }
        else if (pos.offset >= srcEndOffset) {
            pos.offset -= length;
        }
    });
    var extract = srcTextNode.nodeValue.substring(srcStartOffset,srcEndOffset);
    srcTextNode.nodeValue = srcTextNode.nodeValue.slice(0,srcStartOffset) +
                            srcTextNode.nodeValue.slice(srcEndOffset);
    destTextNode.nodeValue = destTextNode.nodeValue.slice(0,destOffset) +
                             extract +
                             destTextNode.nodeValue.slice(destOffset);
}

// public
function setNodeValue(textNode,value) {
    if (textNode.nodeType != Node.TEXT_NODE)
        throw new Error("setNodeValue called on non-text node");
    trackedPositionsForNode(textNode).forEach(function (position) {
        position.offset = 0;
    });
    var oldValue = textNode.nodeValue;
    addUndoAction(setNodeValue,textNode,oldValue);
    textNode.nodeValue = value;
}

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
//                                  High-level DOM Operations                                 //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////

function appendChildInternal(parent,newChild) {
    insertBeforeInternal(parent,newChild,null);
}

// public
function appendChild(node,child) {
    return insertBefore(node,child,null);
}

// public
function insertBefore(parent,child,nextSibling) {
    var newOffset;
    if (nextSibling != null)
        newOffset = nodeOffset(nextSibling);
    else
        newOffset = parent.childNodes.length;

    var oldParent = child.parentNode;
    if (oldParent != null) { // already in tree
        var oldOffset = nodeOffset(child);

        if ((oldParent == parent) && (newOffset > oldOffset))
            newOffset--;

        trackedPositionsForNode(oldParent).forEach(function (position) {
            if (position.offset > oldOffset) {
                position.offset--;
            }
            else if (position.offset == oldOffset) {
                position.node = parent;
                position.offset = newOffset;
            }
        });
    }

    var result = insertBeforeInternal(parent,child,nextSibling);
    trackedPositionsForNode(parent).forEach(function (position) {
        if (position.offset > newOffset)
            position.offset++;
    });
    return result;
}

// public
function deleteNode(node) {
    if (node.parentNode == null) // already deleted
        return;
    adjustPositionsRecursive(node);
    deleteNodeInternal(node,true);

    function adjustPositionsRecursive(current) {
        for (var child = current.firstChild; child != null; child = child.nextSibling)
            adjustPositionsRecursive(child);

        trackedPositionsForNode(current.parentNode).forEach(function (position) {
            var offset = nodeOffset(current);
            if (offset < position.offset) {
                position.offset--;
            }
        });
        trackedPositionsForNode(current).forEach(function (position) {
            var offset = nodeOffset(current);
            position.node = current.parentNode;
            position.offset = offset;
        });
    }
}

// public
function removeAttribute(element,name,value) {
    setAttribute(element,name,null);
}

// public
function removeAttributeNS(element,namespaceURI,localName) {
    setAttributeNS(element,namespaceURI,localName,null)
}

// public
function getAttribute(element,name) {
    if (element.hasAttribute(name))
        return element.getAttribute(name);
    else
        return null;
}

// public
function getAttributeNS(element,namespaceURI,localName) {
    if (element.hasAttributeNS(namespaceURI,localName))
        return element.getAttributeNS(namespaceURI,localName);
    else
        return null;
}

// public
function getStringAttribute(element,name) {
    var value = element.getAttribute(name);
    return (value == null) ? "" : value;
}

// public
function getStringAttributeNS(element,namespaceURI,localName) {
    var value = element.getAttributeNS(namespaceURI,localName);
    return (value == null) ? "" : value;
}

// public
function getStyleProperties(node) {
    var properties = new Object();
    if (node.nodeType == Node.ELEMENT_NODE) {
        for (var i = 0; i < node.style.length; i++) {
            var name = node.style[i];
            var value = node.style.getPropertyValue(name);
            properties[name] = value;
        }
    }
    return properties;
}

// public
function deleteAllChildren(parent) {
    while (parent.firstChild != null)
        deleteNode(parent.firstChild);
}

// public
function shallowCopyElement(element) {
    return cloneNode(element,false,true);
}

// public
function removeNodeButKeepChildren(node) {
    if (node.parentNode == null)
        throw new Error("Node "+Util.nodeString(node)+" has no parent");
    var offset = nodeOffset(node);
    var childCount = node.childNodes.length;

    trackedPositionsForNode(node.parentNode).forEach(function (position) {
        if (position.offset > offset)
            position.offset += childCount-1;
    });

    trackedPositionsForNode(node).forEach(function (position) {
        position.node = node.parentNode;
        position.offset += offset;
    });

    var parent = node.parentNode;
    var nextSibling = node.nextSibling;
    deleteNodeInternal(node,false);

    while (node.firstChild != null) {
        var child = node.firstChild;
        insertBeforeInternal(parent,child,nextSibling);
    }
}

// public
function replaceElement(oldElement,newName) {
    var listeners = listenersForNode(oldElement);
    var newElement = createElement(document,newName);
    for (var i = 0; i < oldElement.attributes.length; i++) {
        var name = oldElement.attributes[i].nodeName; // check-ok
        var value = oldElement.getAttribute(name);
        setAttribute(newElement,name,value);
    }

    var positions = Util.arrayCopy(trackedPositionsForNode(oldElement));
    if (positions != null) {
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].node != oldElement)
                throw new Error("replaceElement: position with wrong node");
            positions[i].node = newElement;
        }
    }

    var parent = oldElement.parentNode;
    var nextSibling = oldElement.nextSibling;
    while (oldElement.firstChild != null)
        appendChildInternal(newElement,oldElement.firstChild);
    // Deletion must be done first so if it's a heading, the outline code picks up the change
    // correctly. Otherwise, there could be two elements in the document with the same id at
    // the same time.
    deleteNodeInternal(oldElement,false);
    insertBeforeInternal(parent,newElement,nextSibling);

    for (var i = 0; i < listeners.length; i++)
        listeners[i].afterReplaceElement(oldElement,newElement);

    return newElement;
}

// public
function wrapNode(node,elementName) {
    return wrapSiblings(node,node,elementName);
}

function wrapSiblings(first,last,elementName) {
    var parent = first.parentNode;
    var wrapper = createElement(document,elementName);

    if (first.parentNode != last.parentNode)
        throw new Error("first and last are not siblings");

    if (parent != null) {
        var firstOffset = nodeOffset(first);
        var lastOffset = nodeOffset(last);
        var nodeCount = lastOffset - firstOffset + 1;
        trackedPositionsForNode(parent).forEach(function (position) {
            if ((position.offset >= firstOffset) && (position.offset <= lastOffset+1)) {
                position.node = wrapper;
                position.offset -= firstOffset;
            }
            else if (position.offset > lastOffset+1) {
                position.offset -= (nodeCount-1);
            }
        });

        insertBeforeInternal(parent,wrapper,first);
    }

    var end = last.nextSibling;
    var current = first;
    while (current != end) {
        var next = current.nextSibling;
        appendChildInternal(wrapper,current);
        current = next;
    }
    return wrapper;
}

// public
function mergeWithNextSibling(current,whiteList) {
    var parent = current.parentNode;
    var next = current.nextSibling;

    if ((next == null) || !nodesMergeable(current,next,whiteList))
        return;

    var currentLength = maxChildOffset(current);
    var nextOffset = nodeOffset(next);

    var lastChild = null;

    if (current.nodeType == Node.ELEMENT_NODE) {
        lastChild = current.lastChild;
        insertBefore(current,next,null);
        removeNodeButKeepChildren(next);
    }
    else {
        insertCharacters(current,current.nodeValue.length,next.nodeValue);

        trackedPositionsForNode(next).forEach(function (position) {
            position.node = current;
            position.offset = position.offset+currentLength;
        });

        trackedPositionsForNode(current.parentNode).forEach(function (position) {
            if (position.offset == nextOffset) {
                position.node = current;
                position.offset = currentLength;
            }
        });

        deleteNode(next);
    }

    if (lastChild != null)
        mergeWithNextSibling(lastChild,whiteList);
}

// public
function nodesMergeable(a,b,whiteList) {
    if ((a.nodeType == Node.TEXT_NODE) && (b.nodeType == Node.TEXT_NODE))
        return true;
    else if ((a.nodeType == Node.ELEMENT_NODE) && (b.nodeType == Node.ELEMENT_NODE))
        return elementsMergableTypes(a,b);
    else
        return false;

    function elementsMergableTypes(a,b) {
        if (whiteList["force"] && Types.isParagraphNode(a) && Types.isParagraphNode(b))
            return true;
        if ((a._type == b._type) &&
            whiteList[a._type] &&
            (a.attributes.length == b.attributes.length)) {
            for (var i = 0; i < a.attributes.length; i++) {
                var attrName = a.attributes[i].nodeName; // check-ok
                if (a.getAttribute(attrName) != b.getAttribute(attrName))
                    return false;
            }
            return true;
        }

        return false;
    }
}

function getDataForNode(node,create) {
    if (node._nodeId == null)
        throw new Error("getDataForNode: node "+node.nodeName+" has no _nodeId property");
    if ((nodeData[node._nodeId] == null) && create)
        nodeData[node._nodeId] = new Object();
    return nodeData[node._nodeId];
}

function trackedPositionsForNode(node) {
    var data = getDataForNode(node,false);
    if ((data != null) && (data.trackedPositions != null)) {
        // Sanity check
        for (var i = 0; i < data.trackedPositions.length; i++) {
            if (data.trackedPositions[i].node != node)
                throw new Error("Position "+data.trackedPositions[i]+" has wrong node");
        }
        return Util.arrayCopy(data.trackedPositions);
    }
    else {
        return [];
    }
}

function listenersForNode(node) {
    var data = getDataForNode(node,false);
    if ((data != null) && (data.listeners != null))
        return data.listeners;
    else
        return [];
}

// public
function replaceCharacters(textNode,startOffset,endOffset,replacement) {
    // Note that we do the insertion *before* the deletion so that the position is properly
    // maintained, and ends up at the end of the replacement (unless it was previously at
    // startOffset, in which case it will stay the same)
    insertCharacters(textNode,startOffset,replacement);
    deleteCharacters(textNode,startOffset+replacement.length,endOffset+replacement.length);
}

// public
function addTrackedPosition(position) {
    var data = getDataForNode(position.node,true);
    if (data.trackedPositions == null)
        data.trackedPositions = new Array();
    data.trackedPositions.push(position);
}

// public
function removeTrackedPosition(position) {
    var data = getDataForNode(position.node,false);
    if ((data == null) || (data.trackedPositions == null))
        throw new Error("removeTrackedPosition: no registered positions for this node "+
                        "("+position.node.nodeName+")");
    for (var i = 0; i < data.trackedPositions.length; i++) {
        if (data.trackedPositions[i] == position) {
            data.trackedPositions.splice(i,1);
            return;
        }
    }
    throw new Error("removeTrackedPosition: position is not registered ("+
                    data.trackedPositions.length+" others)");
}

// public
function removeAdjacentWhitespace(node) {
    while ((node.previousSibling != null) && (Traversal.isWhitespaceTextNode(node.previousSibling)))
        deleteNode(node.previousSibling);
    while ((node.nextSibling != null) && (Traversal.isWhitespaceTextNode(node.nextSibling)))
        deleteNode(node.nextSibling);
}

// public
function documentHead(document) {
    var html = document.documentElement;
    for (var child = html.firstChild; child != null; child = child.nextSibling) {
        if (child._type == ElementTypes.HTML_HEAD)
            return child;
    }
    throw new Error("Document contains no HEAD element");
}

// public
function ensureUniqueIds(root) {
    var ids = new Object();
    var duplicates = new Array();

    discoverDuplicates(root);
    renameDuplicates();

    return;

    function discoverDuplicates(node) {
        if (node.nodeType != Node.ELEMENT_NODE)
            return;

        var id = node.getAttribute("id");
        if ((id != null) && (id != "")) {
            if (ids[id])
                duplicates.push(node);
            else
                ids[id] = true;
        }
        for (var child = node.firstChild; child != null; child = child.nextSibling)
            discoverDuplicates(child);
    }

    function renameDuplicates() {
        var nextNumberForPrefix = new Object();
        for (var i = 0; i < duplicates.length; i++) {
            var id = duplicates[i].getAttribute("id");
            var prefix = id.replace(/[0-9]+$/,"");
            var num = nextNumberForPrefix[prefix] ? nextNumberForPrefix[prefix] : 1;

            var candidate;
            do {
                candidate = prefix + num;
                num++;
            } while (ids[candidate]);

            setAttribute(duplicates[i],"id",candidate);
            ids[candidate] = true;
            nextNumberForPrefix[prefix] = num;
        }
    }
}

// public
function nodeOffset(node,parent?) {
    if ((node == null) && (parent != null))
        return maxChildOffset(parent);
    var offset = 0;
    for (var n = node.parentNode.firstChild; n != node; n = n.nextSibling)
        offset++;
    return offset;
}

// public
function maxChildOffset(node) {
    if (node.nodeType == Node.TEXT_NODE)
        return node.nodeValue.length;
    else if (node.nodeType == Node.ELEMENT_NODE)
        return node.childNodes.length;
    else
        throw new Error("maxOffset: invalid node type ("+node.nodeType+")");
}

function incIgnoreMutations() {
    UndoManager.addAction(decIgnoreMutations);
    ignoreMutations++;
}

function decIgnoreMutations() {
    UndoManager.addAction(incIgnoreMutations);
    ignoreMutations--;
    if (ignoreMutations < 0)
        throw new Error("ignoreMutations is now negative");
}

// public
function ignoreMutationsWhileExecuting(fun) {
    incIgnoreMutations();
    try {
        return fun();
    }
    finally {
        decIgnoreMutations();
    }
}

// public
function getIgnoreMutations() {
    return ignoreMutations;
}

// public
function addListener(node,listener) {
    var data = getDataForNode(node,true);
    if (data.listeners == null)
        data.listeners = [listener];
    else
        data.listeners.push(listener);
}

// public
function removeListener(node,listener) {
    var list = listenersForNode(node);
    var index = list.indexOf(listener);
    if (index >= 0)
        list.splice(index,1);
}

// public
function Listener() {
}

Listener.prototype.afterReplaceElement = function(oldElement,newElement) {}

exports.assignNodeIds = assignNodeIds;
exports.createElement = createElement;
exports.createElementNS = createElementNS;
exports.createTextNode = createTextNode;
exports.createComment = createComment;
exports.cloneNode = cloneNode;
exports.setAttribute = setAttribute;
exports.setAttributeNS = setAttributeNS;
exports.setStyleProperties = setStyleProperties;
exports.insertCharacters = insertCharacters;
exports.deleteCharacters = deleteCharacters;
exports.moveCharacters = moveCharacters;
exports.setNodeValue = setNodeValue;
exports.appendChild = appendChild;
exports.insertBefore = insertBefore;
exports.deleteNode = deleteNode;
exports.removeAttribute = removeAttribute;
exports.removeAttributeNS = removeAttributeNS;
exports.getAttribute = getAttribute;
exports.getAttributeNS = getAttributeNS;
exports.getStringAttribute = getStringAttribute;
exports.getStringAttributeNS = getStringAttributeNS;
exports.getStyleProperties = getStyleProperties;
exports.deleteAllChildren = deleteAllChildren;
exports.shallowCopyElement = shallowCopyElement;
exports.removeNodeButKeepChildren = removeNodeButKeepChildren;
exports.replaceElement = replaceElement;
exports.wrapNode = wrapNode;
exports.wrapSiblings = wrapSiblings;
exports.mergeWithNextSibling = mergeWithNextSibling;
exports.nodesMergeable = nodesMergeable;
exports.replaceCharacters = replaceCharacters;
exports.addTrackedPosition = addTrackedPosition;
exports.removeTrackedPosition = removeTrackedPosition;
exports.removeAdjacentWhitespace = removeAdjacentWhitespace;
exports.documentHead = documentHead;
exports.ensureUniqueIds = ensureUniqueIds;
exports.nodeOffset = nodeOffset;
exports.maxChildOffset = maxChildOffset;
exports.ignoreMutationsWhileExecuting = ignoreMutationsWhileExecuting;
exports.getIgnoreMutations = getIgnoreMutations;
exports.addListener = addListener;
exports.removeListener = removeListener;
exports.Listener = Listener;

});