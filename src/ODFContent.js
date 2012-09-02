var OfficeDocumentContent_get;
var OfficeDocumentContent_put;
var OfficeDocumentContent_parseStyles;

(function() {

    var odfSourceById = new Object();
    var nextODFId = 0;

    var addSourceMapping = trace(function _addSourceMapping(abs,con)
    {
        var id = "odf"+nextODFId;
        odfSourceById[id] = con;
        DOM_setAttribute(abs,"id",id);
        nextODFId++;
    });

    var lookupSourceMapping = trace(function _lookupSourceMapping(abs)
    {
        if (abs.nodeType != Node.ELEMENT_NODE)
            return null;
        var id = DOM_getAttribute(abs,"id");
        if (id == null)
            return id;
        else
            return odfSourceById[id];
    });




    var TextA_get = trace(function _TextA_get(con)
    {
        var href = DOM_getStringAttributeNS(con,XLINK_NAMESPACE,"href");
        var abs = DOM_createElement(document,"A");
        DOM_setAttribute(abs,"href",href);
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            var childAbs = ParagraphContent_getChild(child);
            if (childAbs != null)
                DOM_appendChild(abs,childAbs);
        }
        return abs;
    });

    var ParagraphContentOrHyperlink_getChild =
        trace(function _ParagraphContentOrHyperlink_getChild(con)
    {
        if (con._is_text_a)
            return TextA_get(con);
        else
            return ParagraphContent_getChild(con);
    });

    var ParagraphContent_getChild = trace(function _ParagraphContent_getChild(con)
    {
        if (con.nodeType == Node.TEXT_NODE)
            return DOM_createTextNode(document,con.nodeValue);
        else if (con._is_text_span)
            return TextSpan_get(con);
        else
            return null;
    });

    // text:span
    var TextSpan_get = trace(function _TextSpan_get(con)
    {
        var span = DOM_createElement(document,"SPAN");
        addSourceMapping(span,con);

        // ODF Spec: in the context of <text:span>, the text:style-name attribute specifies style
        // for span which shall be a style with family of text.
        var styleName = DOM_getAttributeNS(con,TEXT_NAMESPACE,"style-name");
        var auto = ODFAutomaticStyles_get(styleName,"text");
        if (auto != null)
            DOM_setStyleProperties(span,auto.cssProperties);
        else
            DOM_setAttribute(span,"class",styleName);

        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            var childAbs = ParagraphContentOrHyperlink_getChild(child);
            if (childAbs != null)
                DOM_appendChild(span,childAbs);
        }
        return span;
    });

    // text:p and text:h
    var TextPH_get = trace(function _TextPH_get(con)
    {
        var p = null;
        if (con._is_text_h) {
            var levelStr = DOM_getAttributeNS(con,TEXT_NAMESPACE,"outline-level");
            var level = 1;
            if (levelStr != null) {
                levelStr = levelStr.trim();
                if (levelStr.match(/[123456]/))
                    level = levelStr;
            }
            p = DOM_createElement(document,"H"+level);
        }
        else {
            p = DOM_createElement(document,"P");
        }
        addSourceMapping(p,con);

        var styleName = DOM_getAttributeNS(con,TEXT_NAMESPACE,"style-name");
        var auto = ODFAutomaticStyles_get(styleName,"paragraph");
        if (auto != null)
            DOM_setStyleProperties(p,auto.cssProperties);
        else
            DOM_setAttribute(p,"class",styleName);

        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            var childAbs = ParagraphContentOrHyperlink_getChild(child);
            if (childAbs != null)
                DOM_appendChild(p,childAbs);
        }
        return p;
    });

    var TextListItem_get = trace(function _TextListItem_get(con)
    {
        var li = DOM_createElement(document,"LI");
        addSourceMapping(li,con);
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            if (child._is_text_p || child._is_text_h)
                DOM_appendChild(li,TextPH_get(child));
            else if (child._is_text_list)
                DOM_appendChild(li,TextList_get(child));
        }
        return li;
    });

    var TextList_get = trace(function _TextList_get(con)
    {
        // All attributes are optional
        var styleName = DOM_getAttributeNS(con,TEXT_NAMESPACE,"style-name");
        var continueNumbering = DOM_getAttributeNS(con,TEXT_NAMESPACE,"continue-numbering");
        var continueList = DOM_getAttributeNS(con,TEXT_NAMESPACE,"continue-list");

        var ul = DOM_createElement(document,"UL");
        addSourceMapping(ul,con);
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            if (child._is_text_list_item) {
                DOM_appendChild(ul,TextListItem_get(child));
            }
        }
        return ul;
    });

    var TableTableCell_get = trace(function _TableTableCell_get(con)
    {
        var td = DOM_createElement(document,"TD");
        addSourceMapping(td,con);
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            var childAbs = DefTextContentChild_get(child);
            if (childAbs != null)
                DOM_appendChild(td,childAbs);
        }
        return td;
    });

    var TableTableRow_get = trace(function _TableTableRow_get(con)
    {
        var tr = DOM_createElement(document,"TR");
        addSourceMapping(tr,con);
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            if (child._is_table_table_cell)
                DOM_appendChild(tr,TableTableCell_get(child));
        }
        return tr;
    });

    var TableTable_get = trace(function _TableTable_get(con)
    {
        var table = DOM_createElement(document,"TABLE");
        addSourceMapping(table,con);

        var tableTitle = null;
        var tableDesc = null;
        var tableSource = null;

        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            if (child._is_table_title) {
                tableTitle = getNodeText(child);
            }
            else if (child._is_table_desc) {
                tableDesc = getNodeText(child);
            }
            else if (child._is_table_table_row) {
                DOM_appendChild(table,TableTableRow_get(child));
            }
        }
        return table;
    });

    var DefTextContentChild_get = trace(function _DefTextContentChild_get(con)
    {
        if (con._is_text_p || con._is_text_h)
            return TextPH_get(con);
        else if (con._is_text_list)
            return TextList_get(con);
        else if (con._is_table_table)
            return TableTable_get(con);
        else
            return null;
    });

    // office:text
    var OfficeText_get = trace(function _OfficeText_get(con)
    {
        var body = DOM_createElement(document,"BODY");
        for (var child = con.firstChild; child != null; child = child.nextSibling) {
            var childAbs = DefTextContentChild_get(child);
            if (childAbs != null)
                DOM_appendChild(body,childAbs);
        }
        return body;
    });

    var OfficeTextChild_isVisible = trace(function _OfficeTextChild_isVisible(con)
    {
        return (con._is_text_p || con._is_text_h);
    });

    var OfficeTextChild_put = trace(function _OfficeTextChild_put(abs,con)
    {
        debug("OfficeTextChild_put "+JSON.stringify(getNodeText(abs)));
        DOM_deleteAllChildren(con);
        DOM_appendChild(con,DOM_createTextNode(ODF_contentDoc,getNodeText(abs)));
    });

    var OfficeTextChild_create = trace(function _OfficeTextChild_create(abs)
    {
        if (isParagraphNode(abs)) {
            debug("OfficeTextChild_create "+JSON.stringify(getNodeText(abs)));
            var text_p = DOM_createElementNS(ODF_contentDoc,TEXT_NAMESPACE,TEXT_PREFIX+"p");
            DOM_appendChild(text_p,DOM_createTextNode(ODF_contentDoc,getNodeText(abs)));
            return text_p;
        }
        else {
            return null;
        }
    });

    var OfficeTextChildLens = {
        isVisible: OfficeTextChild_isVisible,
        put: OfficeTextChild_put,
        create: OfficeTextChild_create,
        getSource: lookupSourceMapping,
    };


    var OfficeText_put = trace(function _OfficeText_put(abs,con)
    {
        debug("OfficeBody_put: abs = "+nodeString(abs));
        debug("OfficeBody_put: con = "+nodeString(con));
        BDT_Container_put(abs,con,OfficeTextChildLens);
    });

    // office:body
    var OfficeBody_get = trace(function _OfficeBody_get(con)
    {
        if (con._child_office_text == null)
            throw new ODFInvalidError("Not an ODF word processing document");
        return OfficeText_get(con._child_office_text);
    });

    var OfficeBody_put = trace(function _OfficeBody_put(abs,con)
    {
        OfficeText_put(abs,con._child_office_text);
    });

    // office:document-content
    OfficeDocumentContent_get = trace(function _OfficeDocumentContent_get(con)
    {
        if ((con.namespaceURI != OFFICE_NAMESPACE) || (con.localName != "document-content"))
            throw new ODFInvalidError("Invalid root element in content.xml");

        if (con._child_office_body == null)
            throw new ODFInvalidError("No office:body element in content.xml");

        var html = DOM_createElement(document,"HTML");


        var head = DOM_createElement(document,"HEAD");
        var style = DOM_createElement(document,"STYLE");
        var styleContent = ODFStyleSheet_getCSSText();
        DOM_appendChild(style,DOM_createTextNode(document,styleContent));
        DOM_appendChild(head,style);
        DOM_appendChild(html,head);

        DOM_appendChild(html,OfficeBody_get(con._child_office_body));
        return html;
    });

    OfficeDocumentContent_put = trace(function _OfficeDocumentContent_update(abs,con)
    {
        var body = null;
        for (var child = abs.firstChild; child != null; child = child.nextSibling) {
            if (DOM_upperName(child) == "BODY") {
                body = child;
                break;
            }
        }

        if (body == null)
            throw new Error("Could not find body element");
        OfficeBody_put(body,con._child_office_body);
    });

    OfficeDocumentContent_parseStyles = trace(function _OfficeDocumentContent_parseStyles(root)
    {
        if (root._child_office_font_face_decls != null)
            OfficeFontFaceDecls_parseStyles(root._child_office_font_face_decls);
        if (root._child_office_automatic_styles != null)
            OfficeAutomaticStyles_parseStyles(root._child_office_automatic_styles);
    });

})();