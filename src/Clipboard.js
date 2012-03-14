(function() {

    function blockToText(md,node,indent,nextIndent,listType,listNo)
    {
        var linesBetweenChildren = 1;
        var childIndent = indent;
        if (node.nodeName == "LI") {
            if (listType == "OL") {
                var listMarker;
                if (listNo.value < 10)
                    listMarker = listNo.value+".  ";
                else
                    listMarker = listNo.value+". ";
                beginParagraph(md,0,indent,listMarker);
                nextIndent += "    ";
            }
            else {
                beginParagraph(md,0,indent,"  - ");
                nextIndent += "    ";
            }
            listNo.value++;
        }
        else if (node.nodeName == "UL") {
            listType = "UL";
            listNo = { value: 1 };
            beginParagraph(md,1,indent);
            linesBetweenChildren = 0;
        }
        else if (node.nodeName == "OL") {
            listType = "OL";
            listNo = { value: 1 };
            beginParagraph(md,1,indent);
            linesBetweenChildren = 0;
        }
        else if (node.nodeName == "H1") {
            beginParagraph(md,1,indent,"# "," #");
        }
        else if (node.nodeName == "H2") {
            beginParagraph(md,1,indent,"## "," ##");
        }
        else if (node.nodeName == "H3") {
            beginParagraph(md,1,indent,"### "," ###");
        }
        else if (node.nodeName == "H4") {
            beginParagraph(md,1,indent,"#### "," ####");
        }
        else if (node.nodeName == "H5") {
            beginParagraph(md,1,indent,"##### "," #####");
        }
        else if (node.nodeName == "H6") {
            beginParagraph(md,1,indent,"###### "," ######");
        }
        else if (node.nodeName == "BLOCKQUOTE") {
            beginParagraph(md,1,indent,"> ");
            nextIndent += "> ";
        }

        var foundNonWhitespaceChild = false;
        for (var child = node.firstChild; child != null; child = child.nextSibling) {
            if (isContainerNode(child) || isParagraphNode(child)) {
                beginParagraph(md,linesBetweenChildren,indent);
                blockToText(md,child,indent,nextIndent,listType,listNo);
                beginParagraph(md,linesBetweenChildren);
                indent = nextIndent;
                foundNonWhitespaceChild = false;
            }
            else {
                if (!foundNonWhitespaceChild) {
                    if (isWhitespaceTextNode(child))
                        continue;
                    beginParagraph(md,0,indent);
                    indent = nextIndent;
                    foundNonWhitespaceChild = true;
                }

                inlineToText(md,child);
            }
        }
    }

    function shipOutParagraph(md)
    {
        var text = normalizeWhitespace(md.buildParagraph.join(""));
        if (md.allText.length > 0) {
            for (var i = 0; i < md.buildLines; i++)
                md.allText.push("\n");
        }
        md.allText.push(md.indent+md.buildPrefix+text+md.buildSuffix+"\n");
        resetBuild(md);
    }

    function beginParagraph(md,blankLines,indent,paraPrefix,paraSuffix)
    {
        if (blankLines == null)
            blankLines = 1;
        if (indent == null)
            indent = "";
        if (paraPrefix == null)
            paraPrefix = "";
        if (paraSuffix == null)
            paraSuffix = "";

        if (md == null)
            throw new Error("beginParagraph: md is null");
        if (md.buildParagraph == null)
            throw new Error("beginParagraph: md.buildParagraph is null");

        if (md.buildParagraph.length > 0) {
            shipOutParagraph(md);
        }

        if (md.buildLines < blankLines)
            md.buildLines = blankLines;
        if (md.indent.length < indent.length)
            md.indent = indent;
        md.buildPrefix += paraPrefix;
        md.buildSuffix = paraSuffix + md.buildSuffix;
    }

    function inlineToText(md,node)
    {
        if (node.nodeType == Node.TEXT_NODE) {
            md.buildParagraph.push(node.nodeValue);
        }
        else if ((node.nodeName == "I") || (node.nodeName == "EM")) {
            md.buildParagraph.push("*");
            processChildren();
            md.buildParagraph.push("*");
        }
        else if ((node.nodeName == "B") || (node.nodeName == "STRONG")) {
            md.buildParagraph.push("**");
            processChildren();
            md.buildParagraph.push("**");
        }
        else if (node.nodeName == "A") {
            md.buildParagraph.push("[");
            processChildren();
            md.buildParagraph.push("]("+node.getAttribute("href")+")");
        }
        else {
            processChildren();
        }

        function processChildren()
        {
            for (var child = node.firstChild; child != null; child = child.nextSibling) {
                inlineToText(md,child);
            }
        }
    }

    function resetBuild(md)
    {
        md.buildParagraph = new Array();
        md.buildLines = 0;
        md.buildPrefix = "";
        md.buildSuffix = "";
        md.indent = "";
    }

    function MarkdownBuilder()
    {
    }

    function htmlToMarkdown(node)
    {
        var md = new MarkdownBuilder();
        md.allText = new Array();
        resetBuild(md);

        if (isContainerNode(node) || isParagraphNode(node)) {
            blockToText(md,node,"","");
            beginParagraph(md);
            return md.allText.join("");
        }
        else {
            inlineToText(md,node);
            return normalizeWhitespace(md.buildParagraph.join(""));
        }
    }

    window.Markdown = new Object();
    Markdown.htmlToMarkdown = htmlToMarkdown;

})();

(function() {

    // public (FIXME: temp: for testing)
    function htmlToText(node)
    {
        return Markdown.htmlToMarkdown(node);
    }

    // public
    function cut()
    {
        var content = copy();
        Selection.deleteSelectionContents();
        return content;
    }

    // public
    function copy()
    {
        var selectionRange = Selection.getSelectionRange();
        var html = "";
        var text = "";

        if (selectionRange != null) {
            var nodes = selectionRange.cloneContents();

            var div = DOM.createElement(document,"DIV");
            for (var i = 0; i < nodes.length; i++)
                DOM.appendChild(div,nodes[i]);

            html = div.innerHTML;
            text = htmlToText(div);
        }

        return { "text/html": html,
                 "text/plain": text };
    }

    // public
    function pasteText(text)
    {
        var textNode = DOM.createTextNode(document,text);
        var nodes = [textNode];
        pastNodes(nodes);
    }

    // public
    function pasteHTML(html)
    {
        var div = DOM.createElement(document,"DIV");
        div.innerHTML = html;

        var nodes = new Array();
        for (var child = div.firstChild; child != null; child = child.nextSibling)
            nodes.push(child);

        pasteNodes(nodes);
    }

    function pasteNodes(nodes)
    {
        Selection.deleteSelectionContents();
        var pos = selection.start;
        var node = pos.node;
        var offset = pos.offset;

        var parent;
        var before;
        if (node.nodeType == Node.ELEMENT_NODE) {
            parent = node;
            before = node.childNodes[offset];
        }
        else {
            splitTextBefore(node,offset);
            parent = node.parentNode;
            before = node;
        }
        for (var i = 0; i < nodes.length; i++)
            DOM.insertBefore(parent,nodes[i],before);
    }

    function pasteImage(href)
    {
        // FIXME
    }

    window.Clipboard = new Object();
    Clipboard.htmlToText = htmlToText;
    Clipboard.cut = cut;
    Clipboard.copy = copy;
    Clipboard.pasteText = pasteText;
    Clipboard.pasteHTML = pasteHTML;

})();
