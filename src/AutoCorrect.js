var AutoCorrect_addCorrection;
var AutoCorrect_removeCorrection;
var AutoCorrect_getCorrections;

var AutoCorrect_getLatest;
var AutoCorrect_acceptLatest;
var AutoCorrect_revertLatest;
var AutoCorrect_replaceLatest;

(function() {

    var removeCorrectionSpan = trace(function removeCorrectionSpan(span)
    {
        var firstChild = span.firstChild;
        DOM_removeNodeButKeepChildren(span);
        if (firstChild != null)
            Formatting_mergeWithNeighbours(firstChild,{});
    });

    function Correction(span)
    {
        this.span = span;
        this.modificationListener = function() {
            PostponedActions_add(function() {
                // This will trigger a removeCorrection() call
                removeCorrectionSpan(span);
            });
        };
    }

    Correction.prototype.toString = function()
    {
        return this.span.getAttribute("original")+" -> "+getNodeText(this.span);
    }

    var correctionsByNode = null;
    var correctionList = null;
    var initDone = false;

    var checkInit = trace(function checkInit()
    {
        if (initDone)
            return;
        initDone = true;
        correctionsByNode = new NodeMap();
        correctionList = new Array();
    });

    AutoCorrect_addCorrection = trace(function addCorrection(span)
    {
        checkInit();

        var correction = new Correction(span);
        correctionsByNode.put(span,correction);
        correctionList.push(correction);

        span.addEventListener("DOMSubtreeModified",correction.modificationListener);
    });

    AutoCorrect_removeCorrection = trace(function removeCorrection(span)
    {
        checkInit();
        var correction = correctionsByNode.get(span);
        if (correction == null)
            throw new Error("No autocorrect entry for "+JSON.stringify(getNodeText(span)));

        var index = null;
        for (var i = 0; i < correctionList.length; i++) {
            if (correctionList[i].span == span) {
                index = i;
                break;
            }
        }
        if (index == null)
            throw new Error("Correction "+correction+" not found in correctionList");
        correctionList.splice(index,1);

        span.removeEventListener("DOMSubtreeModified",correction.modificationListener);
        correctionsByNode.remove(span);
    });

    AutoCorrect_getCorrections = trace(function getCorrections()
    {
        checkInit();
        var result = new Array();
        for (var i = 0; i < correctionList.length; i++) {
            var correction = correctionList[i];
            result.push({ original: correction.span.getAttribute("original"),
                          replacement: getNodeText(correction.span)});
        }
        return result;
    });

    AutoCorrect_getLatest = trace(function getLatest()
    {
        if (correctionList.length == 0)
            return null;

        var correction = correctionList[correctionList.length-1];
        return { original: correction.span.getAttribute("original"),
                 replacement: getNodeText(correction.span) };
    });

    AutoCorrect_acceptLatest = trace(function acceptLatest()
    {
        if (correctionList.length == 0)
            return null;

        UndoManager_newGroup("Accept");
        var correction = correctionList[correctionList.length-1];
        removeCorrectionSpan(correction.span);
        UndoManager_newGroup();
    });

    AutoCorrect_revertLatest = trace(function revertLatest()
    {
        if (correctionList.length == 0)
            return null;

        var correction = correctionList[correctionList.length-1];
        AutoCorrect_replaceLatest(correction.span.getAttribute("original"));
    });

    AutoCorrect_replaceLatest = trace(function replaceLatest(replacement)
    {
        if (correctionList.length == 0)
            return null;

        UndoManager_newGroup("Replace");
        var correction = correctionList[correctionList.length-1];
        var text = DOM_createTextNode(document,replacement);
        DOM_insertBefore(correction.span.parentNode,text,correction.span);
        DOM_deleteNode(correction.span);
        Formatting_mergeWithNeighbours(text,{});
        UndoManager_newGroup();
    });

})();