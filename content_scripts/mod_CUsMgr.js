// See _readme_module_template.js for module conventions


_u.mod_CUsMgr = (function($, mod_core, mod_utils, mod_domEvents, mod_mutationObserver, mod_keyboardLib, mod_filterCUs, mod_help,
                          mod_chromeAltHack, mod_contentHelper, mod_commonHelper, mod_context, CONSTS) {

    "use strict";

    /*-- Public interface --*/
    var thisModule = $.extend({}, _u.mod_pubSub, {
        setup: setup,
        reset: reset,
        $getSelectedCU: $getSelectedCU,
        selectNext: selectNext,
        selectPrev: selectPrev,
        selectFirst: selectFirst,
        selectLast: selectLast
    });

    /*-- Event bindings --*/
    thisModule.listenTo(mod_mutationObserver, 'dom-mutations-grouped', updateCUsAndRelatedState);
    // if mod_filterCUs is not defined, rest of the extension still works fine
    if (mod_filterCUs) {
        thisModule.listenTo(mod_filterCUs, 'filtering-state-change', updateCUsAndRelatedState);
        thisModule.listenTo(mod_filterCUs, 'tab-on-filter-search-box', onTabOnFilterSearchBox);
    }

    /*-- Module implementation --*/
    //////////////////////////////////

    /* NOTES
     1) Often the most important content of a webpage (i.e the actual *content* excluding the header, footer, side bars,
     adverts) is composed of a set of repeating units. We call such a unit a Content Unit (CU). E.g. on the Google Search
     results page, each search result is a CU. Each CU is a logical unit of content, attention and navigation/access.

     Often a CU corresponds to single DOM element, like a <div> (and its contents). But this isn't always the case, and
     a CU might consist of multiple top level DOM elements (e.g: pages on Hacker News, Urban Dictionary, etc). To cater
     to the most general case, this program represents a CU as a jQuery set consisting of one or more DOM elements.

     2) DOM elements that can receive focus are called the "focusables"

     3) In the comments, including JSDoc ones, the term "JQuery *set*" is used to mean a JQuery object that can contain
     *one or more* DOM elements; the term "JQuery *wrapper*" is used to denote one which is expected be a JQuery wrapper
     on a *single* DOM node.

     */

    var $CUsArray = [], /* An array of jQuery sets. The array represents the *sequence* of CUs on the current page.
     Each constituent element (which is a jQuery set) represents the set of DOM elements that constitute a single
     CU for the current page.
     Most web pages will allow writing simple selectors such that each CU can be represented as a jQuery set
     consisting of a single DOM element.(Because these web pages group related logical entities in a single container,
     for which the selector can be specified.)
     However, some web pages (like news.ycombinator.com, wikipedia.org, etc) require writing selectors such each CU
     has to be represented as a jQuery set comprising of multiple DOM elements.
     (For more details, see the documentation on how to specify selectors for webpages.)

     Note: If the search feature has been invoked, this contains only the filtered CUs that are visible on the page.
     This helps keep things simple.
     */

        selectedCUIndex  = -1, // Index of the selected CU in $CUsArray
        hoveredCUIndex  = -1, // Index of the hovered CU in $CUsArray

        //container for elements created by this program that we add to the page's DOM.
        $topLevelContainer = mod_core.$topLevelContainer,

        // This class should be applied to all elements added by this extension.
        class_addedByUnitsProj = CONSTS.class_addedByUnitsProj,

        class_CUOverlay = CONSTS.class_CUOverlay,                     // class applied to all CU overlays
        class_CUSelectedOverlay = CONSTS.class_CUSelectedOverlay,    // class applied to overlay on a selected CU
        class_CUHoveredOverlay = CONSTS.class_CUHoveredOverlay,      // class applied to overlay on a hovered CU
        $unusedOverlaysArray = [],   // to enable reusing existing unused overlays

    // boolean, holds a value indicating where the css specifies a transition style for overlays
        overlayCssHasTransition,

        $document = $(document), // cached jQuery object

        rtMouseBtnDown,         // boolean holding the state of the right mouse button
//        ltMouseBtnDown,         // boolean holding the state of the left mouse button
        scrolledWithRtMouseBtn, // boolean indicating if right mouse button was used to modify scrolling

        class_scrollingMarker = 'CU-scrolling-marker',
        $scrollingMarker,

        $lastSelectedCU = null,   // to store a reference to the last selected CU

    // If a CU is currently selected, this stores the time it was selected, else this stores the time the last
    // selected CU was deselected.
        lastSelectedCUTime,

    // number of milliseconds since its last selection/deselection after which a CU is no longer deemed to be
    // selected/last-selected, IF it is not in the viewport
        selectionTimeoutPeriod = 60000,

// TODO: one of the following two is not needed
        stopExistingScrollAnimation,
        animationInProgress,

        expandedUrlData,
    
        isMac = navigator.appVersion.indexOf("Mac")!=-1, // since macs have different key layouts/behaviors

        // the following objects are retrieved from the background script
        miscSettings,

        suppressEvent = mod_contentHelper.suppressEvent;

    function $getSelectedCU() {
        return $CUsArray[selectedCUIndex];
    }

// returns a jQuery set composed of all focusable DOM elements contained in the
// jQuery set ($CU) passed
    function $getContainedFocusables($CU) {
        var $allElements = $CU.find('*').addBack();
        return $allElements.filter(CONSTS.focusablesSelector);
    }

    /**
     * Returns the "main" element in the specified $CU. This is determined using the "std_mainEl" MU specified in the expandedUrlData.
     * If no std_mainEl is specified, this function simply returns the first focusable element in the $CU
     *
     * @param $CU
     * @return {HtmlElement} Returns the "main" element, if one was found, else null.
     */
    function getMainElement($CU) {

        if (!$CU || !$CU.length) {
            return null;
        }

        var $containedFocusables = $getContainedFocusables($CU);

        if (!$containedFocusables.length) {
            return null;
        }

        var selector = expandedUrlData.CUs_MUs && expandedUrlData.CUs_MUs.std_mainEl && expandedUrlData.CUs_MUs.std_mainEl.selector,
            $filteredFocusables;

        if (selector && ($filteredFocusables = $containedFocusables.filter(selector)) && $filteredFocusables.length) {

            return $filteredFocusables[0];
        }
        else {
            return $containedFocusables[0];
        }
    }

// Focuses the "main" focusable element in a CU, if one can be found.
// See function "getMainElement" for more details.
    function focusMainElement($CU) {
        var mainEl = getMainElement($CU);
        if (mainEl) {
//        $(mainEl).data('enclosingCUJustSelected', true);
            mainEl.focus();
        }
    }

    /**
     * Selects the CU specified.
     * @param {number|JQuery} CUOrItsIndex Specifies the CU. Should either be the JQuery object representing the CU
     * or its index in $CUsArray
     * Can be an integer that specifies the index in $CUsArray or a jQuery object representing the CU.
     * (While performance isn't a major concern here,) passing the index is preferable if it is already known,
     * otherwise the function will determine it itself (in order to set the selectedCUIndex variable).
     * @param {boolean} setFocus If true, the "main" element for this CU, if one is found, is
     * focused.
     * @param {boolean} [adjustScrolling] If true, document's scrolling is adjusted so that
     * all (or such much as is possible) of the selected CU is in the viewport. Defaults to false.
     * This parameter is currently passed as true only from selectPrev() and selectNext()
     * @param {object} [options] Misc options. Can also be used to override miscSettings
     */
    function selectCU(CUOrItsIndex, setFocus, adjustScrolling, options) {
//        console.log('selectCU() called');
        var $CU,
            indexOf$CU; // index in $CUsArray

        if (typeof CUOrItsIndex === "number" || CUOrItsIndex instanceof Number) {
            indexOf$CU = CUOrItsIndex;
            $CU = $CUsArray[indexOf$CU];
        }
        else {
            $CU = CUOrItsIndex;
            indexOf$CU = findIndex_In_$CUsArray($CU);
        }

        if (!$CU || !$CU.length || indexOf$CU < 0) {
            return;
        }

        options = $.extend(true, {}, miscSettings, options);

        deselectCU(options); // before proceeding, deselect currently selected CU, if any

        selectedCUIndex = indexOf$CU;
        var $overlaySelected = showOverlay($CU, 'selected');

        if (!$overlaySelected) {
            console.warn('UnitsProj: no $overlay returned by showOverlay');
        }

        mod_context.setCUSelectedState(true);

        if (!options || !options.onDomChangeOrWindowResize) {
            selectCU.invokedYet = true; // to indicate that now this function (selectCU) has been invoked at least once

            $lastSelectedCU = $CU;
            lastSelectedCUTime = new Date();

            if (adjustScrolling) {
                scrollIntoView($overlaySelected, options);
            }

            if (setFocus) {
                focusMainElement($CU);
            }

            if (options.increaseFontInSelectedCU && !$CU.data('fontIncreasedOnSelection')) {
                mod_mutationObserver.stop();
                increaseFont($CU);
                mod_mutationObserver.start();
                $CU.data('fontIncreasedOnSelection', true);
            }

            var fn_onCUSelection, temp;
            if ((temp = expandedUrlData.page_actions) && (temp = temp.std_onCUSelection) && (fn_onCUSelection = temp.fn)) {
                mod_mutationObserver.stop();
                fn_onCUSelection($CU, document, $.extend(true, {}, expandedUrlData));
            }
        }
    }

    /**
     * Deselects the currently selected CU, if there is one
     */
    function deselectCU(options) {

        var $CU = $CUsArray[selectedCUIndex];
        if ($CU) {

            // console.log('deselecting CU...');
            removeOverlay($CU, 'selected');

            if (!options || !options.onDomChangeOrWindowResize) {
                lastSelectedCUTime = new Date();

                if ($CU.data('fontIncreasedOnSelection')) {
                    mod_mutationObserver.stop();
                    decreaseFont($CU);
                    mod_mutationObserver.start();
                    $CU.data('fontIncreasedOnSelection', false);
                }

                var fn_onCUDeselection, temp;
                if ((temp = expandedUrlData.page_actions) && (temp = temp.std_onCUDeselection) && (fn_onCUDeselection = temp.fn)) {
                    mod_mutationObserver.stop();
                    fn_onCUDeselection($CU, document, $.extend(true, {}, expandedUrlData));
                    mod_mutationObserver.start();
                }
            }
        }
        selectedCUIndex = -1;
        mod_context.setCUSelectedState(false);
    }

    /**
     * Removes the 'selected' or 'hovered' css class from the CU, as specified by 'type'
     * @param $CU
     * @param {string} type Can be 'selected' or 'hovered'
     * @return {*} Returns $overlay (the jQuery wrapper overlay element)
     */
    function removeOverlay ($CU, type) {
        if (!$CU || !$CU.length) {
            return null;
        }

        var $overlay = $CU.data('$overlay');

        if ($overlay) {
            $overlay.removeClass(type === 'selected'? class_CUSelectedOverlay: class_CUHoveredOverlay);

            if (!overlayCssHasTransition) {
                tryRecycleOverlay($overlay);
            }
        }
        else {
            console.warn('UnitsProj: no $overlay found');
        }

    }

    /**
     *
     * @param $CU
     * @param {string} type Can be 'selected' or 'hovered'
     * @return {*} Displays and returns $overlay (i.e. a jQuery wrapped overlay element)
     */
    function showOverlay($CU, type) {
        if (!$CU || !$CU.length) {
            return null;
        }

        var $overlay = $CU.data('$overlay');

        if (!$overlay || !$overlay.length) {
            if ($unusedOverlaysArray.length) {
                $overlay = $unusedOverlaysArray.shift();
            }
            else {
                $overlay = $('<div></div>').addClass(class_CUOverlay).addClass(class_addedByUnitsProj);
            }
        }

        var CUStyleData = expandedUrlData.CUs_style,
            overlayPadding;

        $overlay.data('$CU', $CU);
        $CU.data('$overlay', $overlay);

        // position the overlay above the CU, and ensure that its visible
        $overlay.css(getBoundingRectangle($CU)).show();

        if (CUStyleData && (overlayPadding = CUStyleData.overlayPadding)) {
            $overlay.css("padding", overlayPadding);
            $overlay.css("top", parseFloat($overlay.css("top")) -
                parseFloat($overlay.css("padding-top")));

            $overlay.css("left", parseFloat($overlay.css("left")) -
                parseFloat($overlay.css("padding-left")));
        }

        if (type === 'selected') {
            $overlay.addClass(class_CUSelectedOverlay);
//        $overlay.css('box-shadow', '2px 2px 20px 0px #999');

        }
        else { // 'hovered'
            $overlay.addClass(class_CUHoveredOverlay);
//        $overlay.css('box-shadow', '1px 1px 10px 0px #bbb');
        }

        $overlay.appendTo($topLevelContainer);

        return $overlay;

    }

    /**
     * Shows as hovered the CU specified.
     * @param {number|DOMElement (or jQuery wrapper)} CUOrItsIndex Specifies the CU.
     * Can be an integer that specifies the index in $CUsArray or a jQuery object representing the CU.
     * (While performance isn't a major concern,) passing the index is preferable if it is already known.
     */
    function hoverCU(CUOrItsIndex) {

        var $CU,
            indexOf$CU; // index in $CUsArray

        if (typeof CUOrItsIndex === "number" || CUOrItsIndex instanceof Number) {
            indexOf$CU = CUOrItsIndex;
            $CU = $CUsArray[indexOf$CU];
        }
        else {
            $CU = $(CUOrItsIndex);
            indexOf$CU = findIndex_In_$CUsArray($CU);
        }

        if (!$CU || !$CU.length || indexOf$CU < 0) {
            return;
        }

        dehoverCU(); // before proceeding, dehover currently hovered-over CU, if any

        hoveredCUIndex = indexOf$CU;
        showOverlay($CU, 'hovered');

    }

    /**
     * Dehovers the currently hovered (over) CU, if there is one
     */
    function dehoverCU() {
        var $CU = $CUsArray[hoveredCUIndex];
        if ($CU) {
            removeOverlay($CU, 'hovered');
        }
        hoveredCUIndex = -1;
    }

    function showScrollingMarker(x, y, height) {

        clearTimeout($scrollingMarker.timeoutId); // clear a previously set timeout out, if one exists...

        $scrollingMarker.timeoutId = setTimeout(function() { // ... before setting a new one
            $scrollingMarker.hide();
        }, 3000);

        $scrollingMarker.css({top: y, left: x-$scrollingMarker.width()-5, height: height}).show();
    }

    /**
     * Scrolls more of the currently selected CU into view if required (i.e. if the CU is too large),
     * in the direction specified.
     * @param {string} direction Can be either 'up' or 'down'
     * @param {object} [options] Misc options. Can also be used to override miscSettings
     * @return {Boolean} value indicating whether scroll took place
     */
    function scrollSelectedCUIfRequired (direction, options) {

        options = $.extend(true, {}, miscSettings, options);

        var $CU = $CUsArray[selectedCUIndex];

        var pageHeaderHeight = getEffectiveHeaderHeight();

        var // for the window:
            winTop = $document.scrollTop(),
            winHeight = /*$(window).height()*/ window.innerHeight,// $(window).height() does not work on HN
            winBottom = winTop + winHeight;

        // for the CU
        var boundingRect = getBoundingRectangle($CU),
            CUTop = boundingRect.top,
            CUHeight = boundingRect.height,
            CUBottom = CUTop + CUHeight;

        var newWinTop, // new value of scrollTop
            overlapAfterScroll = 40,
            margin = 30;

        direction = direction.toLowerCase();
        if ( (direction === 'up' && CUTop < winTop + pageHeaderHeight) ||
            (direction === 'down' && CUBottom > winBottom) ) {
            if (direction === 'up' ) { // implies CUTop < winTop + pageHeaderHeight
                newWinTop = winTop - (winHeight - pageHeaderHeight) + overlapAfterScroll; //TODO: verify the math

                // if newWinTop calculated would scroll the CU more than required for it to get completely in the view,
                // increase it to the max value required to show the entire CU with some margin left.
                if (newWinTop + pageHeaderHeight < CUTop) {
                    newWinTop = CUTop - pageHeaderHeight - margin;
                }

                if (newWinTop < 0) {
                    newWinTop = 0;
                }
                showScrollingMarker(boundingRect.left, winTop+pageHeaderHeight, overlapAfterScroll);
            }

            else  { //direction === 'down' && CUBottom > winBottom

                newWinTop = winBottom - overlapAfterScroll - pageHeaderHeight;

                // if newWinTop calculated would scroll the CU more than required for it to get completely in the view,
                // reduce it to the min value required to show the entire CU with some margin left.
                if (newWinTop + winHeight > CUBottom) {
                    newWinTop = CUBottom - winHeight + margin;
                }

                // ensure value is not more then the max possible
                if (newWinTop > $document.height() - winHeight) {
                    newWinTop = $document.height() - winHeight;
                }

                showScrollingMarker(boundingRect.left, winBottom - overlapAfterScroll, overlapAfterScroll);
            }

            if (options.animatedCUScroll) {

                console.log('animated SAME CU scroll');

                var animationDuration = Math.min(options.animatedCUScroll_MaxDuration,
                    Math.abs(newWinTop-winTop) / options.animatedCUScroll_Speed);

                animatedScroll(newWinTop, animationDuration);

//            $('html, body').animate({scrollTop: newWinTop}, animatedScroll);
            }
            else {
                console.log('NON animated SAME CU scroll');
                $document.scrollTop(newWinTop);
            }

            return true;
        }

        return false;
    }

    /**
     * Selects the previous CU to the currently selected one.
     */
    function selectPrev () {

        if (!$CUsArray || !$CUsArray.length || $CUsArray.length == 1) {
            mod_utils.scrollUp();
            return;
        }

        // to handle quick repeated invocations...
        if (animationInProgress) {
            stopExistingScrollAnimation = true;
            return;
        }
        else {
            stopExistingScrollAnimation = false;
        }

        $scrollingMarker.hide();

        var newIndex;

        if (selectedCUIndex >=0 && (isCUInViewport($CUsArray[selectedCUIndex]) ||
            new Date() - lastSelectedCUTime < selectionTimeoutPeriod)) {
            if (miscSettings.sameCUScroll) {
                var scrolled = scrollSelectedCUIfRequired('up');
                if (scrolled) {
                    return;
                }
                else if (selectedCUIndex === 0) { // special case for first CU
                    mod_utils.scrollUp();
                }
            }

            newIndex = selectedCUIndex - 1;
            if (newIndex >= 0) {
                selectCU(newIndex, true, true);
            }
            // else do nothing
        }
        else {
            selectMostSensibleCU(true, true);
        }
    }

    /**
     * Selects the next CU to the currently selected one.
     */
    function selectNext() {

        if (!$CUsArray || !$CUsArray.length || $CUsArray.length == 1) {
            mod_utils.scrollDown();
            return;
        }

        // to handle quick repeated invocations...
        if (animationInProgress) {
            stopExistingScrollAnimation = true;
            return;
        }
        else {
            stopExistingScrollAnimation = false;
        }

        $scrollingMarker.hide();

        var newIndex;

        if (selectedCUIndex >=0 && (isCUInViewport($CUsArray[selectedCUIndex]) ||
            new Date() - lastSelectedCUTime < selectionTimeoutPeriod)) {

            if (miscSettings.sameCUScroll) {
                var scrolled = scrollSelectedCUIfRequired('down');
                if (scrolled) {
                    return;
                }
                else  if (selectedCUIndex === $CUsArray.length-1) { // special case for last CU
                    mod_utils.scrollDown();
                }
            }

            newIndex = selectedCUIndex + 1;
            if (newIndex < $CUsArray.length) {
                selectCU(newIndex, true, true);
            }
            // else do nothing

        }
        else {
            selectMostSensibleCU(true, true);
        }
    }

    function selectFirst() {
        selectCU(0, true);
    }
    function selectLast() {
        selectCU($CUsArray.length - 1, true);
    }

    /**
     * Called typically when there is no currently selected CU, and we need to select the CU that makes most sense
     * to select in this situation.
     */
    function selectMostSensibleCU(setFocus, adjustScrolling) {

        var lastSelectedCUIndex;

        // if a CU is already selected AND (is present in the viewport OR was selected only recently)...
        if (selectedCUIndex >= 0 &&
            (isCUInViewport($CUsArray[selectedCUIndex]) ||
                new Date() - lastSelectedCUTime < selectionTimeoutPeriod)) {


            //...call selectCU() on it again passing on the provided parameters
            selectCU(selectedCUIndex, setFocus, adjustScrolling);
            return;
        }
        // if last selected CU exists AND (is present in the viewport OR was deselected only recently)...
        else if( (lastSelectedCUIndex = findIndex_In_$CUsArray($lastSelectedCU)) >=0 &&
            (isCUInViewport($lastSelectedCU) ||
                new Date() - lastSelectedCUTime < selectionTimeoutPeriod)) {

            selectCU(lastSelectedCUIndex, setFocus, adjustScrolling);

        }

        else {
            // Selects first CU in the viewport; if none is found, this selects the first CU on the page
            selectFirstCUInViewport(setFocus, adjustScrolling);
        }
    }

    /**
     * Selects first (topmost) CU in the visible part of the page. If none is found, selects the first CU on the page
     * @param {boolean} setFocus
     * @param {boolean} adjustScrolling
     */

    function selectFirstCUInViewport (setFocus, adjustScrolling) {

        if ($CUsArray && $CUsArray.length) {
            var winTop = $document.scrollTop(),
                CUsArrLen = $CUsArray.length;

            for (var i = 0; i < CUsArrLen; ++i) {
                var $CU = $CUsArray[i];
                var offset = $CU.offset();
                if (offset.top > winTop) {
                    break;
                }
            }

            if (i < CUsArrLen) {
                selectCU(i, setFocus, adjustScrolling);
            }
            else {
                selectCU(0, setFocus, adjustScrolling);
            }

        }

    }

    /**
     * If the specified element exists within a CU, the index of that CU in $CUsArray is
     * returned, else -1 is returned.
     * @param {DOM element|jQuery wrapper} element
     * @return {number} If containing CU was found, its index, else -1
     */
    function getEnclosingCUIndex(element) {
        var $element = $(element),
            CUsArrLen = $CUsArray.length;

        for (var i = 0; i < CUsArrLen; ++i) {
            if ($CUsArray[i].is($element) || $CUsArray[i].find($element).length) {
                return i;
            }
        }

        return -1;

    }

    function onTabOnFilterSearchBox() {
        if ($CUsArray.length) {
            selectCU(0, true, true);
        }
        else {
            var $focusables = $document.find(CONSTS.focusablesSelector);
            if ($focusables.length) {
                $focusables[0].focus();
            }
        }
    }

// Returns ALL the elements after the current one in the DOM (as opposed to jQuery's built in nextAll which retults only
// the next siblings.
// Returned object contains elements in document order
// TODO2: check if this is needed. Of if needed only in the one instance where its being used current, could be replaced
// by nextALLUntil(selector), which might be more efficient
    $.fn.nextALL = function(filter) {
        var $all = $('*'); // equivalent to $document.find('*')
        $all = $all.slice($all.index(this) + 1);
        if (filter)  {
            $all = $all.filter(filter);
        }
        return $all;
    };


// this will find index of the passed jQuery set ($CU) in the $CUsArray. However, unlike JavaScript's
// Array#indexOf() method, a match will be found even if the passed jQuery set is "equivalent" (i.e has the same
// contents as a member of $CUsArray, even if they are not the *same* object.
// Returns -1 if not found.
    function findIndex_In_$CUsArray($CU)  {

        var CUsArrLen;

        if ($CUsArray && (CUsArrLen = $CUsArray.length)) {

            for (var i = 0; i < CUsArrLen; ++i) {
                if (areCUsSame($CU, $CUsArray[i])) {
                    return i;
                }
            }
        }

        return -1;
    }

// returns a boolean indicating if the passed CUs (jQuery sets) have the same contents in the same order (for
// instances where we use this function, the order of elements is always the document order)
    /**
     * returns a boolean indicating if the passed CUs (jQuery sets) have the same contents in the same order (for
     * instances where we use this function, the order of elements is always the document order)
     * @param $1 A CU
     * @param $2 Another CU to compare with the first one.
     * @return {Boolean}
     */
    function areCUsSame($1, $2) {

        // if each jQuery set is either empty or nonexistent, their "contents" are "same".
        if (!$1 && (!$2 || !$2.length)) {
            return true;
        }
        if (!$2 && (!$1 || !$1.length)) {
            return true;
        }

        // we reach here if atleast one of them exists and is non-empty, so...
        if ($1 && $1.length && $2 && $2.length ) {
            var length1 = $1.length,
                length2 = $2.length;

            if (length1 === length2) {

                for (var i = 0; i < length1; ++i) {
                    if ($1[i] !== $2[i]) { // if corresponding DOM elements are not the same
                        return false;
                    }
                }
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }

    }

// returns a bounding rectangle for $CU
// the returned rectangle object has the keys: top, left, width, height, (such
// that the rectangle object can be directly passed to jQuery's css() function).
    function getBoundingRectangle($CU) {

        if (!$CU || !$CU.length)
            return;

        var CUStyleData = expandedUrlData.CUs_style,
            elements = [];

        if (CUStyleData && CUStyleData.useInnerElementsToGetOverlaySize) {
            var allDescendants = $CU.find('*');

            if (allDescendants.length) {
                var $innermostDescendants = allDescendants.filter(function() {
                    if (!($(this).children().length)) {
                        return true;
                    }
                });
                elements = $innermostDescendants.get();
            }
            else {
                elements = $CU.get();
            }
        }

        else {
            elements = $CU.get();
        }
        return getBoundingRectangleForElements(elements);
    }

// returns a bounding rectangle for the set (array) of DOM elements specified
// the returned rectangle object has the keys: top, left, width, height, (such
// that the rectangle object can be directly passed to jQuery's css() function).
    function getBoundingRectangleForElements(elements) {

        if (!elements || !elements.length)
            return;

        var $el, offset;
        if (elements.length === 1) {
            $el = $(elements[0]);
            offset = $el.offset();
            return {
                top: offset.top,
                left: offset.left,
                width: $el.innerWidth(),
                height: $el.innerHeight()
            };

        }

        // if function has still not returned...

        // x1, y1 => top-left. x2, y2 => bottom-right.
        // for the bounding rectangle:
        var x1 = Infinity,
            y1 = Infinity,
            x2 = -Infinity,
            y2 = -Infinity;


        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            $el = $(el);
            var elPosition = $(el).css('position');

            // ignore elements out of normal flow to calculate rectangle + hidden/invisible elements
            if (elPosition === "fixed" || elPosition === "absolute" || /*|| elPosition === "relative"*/
                !$el.is(':visible') || $el.css('visibility') === "hidden" ||
                !$el.innerWidth() || !$el.innerHeight()) {
                continue;
            }

            offset = $el.offset();  // Ingnoring JSHint warning, for the same reason as above

            // for the current element:
            var _x1, _y1, _x2, _y2;

            _x1 = offset.left;
            _y1 = offset.top;
            _x2 = _x1 + $el.innerWidth();
            _y2 = _y1 + $el.innerHeight();

            if (_x1 < x1)
                x1 = _x1;

            if (_y1 < y1)
                y1 = _y1;

            if (_x2 > x2)
                x2 = _x2;

            if (_y2 > y2)
                y2 = _y2;

        }

        // return an object with a format such that it can directly be passed to jQuery's css() function).
        return {
            top: y1,
            left:x1,
            width: x2-x1,
            height: y2-y1
        };
    }

// sets the document's scrollTop to the value specified, using gradual changes in the scrollTop value.
    function animatedScroll(scrollTop, duration) {

        var current = $document.scrollTop();
        var destination = scrollTop;

        // ensure that destination scrollTop position is within the possible range
        if (destination < 0) {
            destination = 0;
        }
        else if (destination > $document.height() - window.innerHeight) {
            destination = $document.height() - window.innerHeight; // $(window).height does not work on HN
        }

        var scrollingDown;

        if (destination > current) {
            scrollingDown = true;
        }
        else if (destination < current) {
            scrollingDown = false;
        }
        else {
            return;
        }

        var totalDisplacement = destination - current,

            speed = totalDisplacement/duration, // pixels per millisec

        // millisecs (actually this is the *minimum* interval between any two consecutive invocations of
        // invokeIncrementalScroll, not necessarily the actual period between any two consecutive ones.
        // This is  handled by calculating the time diff. between invocations. See later.)
            intervalPeriod = Math.min(100, miscSettings.animatedCUScroll_MaxDuration/4),

            lastInvocationTime, // will contain the time of the last invocation (of invokeIncrementalScroll)

            body = document.body,

            intervalId;

        var invokeIncrementalScroll = function () {

            if (stopExistingScrollAnimation) {
                console.log('interval CLEARED.');
                clearInterval(intervalId);
                body.scrollTop = destination;
                animationInProgress = false;
                return;
            }

//        scrollingDown? (current += scrollDelta): (current -= scrollDelta);
            var now = new Date();
            current += (now - lastInvocationTime) * speed;
            lastInvocationTime = now;
            if (scrollingDown? (current >= destination): (current <= destination)) {
                body.scrollTop = destination;
                clearInterval(intervalId);
                animationInProgress = false;
            }
            else {
                body.scrollTop = current;
            }

        };

        animationInProgress = true;
        // in the following lines, we call  'invokeIncrementalScroll' once, after setting 'lastInvocationTime' to the
        // current time minus 'intervalPeriod'. This allows the first invocation of the function to take place immediately
        // rather than at the end of the 'intervalPeriod'.
        lastInvocationTime = new Date() - intervalPeriod;
        invokeIncrementalScroll();   // invoke once immediately, before setting setInterval.

        intervalId = setInterval (invokeIncrementalScroll , intervalPeriod);
    }


    /**
     * Scrolls the window such the specified element lies fully in the viewport (or as much as is
     * possible if the element is too large).
     * //TODO3: consider if horizontal scrolling should be adjusted as well (some, very few, sites sites might, like an
     * image gallery, might have CUs laid out horizontally)
     * @param {DOM element|JQuery wrapper} $element
     * @param {object} options Misc options. Can also be used to override miscSettings
     */
    function scrollIntoView($element, options) {

        $element = $($element);
        if (!$element || !$element.length) {
            return;
        }

        options = $.extend(true, {}, miscSettings, options);

        var // for the window:
            winTop = $document.scrollTop(),
        // winHeight = $(window).height(), // this doesn't seem to work correctly on news.ycombinator.com
            winHeight = window.innerHeight,
            winBottom = winTop + winHeight,

        // for the element:
            elTop = $element.offset().top,
            elHeight = $element.height(),
            elBottom = elTop + elHeight;

        var newWinTop, // once determined, we will scroll the window top to this value
            margin = 10;

        var pageHeaderHeight = getEffectiveHeaderHeight();

        /*
         if (elBottom >= winBottom) { // element is overflowing from the bottom

         newWinTop = elTop - Math.max(pageHeaderHeight, Math.min(winHeight - elHeight, winHeight/2));
         }
         else if (elTop <= winTop + pageHeaderHeight) { // element is overflowing from the top

         newWinTop = elTop - Math.max(pageHeaderHeight, winHeight/2 - elHeight);
         }
         */

        if ( (elTop > winTop + pageHeaderHeight + margin && elBottom < winBottom - margin) && // CU is fully in viewport
            !scrollIntoView.tryCenteringCUOnEachScroll) {

            return false;
        }

        else {

            // center the element based on this equation equating the space left in the (visible part of the) viewport above
            // the element to the space left below it:
            // elTop - (newWinTop + pageHeaderHeight) = newWinBottom - elBottom = newWinTop + winHeight - elBottom
            // (substituting (newWinTop + winHeight) for newWinBottom)
            newWinTop = (elTop + elBottom - winHeight +  - pageHeaderHeight)/2;

            if (elTop < newWinTop + pageHeaderHeight + margin ) {
                newWinTop = elTop - pageHeaderHeight - margin;
            }
        }

        if (options.animatedCUScroll) {
            console.log('animated CU scroll');
            var animationDuration = Math.min(options.animatedCUScroll_MaxDuration,
                Math.abs(newWinTop-winTop) / options.animatedCUScroll_Speed);
            animatedScroll(newWinTop, animationDuration);
//        $('html, body').animate({scrollTop: newWinTop}, animatedScroll);
        }
        else {
            console.log('NON animated CU scroll');
            $document.scrollTop(newWinTop);

        }

    }

// Sets/updates the global variable $CUsArray and other state associated with it
    function updateCUsAndRelatedState() {

        // Save the currently selected CU, to reselect it, if it is still present in the $CUsArray after the array is
        // updated. This needs to be done before calling deselectCU() and modifying the current $CUsArray
        var $prevSelectedCU = $CUsArray && $CUsArray[selectedCUIndex];
        dehoverCU(); // to prevent a "ghost" hover overlay
        deselectCU({onDomChangeOrWindowResize: true});
        var $CUs = getAllCUsOnPage();
        mod_filterCUs && mod_filterCUs.filterCUsArray($CUs);
        $CUsArray = $CUs;
        mod_context.setCUsCount($CUsArray.length);

        if ($CUsArray && $CUsArray.length) {

            if (miscSettings.selectCUOnLoad && !selectCU.invokedYet) {
                // this is done at DOM ready as well in case by then the page's JS has set focus elsewhere.
                selectFirstCUInViewport(true, false);
            }

            // The following block ensures that a previously selected CU continues to remain selected
            else if ($prevSelectedCU) {

                var newSelectedCUIndex = findIndex_In_$CUsArray($prevSelectedCU);

                if (newSelectedCUIndex >= 0) {
                    // pass false to not change focus (because it is almost certainly is already where it should be,
                    // and we don't want to inadvertently change it)
                    selectCU(newSelectedCUIndex, false, false, {onDomChangeOrWindowResize: true});
                }
            }
        }
    }

// Finds the set of all the CUs on the current page, and returns it as an array
    function getAllCUsOnPage() {

        if (!expandedUrlData || !expandedUrlData.CUs_specifier) {
            // returning an empty array instead of null means accessing $CUsArray[selectedCUIndex] (which
            // is done a lot) doesn't need to be prepended with a check against null in each case.
            return [];
        }

        var $CUsArr,   // this will be hold the array to return
            CUsSpecifier = expandedUrlData.CUs_specifier,
            selector,
            firstSelector,
            lastSelector,
            centralElementselector;


        if (typeof (selector = CUsSpecifier.selector) === "string") {
            $CUsArr = $.map($(selector).get(), function(item, i) {
                return $(item);
            });
        }

        else if (typeof (firstSelector = CUsSpecifier.first) === "string" &&
            typeof (lastSelector = CUsSpecifier.last) === "string") {

            $CUsArr = [];
            var $firstsArray = $.map($(firstSelector).get(), function(item, i) {
                return $(item);
            });

            // TODO: add a comment somewhere explaining how "first" and "last" work "smartly" (i.e. find the respective
            // ancestors first_ancestor and last_ancestor that are siblings and use those)
            // selecting logically valid entities.)
            if ($firstsArray.length) {
                var // these will correspond to CUsSpecifier.first and CUsSpecifier.last
                    $_first, $_last,

                //these will be the closest ancestors (self included) of $_first and $_last respectively, which are
                // siblings
                    $first, $last,

                    $closestCommonAncestor,
                    firstsArrLen = $firstsArray.length;

                var filterFirst = function(){
                    var $el = $(this);
                    if ($el.is($_first) || $el.has($_first).length) {
                        return true;
                    }
                    else {
                        return false;
                    }
                };

                var filterLast = function(){
                    var $el = $(this);
                    if ($el.is($_last) || $el.has($_last).length) {
                        return true;
                    }
                    else {
                        return false;
                    }
                };

                for (var i = 0; i < firstsArrLen; ++i) {
                    $_first = $firstsArray[i];
                    $_last = $_first.nextALL(lastSelector).first();

                    $closestCommonAncestor = $_first.parents().has($_last).first();

                    $first = $closestCommonAncestor.children().filter(filterFirst);
                    $last = $closestCommonAncestor.children().filter(filterLast);
                    $CUsArr[i] = $first.add($first.nextUntil($last)).add($last);
                }
            }
        }

        else if (typeof (centralElementselector = CUsSpecifier.buildCUAround) === "string"){

            $CUsArr = [];
            var currentGroupingIndex = 0;

            var $container = mod_contentHelper.closestCommonAncestor($(CUsSpecifier.buildCUAround));
            // TODO: move the function below to a more apt place
            /**
             *
             * @param {DOM Node|JQuery Wrapper} $container
             */

            var buildCUsAroundCentralElement = function ($container) {
//TODO: 1) rename child to sibling etc
//            2) call currentGroupingIndex currentGroupingIndex etc.
                $container = $($container);

                if (!$container || !$container.length) {
                    return null;
                }

                if ($container.length > 1) {
                    console.error("length of $container should not be more than 1");
                }

                var $siblings = $container.children();
                var siblingsLength = $siblings.length;

                if (siblingsLength) {

                    var $currentSibling,
                        firstCentralElementFound = false,
                        num_centralElementsInCurrentSibling;

                    for (var i = 0; i < siblingsLength; ++i) {
                        $currentSibling = $siblings.eq(i);
                        if ($currentSibling.is(centralElementselector)) {
                            if (!firstCentralElementFound) {
                                firstCentralElementFound = true;
                            }
                            else {
                                ++currentGroupingIndex;
                            }
                            $CUsArr[currentGroupingIndex] = $currentSibling.add($CUsArr[currentGroupingIndex]);
                        }
                        else if ((num_centralElementsInCurrentSibling = $currentSibling.find(centralElementselector).length)) {
                            if (num_centralElementsInCurrentSibling === 1) {
                                if (!firstCentralElementFound) {
                                    firstCentralElementFound = true;
                                }
                                else {
                                    ++currentGroupingIndex;
                                }
                                $CUsArr[currentGroupingIndex] = $currentSibling.add($CUsArr[currentGroupingIndex]);
                            }
                            else { // >= 2
                                if (!firstCentralElementFound) {
                                    firstCentralElementFound = true;
                                }
                                else {
                                    ++currentGroupingIndex;
                                }

                                buildCUsAroundCentralElement($currentSibling);
                            }
                        }
                        else {
                            $CUsArr[currentGroupingIndex] = $currentSibling.add($CUsArr[currentGroupingIndex]);
                        }
                    }
                }
            }; // end of function definition

            buildCUsAroundCentralElement($container);
        }

        processCUsArray($CUsArr);

//    if (parseInt($searchContainer.css('top')) >= 0) { // if search box is visible
//    ////if ($searchContainer.offset().top >= 0) { // if search box is visible
//        filterCUsArray($CUsArr);
//    }

//    if (!$CUsArr || !$CUsArr.length) {
//        console.warn("UnitsProj: No CUs were found based on the selector provided for this URL")
//        return;
//    }

        return $CUsArr;
    }

    /* Returns true if all constituent elements of $CU1 are contained within (the constituents) of $CU2, false
     otherwise. (An element is considered to 'contain' itself and all its descendants)
     */
    function isCUContainedInAnother($CU1, $CU2) {

        var CU1Len = $CU1.length,
            CU2Len = $CU2.length;

        for (var i = 0; i < CU1Len; ++i) {

            var isThisConstituentContained = false; // assume

            for (var j = 0; j < CU2Len; ++j) {
                if ($CU2[j].contains($CU1[i])) {
                    isThisConstituentContained = true;
                    break;
                }
            }

            if (!isThisConstituentContained) {
                return false;
            }
        }
        return true;
    }

    /**
     * process all CUs in $CUsArr does the following
     1) remove any CU that is not visible in the DOM
     2) remove any CU that is fully contained within another
     */
    function processCUsArray($CUsArr) {

        if (!$CUsArr || !$CUsArr.length) {
            return;
        }

        var CUsArrLen = $CUsArr.length;

        for (var i = 0; i < CUsArrLen; ++i) {
            var $CU = $CUsArr[i];
            if ( (!$CU.is(':visible') && !$CU.hasClass('hiddenByUnitsProj')) || isCUInvisible($CU)) {
                $CUsArr.splice(i, 1);
                --CUsArrLen;
                --i;
                continue;
            }

            for (var j = 0; j < CUsArrLen; ++j) {
                if (i === j) {
                    continue;
                }

                if (isCUContainedInAnother($CU, $CUsArr[j])) {
                    $CUsArr.splice(i, 1);
                    --CUsArrLen;
                    --i;
                    break;
                }
            }
        }
    }

    /**
     *
     * @param {DOM Element|JQuery wrapper} element
     * @param {object} point Should have the properties x and y.
     * @return {Boolean}
     */
    function elementContainsPoint(element, point) {

        var $element = $(element);
        if (!$element || !$element.length) {
            return false;
        }

        var x = point.x, y = point.y;

        var offset = $element.offset();
        var x1 = offset.left,
            x2 = x1 + $element.width(),
            y1 = offset.top,
            y2 = y1 + $element.height();

        return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }

// Based on the header selector provided, this returns the "effective" height of the header (i.e. unusable space) at the
// top of the current view.
// Only the part of the header below the view's top is considered, and its size returned. If there is more than one
// header element, we do the same thing, but for the bottommost one.
    function getEffectiveHeaderHeight() {

        var tmp;
        var headerSelector = (tmp = expandedUrlData) && (tmp = tmp.CUs_MUs) && (tmp = tmp.std_header) && tmp.selector;
        if (!headerSelector) {
            return 0;
        }

        var $headers = $(headerSelector).filter(':visible'),
            headersLen;

        if ($headers && (headersLen = $headers.length)) {

            var maxHeaderBottom = 0;

            for (var i = 0; i < headersLen; ++i) {
                var $header = $headers.eq(i),
                    headerTop = $header.offset().top,
                    headerBottom = headerTop + $header.height();

                if (headerBottom > maxHeaderBottom) {
                    maxHeaderBottom = headerBottom;
                }

            }
            var  winTop = $document.scrollTop();
            return Math.max(0, maxHeaderBottom-winTop);
        }
        else {
            return 0;
        }
    }

    function isRtMouseButton(e) {
        // following right code mostly taken from http://www.quirksmode.org/js/events_properties.html
        var isRtButton;
//    if (!e) var e = window.event;
        if (e.which) isRtButton = (e.which == 3);
        else if (e.button) isRtButton = (e.button == 2);

        return isRtButton;
    }

    function onKeydown(e) {
        var code = e.which || e.keyCode,
            hasNonShiftModifier = e.altKey || e.ctrlKey|| e.metaKey,
            hasModifier = hasNonShiftModifier || e.shiftKey,
            $selectedCU = $CUsArray[selectedCUIndex],
            activeEl = document.activeElement || document.body;

        // On pressing TAB (or shift-tab):
        // If a CU is selected, and no element of the page has focus, focus the 'main' element of the CU.
        if (code === 9 && !hasNonShiftModifier) { // TAB
            if ($selectedCU && (activeEl === document.body))  {
                focusMainElement($selectedCU);
                suppressEvent(e);
            }
        }

        /* On pressing ESC:
         - When no CU is selected, blur the active element and select the "most sensible" CU
         - When a CU is selected
         - if an element which does not allow single key shortcuts is active, blur it
         - else deselect the CU. (meaning that a selected CU will be deselected on at most a second 'Esc', if not
         the first)
         */
        else if (code === 27 && !hasModifier) { // ESC
            if (!$selectedCU) {
                activeEl.blur();
                var index = getEnclosingCUIndex(activeEl);
                if (index >= 0) {
                    selectCU(index, true, true);
                }
                else {
                    selectMostSensibleCU(true, true);
                }
            }
            else if (!mod_contentHelper.elementAllowsSingleKeyShortcut(activeEl)) {
                activeEl.blur();
            }
            else {
                deselectCU();
                dehoverCU();
            }
        }
    }

// handler for whenever an element on the page receives focus
// (and thereby a handler for focus-change events)
    function onFocus(e) {
        //console.log('on focus called');
        var el = e.target;
//
//    if ( ($el = $(el)).data('enclosingCUJustSelected') ) {
//        $el.data('enclosingCUJustSelected', false);
//    }
//    else {
        var enclosingCUIndex = getEnclosingCUIndex(el);
        if (enclosingCUIndex >= 0 && enclosingCUIndex !== selectedCUIndex) {
            selectCU(enclosingCUIndex, false);
        }
//    }
    }

    function onMouseWheel (e) {
        // don't do this on macs for now. can make two finger scrolling problematic if the setting "tap to click"
        // is on. (because then, then a two finger tap becomes right click.)
        if (!isMac) {
            if (rtMouseBtnDown) {
                var wheelDirection = e.wheelDelta || e.wheelDeltaY || (-e.detail); // -ve will indicate down, +ve up
                if (wheelDirection) {

                    e.preventDefault();
                    scrolledWithRtMouseBtn = true;

                    if (wheelDirection < 0) {
                        selectNext();
                    }
                    else  {
                        selectPrev();
                    }
                }
            }
        }
    }

    function onLtMouseBtnDown(e) {
        // first update the following global variables
//        ltMouseBtnDown = true;

        var point = {x: e.pageX, y: e.pageY},
            $selectedCU = $CUsArray[selectedCUIndex],
            $overlaySelected = $selectedCU && $selectedCU.data('$overlay'),
            $hoveredCU = $CUsArray[hoveredCUIndex],
            $overlayHovered = $hoveredCU && $hoveredCU.data('$overlay'),
            indexToSelect;

        if ($overlaySelected && elementContainsPoint($overlaySelected, point)) {
            return;  // do nothing
        }
        else  if ($overlayHovered && elementContainsPoint($overlayHovered, point)) {
            indexToSelect = hoveredCUIndex;
        }
        else {
            indexToSelect = getEnclosingCUIndex(e.target);
        }

        if (indexToSelect >= 0) {
            selectCU(indexToSelect, false, false);
            var activeEl = document.activeElement,
                indexOf_CUContainingActiveEl = getEnclosingCUIndex(activeEl);

            if (indexOf_CUContainingActiveEl !== selectedCUIndex) {
                activeEl.blur();
            }
        }
        else {
            deselectCU(); // since the user clicked at a point not lying inside any CU, deselect any selected CU
        }

    }

    function onRtMouseBtnDown() {
        rtMouseBtnDown = true;
    }

    // TODO: describe this in documentation if the feature is deemed useful
    function onContextMenu(e) {

        if (scrolledWithRtMouseBtn) {
            e.preventDefault();
        }
    }

    function onMouseDown (e) {

        if (isRtMouseButton(e)) {
            return onRtMouseBtnDown();
        }
        else {
            return onLtMouseBtnDown(e);
        }

    }

    function onMouseUp(e) {

        if (isRtMouseButton(e)) {

            rtMouseBtnDown = false;

            setTimeout(function() {
                // use a small timeout so that we don't change value before onContextMenu runs
                scrolledWithRtMouseBtn = false;
            },100);
        }
//        else {
//            ltMouseBtnDown = false;
//        }

    }

    // function to be called once the user "intends" to hover over an element
    function onMouseOverIntent(e) {

        var point = {x: e.pageX, y: e.pageY};

        var $overlayHovered;
        if ($CUsArray[hoveredCUIndex] &&
            ($overlayHovered = $CUsArray[hoveredCUIndex].data('$overlay')) &&
            (elementContainsPoint($overlayHovered, point))) {

            return ; // CU already has hovered overlay; don't need to do anything

        }

        var CUIndex = getEnclosingCUIndex(e.target);

        if (CUIndex >= 0) {

            hoverCU(CUIndex);
        }

    }

    function onMouseOver(e) {
        var timeout_applyHoveredOverlay = setTimeout(onMouseOverIntent.bind(null, e), 150);
        $(e.target).data({timeout_applyHoveredOverlay: timeout_applyHoveredOverlay});
//    onMouseOverIntent(e);
    }

    function onMouseOut(e) {

        //clear any timeout set in onMouseOver
        var timeout_applyHoveredOverlay = $(e.target).data('timeout_applyHoveredOverlay');
        clearTimeout(timeout_applyHoveredOverlay);

        // upon any mouseout event, if a hovered overlay exists and the mouse pointer is found not be
        // contained within it, dehover it (set it as dehovered).
        var $overlayHovered;
        if ($CUsArray[hoveredCUIndex] &&
            ($overlayHovered = $CUsArray[hoveredCUIndex].data('$overlay')) &&
            (!elementContainsPoint($overlayHovered, {x: e.pageX, y: e.pageY}))) {

            dehoverCU();

        }
    }

    function onWindowResize() {

        dehoverCU();

        if (selectedCUIndex >= 0) {
            selectCU(selectedCUIndex, false, false, {onDomChangeOrWindowResize: true}); // to redraw the overlay
        }
    }


    function onTransitionEnd (e) {

        var $overlay = $(e.target);

//  console.log('overlay transition ended. total overlays = ', $('.' + class_CUOverlay).length);
        tryRecycleOverlay($overlay);

    }

    /**
     * Checks if the overlay element specified (as jQuery wrapper) is no longer in
     * use, and if so, marks it as available for future reuse.
     * @param $overlay
     */
    function tryRecycleOverlay($overlay) {

        if (!$overlay.hasClass(class_CUOverlay)) {
            console.warn("UnitsProj: Unexpected - $overlay doesn't have class '" + class_CUOverlay + "'");
        }

        // check if the overlay is both in deselected and dehovered states
        if (!$overlay.hasClass(class_CUHoveredOverlay) && !$overlay.hasClass(class_CUSelectedOverlay)) {

            $overlay.hide();
            var $CU = $overlay.data('$CU');

            if ($CU) {
                $CU.data('$overlay', null);
            }
            else {
                console.warn("UnitsProj: Unexpected - overlay's associated CU NOT found!");
            }

            $overlay.data('$CU', null);

            $unusedOverlaysArray.push($overlay);

        }
    }

    function onDomReady() {

        // if settings have been obtained from background script before dom ready takes place
        if (miscSettings && miscSettings.selectCUOnLoad) {

            selectMostSensibleCU(true, false);
        }
    }

    function reset() {
        dehoverCU();
        deselectCU();
        $CUsArray = [];
        $lastSelectedCU = null;
        mod_context.setCUSelectedState(false);
        mod_context.setCUsCount(0);
    }

    function setup(_miscSettings, _expandedUrlData) {

        // we need the body to exist before we can set overlayCssHasTransition
        if (!document.body) {
            setTimeout(setup, 100);
            return;
        }

        // This is required to be initialized before setting up at least one of the event handlers subsequently set up
        overlayCssHasTransition = checkOverlayCssHasTransition();

        miscSettings = _miscSettings;
        expandedUrlData = _expandedUrlData;

        $scrollingMarker = $('<div></div>')
            .addClass(class_scrollingMarker)
            .addClass(class_addedByUnitsProj)
            .hide()
            .appendTo($topLevelContainer);

        $(onDomReady);

        mod_domEvents.addEventListener(document, 'keydown', onKeydown, true);
        mod_domEvents.addEventListener(document, 'mousedown', onMouseDown, true);
        mod_domEvents.addEventListener(document, 'mouseup', onMouseUp, true);
        mod_domEvents.addEventListener(document, 'mouseover', onMouseOver, true);
        mod_domEvents.addEventListener(document, 'mouseout', onMouseOut, true);
        mod_domEvents.addEventListener(document, 'contextmenu', onContextMenu, true);
        mod_domEvents.addEventListener(document, 'DOMMouseScroll', onMouseWheel, false); // for gecko
        mod_domEvents.addEventListener(document, 'mousewheel', onMouseWheel, false);   // for webkit

        $(window).on('resize', onWindowResize);

        // Specifying 'focus' as the event name below doesn't work if a filtering selector is not specified
        // However, 'focusin' behaves as expected in either case.
        $document.on('focusin', CONSTS.focusablesSelector, onFocus);

        if (overlayCssHasTransition) {
            $document.on('transitionend transitionEnd webkittransitionend webkitTransitionEnd otransitionend oTransitionEnd',
                '.' + class_CUOverlay, onTransitionEnd);
        }

        updateCUsAndRelatedState();
        if ( miscSettings.selectCUOnLoad) {
            selectMostSensibleCU(true, false);
        }
    }

    /**
     * Returns true if all (top most) constituents of $CU have css 'visibility' style equal to "hidden"
     * @param $CU
     * @return {Boolean}
     */
    function isCUInvisible($CU) {

        for (var i = 0; i < $CU.length; ++i) {
            if ($CU.eq(i).css('visibility') !== "hidden") {
                return false;
            }
        }
        return true;
    }

// returns true if any part of $CU is in the viewport, false otherwise
    function isCUInViewport($CU) {

        // for the CU
        var boundingRect = getBoundingRectangle($CU),
            CUTop = boundingRect.top,
            CUHeight = boundingRect.height,
            CUBottom = CUTop + CUHeight;

        var // for the window:
            winTop = $document.scrollTop(),
        // winHeight = $(window).height(), // this doesn't seem to work correctly on news.ycombinator.com
            winHeight = window.innerHeight,
            winBottom = winTop + winHeight;


        return ( (CUTop > winTop && CUTop < winBottom) ||
            (CUBottom > winTop && CUBottom < winBottom) );
    }

    function checkOverlayCssHasTransition() {

        // create a short-lived element which is inserted into the DOM to allow determination of CSS transition property
        // on overlay elements, and then quickly removed.
        var $tempOverlay = $('<div></div>')
            .addClass(class_addedByUnitsProj)
            .addClass(class_CUOverlay)
            .hide()
            .appendTo(document.body);
        var properties = ['transition-duration', '-webkit-transition-duration', '-moz-transition-duration',
            '-o-transition-duration'];

        var transitionDuration;
        for (var i = 0; i < properties.length; i++) {
            var property = properties[i];
            transitionDuration = $tempOverlay.css(property);
            if (transitionDuration !== null) {
                break;
            }
        }

        $tempOverlay.remove();

        transitionDuration = parseFloat(transitionDuration); // to get 0.3 from 0.3s etc

        // check if transitionDuration exists and has a non-zero value, while tolerating
        // precision errors with float (which should not occur for 0, but just in case)
        return transitionDuration && transitionDuration > 0.00000001;
    }

    function changeFontSize($jQuerySet, isBeingIncreased) {
        if (!$jQuerySet || !$jQuerySet.length) {
            return;
        }

        for (var i = 0; i < $jQuerySet.length; i++) {
            var $el = $jQuerySet.eq(i);
            var font = $el.css('font-size');
            var numericVal = parseFloat(font);
            var CU = font.substring(numericVal.toString().length);

            var newNumericVal = isBeingIncreased?(numericVal+2): (numericVal-2);
            $el.css('font-size', newNumericVal+CU);

        }
    }
    function increaseFont($jQuerySet) {
        changeFontSize($jQuerySet, true);
    }

    function decreaseFont($jQuerySet) {
        changeFontSize($jQuerySet, false);
    }

    return thisModule;

})(jQuery, _u.mod_core, _u.mod_utils, _u.mod_domEvents, _u.mod_mutationObserver, _u.mod_keyboardLib, _u.mod_filterCUs, _u.mod_help,
        _u.mod_chromeAltHack, _u.mod_contentHelper, _u.mod_commonHelper, _u.mod_context, _u.CONSTS);



