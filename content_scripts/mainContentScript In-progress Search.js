/* NOTES
1)  The set of all logical units of navigation/user attention on a page are simply called "Units" in the
    context of this program. Each unit consists of one or more DOM elements.

2)  The set of all elements that can receive focus on the current page are called the "focusables"

3)  In the comments, including JSDoc snippets, the term "JQuery *collection*" is used to mean a JQuery
    object that can contain *one or more* DOM elements; the term "JQuery *wrapper*" is used to
    denote one which is expected be a JQuery wrapper on a *single* DOM node.

4) jquery dependencies (for if jquery needs replacing/removing)
 1. event handlers
 2. e.which
 3. selectors
 4. offset(), outerWidth(),  etc
 5. prev(), next()
 6. find(), filter(), is()
 7. data()
 8. isArray()
 9. slideDown/Up
 10. extend()
 11. animate()
 12. Line in url-data-map.js: "Anywhere a selector is specified, the extended set of jQuery selectors can be used as
  well.". This feature is probably used pin google last year shortcut.

 */

/* TODOs:

- on quora etc, clicking an a unit scrolls suddenly

- exclude images from rect if affecting both dimensions (including single child ancestors)
- on stackoverflow / questions page: clicking a unit, messes with
 text selection etc in some weird way. doesn't happen every time.

- add padding to the overlay(s) (see wikipedia pages for why)

- handle url changes
- margin near the bottom after scrolling
- override scroll animation when cycling from last to first or first to last
- quora: click doesnt focus
- stackoverflow: clicking doesn't focus main element/etc
- exclude display:none when populating $units

- implement exclude

- animate hovering/unhovering and selection/unselection

check where all deselectUnit() is being called, and if that needs any modifying/placing a check around the call

remove prevALL etc if not using

*/

var currentUrl,

    urlData,    // Data that identifies elements and  unit and specifies shortcuts and other information for the
                        // current url. This is updated whenever the current url changes.

    $unitsArray = [], /* An array of jQuery sets. The array represents the *sequence* of Units on the current page.
    Each constituent element (which is a jQuery collection) represents the set of DOM elements that constitute a single
    unit for the current page.
    Most web pages will allow writing simple selectors such that each unit can be represented as a jQuery collection
    consisting of a single DOM element.(Because these web pages group related logical entities in a single container,
    for which the selector can be specified.)
    However, some web pages (like news.ycombinator.com, wikipedia.org, etc) require writing selectors such each unit
    has to be represented as a jQuery collection comprising of multiple DOM elements.
    (For more details, see the documentation on how to specify selectors for webpages.)

    Note: If the search feature has been invoked, this contains only the filtered Units that are visible on the page.
    This helps keep things simple.
    */

    selectedUnitIndex  = -1, // Index of the selected unit in $unitsArray
    hoveredUnitIndex  = -1, // Index of the hovered unit in $unitsArray

    mutationObserver,
    // TODO2: handle using this variable (or code elsewhere) not triggering mutation changes for unneeded dom changes
    mutationObserverConfig = { childList: true, attributes:true, subtree: true, attributeFilter: ["style"],
        attributeOldValue: true },

    /* This class should be applied to all elements added by this extension. This is used to distinguish DOM mutation
    events caused by them from the those of the page's own elements. This is also a "responsible" thing since it marks
    out clearly elements added by this code to the DOM (for anyone looking at DOM, page source etc) */
    class_addedBySwiftlyExtn = 'added-by-swiftly-extension',

    /* This is used as a container for all elements created by this program that we add to the DOM (technically, this 
    applies only to elements that are outside the render flow of the page. As of 31 Dec 2012 these include all elements
    added by this extension).
    This allows keeping modifications to the DOM localized inside a single element. */
    $topLevelContainer = $('<div></div>').addClass(class_addedBySwiftlyExtn),

    class_overlay = "unit-overlay",                     // class applied to all unit overlays
    class_overlaySelected = "unit-overlay-selected",    // class applied to overlay on a selected unit
    class_overlayHovered = "unit-overlay-hovered",      // class applied to overlay on a hovered unit
    $unusedOverlaysArray = [],   // to enable reusing existing unused overlays

    // boolean, holds a value indicating where the css specifies a transition style for overlays
    overlayCssHasTransition,

    $document = $(document), // cached jQuery object
    
    rtMouseBtnDown,         // boolean holding the state of the right mouse button
    ltMouseBtnDown,         // boolean holding the state of the left mouse button
    scrolledWithRtMouseBtn, // boolean indicating if right mouse button was used to modify scrolling

    class_scrollingMarker = 'unit-scrolling-marker',
    $scrollingMarker = $('<div></div>')
        .addClass(class_scrollingMarker)
        .addClass(class_addedBySwiftlyExtn)
        .hide()
        .appendTo($topLevelContainer),

    class_usedForChromeAltHack = 'swiftly-usedForChromeAltHack',

    $searchContainer,
    $helpContainer,
    timeout_search,

    $lastSelectedUnit = null,   // to store a reference to the last selected unit
    // If a unit is currently selected, this stores the time it was selected, else this stores the time the last
    // selected unit was deselected.
    lastSelectedUnitTime,
    // number of milliseconds since its last selection/deselection after which a unit is no longer deemed to be
    // selected/last-selected, IF it is not in the viewport
    selectionTimeoutPeriod = 60000,

// TODO: one of the following two is not needed
    stopExistingScrollAnimation,
    animationInProgress,

    // A selector for all elements that can receive the keyboard focus. Based on http://stackoverflow.com/a/7668761,
    // with the addition that a :visible has been added in each selector, instead of using a .filter(':visible')
    focusablesSelector = 'a[href]:visible, area[href]:visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, button:not([disabled]):visible, iframe:visible, object:visible, embed:visible, *[tabindex]:visible, *[contenteditable]',

    // Specifies options used by the program. Functions that use this object might also accept a 'options' object as
    // argument. In addition to providing additional options for the function, the 'options' argument can also be
    // to override any properties of the 'globalSettings' object (for that specific invocation) by providing different
    // values for those properties.
    globalSettings = {

        selectUnitOnLoad: true, // whether the first unit should be selected when the page loads
        animatedUnitScroll: true,
        animatedUnitScroll_Speed: 2, // pixels per millisecond
        animatedUnitScroll_MaxDuration: 300, // milliseconds

        increaseFontInSelectedUnit: false,

        // determines if while scrolling a unit should always be centered (whenever possitble) or only if it lies
        // outside the view port
        tryCenteringUnitOnEachScroll: false,

        // if true, scrollNext() and scrollPrev() will scroll more of the current unit, if it is not in view
        sameUnitScroll: true,

        pageScrollDelta: 100, // pixels to scroll on each key press

    };


// returns a jQuery collection composed of all focusable DOM elements contained in the
// jQuery collection ($unit) passed
var $getContainedFocusables = function($unit) {

    var $allElements = $unit.find('*').addBack()
    var $containedFocusables = $allElements.filter(focusablesSelector);
    return $containedFocusables;

};

/**
 * Returns the "main" element in the specified unit, which is determined as follows:
 * 1) Return the first "focusable" element within $unit which matches the selector specified in any of these
 * properties in the urlData.unitSpecifier object (checked in order): 'main', 'buildUnitAround', 'first'
 * 2) If no such element is found, return the first focusable element contained in $unit, if one can be found
 *
 * @param $unit
 * @return {DOM element} Returns the "main" element, if one was found, else null.
 */
var getMainElement = function($unit) {

    if (!$unit || !$unit.length) {
        return null;
    }

    var $containedFocusables = $getContainedFocusables($unit),
        unitSpecifier = urlData.unitSpecifier;

    if (!$containedFocusables.length) {
        return null;
    }

    var mainSelector,
        $filteredFocusables,
    // we look for these keys in unitSpecifier, in order
        focusableSelectorKeys = ['main', 'buildUnitAround', 'first'];

    for (var i = 0, focusableSelectorKey; i < focusableSelectorKeys.length; ++i) {
        focusableSelectorKey = focusableSelectorKeys[i];
        if ((mainSelector = unitSpecifier[focusableSelectorKey]) &&
            ($filteredFocusables = $containedFocusables.filter(mainSelector)) &&
            $filteredFocusables.length) {

            return $filteredFocusables[0];

        }
    }

    // if not returned yet,
    return $containedFocusables[0];

};

/**
 * Invokes a click on the "main" element (see getMainElement()) of the selected unit. Passing true for
 * 'newTab' invokes "ctrl+click", which has the effect of opening the link in a new tab (if the "main" element is
 * a link)
 * @param {boolean} newTab {Determines whether to invoke ctrl+click or simply a click)
 */
function openMainElement(newTab) {
    var $unit = $unitsArray[selectedUnitIndex];
    if ($unit) {
        var element = getMainElement($unit)
        if (element) {
            if (newTab) {
                var ctrlClickEvent = document.createEvent("MouseEvents");
                ctrlClickEvent.initMouseEvent("click", true, true, null,
                    0, 0, 0, 0, 0, true, false, false, false, 0, null);

                element.dispatchEvent(ctrlClickEvent);
            }
            else {
                element.click();
            }
        }

    }
}

/**
 * Selects the unit specified.
 * @param {number|DOMElement (or jQuery wrapper)} unitOrItsIndex Specifies the unit.
 * Can be an integer that specifies the index in $unitsArray or a jQuery object representing the unit.
 * (While performance isn't a major concern here,) passing the index is preferable if it is already known,
 * otherwise the function will determine it itself (in order to set the selectedUnitIndex variable).
 * @param {boolean} setFocus If true, the "main" element for this unit, if one is found, is
 * focused.
 * @param {boolean|undefined} adjustScrolling If true, document's scrolling is adjusted so that
 * all (or such much as is possible) of the selected unit is in the viewport. Defaults to false.
 * This parameter is currently passed as true only from selectPrev() and selectNext()
 * @param {object} options
 */
var selectUnit = function(unitOrItsIndex, setFocus, adjustScrolling, options) {

//    console.log('selectUnit() called');

    var $unit,
        indexOf$unit; // index in $unitsArray

    if (typeof unitOrItsIndex === "number" || unitOrItsIndex instanceof Number) {
        indexOf$unit = unitOrItsIndex;
        $unit = $unitsArray[indexOf$unit];
    }
    else {
        $unit = $(unitOrItsIndex);
        indexOf$unit = findIndex_In_$unitsArray($unit);
    }

    if (!$unit || !$unit.length || indexOf$unit < 0) {
        return;
    }

    options = $.extend(true, {}, globalSettings, options);

    deselectUnit(options); // before proceeding, deselect currently selected unit, if any

    selectedUnitIndex = indexOf$unit;
    var $overlaySelected = showOverlay($unit, 'selected');

    if (!$overlaySelected) {
        console.warn('swiftly: no $overlay returned by showOverlay');
    }

    if (options && options.reselectingUnitOnDomChange) {
        return;
    }
    // the redundant else block exists make explicit the conditional flow below this part
    else {
        selectUnit.invokedYet = true; // to indicate that now this function (selectUnit) has been invoked at least once

        $lastSelectedUnit = $unit;
        lastSelectedUnitTime = new Date();

        if (adjustScrolling) {
            scrollIntoView($overlaySelected, options);
        }

        if (setFocus) {
            var mainEl;
            if (mainEl = getMainElement($unit)) {

                $(mainEl).data('focusJustSet_OnSelectingUnit', true);
                mainEl.focus();
            }

        }

        if (options.increaseFontInSelectedUnit && !$unit.data('fontIncreasedOnSelection')) {
            mutationObserver.disconnect();
            increaseFont($unit);
            mutationObserver.observe(document, mutationObserverConfig);
            $unit.data('fontIncreasedOnSelection', true)
        }

        if (urlData.fn_onUnitSelection) {
            mutationObserver.disconnect();
            urlData.fn_onUnitSelection($unitsArray[selectedUnitIndex], document);
            mutationObserver.observe(document, mutationObserverConfig);

        }
    }


};

/**
 * Deselects the currently selected unit, if there is one
 */
var deselectUnit = function (options) {

   
    var $unit;
    if ($unit = $unitsArray[selectedUnitIndex]) {

//        console.log('deselecting unit...');
        selectedUnitIndex = -1;
        removeOverlay($unit, 'selected');

        if (options && options.reselectingUnitOnDomChange) {
            return;
        }

        // the redundant else block exists to make explicit the conditional flow below this part
        else {
            lastSelectedUnitTime = new Date();

            if ($unit.data('fontIncreasedOnSelection')) {
                mutationObserver.disconnect();
                decreaseFont($unit);
                mutationObserver.observe(document, mutationObserverConfig);
                $unit.data('fontIncreasedOnSelection', false)
            }

            if (urlData.fn_onUnitDeselection) {
                mutationObserver.disconnect();
                urlData.fn_onUnitDeselection($unit, document);
                mutationObserver.observe(document, mutationObserverConfig);
            }
        }

    }
};

/**
 * Removes the 'selected' or 'hovered' css class from the unit, as specified by 'type'
 * @param $unit
 * @param {string} type Can be 'selected' or 'hovered'
 * @return {*} Returns $overlay (the jQuery wrapper overlay element)
 */
function removeOverlay ($unit, type) {
    if (!$unit || !$unit.length) {
        return null;
    }

    var $overlay = $unit.data('$overlay');

    if ($overlay) {
        $overlay.removeClass(type === 'selected'? class_overlaySelected: class_overlaySelected);

        if (!overlayCssHasTransition) {
            tryRecycleOverlay($overlay);
        }
    }
    else {
        console.warn('swiftly: no $overlay found');
    }

}

/**
 *
 * @param $unit
 * @param {string} type Can be 'selected' or 'hovered'
 * @return {*} Returns $overlay (the jQuery wrapper overlay element)
 */
var showOverlay = function($unit, type) {
    if (!$unit || !$unit.length) {
        return null;
    }

    var $overlay = $unit.data('$overlay');
    if (!$overlay || !$overlay.length) {
        if ($unusedOverlaysArray.length) {
            $overlay = $unusedOverlaysArray.shift();
        }
        else {
            $overlay = $('<div></div>').addClass(class_addedBySwiftlyExtn).addClass(class_overlay);
        }
    }

    $overlay.data('$unit', $unit);
    $unit.data('$overlay', $overlay);

    // position the overlay above the unit, and ensure that its visible
    $overlay.css(getBoundingRectangle($unit)).show();

    if (type === 'selected') {
        $overlay.addClass(class_overlaySelected);
//        $overlay.css('box-shadow', '2px 2px 20px 0px #999');

    }
    else { // 'hovered'
        $overlay.addClass(class_overlayHovered);
//        $overlay.css('box-shadow', '1px 1px 10px 0px #bbb');
    }

    $overlay.appendTo($topLevelContainer);

    return $overlay;

};


// Checks if document.body contains the $topLevelContainer element, and appends it to the body if it doesn't.
function ensureTopLevelContainerIsInDom() {
    if (!document.body.contains($topLevelContainer[0])) {
//        console.log('appending $topLevelContainer to body');
        $topLevelContainer.appendTo(document.body);

    }
}

/**
 * Shows as hovered the unit specified.
 * @param {number|DOMElement (or jQuery wrapper)} unitOrItsIndex Specifies the unit.
 * Can be an integer that specifies the index in $unitsArray or a jQuery object representing the unit.
 * (While performance isn't a major concern,) passing the index is preferable if it is already known.
 */
var hoverUnit = function(unitOrItsIndex) {

    var $unit,
        indexOf$unit; // index in $unitsArray

    if (typeof unitOrItsIndex === "number" || unitOrItsIndex instanceof Number) {
        indexOf$unit = unitOrItsIndex;
        $unit = $unitsArray[indexOf$unit];
    }
    else {
        $unit = $(unitOrItsIndex);
        indexOf$unit = findIndex_In_$unitsArray($unit);
    }

    if (!$unit || !$unit.length || indexOf$unit < 0) {
        return;
    }

    dehoverUnit(); // before proceeding, dehover currently hovered-over unit, if any

    hoveredUnitIndex = indexOf$unit;
    showOverlay($unit, 'hovered');

};

/**
 * Dehovers the currently hovered (over) unit, if there is one
 */
var dehoverUnit = function () {

    var $unit;
    if ($unit = $unitsArray[hoveredUnitIndex]) {

        hoveredUnitIndex = -1;
        removeOverlay($unit, 'hovered');

    }
};

var showScrollingMarker = function(x, y) {

    clearTimeout($scrollingMarker.timeoutId); // clear a previously set timeout out, if one exists...

    $scrollingMarker.timeoutId = setTimeout(function() { // ... before setting a new one
        $scrollingMarker.hide();
    }, 3000);

    $scrollingMarker.css({top: y, left: x-$scrollingMarker.width()-5}).show();


};

/**
 * Scrolls more of the currently selected unit into view if required (i.e. if the unit is too large),
 * in the direction specified.
 * @param {string} direction Can be either 'up' or 'down'
 * @param {object} options
 * @return {Boolean} value indicating whether scroll took place
 */
var scrollSelectedUnitIfRequired = function(direction, options) {

    options = $.extend(true, {}, globalSettings, options);

    var $unit = $unitsArray[selectedUnitIndex];

    var pageHeaderHeight = getEffectiveHeaderHeight();

    var // for the window:
        winTop = $document.scrollTop(),
        winHeight = $(window).height(),
        winBottom = winTop + winHeight,

    // for the unit:
        unitTop = $unit.offset().top,
        unitHeight = $unit.height(),
        unitBottom = unitTop + unitHeight;

    var newWinTop, // new value of scrollTop
        sameUnitScrollOverlap = 70,
        margin = 30;

    var direction = direction.toLowerCase();
    if ( (direction === 'up' && unitTop < winTop + pageHeaderHeight)
        || (direction === 'down' && unitBottom > winBottom) ) {
        if (direction === 'up' ) { // implies unitTop < winTop + pageHeaderHeight
            newWinTop = winTop - winHeight + sameUnitScrollOverlap;

            // if newWinTop calculated would scroll the unit more than required for it to get completely in the view,
            // increase it to the max value required to show the entire unit with some margin left.
            if (newWinTop + pageHeaderHeight < unitTop) {
                newWinTop = unitTop - pageHeaderHeight - margin;
            }

            if (newWinTop < 0) {
                newWinTop = 0;
            }

//            showScrollingMarker($unit.offset().left, winTop + 25);
        }

        else  { //direction === 'down' && unitBottom > winBottom
            
            newWinTop = winBottom - sameUnitScrollOverlap;

            // if newWinTop calculated would scroll the unit more than required for it to get completely in the view,
            // reduce it to the min value required to show the entire unit with some margin left.
            if (newWinTop + winHeight > unitBottom) {
                newWinTop = unitBottom - winHeight + margin;
            }

            // ensure value is not more then the max possible
            if (newWinTop > $document.height() - winHeight) {
                newWinTop = $document.height() - winHeight;
            }

            showScrollingMarker($unit.offset().left, winBottom - 25);
        }

        if (options.animatedUnitScroll) {

            console.log('animated SAME unit scroll');

            var animationDuration = Math.min(options.animatedUnitScroll_MaxDuration,
                Math.abs(newWinTop-winTop) / options.animatedUnitScroll_Speed);

            animatedScroll(newWinTop, animationDuration);

//            $('html, body').animate({scrollTop: newWinTop}, animatedScroll);
        }
        else {
            console.log('NON animated SAME unit scroll');
            $document.scrollTop(newWinTop);
        }


        return true;
    }

    return false;
}

/**
 * Selects the previous unit to the currently selected one.
 */
var selectPrev = function() {

    if (!$unitsArray || !$unitsArray.length || $unitsArray.length == 1) {
        scrollUp();
        return;
    }

    var options,
        currentTime = new Date(),
        lastInvocationTime = selectPrev.lastInvocationTime;

    // to handle quick repeated invocations...
    if (animationInProgress) {
        return;
    }
    if (lastInvocationTime && currentTime - lastInvocationTime < 100) {
        return;
    }
    else if (lastInvocationTime && currentTime - lastInvocationTime < 200) {
        options = {
            animatedUnitScroll: false
        }
        stopExistingScrollAnimation = true;
    }
    else {
        stopExistingScrollAnimation = false;
    }
    selectPrev.lastInvocationTime = currentTime;
    options = $.extend(true, {}, globalSettings, options);

    $scrollingMarker.hide();

    var newIndex;

    if (selectedUnitIndex >=0 && (isAnyPartOfUnitInViewport($unitsArray[selectedUnitIndex])
        || new Date() - lastSelectedUnitTime < selectionTimeoutPeriod)) {
        if (options.sameUnitScroll) {
             var scrolled = scrollSelectedUnitIfRequired('up', options);
            if (scrolled) {
                return;
            }
            else if (selectedUnitIndex === 0) { // special case for first unit
                scrollUp();
            }
        }

        newIndex = selectedUnitIndex - 1;
        if (newIndex >= 0) {
            selectUnit(newIndex, true, true, options);
        }
        // else do nothing

    }
    else {
        selectMostSensibleUnit(true, true);
    }


};

/**
 * Selects the next unit to the currently selected one.
 */
var selectNext = function() {

    if (!$unitsArray || !$unitsArray.length || $unitsArray.length == 1) {
        scrollDown();
        return;
    }

    var options,
        currentTime = new Date(),
        lastInvocationTime = selectNext.lastInvocationTime;

    // to handle quick repeated invocations...
    if (animationInProgress) {
        stopExistingScrollAnimation = true;
        return;
    }
    else {
        stopExistingScrollAnimation = false;
    }
//    if (lastInvocationTime && currentTime - lastInvocationTime < 100) {
//        return;
//    }
//    else if (lastInvocationTime && currentTime - lastInvocationTime < 200) {
//        options = {
//            animatedUnitScroll: false
//        }
//        stopExistingScrollAnimation = true;
//    }
//    else {
//        stopExistingScrollAnimation = false;
//    }
//
//    selectNext.lastInvocationTime = currentTime;

    options = $.extend(true, {}, globalSettings, options);

    $scrollingMarker.hide();

    var newIndex;

    if (selectedUnitIndex >=0 && (isAnyPartOfUnitInViewport($unitsArray[selectedUnitIndex])
        || new Date() - lastSelectedUnitTime < selectionTimeoutPeriod)) {

        if (options.sameUnitScroll) {
            var scrolled = scrollSelectedUnitIfRequired('down', options);
            if (scrolled) {
                return;
            }
            else  if (selectedUnitIndex === $unitsArray.length-1) { // special case for last unit
                scrollDown();
            }
        }

        newIndex = selectedUnitIndex + 1;
        if (newIndex < $unitsArray.length) {
            selectUnit(newIndex, true, true);
        }
        // else do nothing

    }
    else {
        selectMostSensibleUnit(true, true);
    }
};

/**
 * Called typically when there is no currently selected unit, and we need to select the unit that makes most sense
 * to select in this situation.
 */
function selectMostSensibleUnit(setFocus, adjustScrolling) {

    var lastSelectedUnitIndex;

    // if a unit is already selected AND (is present in the viewport OR was selected only recently)...
    if (selectedUnitIndex >= 0
        && (isAnyPartOfUnitInViewport($unitsArray[selectedUnitIndex])
        || new Date() - lastSelectedUnitTime < selectionTimeoutPeriod)) {


        //...call selectUnit() on it again passing on the provided parameters
        selectUnit(selectedUnitIndex, setFocus, adjustScrolling);
        return;
    }
    // if last selected unit exists AND (is present in the viewport OR was deselected only recently)...
    else if( (lastSelectedUnitIndex = findIndex_In_$unitsArray($lastSelectedUnit)) >=0
        && (isAnyPartOfUnitInViewport($lastSelectedUnit)
        || new Date() - lastSelectedUnitTime < selectionTimeoutPeriod)) {

        selectUnit(lastSelectedUnitIndex, setFocus, adjustScrolling);
       
    }
  
    else {
        // Selects first unit in the viewport; if none is found, this selects the first unit on the page
        selectFirstUnitInViewport(setFocus, adjustScrolling);
    }
}

/**
 * Selects first (topmost) unit in the visible part of the page. If none is found, selects the first unit on the page
 * @param {boolean} setFocus
 * @param {boolean} adjustScrolling
 */

function selectFirstUnitInViewport (setFocus, adjustScrolling) {

    if ($unitsArray && $unitsArray.length) {
        var winTop = $document.scrollTop(),
            unitsArrLen = $unitsArray.length;

        for (var i = 0; i < unitsArrLen; ++i) {
            var $unit = $unitsArray[i];
            var offset = $unit.offset();
            if (offset.top > winTop) {
                break;
            }
        }

        if (i < unitsArrLen) {
            selectUnit(i, setFocus, adjustScrolling);
        }
        else {
            selectUnit(0, setFocus, adjustScrolling);
        }

    }

}

/**
 * If the specified element exists within a unit, the index of that unit in $unitsArray is 
 * returned, else -1 is returned.
 * @param {DOM element|jQuery wrapper} element
 * @return {number} If containing unit was found, its index, else -1
 */
var getContainingUnitIndex = function(element) {
    var $element = $(element),
        unitsArrLen = $unitsArray.length;

    for (var i = 0; i < unitsArrLen; ++i) {
        if ($unitsArray[i].is($element) || $unitsArray[i].find($element).length) {
            return i;
        }
    }

    return -1;

};


// Returns ALL the elements after the current one in the DOM (as opposed to jQuery's built in nextAll which retults only
// the next siblings.
// Returned object contains elements in document order
// TODO2: check if this is needed. Of if needed only in the one instance where its being used current, could be replaced
// by nextALLUntil(selector), which might be more efficient
$.fn.nextALL = function(filter) {
    var $all = $('*'); // equivalent to $document.find('*')
    $all = $all.slice($all.index(this) + 1)
    if (filter)  {
        $all = $all.filter(filter);
    }
    return $all;
};


// this will find index of the passed jQuery collection ($unit) in the $unitsArray. However, unlike JavaScript's
// Array#indexOf() method, a match will be found even if the passed jQuery collection is "equivalent" (i.e has the same
// contents as a member of $unitsArray, even if they are not the *same* object.
// Returns -1 if not found.
var findIndex_In_$unitsArray = function($unit)  {

    var unitsArrLen = $unitsArray.length;

    for (var i = 0; i < unitsArrLen; ++i) {
        if (areUnitsSame($unit, $unitsArray[i])) {
            return i;
        }
    }

    return -1
};

// returns a boolean indicating if the passed Units (jQuery sets) have the same contents in the same order (for
// instances where we use this function, the order of elements is always the document order)
/**
 * returns a boolean indicating if the passed Units (jQuery sets) have the same contents in the same order (for
 * instances where we use this function, the order of elements is always the document order)
 * @param $1 A unit
 * @param $2 Another unit to compare with the first one.
 * @return {Boolean}
 */
var areUnitsSame = function($1, $2) {

    // if each jQuery collection is either empty or nonexistent, their "contents" are "same".
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

};

// returns a bounding rectangle for the constituents of a jQuery collection $obj
// the returned rectangle object has the keys: top, left, width, height, (such
// that the rectangle object can be directly passed to jQuery's css() function).
var getBoundingRectangle = function($obj) {

    if (!$obj || !$obj.length)
        return;

    if ($obj.length === 1) {
        var offset = $obj.offset();
        return {
            top: offset.top,
            left: offset.left,
            width: $obj.innerWidth(),
            height: $obj.innerHeight()
        };
//
    }

    // if function has still not returned...

    // x1, y1 => top-left. x2, y2 => bottom-right.
    // for the boundin   g rectangle:
    var x1 = Infinity,
        y1 = Infinity
        x2 = -Infinity,
        y2 = -Infinity;

    $obj.each(function(i, el) {
        var elPosition = $(el).css('position');
        // ignore elements out of normal flow to calculate rectangle

        if (elPosition === "fixed" || elPosition === "absolute" || elPosition === "relative") {
            return;
        }

        var $el = $(el);
        var offset = $el.offset();

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

    });

    // return an object with a format such that it can directly be passed to jQuery's css() function).
    return {
        top: y1,
        left:x1,
        width: x2-x1,
        height: y2-y1
    };
};

// sets the document's scrollTop to the value specified, using gradual changes in the scrollTop value.
var animatedScroll = function(scrollTop, duration) {

    var current = $document.scrollTop();
    var final = scrollTop;

    // ensure that final scrollTop position is within the possible range
    if (final < 0) {
        final = 0;
    }
    else if (final > $document.height() - $(window).height()) {
        final = $document.height() - $(window).height();
    }

    var scrollingDown;         

    if (final > current) {
        scrollingDown = true;
    }
    else if (final < current) {
        scrollingDown = false;
    }
    else {
        return;
    }

    var totalDisplacement = final - current,

        speed = totalDisplacement/duration, // pixels per millisec

        // millisecs (actually this is the *minimum* interval between any two consecutive invocations of
        // invokeIncrementalScroll, not necessarily the actual period between any two consecutive ones.
        // This is  handled by calculating the time diff. between invocations. See later.)
        intervalPeriod = Math.min(100, globalSettings.animatedUnitScroll_MaxDuration/4),

        lastInvocationTime, // will contain the time of the last invocation (of invokeIncrementalScroll)

        body = document.body,

        intervalId;

    var invokeIncrementalScroll = function () {

        if (stopExistingScrollAnimation) {
            console.log('interval CLEARED.')
            clearInterval(intervalId);
            body.scrollTop = final;
            animationInProgress = false;
            return;
        }

//        scrollingDown? (current += scrollDelta): (current -= scrollDelta);
        var now = new Date();
        current += (now - lastInvocationTime) * speed;
        lastInvocationTime = now;
        if (scrollingDown? (current >= final): (current <= final)) {
            body.scrollTop = final;
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
};


/**
 * Scrolls the window such the specified element lies fully in the viewport (or as much as is
 * possible if the element is too large).
 * //TODO3: consider if horizontal scrolling should be adjusted as well (some, very few, sites sites might, like an
 * image gallery, might have Units laid out horizontally)
 * @param {DOM element|JQuery wrapper} $element
 * @param {object} options
 */
function scrollIntoView($element, options) {

    $element = $($element);
    if (!$element || !$element.length) {
        return;
    }

    options = $.extend(true, {}, globalSettings, options);

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

    if ( (elTop > winTop + pageHeaderHeight + margin && elBottom < winBottom - margin) // unit is fully in viewport
        && !scrollIntoView.tryCenteringUnitOnEachScroll) {

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

    if (options.animatedUnitScroll) {

        console.log('animated unit scroll');

        var animationDuration = Math.min(options.animatedUnitScroll_MaxDuration,
            Math.abs(newWinTop-winTop) / options.animatedUnitScroll_Speed);

        animatedScroll(newWinTop, animationDuration);

//        $('html, body').animate({scrollTop: newWinTop}, animatedScroll);

    }
    else {
        console.log('NON animated unit scroll');
        $document.scrollTop(newWinTop);

    }

}

var timeout_domChanges,
    groupingInterval_for_DomMutations = 200; // millisecs
// this function ensures that a set of closely spaced DOM mutation events triggers only one (slightly expensive)
// getUnitsArray() call, as long each pair of successive events in this set is separated by less than
// 'groupingInterval_for_DomMutations' millisecs.
var onDomChange = function() {

    clearTimeout(timeout_domChanges);
    timeout_domChanges = setTimeout(_onDomChange, groupingInterval_for_DomMutations);

    // This is invoked on each DOM change because in principle the JS code can replace the body element with a new one
    // at run time, and so the current body may no longer contain $topLevelContainer even if it was inserted into the
    // body earlier.
    ensureTopLevelContainerIsInDom(); // inexpensive, hence can be invoked here instead of within _onDomChange

};

function _onDomChange() {

    //TODO: check if url changed here, and call onUrlChange()
    updateUnitsAndRelatedState();

}


function updateUnitsAndRelatedState() {

    // Save the currently selected unit, to reselect it, if it is still present in the $unitsArray after the array is
    // updated
    var $prevSelectedUnit = $unitsArray[selectedUnitIndex];

    // dehover() to prevent a "ghost" hover overlay
    dehoverUnit();

    $unitsArray = getUnitsArray();


    // A similar block of code is executed at DOM ready as well in case by then the page's JS has set focus elsewhere.
    if (globalSettings.selectUnitOnLoad
        && !selectUnit.invokedYet) { // if selectUnit() has not been invoked yet

        selectFirstUnitInViewport(true, false);
    }

    // The following block ensures that a previously selected unit continues to remain selected
    else if ($prevSelectedUnit) {

        var newSelectedUnitIndex = findIndex_In_$unitsArray($prevSelectedUnit);

        if (newSelectedUnitIndex >= 0) {
            // pass false to not change focus (because it is almost certainly is already where it should be,
            // and we don't want to inadvertently change it)
            selectUnit(newSelectedUnitIndex, false, false, {reselectingUnitOnDomChange: true});
        }

    }

}

// Populates the units array based on the current contents of the DOM and returns it.
// If search box is visibile, the returned units array is filtered accordingly.
var getUnitsArray = function() {

    if (!urlData || !urlData.unitSpecifier) {
        return;
    }

    var $unitsArr,   // this will be hold the array to return
        unitSpecifier = urlData.unitSpecifier;

    if (typeof unitSpecifier === "string") {
        $unitsArr = $.map($(unitSpecifier).get(), function(item, i) {
            return $(item);
        });
    }
    else if (typeof unitSpecifier.unit === "string"){
        $unitsArr = $.map($(unitSpecifier.unit).get(), function(item, i) {
            return $(item);
        });
    }
    else if (typeof unitSpecifier.first === "string" && typeof unitSpecifier.last === "string" ) {
        $unitsArr = [];
        var $firstsArray = $.map($(unitSpecifier.first).get(), function(item, i) {
            return $(item);
        });

        // TODO: add a comment somewhere explaining how "first" and "last" work "smartly" (i.e. find the respective
        // ancestors first_ancestor and last_ancestor that are siblings and use those)
        // selecting logically valid entities.)
        if ($firstsArray.length) {
            var // these will correspond to unitSpecifier.first and unitSpecifier.last
                $_first, $_last,

                //these will be the closest ancestors (self included) of $_first and $_last respectively, which are
                // siblings
                $first, $last,

                $closestCommonAncestor,
                firstsArrLen = $firstsArray.length;

            for (var i = 0; i < firstsArrLen; ++i) {
                $_first = $firstsArray[i];
                $_last = $_first.nextALL(unitSpecifier.last).first();

                $closestCommonAncestor = $_first.parents().has($_last).first();

                $first = $closestCommonAncestor.children().filter(function(){
                    var $el = $(this);
                    if ($el.is($_first) || $el.has($_first).length) {
                        return true;
                    }
                    else {
                        return false;
                    }
                });
                $last = $closestCommonAncestor.children().filter(function(){
                    var $el = $(this);
                    if ($el.is($_last) || $el.has($_last).length) {
                        return true;
                    }
                    else {
                        return false;
                    }
                });
                $unitsArr[i] = $first.add($first.nextUntil($last)).add($last);

            }

        }

    }

    else if (typeof unitSpecifier.buildUnitAround === "string"){

        $unitsArr = [];
        var currentGroupingIndex = 0;

        var $container = closestCommonAncestor($(unitSpecifier.buildUnitAround));
        // TODO: move the function below to a more apt place
        /**
         *
         * @param {DOM Node|JQuery Wrapper} $container
         */

        function buildUnitsAroundCentralElement($container) {
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

            var centralElementselector = unitSpecifier.buildUnitAround;
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
                        $unitsArr[currentGroupingIndex] = $currentSibling.add($unitsArr[currentGroupingIndex]);
                    }
                    else if (num_centralElementsInCurrentSibling = $currentSibling.find(centralElementselector).length) {
                        if (num_centralElementsInCurrentSibling === 1) {
                            if (!firstCentralElementFound) {
                                firstCentralElementFound = true;
                            }
                            else {
                                ++currentGroupingIndex;
                            }
                            $unitsArr[currentGroupingIndex] = $currentSibling.add($unitsArr[currentGroupingIndex]);
                        }
                        else { // >= 2
                            if (!firstCentralElementFound) {
                                firstCentralElementFound = true;
                            }
                            else {
                                ++currentGroupingIndex;
                            }

                            buildUnitsAroundCentralElement($currentSibling);
                        }
                    }
                    else {
                        $unitsArr[currentGroupingIndex] = $currentSibling.add($unitsArr[currentGroupingIndex]);
                    }
                }


            }

        } // end of function definition

        buildUnitsAroundCentralElement($container);

    }

    processUnitsArray($unitsArr);

    if ($searchContainer.offset().top >= 0) { // if search box is visible
        filterUnitsArray($unitsArr);
    }
    
//    if (!$unitsArr || !$unitsArr.length) {
//        console.warn("Swiftly: No units were found based on the selector provided for this URL")
//        return;
//    }

    return $unitsArr;

};

/* Returns true if all constituent elements of $unit1 are contained within (the constituents) of $unit2, false
otherwise. (An element is considered to 'contain' itself and all its descendants) */
var unitContainedInAnother = function($unit1, $unit2) {

    var unit1Len = $unit1.length,
        unit2Len = $unit2.length;

    for (var i = 0; i < unit1Len; ++i) {

        var isThisConstituentContained = false; // assume

        for (var j = 0; j < unit2Len; ++j) {
            if ($unit2[j].contains($unit1[i])) {
                isThisConstituentContained = true;
                break;
            }
        }

        if (!isThisConstituentContained) {
            return false;
        }

    }

    return true;
};

/**
 * process all units in $unitsArr does the following
1) remove any unit that is not visible in the DOM
2) remove any unit that is fully contained within another
 */
var processUnitsArray = function($unitsArr) {

    var unitsArrLen = $unitsArr.length;

    for (var i = 0; i < unitsArrLen; ++i) {
        var $unit = $unitsArr[i];
        if ( (!$unit.is(':visible') && !$unit.data('hiddenByUnitsExtn'))
            || $unitIsInvisible($unit)) {
            $unitsArr.splice(i, 1);
            --unitsArrLen;
            --i;
            continue;
        }

        for (var j = 0; j < unitsArrLen; ++j) {

            if (i === j) {
                continue;
            }

            if (unitContainedInAnother($unit, $unitsArr[j])) {
                $unitsArr.splice(i, 1);
                --unitsArrLen;
                --i;
                break;
            }
        }

    }

};


/**
 * returns an array containing ancestor elements in document order
 * @param element
 * @return {Array of DOM elements}
 */
var ancestorElements = function(element) {
    var ancestors = []
    for (; element; element = element.parentElement) {
        ancestors.unshift(element)
    }
    return ancestors;
};

/** returns that DOM element which is the closest common ancestor of the elements specified,
 * or null if no common ancestor exists.
 * @param {Array of DOM Elements | jQuery wrapper} elements
 * @return {DOM Element}
 */
var closestCommonAncestor = function(elements) {

    if(!elements || !elements.length) {
        return null;
    }

    if (elements.length ===1) {
        return elements[0];
    }

    // each element of this array will be an array containing the ancestors (in document order, i.e. topmost first) of
    // the element at the corresponding index in 'elements'
    var ancestorsArray = [],
        elementsLen = elements.length,
        ancestorsArrLen;

    for (var i = 0; i < elementsLen; ++i ) {
        ancestorsArray[i] = ancestorElements(elements[i]);
    }
    
    var isAncestorAtSpecifiedIndexCommon = function(index) {

        var referenceAncestor = ancestorsArray[0][index];

        ancestorsArrLen = ancestorsArray.length;
        for (var i = 1; i < ancestorsArrLen; ++i ) {
            if (ancestorsArray[i][index] !== referenceAncestor) {
                return false;
            }

        }

        return true;
    }

    // check if all share the same topmost ancestor
    if (!isAncestorAtSpecifiedIndexCommon(0)) {
        return null;  // no common ancestor
    }

    // This will hold the index of the element in 'elements' with the smallest number of ancestors (in other words,  the element
    // that is highest in the DOM)
    var highestElementIndex = 0,
        
        
    ancestorsArrLen = ancestorsArray.length;
    
    for (i = 0; i < ancestorsArrLen; ++i) {
        if (ancestorsArray[i].length < ancestorsArray[highestElementIndex].length) {
            highestElementIndex = i;
        }
    }

    var ancestorArrayWithFewestElements = ancestorsArray[highestElementIndex]; // use this as the reference array
    var closestCommonAnstr = null,
        arrLen = ancestorArrayWithFewestElements.length;
    for (var i = 0; i < arrLen; ++i) {
        if (isAncestorAtSpecifiedIndexCommon(i)) {
            closestCommonAnstr = ancestorArrayWithFewestElements[i];
        }
        else {
            break;
        }
    }

    return closestCommonAnstr;
};

// returns boolean
var canIgnoreMutation = function(mutationRecord) {
    if (mutationRecord.type === "attributes" && mutationRecord.target.classList.contains(class_addedBySwiftlyExtn)) {
        return true;
    }

    if (mutationRecord.type === "childList") {

        // returns boolean
        var canIgnoreAllNodes = function(nodes) {

            var canIgnore = true; // assume true to start off

            if (nodes && nodes.length) {
                for (var i = 0; i < nodes.length; ++i) {
                    var node = nodes[i];
                    if(!  ((node.classList && node.classList.contains(class_addedBySwiftlyExtn))
                        || node.nodeType === 3)  ) {
                        canIgnore = false;
                        break;
                    }
                }
            }

            return canIgnore;
        };

        if (canIgnoreAllNodes(mutationRecord.addedNodes) && canIgnoreAllNodes(mutationRecord.removedNodes)) {
            return true;
        }
        else {
            return false;
        }

    }

    return false; // if not returned yet

};

/**
 *
 * @param {DOM Element|JQuery wrapper} element
 * @param {object} point Should have the properties x and y.
 * @return {Boolean}
 */
var elementContainsPoint = function(element, point) {

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

    if (x >= x1 && x <= x2 && y >= y1 && y <= y2 ) {
        return true;
    }
    else {
        return false;
    }
};

// Based on the header selector provided, this returns the "effective" height of the header (i.e. unusable space) at the
// top of the current view.
// Only the part of the header below the view's top is considered, and its size returned. If there is more than one
// header element, we do the same thing, but for the bottommost one.
var getEffectiveHeaderHeight = function() {

    var headerSelector = urlData.header;
    if (headerSelector) {
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
    }
    return 0;
};

var isRtMouseButton = function(e) {
    // following right code mostly taken from http://www.quirksmode.org/js/events_properties.html
    var isRtButton;
//    if (!e) var e = window.event;
    if (e.which) isRtButton = (e.which == 3);
    else if (e.button) isRtButton = (e.button == 2);

    return isRtButton;
};

function showSearchBox() {

    if (!$searchContainer.is(':visible')) {
        $searchContainer.show();
    }

    if (parseInt($searchContainer.css('top')) < 0) {

        $searchContainer.$searchBox.val('');

        $searchContainer.css({top: "0px"});

        var savedScrollPos = $document.scrollTop();

        $searchContainer.$searchBox.focus();

        // Setting the focus to the searchbox scrolls the page up slightly because the searchbox lies above the visible
        // part of the page (till its css animation completes). This is undesirable. Hence we restore the scroll
        // position:
        $document.scrollTop(savedScrollPos);

    }
    else {
        $searchContainer.$searchBox.focus();
    }

}

function closeSearchBox() {
    $searchContainer.$searchBox.val('');

    // This function should be called before the search box is hidden, so that the call to filter() function is made
    // within it
    updateUnitsAndRelatedState();
    $searchContainer.$searchBox.blur();

    $searchContainer.css({top: -$searchContainer.outerHeight(true) + "px"});

}

// filters $unitsArr based on the text in the search box
function filterUnitsArray($unitsArr) {

    if (!$unitsArr || !$unitsArr.length) {
        return;
    }

    // ** --------- PRE FILTERING --------- **
    var unitsNodes = [],
        unitsArrLen = $unitsArr.length;

    for (var i = 0; i < unitsArrLen; ++i) {
        var $unit = $unitsArr[i];
        unitsNodes = unitsNodes.concat($unit.get());
    }

    var $closestAncestor = $(closestCommonAncestor(unitsNodes));

    mutationObserver.disconnect(); // ** stop monitoring mutations **


    // ** --------- FILTERING --------- **
    var searchTextLowerCase = $searchContainer.$searchBox.val().toLowerCase();

    if (!searchTextLowerCase) {
//        var $unitsHiddenByPriorFiltering = $closestAncestor.find('.hiddenByUnitsExtn');
//        $unitsHiddenByPriorFiltering.removeClass('hiddenByUnitsExtn').show();

        $closestAncestor.hide();  // for efficiency: remove from the render tree first

        for (var i = 0; i < unitsArrLen; ++i) {
            var $unit = $unitsArr[i];
            if ($unit.data('hiddenByUnitsExtn')) {
                $unit.show().data('hiddenByUnitsExtn', false);
            }
        }

        removeHighlighting($closestAncestor);

        $closestAncestor.show();
    }

    else {

        console.log('filtering invoked...');

        for (var i = 0, $unit; i < unitsArrLen; ++i) {
            $unit = $unitsArr[i];
//            if ($unit.text().toLowerCase().indexOf(searchTextLowerCase) >= 0) {
            if (highlightInUnit($unit, searchTextLowerCase)) {

                //if ($unit.hasClass('hiddenByUnitsExtn')) {

//                $unit.removeClass('hiddenByUnitsExtn');
                $unit.data('hiddenByUnitsExtn', false);
                //}
            }
            else {
                //if ($unit.is(':visible')) {
//                $unit.addClass('hiddenByUnitsExtn');
                $unit.data('hiddenByUnitsExtn', true);


                //}
            }
        }
    }

    $closestAncestor.hide();  // for efficiency: remove from the render tree first
    for (var i = 0, $unit; i < unitsArrLen; ++i) {
        $unit = $unitsArr[i];
        if ($unit.data('hiddenByUnitsExtn')) {
            $unit.hide();
            $unitsArr.splice(i, 1);
            --unitsArrLen;
            --i;
        }
        else {
            $unit.show();
        }
    }

    // ** --------- POST FILTERING --------- **
    $closestAncestor.show();
    mutationObserver.observe(document, mutationObserverConfig); // ** start monitoring mutations **

}

function scrollDown() {
    document.body.scrollTop = document.body.scrollTop + globalSettings.pageScrollDelta;
}

function scrollUp() {
    document.body.scrollTop = document.body.scrollTop - globalSettings.pageScrollDelta;
}

function closeTab() {

    chrome.extension.sendMessage({message: "closeTab"});

}

// *----------event handler definitions follow---------------
// We need this because the URL might change without the page (and this extension) being reloaded in
// a single page app or similar.
var onUrlChange = function() {

    chrome.extension.sendMessage({
            message: "getUrlData",
            tabLocationObj: window.location

        },
        function(response) {
            urlData = response;
            destringifyFunctions(urlData);

            updateUnitsAndRelatedState();
            setupShortcuts();

            setupHelpUIAndEvents();
        }
    );

}

/**
 * The bind function allows mapping of an array of keyboard shortcuts to a handler.
 * @param {Array} shortcuts
 * @param {Function} handler
 * @param {boolean|undefined} suppressPropagation Whether to prevent the event from causing any other action. This
 * defaults to true since it makes sense that if a shortcut has been invoked, nothing else should happen, given that
 * the shortcuts are configurable on a per-page basis). Note: Google results page (and similar pages; see below) need
 * this to be set to true in order to work correctly. In particular, a call to stopImmediatePropagation() is required
 * for google, even if preventDefault() are not called.
 *
 Additional Notes:
 Within the code for bind(), we specify 'keydown' for correct functioning in certain pages which otherwise consume
 keyboard input even when a "typable" element is not focused. The main example of this we encountered was the google
 search results page, which starts typing into the search box even when pressing keys when the search box doesn't
 have focus.
 [This is done in addition to modifying the Mousetrap library to attach events in the capturing phase.]

 In the future, if required, we could consider doing these only for google search pages/sites where it is required.
 */
function bind(shortcuts, handler, suppressPropagation) {

    // defaults to true unless explicitly specified as false (i.e. undefined is true as well)
    if (suppressPropagation !== false) {
        suppressPropagation = true;
    }

    // code within the following 'if' statement
    if (suppressPropagation) {

        Mousetrap.bind(shortcuts, suppressEvent, 'keypress');
        Mousetrap.bind(shortcuts, suppressEvent, 'keyup');
    }

    Mousetrap.bind(shortcuts, function(e) {

        handler();

        if (suppressPropagation) {
            suppressEvent(e);
        }

    }, 'keydown');


    // TODO: check if running on chrome and do the following only then
    applyChromeAltHackIfNeeded(shortcuts, $topLevelContainer);
}

/* Each action is mapped to an array of keyboard shortcuts that will trigger it (allowing multiple shortcuts for the
 same action).
 In addition to the usual modifier keys, 'space' can be used (and will only work) as a modifier key. This was done
 by modifying the MouseTrap library
 */
var globalShortcuts = {
    // NOTE: since space is allowed as a modifier, it can only be used here in that capacity.
    // i.e. only 'space' or 'alt+space' are invalid shortcuts, while 'shift+space+x' is okay.
    nextUnit: ['j', '`', 'down'],
    prevUnit: ['k', 'shift+`', 'up'],
    search: ['/', 'ctrl+shift+f', 'command+shift+f'],
    firstUnit: ['^', 'alt+1'], // TODO: check if ding sound on alt can be fixed
    lastUnit: ['$', 'alt+9', 'alt+0'],

    scrollDown: ['alt+j'],
    scrollUp: ['alt+k'],
    closeTab: ['x'],
    showHelp: ['h', 'alt+h']

    /*Note:
     Esc is defined in the escapeHandler(), and is used for two actions. Should shortcuts for those be made
     changeable. Possibly we won't allow Esc to be removed but allow adding alternatives for them?
     */

};
// Sets up the global shortcuts, that is ones that don't depend on the current webpage. E.g: shortcuts for
// back, forward, close tab, scroll up down, selecting next/prev unit, etc.
function _setupGlobalShortcuts() {

    // true is redundant here; used only to illustrate this form of the function call
    bind(globalShortcuts.nextUnit, selectNext, true);

    bind(globalShortcuts.prevUnit, selectPrev);

    bind(globalShortcuts.search, showSearchBox);

    bind(globalShortcuts.firstUnit, function(e) {
        selectUnit(0, true);
    });

    bind(globalShortcuts.lastUnit, function(e) {
        selectUnit($unitsArray.length - 1, true);
    });


    bind(globalShortcuts.scrollDown, scrollDown);
    bind(globalShortcuts.scrollUp, scrollUp);
    bind(globalShortcuts.closeTab, closeTab);

    bind(globalShortcuts.showHelp, showHelp);
}


/**
 * Sets up the shortcuts specified. Can be used to setup either page-specific or unit-specific shortcut depending on
 * whehter the 'type' is passed as "page" or "unit".
 * @param type
 */
function _setupSpecifiedShortcuts(type) {

    var shortcuts;
    if (type === "unit") {
        shortcuts = urlData && urlData.unit_shortcuts
    }
    else {
        shortcuts = urlData && urlData.page_shortcuts
    }

    if (shortcuts) {

        for (var key in shortcuts) {
            var shortcut = shortcuts[key];

            bind(shortcut.keys, invokeShortcut.bind(null, shortcut, type));

        }
    }
}

/**
 *
 * @param shortcut
 * @param {string} scope Can be either "page" or "unit"
 */
function invokeShortcut(shortcut, scope) {

    var fn,
        selectors,
        $selectedUnit = $unitsArray[selectedUnitIndex];

    // if shortcut has the 'fn' property specified, do the same thing whether scope is 'page' or 'unit'
    if (fn = shortcut.fn) {
        fn($selectedUnit, document);
    }

    else if (selectors = shortcut.selectors || shortcut.selector ) {
        var $scope;

        if (scope === 'unit') {
            $scope =  $unitsArray[selectedUnitIndex];
        }
        else  {
            $scope = $document;
        }

        if ($scope) {

            if (typeof selectors === 'string' ) {
                selectors = [selectors];
            }

            (function invokeSequentialClicks (selectorsArr) {

                if (selectorsArr.length) {
                    executeWhenConditionMet(

                        function() {
                            // for some reason DOM API's click() works well, but jQuery's doesn't seem to always
                            $scope.find(selectorsArr[0])[0].click();
                            selectorsArr.splice(0, 1);
                            invokeSequentialClicks(selectorsArr);
                        },
                        function() {
                            return $scope.find(selectorsArr[0]).length;
                        },
                        2000
                    );

                }

            })(selectors);

        }
    }

}

/**
 * Sets up the keyboard shortcuts.
 * Note: Because of the order in which shortcuts are set up, their priorities in case of a conflict are:
 * <global shortcuts> override <page-specific shortcuts> override <unit-specific shortcuts>
 * This order has been chosen since it favors consistency and hence minimizes confusion.
 */
function setupShortcuts() {

    // since this is invoked every time URL changes, first reset shortcuts and remove any divs created for chrome hack
    Mousetrap.reset();
    $topLevelContainer.find('.' + class_usedForChromeAltHack).remove();

    _setupSpecifiedShortcuts("unit");
    _setupSpecifiedShortcuts("page");
    _setupGlobalShortcuts();

    // TODO: should these be "unit specific" shortcuts
    bind (['o'], function() {
        openMainElement(); // open
    });

    // alt+o allows invoking only with one hand (at least in windows) //TODO: is alt+o a good idea? what about
    // reserving alt-based for browser action shortcuts
    bind (['alt+o', 'shift+o'], function() {
        openMainElement(true); // open in new tab
    });


}

var onKeydown = function (e) {

    var code = e.which || e.keyCode;

    if (!(e.altKey || e.ctrlKey|| e.ctrlKey) && $(document.activeElement).is($('input, textarea, select'))) {
        return;
    }

    if (code === 27) { //27 - esc
       //TODO: code "de-select" selected unit and/or exit search?
    }

    else if (code === 9) { // tab

        // if there is a selected unit, and no element of the page has focus, pressing tab
        // should focus the 'main' element of the unit.

        var docActiveEl = document.activeElement;

        if (selectedUnitIndex >= 0 &&
            !docActiveEl || $(docActiveEl).is(document) || $(docActiveEl).is('body, html')) {
            selectUnit(selectedUnitIndex, true);

            e.preventDefault();
        }
    }

    else if (code === 76) { // l
        if (!e.altKey && $(document.activeElement).is($('input[type="text"], textarea'))) {
            return;
        }

        e.stopImmediatePropagation();

        var tabEvent = $.Event('keydown');
        tabEvent.which = 65; // tab
        tabEvent.keyCode = 65; // tab
        $document.trigger(tabEvent);
        $(document.body).trigger(tabEvent);
        $(e.target).trigger(tabEvent);

    }
    else if (code === 72) { // h
        if (!e.altKey && $(document.activeElement).is($('input[type="text"], textarea'))) {
            return;
        }

        e.stopImmediatePropagation();
        var shiftTabEvent = $.Event('keydown');
        shiftTabEvent.which = 9; // tab
        shiftTabEvent.shiftKey = true;
        $document.trigger(tabEvent);
    }

    // TODO:handle cmd+shift+f below
    else if (code === 70 && e.ctrlKey && e.shiftKey) { // ctrl-shift-f

        e.stopImmediatePropagation();
        var shiftTabEvent = $.Event('keydown');
        shiftTabEvent.which = 9; // tab
        shiftTabEvent.shiftKey = true;
        $document.trigger(tabEvent);
    }

    else if (selectedUnitIndex >= 0) {
//        checkIfContextualShortcut(e);
    }


};

// handler for whenever an element on the page receives focus
// (and thereby a handler for focus-change events)
var onFocus = function(e) {

//    console.log('!!!!!on focus called');

    var el = e.target, $el;

    if ( ($el = $(el)).data('focusJustSet_OnSelectingUnit') ) {
        $el.data('focusJustSet_OnSelectingUnit', false);
    }
    else {

        var containingUnitIndex = getContainingUnitIndex(el);
        if (containingUnitIndex >= 0 && containingUnitIndex !== selectedUnitIndex) {
            selectUnit(containingUnitIndex, false);
        }
    }
};

var onMouseWheel = function (e) {

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

};

var onLtMouseBtnDown = function(e) {

    ltMouseBtnDown = true;

    var point = {x: e.pageX, y: e.pageY},
        $overlaySelected, $overlayHovered,
        containingUnitIndex;

    if ($unitsArray[selectedUnitIndex] &&
        ($overlaySelected = $unitsArray[selectedUnitIndex].data('$overlay')) &&
        (elementContainsPoint($overlaySelected, point))) {

        // do nothing
    }
    else  if ($unitsArray[hoveredUnitIndex] &&
        ($overlayHovered = $unitsArray[hoveredUnitIndex].data('$overlay')) &&
        (elementContainsPoint($overlayHovered, point))) {

        selectUnit(hoveredUnitIndex, false);

    }
    else if ( (containingUnitIndex = getContainingUnitIndex(e.target)) >= 0) {
        selectUnit(containingUnitIndex, false); // pass false to not change focus after selecting unit
    }
    else {
        deselectUnit();
    }

};

function onRtMouseBtnDown(e) {
    rtMouseBtnDown = true;
}

function onContextMenu(e) {

    if (scrolledWithRtMouseBtn) {
        e.preventDefault();
    }
}

function onMouseDown (e) {

    if (isRtMouseButton(e)) {
        return onRtMouseBtnDown(e);
    }
    else {
        return onLtMouseBtnDown(e)
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
    else {
        ltMouseBtnDown = false;
    }

}

// function to be called once the user "intends" to hover over an element
var onMouseOverIntent = function(e) {

    var point = {x: e.pageX, y: e.pageY};

    var $overlayHovered;
    if ($unitsArray[hoveredUnitIndex] &&
        ($overlayHovered = $unitsArray[hoveredUnitIndex].data('$overlay')) &&
        (elementContainsPoint($overlayHovered, point))) {

        return ; // unit already has hovered overlay; don't need to do anything

    }

    var unitIndex = getContainingUnitIndex(e.target);

    if (unitIndex >= 0) {

        hoverUnit(unitIndex);
    }

};

var onMouseOver = function(e) {

    var timeout_applyHoveredOverlay = setTimeout(onMouseOverIntent.bind(null, e), 150);
    $(e.target).data({timeout_applyHoveredOverlay: timeout_applyHoveredOverlay});
//    onMouseOverIntent(e);

};

var onMouseOut = function(e) {

    //clear any timeout set in onMouseOver
    var timeout_applyHoveredOverlay = $(e.target).data('timeout_applyHoveredOverlay');
    clearTimeout(timeout_applyHoveredOverlay);

    // upon any mouseout event, if a hovered overlay exists and the mouse pointer is found not be
    // contained within it, dehover it (set it as dehovered).
    var $overlayHovered;
    if ($unitsArray[hoveredUnitIndex] &&
        ($overlayHovered = $unitsArray[hoveredUnitIndex].data('$overlay')) &&
        (!elementContainsPoint($overlayHovered, {x: e.pageX, y: e.pageY}))) {

        dehoverUnit();

    }

};

var MutationObserver = MutationObserver? MutationObserver: WebKitMutationObserver;

mutationObserver = new MutationObserver (function(mutations) {
    console.log('dom changed. mutations: ', mutations);


    var mutationRecord,
        mutationsLen = mutations.length;
    for (var i = 0; i < mutationsLen; ++i) {

        if (canIgnoreMutation(mutations[i])) {
            mutations.splice(i, 1); // remove current mutation from the array
            --mutationsLen;
            --i;
        }

    }

    // if there are mutations left still
    if (mutations.length) {
        console.log("filtered mutations: ", mutations);
        onDomChange();
    }


});

var onWindowResize = function() {
    if (selectedUnitIndex >= 0) {
        selectUnit(selectedUnitIndex, false); // basically to redraw the overlay
    }
};


var onTransitionEnd = function(e) {

    var $overlay = $(e.target);

//  console.log('overlay transition ended. total overlays = ', $('.' + class_overlay).length);
    tryRecycleOverlay($overlay);

};

/**
 * Checks if the overlay element specified (as jQuery wrapper) is no longer in
 * use, and if so, marks it as available for future reuse.
 * @param $overlay
 */
var tryRecycleOverlay = function($overlay) {

    if (!$overlay.hasClass(class_overlay)) {
        console.warn("swiftly: Unexpected - $overlay doesn't have class '" + class_overlay + "'");
    }

    // check if the overlay is both in deselected and dehovered states
    if (!$overlay.hasClass(class_overlayHovered) && !$overlay.hasClass(class_overlaySelected)) {

        $overlay.hide();
        var $unit = $overlay.data('$unit');

        if ($unit) {
            $unit.data('$overlay', null);
        }
        else {
            console.warn("Swiftly: Unexpected - overlay's associated unit NOT found!");
        }

        $overlay.data('$unit', null);

        $unusedOverlaysArray.push($overlay);

    }
};

function onSearchBoxKeydown(e) {

    clearTimeout(timeout_search); // clears timeout if it is set

    if (e.type === 'keydown' || e.type === 'keypress') {

        var code = e.which || e.keyCode;

        if (code === 27) { // ESc

            closeSearchBox();
            e.stopImmediatePropagation();
            return false;
        }
        else  if (code === 13) { // Enter
            updateUnitsAndRelatedState();
            return false;
        }
        else if (code === 9) { // Tab
            if ($unitsArray.length) {
                selectUnit(0, true, true);
            }
            else {
                var $focusables = $document.find(focusablesSelector);
                if ($focusables.length) {
                    $focusables[0].focus();
                }
            }
            e.stopImmediatePropagation(); // otherwise the 'tab' is invoked on the unit, focusing the next element
            return false;
        }
    }

    // setting the time out below, in conjunction with the clearTimeout() earlier, allows search-as-you-type, while
    // not executing the search related code multiple times while the user is typing the search string.
    timeout_search = setTimeout (function() {

        updateUnitsAndRelatedState();

    }, 400);
}

function setupSearchUIAndEvents() {

    var $searchBox = $('<input id = "swiftly-search-box" class = "swiftly-reset-text-input" type = "text">')
            .addClass(class_addedBySwiftlyExtn),

        $closeButton = $('<span>&times;</span>') // &times; is the multiplication symbol
            .addClass(class_addedBySwiftlyExtn)
            .attr("id", "swiftly-search-close-icon");

    $searchContainer = $('<div id = "swiftly-search-container">')
        .addClass(class_addedBySwiftlyExtn)
        .append($searchBox)
        .append($closeButton)
        .hide()
        .appendTo($topLevelContainer);

    $searchContainer.css({top: -$searchContainer.outerHeight(true) + "px"}); // seems to work only after it's in DOM

    // attach reference to the global variable for easy access in the rest of the code
    $searchContainer.$searchBox = $searchBox;

    $searchBox.on('keydown paste input', onSearchBoxKeydown);

    $closeButton.click(closeSearchBox);

}


/*
On pressing Esc:
- When no unit is selected, blurs the active element and selects the "most sensible" unit
- When a unit is selected
    - if an editable element is active (and hence single key shortcuts can't be used), blurs the active element
    - else deselects the unit. (meaning a selected unit should be deselected a second time on pressing 'Esc' if not
      the first)
 */
function escapeHandler(e) {

    var code = e.which || e.keyCode;

    if (code === 27) { // ESc

        var activeEl = document.activeElement || document.body;

        if (selectedUnitIndex === -1) {
            activeEl.blur();
            var index = getContainingUnitIndex(activeEl);
            if (index >= 0) {
                selectUnit(index, true, true);
            }
            else {
                selectMostSensibleUnit(true, true);
            }

        }
        else if (isElementEditable(activeEl)) {
            activeEl.blur();
        }
        else {
            deselectUnit();
            dehoverUnit();
        }

    }

}

function setupSearchInExternalSite() {

    var keyHandler = function(e) {
        var selection;

        // If a kew is pressed while the left-mouse button is pressed down and some text is selected
        if (ltMouseBtnDown && (selection = document.getSelection().toString())) {

            if (e.type === 'keydown') {
                var code = e.which || e.keyCode;

                // the background script will determine which site to search on based
                chrome.extension.sendMessage({message: "searchExternalSite", selection: selection, keyCode: code});
            }

            suppressEvent(e); // for all types - keypress, keydown, keyup
        }
    };

    document.addEventListener('keydown', keyHandler, true);
    document.addEventListener('keypress', keyHandler, true);
    document.addEventListener('keyup', keyHandler, true);

}

var setupEvents = function() {

//    document.addEventListener('keydown', onKeydown, true);

    // this event should be done  before any binding any keydown/keypress/keyup events (including Mousetrap binds)
    setupSearchInExternalSite();

    document.addEventListener('keydown', escapeHandler, true);
    document.addEventListener('mousedown', onMouseDown, true);

    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('contextmenu', onContextMenu, true);

    document.addEventListener('DOMMouseScroll', onMouseWheel, false); // for gecko
    document.addEventListener('mousewheel', onMouseWheel, false);   // for webkit

    $document.mouseover(onMouseOver);
    $document.mouseout(onMouseOut);

    // Specifying 'focus' as the event name below doesn't work if a filtering selector is not specified
    // However, 'focusin' behaves as expected in either case.
    $document.on('focusin', focusablesSelector, onFocus);
    $(window).resize(onWindowResize);

    // TODO: for mutation observer:
    // fix mutation observer such that we selectively handle changes to attributes
    // (i.e. if 'display' value of "style" attribute is changed.

    // defined such that it observes additions/removals of dom elements  and change in
    // attributes, but not other changes like character data etc
    mutationObserver.observe(document, mutationObserverConfig);

    if (overlayCssHasTransition) {
        $document.on('transitionend transitionEnd webkittransitionend webkitTransitionEnd otransitionend oTransitionEnd',
            '.' + class_overlay, onTransitionEnd);
    }

};

function onDomReady() {

    if ( globalSettings.selectUnitOnLoad) {

        selectMostSensibleUnit(true, false);
    }
}

// don't need to wait till dom-ready. allows faster starting up of the extension's features
// (in certain sites at least. e.g. guardian.co.uk)
// this should not cause any issues since we are handling dom changes anyway.
(function initializeStateAndSetupEvents (){

    // we need the body to exist before we can set overlayCssHasTransition
    if (!document.body) {
        setTimeout(initializeStateAndSetupEvents, 100);
        return;
    }

    $topLevelContainer.appendTo(document.body);

    setupSearchUIAndEvents();

    overlayCssHasTransition = checkOverlayCssHasTransition(); // this needs to be set before we setup events
    setupEvents();

    $(onDomReady);

    onUrlChange(); // to initialize state for current url

})();


