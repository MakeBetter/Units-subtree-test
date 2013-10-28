
// We use this over jQuery's animated scroll, since we have more control this way, and we don't have another
// jQuery dependency (plus, it seemed it would be fun to do!). Also (in limited testing) this seemed faster.

_u.mod_smoothScroll = (function() {
    "use strict";

    /*-- Public interface --*/
    var thisModule = $.extend({}, _u.mod_pubSub, {
        smoothScroll: smoothScroll,
        isInProgress: isInProgress,
        endAtDestination: endAtDestination

    });

    // The variables below are related to the currently ongoing scroll animation.
    // Having them as globals (within the module)  allows step() to be defined as a global
    // function rather than an inner function of smoothScroll() (which means the function
    // object doesn't need to be created each time smoothScroll() is called)
    var element,                // element being scrolled
        scrollProp,             // the scroll property of the element to modify -- mostly 'scrollTop' or 'scrollLeft',
                                // but can be 'pageYOffset' or 'pageXOffset' if the element is `window`
        startPosition,          // scrollTop/scrollLeft position of the element at the time of animation beginning
        destination,            // final value of scrollTop/scrollLeft
        scrollingForward,       // true - if scroll direction is down/right; false - direction is rup/left
        speed,                  // speed of the current scroll animation (pixes/millisecs)
        inProgress,             // true if a scroll animation currently ongoing
        startTime,              // time the current animation was started
        maxDuration,            // max duration that this animation should end in
        onAnimationEnd,         // function to be called once the animation is over

        // This will later be set to one of: _setScrollProp, setPageYOffset, setPageXOffset
        // We do it this way for performance reasons (we want scrolling to be as smooth as possible)
        setScrollProp,
        _setScrollProp = function(value) {
            element[scrollProp] = value;
        },
        setPageYOffset = function(value) {
            window.scroll(window.pageXOffset, value);
        },
        setPageXOffset = function(value) {
            window.scroll(value, window.pageYOffset);
        };


    /**
     * Smooth scrolls the specified element by setting it's scrollTop/scrollLeft to the `destination` value
     * over `duration` millisecs.
     * If this function is called again before the previous animation is over, the previous animation is
     * instantly ended at it's desired destination.
     * @param elementToScroll The element whose scrollTop/scrollLeft (or pageYOffet/pageXOffset) property is to
     * be changed in smooth increments
     * @param {string} scrollProperty Specifies which scroll property to modify -- 'mostly 'scrollTop' or 'scrollLeft',
     * but can be 'pageYOffset' or 'pageXOffset' if the element is `window`
     * @param value Destination scrollTop value at the end of animation
     * @param duration Duration of smooth scroll animation (millisecs)
     * @param {Function} [callback] Optional. Function to be called once the animation is over
     */
    function smoothScroll(elementToScroll, scrollProperty, value, duration, callback) {
        if (inProgress) {
            endAtDestination(); // instantly terminate any ongoing animation at final destination before starting a new one
        }

        // Chrome (Canary) complains about `scrollTop` being deprecated on body (while it's value seems to
        // always be 0 in firefox), and documentElement.scrollTop seems to not work reliably on chrome, so
        if (elementToScroll === document.body || element === document.documentElement) {
            elementToScroll = window;
            if (scrollProperty === 'scrollTop'){
                scrollProperty = 'pageYOffset';
            }
            else {
                scrollProperty = 'pageXOffset';
            }
        }

        // if this was specified as window or changed to window above
        if (elementToScroll === window)
            setScrollProp = scrollProperty === 'pageYOffset'? setPageYOffset: setPageXOffset;
        else
            setScrollProp = _setScrollProp;

        element = elementToScroll;
        scrollProp = scrollProperty;
        destination = value;
        onAnimationEnd = callback;

        startPosition = element[scrollProperty];

        if (destination > startPosition) {
            scrollingForward = true;
        }
        else if (destination < startPosition) {
            scrollingForward = false;
        }
        else {
            endAtDestination();
            return;
        }

        inProgress = true;
        // TODO: we are using the following instead of the commented out line below
        // as a temporary fix for issue #77 (GitHub). It may be reverted once Chrome
        // fixes the underlying issue (Also remove the line `now = Date.now();` in
        // step() function at that point
        startTime = Date.now();
//        startTime = performance.now();
        maxDuration = duration;

        var totalDisplacement = destination - startPosition;
        speed = totalDisplacement/duration; // pixels per millisec

        requestAnimationFrame(step, elementToScroll);
    }

    function endAtDestination() {
        setScrollProp(destination);
        inProgress = false;
        onAnimationEnd && onAnimationEnd();
    }

    // a single animation step
    function step(now) {
        // TODO: The following line has been added  as a temporary fix for issue
        // #77 (GitHub). It may be reverted once Chrome fixes the underlying issue
        // (Also make the related change in assigning `startTime` in the function
        // smoothScroll() at that point
        now = Date.now();
        var nextPosition = Math.round(startPosition + (now - startTime) * speed);
        if (scrollingForward? (nextPosition >= destination): (nextPosition <= destination) ||
            now - startTime >= maxDuration) {

            endAtDestination();
        }
        else {
            setScrollProp(nextPosition);
            requestAnimationFrame(step, element);
        }
    }

    function isInProgress() {
        return inProgress;
    }
    return thisModule;

})();