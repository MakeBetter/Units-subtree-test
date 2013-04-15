/*
 A not on the "chrome Alt hack" used in this project.
 This "hack" is meant to allow shortcuts of the type 'Alt + <key>' to work (better) on Chrome.
 There are two problems with such shortcuts on Chrome:
 a) Windows only: They cause a beep/"ding" sound in chrome when invoked (even when the keyboard event is suppressed in
 the JS handler).
 (Ref: http://code.google.com/p/chromium/issues/detail?id=105500)k
 b) Since chrome implements the "accesskey" attribute as 'Alt + <key>' shortcuts, this can a conflict with shortcuts
 defined by the extension (even if the keyboard event is suppressed). In case of such a conflict both the conflicting
 actions -- the execution of extension's shortcut handler and focusing of the element with the conflicting accesskey --
 take place, which is undesirable.

 These issues are handled in the following ways:
 1) For each 'alt+<key' shortcut required by this extension, we insert an otherwise unused div (non focusable by into the dom
 for the sole purpose of setting its accesskey attribute to the key specified with alt in this shortcut.

 It also removes conflicting access-keys attributes in the DOM (because calling preventDefault or stopImmediatePropagation
 is unable to stop their action). Finally, it reinstates the removed access-key attributes when the extension is
 disabled temporarily.

 Note: this won't help with shortcuts like alt+shift+<key> etc, only of the type "alt+key"
 */

if (navigator.userAgent.toLowerCase().indexOf('chrome') > -1) {
    _u.mod_chromeAltHack = (function($, mod_core, mod_mutationObserver, CONSTS) {
        "use strict";

       /*-- Public interface --*/
        var thisModule = $.extend({}, _u.mod_events, {
            applyHack: applyHack,
            undoAndDisableHack: undoAndDisableHack
            //_onDomMutation: _onDomMutation, //to  apply the hack for conflicting accesskeys that come into existence later
        });

        /*-- Event bindings --*/
        thisModule.listenTo(mod_mutationObserver, 'dom-mutation', _onDomMutation);

        /*-- Module implementation --*/
        var isEnabled,

            // when the extension is (temporarily) disabled, this is used to reinstate the conflicting access key attributes
            // that were removed from the original DOM
            accesskeysRemoved = [],

            // array of <key>'s that are a part of alt+<key> type shortcuts; used to detect conflicts on DOM changes
            altShortcutKeys = [],

            class_usedForChromeAltHack = 'UnitsProj-usedForChromeAltHack',
            $topLevelContainer = mod_core.$topLevelContainer,
            class_addedByUnitsProj = CONSTS.class_addedByUnitsProj;

        /**
         * Applies the "chrome alt hack" (if required) to the page, based on array of keyboard shortcuts passed.
         * This involves two things:
         * 1) Inserting <div> elements with dummy accesskeys to disable the "ding" sound (see comments on top)
         * 2) Removing any conflicting accesskey attributes
         * These is meant to be called at the time of initializing the keyboard shortcuts for the current page.
         * @param {Array} shortcutsArr - array of strings, each of which specifies a keyboard shortcut
         */
        function applyHack(shortcutsArr) {

            isEnabled = true;
            var shortcutsLen = shortcutsArr.length;
            for (var i = 0; i < shortcutsLen; ++i) {
                var shortcut = shortcutsArr[i],
                    tokens =  shortcut.trim().split(/\s*\+\s*/),
                    keyAfterAlt;

                // this function is useful only when the following condition is true
                if (tokens && tokens.length == 2 && tokens[0].toLowerCase() === "alt") {

                    keyAfterAlt = tokens[1];

                    if (altShortcutKeys.indexOf(keyAfterAlt) === -1) {
                        altShortcutKeys.push(keyAfterAlt);
                    }

                    _removeAccessKey(keyAfterAlt, document);

                    if (!($topLevelContainer.find('[accesskey="' + keyAfterAlt+ '"]').length)) {

                        $topLevelContainer.append(
                            $('<div></div>')
                                .attr('accesskey', keyAfterAlt)
                                .addClass(class_usedForChromeAltHack)
                                .addClass(class_addedByUnitsProj)
                        );
                    }
                }
            }
        }

        /**
         * Disables the hack and undoes any modifications to page made by it. Resets module state.
         * Is meant to be called when the extension is (temporarily) disabled on the current page.
         */
        function undoAndDisableHack() {

            // undo DOM changes due to hack...
            var len = accesskeysRemoved.length,
                data;
            for (var i = 0; i < len; i++) {
                data = accesskeysRemoved[i];
                $(data.element).attr('accesskey', data.accessKey); // reinstate the removed accesskeys
            }
            _u.mod_core.$topLevelContainer.find('.' + class_usedForChromeAltHack).remove();

            // disable...
            isEnabled = false;

            // reset state for the future...
            accesskeysRemoved = [];
            altShortcutKeys = [];
        }

        /**
         * Removes any conflicting accesskey attributes that come into existence due to a DOM change, based on the
         * stored list of keyboard shortcuts active on the page.
         * @param mutations
         */
        function _onDomMutation(mutations) {

            if (isEnabled) {
                var mutationsLen = mutations.length,
                    mutationRecord,
                    addedNodes;
                for (var i = 0; i < mutationsLen; ++i) {
                    mutationRecord = mutations[i];

                    if ((addedNodes = mutationRecord.addedNodes)) {

                        var addedNodesLen = addedNodes.length,
                            node;
                        for (var j = 0; j < addedNodesLen; ++j) {
                            node = addedNodes[j];
                            if (node.nodeType === document.ELEMENT_NODE) {
                                _removeAnyConflictingAccessKeyAttr(node);
                            }
                        }
                    }

                    if (mutationRecord.attributeName && mutationRecord.attributeName.toLowerCase() === 'accesskey') {
                        _removeAnyConflictingAccessKeyAttr(mutationRecord.target);
                    }
                }
            }
        }


        /**
         * Removes  conflicting accesskeys from the specified element and all its children
         * @param element
         */
        function _removeAnyConflictingAccessKeyAttr(element) {
            var altShortcutKeysLen = altShortcutKeys.length;
            for (var i = 0; i < altShortcutKeysLen; ++i) {
                _removeAccessKey(altShortcutKeys[i], element);
            }
        }

        /**
         * Removes the specified accessKey attribute from the specified DOM element, and any descendants.
         * This is required because calling stopImmediatePropagation() or preventDefault() (in a conflicting keyboard
         * shortcut's handler does not prevent the accesskey attribute's function from taking place. So any focusable
         * elements with conflicting accesskey's on the page needs to have their acccesskey attribute removed.
         * @param accessKey
         * @param {DOMelement} element The DOM element within which (including its subtree) a conflicting accesskey will be
         * removed.
         */
        function _removeAccessKey(accessKey, element) {

            var $conflictingElements =  $(element).find('[accesskey="' + accessKey+ '"]:not(.' +
                class_usedForChromeAltHack + ')');

            $conflictingElements.each(
                function(index, element) {
                    $(element).attr('accesskey', '');
                    accesskeysRemoved.push({element: element, accessKey: accessKey});
//            console.log('accesskeysRemoved', accesskeysRemoved);
                }
            );
        }

        return thisModule;

    })(jQuery, _u.mod_core, _u.mod_mutationObserver, _u.CONSTS);
}

