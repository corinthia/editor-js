// Copyright (c) 2011-2012 UX Productivity. All rights reserved.

function Position(node,offset)
{
    this.node = node;
    this.offset = offset;
    this.origOffset = offset;
}

Position.prototype.moveToStartOfWord = function()
{
    var text = this.node.nodeValue;
    this.offset = this.origOffset;
    while ((this.offset > 0) && isWordChar(text.charAt(this.offset-1)))
        this.offset--;
}

Position.prototype.moveToEndOfWord = function()
{
    var text = this.node.nodeValue;
    var length = text.length;
    this.offset = this.origOffset;
    while ((this.offset < length) && isWordChar(text.charAt(this.offset)))
        this.offset++;
}

Position.prototype.moveForwardIfAtEnd = function()
{
    if ((this.node.nodeType == Node.TEXT_NODE) &&
        (this.offset == this.node.nodeValue.length)) {
        var next = nextTextNode(this.node);
        if (next != null) {
            this.node = next;
            this.offset = 0;
            // debug("Moved start to "+this.toString()+"\n");
        }
    }
}

Position.prototype.moveBackwardIfAtStart = function()
{
    if ((this.node.nodeType == Node.TEXT_NODE) &&
        (this.offset == 0)) {
        var prev = prevTextNode(this.node);
        if (prev != null) {
            this.node = prev;
            this.offset = this.node.nodeValue.length;
            // debug("Moved end to "+this.toString()+"\n");
        }
    }
}

Position.prototype.toString = function()
{
    if (this.node.nodeType == Node.TEXT_NODE) {
        return "(\""+this.node.nodeValue+"\","+this.offset+")";
    }
    else if ((this.node.nodeType == Node.ELEMENT_NODE) && (this.node.hasAttribute("id"))) {
        return "(#"+this.node.getAttribute("id")+","+this.offset+")";
    }
    else {
        return "("+this.node.nodeName+","+this.offset+")";
    }
}
