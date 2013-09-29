
_u.mod_selectLink = (function($, mod_domEvents, mod_contentHelper, mod_keyboardLib, mod_globals, CONSTS) {
    "use strict";

    /*-- Public interface --*/
    var thisModule = $.extend({}, _u.mod_pubSub, {
        setup: setup
    });


    var $document = $(document),
        class_unitsProjElem = CONSTS.class_unitsProjElem,
        class_hint = 'UnitsProj-hintLabel',                     // class for all hint labels
        class_hintVisible = 'UnitsProj-hintLabel-visible',      // class applied to make a hint label visible,
        hintsEnabled,
        hintInputStr_upperCase,

        // arrays of spans showing hints (dom elements)
        hintSpans_singleDigit = [],
        hintSpans_doubleDigit = [],
        timeout_removeHints,
        timeout_blurDummyTextbox,
        timeoutPeriod = 4000,

        // we don't use on mod_keyboardLib.isSpaceDown() because that might be removed soon (ref: #144, #145)
        isSpaceDownOnNonInputElement;

    // vars related to hint chars 
    var reducedSet = "jkdhglsurieytnvmbc",// easiest to press keys (roughly in order), exluding 'f'
        remainingSet = "axzwoqp",
        // hint chars: set of letters used for hints. easiest to reach letters should come first
        hintCharsStr = (reducedSet + remainingSet).toUpperCase(); //

    // This is used to group the all the hint label spans within a common parent
    var $hintsContainer = $("<div></div>")
        .addClass('UnitsProj-hintsContainer')
        .addClass(class_unitsProjElem)
        .hide()
        .appendTo(_u.$topLevelContainer);

    // "dummy" text box (based on css styling) used to get "match-char" input (input on this triggers onMatchCharInput(),
    // see it's documentation)
    var $dummyTextBox = $('<input type = "text">').
        addClass(class_unitsProjElem).
        addClass('UnitsProj-dummyInput').
        appendTo(_u.$topLevelContainer);

    function reset() {
        removeHints();
    }

    function setup() {
        reset();
        mod_domEvents.addEventListener(document, 'keydown', onKeyDown, true);
        mod_domEvents.addEventListener(document, 'keyup', onKeyUp_space, true);
        mod_domEvents.addEventListener($dummyTextBox[0], 'blur', onDummyTextBoxBlur, true);

        $dummyTextBox.on('input', onDummyTextBoxInput );
    }

    function onHintInput(character) {
        hintInputStr_upperCase += character.toUpperCase();

        var elem_exactMatch = null,
            partialMatches = [],
            $assignedHintSpans = $('.' + class_hintVisible);
            
        var len = $assignedHintSpans.length;
        for (var i = 0; i < len; i++) {
            var hintSpan = $assignedHintSpans[i],
                elem = $(hintSpan).data('element');

            var elemHint_upperCase = hintSpan.innerText;
            if (elemHint_upperCase.substring(0, hintInputStr_upperCase.length) === hintInputStr_upperCase) {
                partialMatches.push(elem);
                if (elemHint_upperCase === hintInputStr_upperCase) {
                    elem_exactMatch = elem;
                    break;
                }
            }
            else {
                hintSpan.classList.remove(class_hintVisible);
            }
        }

        // exact match
        if (elem_exactMatch) {
            elem_exactMatch.focus();
            removeHints();
        }
        // no match
        else if (!partialMatches.length) {
            removeHints();
        }
        // partial match
        else {
            // reset the timeout
            clearTimeout(timeout_removeHints);
            timeout_removeHints = setTimeout(removeHints, timeoutPeriod);
        }
    }

    function removeHints() {
        $hintsContainer.hide();
        $('.' + class_hintVisible).removeClass(class_hintVisible);
        hintsEnabled = mod_globals.hintsEnabled = false;

        // event is unbound when hints are removed since there is no need to track the 'scroll' event continuously
        $(window).off('resize scroll', onViewportChange);
        clearTimeout(timeout_removeHints);

    }
    
    function showHints($matchingElems) {
        // Call removeHints() for cases where showHints() is called consecutively
        // without removeHints() being called in between (clears existing
        // timeout + unbinds bound event + generally resets state)
        removeHints();
        _assignHints($matchingElems);
        $hintsContainer.show();

        hintInputStr_upperCase = "";
        hintsEnabled = mod_globals.hintsEnabled = true;

        $(window).on('resize scroll', onViewportChange);
        timeout_removeHints = setTimeout(removeHints, timeoutPeriod);
    }

    function onViewportChange() {
        removeHints();
    }

    function onKeyDown(e) {
        var keyCode = e.which || e.keyCode || e.charCode;
        var target = e.target;

        // space keydown on non-input type element
        if (keyCode === 32 && canIgnoreSpaceOnElement(target)) {
            isSpaceDownOnNonInputElement = true;
            mod_contentHelper.suppressEvent(e); // prevents default action of space like scrolling etc
        }
        // space (already pressed) + some other key's keydown (+ non-input type element focused)
        else if (isSpaceDownOnNonInputElement && canIgnoreSpaceOnElement(target)) {
            // Focus the dummy text box. And stop the event from propagating, but don't
            // prevent it's default action, so that it enters text into the text box.
            // This lets us give focus to the dummy text box just-in-time (i.e. when the
            // <char> is pressed after pressing space, and not at the keydown of space
            // itself. This is nicer for a couple of reasons:
            // 1) it doesn't take away focus from the active element till as late as
            // possible, and if the user decides to not press anything after pressing
            // space, the focus will remain where it was.
            // 2) this will be make it easier to implement in the future a feature where
            // if the user presses space without pressing anything else the document is
            // scrolled down by a page (like the default browser behavior which gets broken
            // due to this feature)
            focusDummyTextBoxAndRemoveHints();
            e.stopImmediatePropagation();

        }
        // 'f' pressed. focus dummy text box so the that the next next char entered triggers onMatchCharInput   
        else if (String.fromCharCode(keyCode).toLowerCase() === "f" &&
            !(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) &&
            (document.activeElement === $dummyTextBox[0] || mod_contentHelper.elementAllowsSingleKeyShortcut(target))) {

            mod_contentHelper.suppressEvent(e);
            focusDummyTextBoxAndRemoveHints();
            clearTimeout(timeout_blurDummyTextbox);
            timeout_blurDummyTextbox = setTimeout(function() {
                blurDummyTextBox();
            }, timeoutPeriod);
        }
        else if (hintsEnabled) {
            // These modifiers are not required (or expected) to be pressed, so exclude keydown events having them
            if (!(e.ctrlKey || e.altKey || e.metaKey)) {
                mod_contentHelper.suppressEvent(e);
                if (e.which === 27) { // 27 - Esc
                    removeHints();
                }
                else {
                    onHintInput(String.fromCharCode(e.which || e.keyCode));
                }
            }
        }
    }

    function onKeyUp_space(e) {
        var keyCode = e.which || e.keyCode || e.charCode;
        if (keyCode === 32) { // space
            isSpaceDownOnNonInputElement = false;
        }
    }

    function focusDummyTextBoxAndRemoveHints() {
        $dummyTextBox.val('').focus();
        removeHints();
    }

    // We deem space key ignorable it the target is not an input type or allows typing.
    // This allows us to target links using space+<key>
    // However, this will prevent user from scrolling the page down using the space key.
    function canIgnoreSpaceOnElement(elem) {
        return elem.tagName.toLowerCase() !== "input" && !mod_contentHelper.elementAllowsTyping(elem);
    }

    // We read input off of this dummy element to determine the actual character
    // entered by the user (as opposed to the key pressed down) even while binding
    // to the 'keydown' event for input rather than 'keypress' (refer: #144)
    function onDummyTextBoxInput () {
        var input = $dummyTextBox.val();
        input = input[input.length - 1]; // consider only the last char typed in case there is more than one
        var char_lowerCase = input.trim().toLowerCase(); // for case insensitive matching
        char_lowerCase && onMatchCharInput(char_lowerCase);
        blurDummyTextBox();
    }

    // This map allows us to determine the char that would be typed had
    // shift been pressed along with a key. This only works for the
    // standard US keyboard, but since it's required only for an optional
    // feature, it's ok.
    var stdUSKbdShiftMap = {
        '`': '~',
        '1': '!',
        '2': '@',
        '3': '#',
        '4': '$',
        '5': '%',
        '6': '^',
        '7': '&',
        '8': '*',
        '9': '(',
        '0': ')',
        '-': '_',
        '=': '+',
        '[': '{',
        ']': '}',
        '\\': '|',
        ';': ':',
        '\'': '"',
        ',': '<',
        '.': '.',
        '/': '?'
    };

    // Handler for when a "match-char" is input by the user
    // A match-char refers to a character typed to match
    // links starting with it, etc.
    function onMatchCharInput(matchChar_lowerCase) {
        removeHints();  // first remove any existing hints
        var $elemsInViewport = getElemsInViewport(),
            $matchingElems;

        // space + '.' targets all links without an inner text
        if (matchChar_lowerCase === '.') {
            $matchingElems = $elemsInViewport.filter(function() {
                return !(getElementText(this).trim());
            });
        }

        // space + '/' targets all links
        else if (matchChar_lowerCase === '/') {
            $matchingElems = $elemsInViewport;
        }

        // space + <char> targets all links starting with <char>
        // Actually, for increased usability, this targets all links
        // whose first letter, digit or special symbol is <char>
        // E.g: a link with the text "-3 AAPL" (without the quotes) will be
        // matched if <char> is either 'a' (case insensitive), or '-', or '3']
        // Additionally, if the character corresponds to a key pressed without
        // shift, we consider the char that would be typed if shift had been
        // pressed as well (based on `stdUSKbdShiftMap`)
        else {
            $matchingElems = $elemsInViewport.filter(function() {
                var text_lowerCase = getElementText(this).toLowerCase(),
                linkChars = [];

                /* TODO: need to support unicode letters, digits, symbols. JS regex
                   does not have unicode support built in. Useful resources at
                   http://stackoverflow.com/questions/280712/javascript-unicode
                   Close #147 when this is done
                 */
                var letter = text_lowerCase.match(/[a-z]/),
                    digit = text_lowerCase.match(/\d/),
                    symbol = text_lowerCase.match(/[^\da-z ]/); // not digit, a-z, or space

                letter && linkChars.push(letter[0]); // if there is a match, String.match returns an array
                digit && linkChars.push(digit[0]);
                symbol && linkChars.push(symbol[0]);

                // especially since we don't support unicode yet, it's useful to ensure
                // that the first character of the (trimmed) text is always included
                // in linkChars. In any case, there is no harm even if it gets included
                // twice
                linkChars.push(text_lowerCase[0]);

                var matchChars = [matchChar_lowerCase],
                    shiftUpChar = stdUSKbdShiftMap[matchChar_lowerCase];
                
                shiftUpChar && matchChars.push(shiftUpChar);

                for (var i = 0; i < linkChars.length; i++) {
                    var char1 = linkChars[i];
                    for (var j = 0; j < matchChars.length; j++) {
                        var char2 = matchChars[j];
                        if (char1 === char2) {
                            return true;
                        }
                    }
                }
                return false;
            });
        }

        if ($matchingElems.length) {
            if ($matchingElems.length === 1) {
                $matchingElems.focus();
            }
            else {
                showHints($matchingElems);
            }
        }
    }

    // meant to be called from within showHints()
    function _assignHints($matchingElems) {
        // generate the hint spans and put them in the DOM if not done yet
        if (!hintSpans_singleDigit.length) {
            generateHintSpansInDom();
        }

        $('.' + class_hintVisible).removeClass(class_hintVisible);

        var hintSpansToUse;
        hintSpansToUse = $matchingElems.length <= hintSpans_singleDigit.length?
            hintSpans_singleDigit: hintSpans_doubleDigit;

        // Note: If the extremely unlikely scenario that the current *viewport* has more matching links than
        // `hintSpans_doubleDigit.length`, we ignore links beyond that count, i.e. these links won't get a hint
        var len = Math.min($matchingElems.length, hintSpansToUse.length);
        for (var i = 0; i < len; i++) {
            var el = $matchingElems[i];
            var hintSpan = hintSpansToUse[i];
            hintSpan.classList.add(class_hintVisible);

            var viewportOffset = el.getBoundingClientRect();
            hintSpan.style.top = viewportOffset.top + "px";
            hintSpan.style.left = viewportOffset.left + Math.min(20, Math.round(el.offsetWidth/2)) + "px";
            $(hintSpan).data('element', el);
        }
    }

    // gets hints based on hintCharsStr
    function getHints(hintCharsStr) {
        var singleDigitHints = hintCharsStr.split(''),
            doubleDigitHints = [],
            len = singleDigitHints.length,
            count = -1;

        for (var i = 0; i < len; ++i) {
            for (var j = 0; j < len; ++j) {
                // [j] + [i] instead of [i] + [j] so that the the first character
                // of neighbouring double digit hints is scattered (which is nicer)
                doubleDigitHints[++count] = singleDigitHints[j] + singleDigitHints[i];
            }
        }
        return {singleDigit: singleDigitHints, doubleDigit: doubleDigitHints};
    }

    function generateHintSpansInDom() {
        var hints = getHints(hintCharsStr);

        hintSpans_singleDigit = getHintSpans(hints.singleDigit);
        hintSpans_doubleDigit = getHintSpans(hints.doubleDigit);

        $hintsContainer.empty();
        $hintsContainer.append(hintSpans_singleDigit);
        $hintsContainer.append(hintSpans_doubleDigit);
    }

    function getHintSpans(hintsArr) {
        var hintSpans = [];
        var len = hintsArr.length;
        for (var i = 0; i < len; i++) {
            var hintSpan = document.createElement('span');
            hintSpan.innerText = hintsArr[i];
            hintSpan.classList.add(class_hint);
            hintSpans[i] = hintSpan;
        }
        return hintSpans;
    }

    // returns all link elements + other input-type elements
    function $getAllLinkLikeElems($scope) {
        $scope || ($scope = $document);
        return $scope.find(CONSTS.focusablesSelector);
    }

    function getElementText(el) {
        return (
            el.innerText? el.innerText: (
                el.value? el.value:
                    (el.placeholder? el.placeholder: "")
                )
            ).trim();
    }

    function getElemsInViewport() {
        return $getAllLinkLikeElems().filter(function() {
            return (!mod_contentHelper.isUnitsProjNode(this) && isAnyPartOfElementInViewport(this));
        });
    }

    function isAnyPartOfElementInViewport(el) {
        var top = el.offsetTop;
        var left = el.offsetLeft;
        var width = el.offsetWidth;
        var height = el.offsetHeight;

        // get top and left values relative to the document by traversing up the offsetParent chain
        while(el.offsetParent) {
            el = el.offsetParent;
            top += el.offsetTop;
            left += el.offsetLeft;
        }

        return (top < (window.scrollY + window.innerHeight)) &&     // elTop < winBottom
            ((top + height) > window.scrollY) &&                    // elBottom > winTop
            (left < (window.scrollX + window.innerWidth)) &&        // elLeft < winRight
            ((left + width) > window.scrollX);                      // elRight > winLeft
    }

    function blurDummyTextBox() {
        // proceed only if the dummy textbox has focus, so that we don't change the page focus
        // in case the dummy text box has already lost focus
        if (document.activeElement === $dummyTextBox[0]) {
            document.body.focus(); // will call onDummyTextBoxBlur() as well
        }
    }

    function onDummyTextBoxBlur() {
        $dummyTextBox[0].value = '';
        clearTimeout(timeout_blurDummyTextbox);
    }

    return thisModule;

})(jQuery, _u.mod_domEvents, _u.mod_contentHelper, _u.mod_keyboardLib, _u.mod_globals, _u.CONSTS);

