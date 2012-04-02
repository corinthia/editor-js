// Copyright (c) 2012 UX Productivity Pty Ltd. All rights reserved.

(function() {

    window.PostponedActions = new (function PostponedActions(){});

    var actions = new Array();

    PostponedActions.add = function(action)
    {
        actions.push(action);
        if (PostponedActions.performImmediately)
            PostponedActions.perform();
    }

    PostponedActions.perform = function()
    {
        if (actions.length > 0) {
            var actionsToPerform = actions;
            actions = new Array();
            for (var i = 0; i < actionsToPerform.length; i++)
                actionsToPerform[i]();
            Selection.updateSelectionDisplay();
        }
    }

    PostponedActions.performImmediately = false;
})();
