/**
 * Implements the zen mode. Hide everything on the page except CUs, zenMode whitelisted elements and UnitsProj elements when
 * invoked. Restore the page when mode is switched off.
 */
_u.mod_zenMode = (function($, mod_CUsMgr, mod_keyboardLib, mod_mutationObserver, CONSTS) {
    "use strict";

    /*-- Public interface --*/
    var thisModule = $.extend({}, _u.mod_pubSub, {
        reset: reset, // reset the module (and disable it if applicable/required)
        setup: setup,   // (re) initialize the module
        toggle: toggle,
        start: start
    });

    var _isStarted = false, // true when zen mode is active/ started on a page
        _isStoppedByUser = false, // true if mode is explicitly stopped by user
        _isSupportedOnCurrentPage = false ,// Is evaluated by checking the currently present DOM elements on page. Value is
        // updated on DOM change.

        $style_whiteList,
        class_hidden = CONSTS.class_zenModeHidden,
        class_visible = CONSTS.class_zenModeVisible,
        class_addedByUnitsProj = CONSTS.class_addedByUnitsProj,
        expandedUrlData,
        zenModeAutoOn,
        mainContentSelector_include,
        mainContentSelector_exclude,

        $document;

    var $zenModeIndicator,
        id_zenModeIndicator = 'UnitsProj-zen-mode-indicator',
        $topLevelContainer = _u.$topLevelContainer;


    var timeout_updateZenMode = false;

    /*-- Module implementation --*/
    function reset() {
        $zenModeIndicator && $zenModeIndicator.remove();
        thisModule.stopListening();

        zenModeAutoOn = false;

        _isStarted = false;
        _isStoppedByUser = false;
        _isSupportedOnCurrentPage = false;

        timeout_updateZenMode = false;

    }

    function setup(settings) {
        reset();

        expandedUrlData = settings.expandedUrlData;

        // Do not setup this module if there are zen mode aware elements specified for current URL
        var CUs_specifier = expandedUrlData && expandedUrlData.CUs_specifier,
            mainContentSpecifier = expandedUrlData && expandedUrlData.page_mainContent;


        if (!(CUs_specifier || mainContentSpecifier)) {
            return;     // don't setup this module if no elements are specified to be shown in this mode.
        }

        // Cached global variables
        $document = $(document);
        zenModeAutoOn = settings.miscSettings && settings.miscSettings.zenModeAutoOn;

        if (mainContentSpecifier) {
            mainContentSelector_include = mainContentSpecifier.include || mainContentSpecifier;
            mainContentSelector_exclude = mainContentSpecifier.exclude;
        }

        // Setup keyboard shortcut for this module
        var miscShortcuts = settings.miscShortcuts;
        mod_keyboardLib.bind(miscShortcuts.toggleZenMode.kbdShortcuts, toggle);

        // Setup indicator UI to be shown on the page when zen mode is supported.
        setupZenModeUI();

        // On DOM mutation, update zen mode status for the current page.
        bindMutationEvents();

        // On CUs change event, update CUs for zen mode
        thisModule.listenTo(mod_CUsMgr, 'CUs-all-change', function() {
            if (_isStarted) {
                updateCUsState(); // Update the zen mode state for any added CUs (for sites where CUs get dynamically added
                // due to infinite scroll)
            }
        });

        // Update zen mode status the first time during setup.
        onDomMutations_updateZenModeStatus();

    }

    function onDomMutations_updateZenModeStatus() {
        if (!(( mod_CUsMgr.getAllCUs().length) || $document.find(mainContentSelector_include).length)) {
            _isSupportedOnCurrentPage = false;

            if ($zenModeIndicator[0].offsetHeight) {
                $zenModeIndicator.hide();
            }

            if (zenModeAutoOn) {
                stop();
            }

            return;
        }

        _isSupportedOnCurrentPage = true;

        // Show if not currently present on page
        if (!$zenModeIndicator[0].offsetHeight) {
            $zenModeIndicator.show();
        }

        if (zenModeAutoOn && !_isStoppedByUser) {
            start();
        }
    }

    function setupZenModeUI() {

        $zenModeIndicator = $("<div><span>Z</span></div>");

        $zenModeIndicator
            .attr('id', id_zenModeIndicator)
            .addClass(class_addedByUnitsProj)
            .appendTo($topLevelContainer)
            .hide();

        $zenModeIndicator.click(toggle);
    }


    // public function
    function toggle() {
        if (_isStarted) {
            stop(true);
        }
        else {
            start();
        }
    }

    function start() {
        // if the module was not set up initially, then do not start/stop the zen mode.
        if (!_isSupportedOnCurrentPage) {
            return;
        }

        if (!_isStarted) {
            _isStarted = true;
            _isStoppedByUser = false;

            $("body").addClass(class_hidden);
            $("." + class_addedByUnitsProj).addClass(class_visible);

            updateCUsState();

            if (mainContentSelector_include) {
                $style_whiteList = $('<style>' + mainContentSelector_include + '{visibility: visible;} ' +
                   '</style>');
                $('html > head').append($style_whiteList);
                $(mainContentSelector_include).addClass(class_visible); //class used in CSS
            }
        }
    }

    function stop(isUserInitiated) {
        if (_isStarted) {
            _isStarted = false;
            if (isUserInitiated) {
                _isStoppedByUser = true;
            }

            $("body").removeClass(class_hidden);
            $("." + class_addedByUnitsProj).removeClass(class_visible);

            updateCUsState();

            $style_whiteList && $style_whiteList.remove();
            $(mainContentSelector_include).removeClass(class_visible);
        }
    }

    function updateCUsState() {
        var CUs_all = mod_CUsMgr.getAllCUs(),
            $CU, $el;

        for (var i = 0; i < CUs_all.length; i++) {
            $CU = CUs_all[i];

            for (var j = 0; j < $CU.length; j++) {
                $el = $CU.eq(j);

                if (_isStarted) {
                    $el.addClass(class_visible);
                }
                else {
                    $el.removeClass(class_visible);
                }
            }
        }
    }

    function bindMutationEvents() {
        thisModule.listenTo(mod_mutationObserver, 'documentMuts_fallback', onDomMutations);
    }

    function onDomMutations() {
        // compare explicitly with false, which is how we reset it
        if (timeout_updateZenMode === false) {
            timeout_updateZenMode = setTimeout(_onDomMutations, 500);
        }
    }

    function _onDomMutations() {
        if (timeout_updateZenMode) {
            clearTimeout(timeout_updateZenMode);
            timeout_updateZenMode = false;    // reset
        }
        onDomMutations_updateZenModeStatus();
    }


    return thisModule;

})(jQuery, _u.mod_CUsMgr, _u.mod_keyboardLib, _u.mod_mutationObserver, _u.CONSTS);    // pass as input external modules that this modules depends on
