// Copyright (c) 2011-2012 UX Productivity Pty Ltd. All rights reserved.

function Range(startNode,startOffset,endNode,endOffset)
{
    this.start = new Position(startNode,startOffset);
    this.end = new Position(endNode,endOffset);
}

Range.prototype.copy = function()
{
    return new Range(this.start.node,this.start.offset,
                     this.end.node,this.end.offset);
}

Range.prototype.isEmpty = function()
{
    return ((this.start.node == this.end.node) &&
            (this.start.offset == this.end.offset));
}

Range.prototype.toString = function()
{
    return this.start.toString() + " - " + this.end.toString();
}

Range.prototype.trackWhileExecuting = function(fun)
{
    Position.trackWhileExecuting([this.start,this.end],fun);
}

Range.prototype.selectWholeWords = function()
{
    if ((this.start.node.nodeType == Node.TEXT_NODE) &&
        (this.end.node.nodeType == Node.TEXT_NODE)) {
        if (this.isForwards()) {
            // this.start comes before this.end
            this.start.moveToStartOfWord();
            this.end.moveToEndOfWord();
        }
        else {
            // this.end comes before this.end
            this.start.moveToEndOfWord();
            this.end.moveToStartOfWord();
        }
    }
}

Range.prototype.omitEmptyTextSelection = function()
{
    this.start.moveForwardIfAtEnd();
    this.end.moveBackwardIfAtStart();
}

Range.prototype.isForwards = function()
{
    if ((this.start.node.parentNode == null) && (this.start.node != document.documentElement))
        throw new Error("Range.isForwards "+this+": start node has been removed from document");
    if ((this.end.node.parentNode == null) && (this.end.node != document.documentElement))
        throw new Error("Range.isForwards "+this+": end node has been removed from document");

    var start = this.start.toDefinitePosition();
    var end = this.end.toDefinitePosition();

    if (end == null) // end of document
        return true;

    if (start == null) // start is at end of document, end isn't
        return false;

    if (start.node == end.node) {
        return (start.offset <= end.offset);
    }
    else {
        var cmp = start.node.compareDocumentPosition(end.node);
        return (cmp & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY));
    }
}

Range.prototype.getParagraphNodes = function()
{
    var result = new Array();
    var node = this.start.node;
    while (!isParagraphNode(node))
        node = node.parentNode;
    while (true) {
        if (isParagraphNode(node))
            result.push(node);
        if (node == this.end.node)
            break;
        node = nextNode(node);
    }
    return result;
}

Range.prototype.getInlineNodes = function()
{
    var result = new Array();
    var node = this.start.node;
    while (true) {
        if (isInlineNode(node))
            result.push(node);
        if (node == this.end.node)
            break;
        node = nextNode(node);
    }
    return result;
}

Range.prototype.getAllNodes = function()
{
    var result = new Array();
    var node = this.start.node;
    while (true) {
        result.push(node);
        if (node == this.end.node)
            break;
        node = nextNode(node);
    }
    return result;
}

Range.prototype.ensureRangeValidHierarchy = function()
{
    var nodes = this.getAllNodes();
    
    var depths = new Array();
    for (var i = 0; i < nodes.length; i++) {
        var depth = getNodeDepth(nodes[i]);
        if (depths[depth] == null) {
            depths[depth] = new Array();
        }
        depths[depth].push(nodes[i]);
    }
    
    for (var depth = 0; depth < depths.length; depth++) {
        var firstDepth = true;
        if (depths[depth] != null) {
            for (var i = 0; i < depths[depth].length; i++) {
                var node = depths[depth][i];
                if (!isInlineNode(node.parentNode) && isWhitespaceTextNode(node)) {
                    node.parentNode.removeChild(node);
                }
                else {
                    ensureValidHierarchy(node,firstDepth);
                }
            }
            firstDepth = false;
        }
    }
}

Range.prototype.getOutermostSelectedNodes = function()
{
    if (!this.isForwards()) {
        var reverse = new Range(this.end.node,this.end.offset,this.start.node,this.start.offset);
        if (!reverse.isForwards())
            throw new Error("Both range "+this+" and its reverse are not forwards");
        return reverse.getOutermostSelectedNodes();
    }

    var result = new Array();
    var startContainer = this.start.node;
    var startOffset = this.start.offset;
    var endContainer = this.end.node;
    var endOffset = this.end.offset;

    // Note: start and end are *points* - they are always *in between* nodes or characters, never
    // *at* a node or character.
    // Everything after the end point is excluded from the selection
    // Everything after the start point, but before the end point, is included in the selection

    // We use (parent,child) pairs so that we have a way to represent a point that comes after all
    // the child nodes in a container - in which case the child is null. The parent, however, is
    // always non-null;

    var startLocation = this.start.toLocation();
    var endLocation = this.end.toLocation();

    // If the end node is contained within the start node, change the start node to the first
    // node in document order that is not an ancestor of the end node

    var startParent = startLocation.parent;
    var startChild = startLocation.child;

    var endParent = endLocation.parent;
    var endChild = endLocation.child;

    while (isAncestorLocation(startParent,startChild,endParent,endChild) &&
           ((startParent != endParent) || (startChild != endChild)) &&
           (startChild != null) &&
           (startChild.firstChild != null)) {
        startParent = startChild;
        startChild = startChild.firstChild;
    }

    var ancestors = ancestorsWithCommonParent(startParent,startChild,endParent,endChild);
    if (ancestors == null)
        return result;
    var commonParent = ancestors.commonParent;
    var startAncestorChild = ancestors.startChild;
    var endAncestorChild = ancestors.endChild;

    // Add start nodes
    var topParent = startParent;
    var topChild = startChild;
    do {
        if (topChild != null)
            result.push(topChild);

        while (((topChild == null) || (topChild.nextSibling == null)) &&
               (topParent != commonParent)) {
            topChild = topParent;
            topParent = topParent.parentNode;
        }
        if (topParent != commonParent)
            topChild = topChild.nextSibling;
    } while (topParent != commonParent);

    // Add middle nodes
    if (startAncestorChild != endAncestorChild) {
        var c = startAncestorChild;
        if (c != null)
            c = c.nextSibling;
        for (; c != endAncestorChild; c = c.nextSibling)
            result.push(c);
    }

    // Add end nodes
    var endNodes = new Array();
    var bottomParent = endParent;
    var bottomChild = endChild;
    var includeEnd = ((endChild != null) && (endChild.nodeType == Node.TEXT_NODE));
    var atEnd = true;
    do {
        if ((bottomChild != null) && (includeEnd || !atEnd))
            endNodes.push(bottomChild);
        atEnd = false;

        while ((getPreviousSibling(bottomParent,bottomChild) == null) &&
               (bottomParent != commonParent)) {
            bottomChild = bottomParent;
            bottomParent = bottomParent.parentNode;
        }
        if (bottomParent != commonParent)
            bottomChild = getPreviousSibling(bottomParent,bottomChild);
    } while (bottomParent != commonParent);
    for (var i = endNodes.length-1; i >= 0; i--)
        result.push(endNodes[i]);

    return result;

    function ancestorsWithCommonParent(startParent,startChild,endParent,endChild)
    {
        var startP = startParent;
        var startC = startChild;
        while (startP != null) {
            var endP = endParent;
            var endC = endChild
            while (endP != null) {
                if (startP == endP) {
                    return { commonParent: startP, startChild: startC, endChild: endC };
                }
                endC = endP;
                endP = endP.parentNode;
            }
            startC = startP;
            startP = startP.parentNode;
        }
        return null;
    }

    function getPreviousSibling(parent,child)
    {
        if (child != null)
            return child.previousSibling;
        else if (parent.lastChild != null)
            return parent.lastChild;
        else
            return null;
    }

    function isAncestorLocation(ancestorParent,ancestorChild,
                                descendantParent,descendantChild)
    {
        while ((descendantParent != null) &&
               ((descendantParent != ancestorParent) || (descendantChild != ancestorChild))) {
            descendantChild = descendantParent;
            descendantParent = descendantParent.parentNode;
        }

        return ((descendantParent == ancestorParent) &&
                (descendantChild == ancestorChild));
    }
}

Range.prototype.getClientRects = function()
{
    var nodes = this.getOutermostSelectedNodes();

    // WebKit in iOS 5.0 has a bug where if the selection spans multiple paragraphs, the complete
    // rect for paragraphs other than the first is returned, instead of just the portions of it
    // that are actually in the range. To get around this problem, we go through each text node
    // individually and collect all the rects.
    var result = new Array();
    var domRange = document.createRange();
    for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        var node = nodes[nodeIndex];
        if (node.nodeType == Node.TEXT_NODE) {
            var startOffset = (node == this.start.node) ? this.start.offset : 0;
            var endOffset = (node == this.end.node) ? this.end.offset : node.nodeValue.length;
            domRange.setStart(node,startOffset);
            domRange.setEnd(node,endOffset);
            var rects = domRange.getClientRects();
            for (var rectIndex = 0; rectIndex < rects.length; rectIndex++)
                result.push(rects[rectIndex]);
        }
        else if (node.nodeType == Node.ELEMENT_NODE) {
            result.push(node.getBoundingClientRect());
        }
    }
    return result;
}
