// JSHint config
/* global defaultSettings */
/* exported specialDomain_masterDomain_map */

/*
A note on the terms 'CU' and 'SU' that occur multiple times throughout this file:
 Often the most important content of a webpage (i.e the actual *content* excluding the header, footer, side bars,
 adverts) is composed of a set of repeating units. We call such a unit a Content Unit (CU). E.g. on the Google Search
 results page, each search result is a CU. Each CU is a logical unit of content, attention and navigation/access.
 In addition to these CUs, there can be many other types of important units on the page. We call them 'SU's (secondary units).
 SUs can generally be of two types:
 - ones occurring within each CU (e.g: 'like', 'share', etc links/buttons)
 - ones outside any CU, and generally applicable to the whole page itself (e.g: 'logout' link, search field, etc).
 */

/*
The object `defaultSettings.urlDataMap` (along with the 'specialDomain_masterDomain_map' object) provides a way to
map each URl to the data associated with it (which is called the `urlData` corresponding to that URL). [Currently, the
term "URL" is used to mean the part of the URL that is stripped of "http(s)://", etc].
Each `urlData` object identifies elements of importance on the webpage, including any "content units" (CUs), and the
associated keyboard shortcuts. The `urlData` also specifies any other information associated with the URL.

Notes:
1) Each key of the urlDataMap object is called a domain-key, and is the "main domain" for the corresponding
website, i.e. the topmost "registrable" domain based on the public suffix list (publicsuffix.org).

Exception: There may be some exception to the above rule. Example, "blogspot.com". Now, per the public suffix list,
blogspot.com is itself a public suffix (and so each first sub-domain of blogspot.com is a registrable domain and should
technically an be individual key in urlDataMap).
However, since all blogspot sub-domains have a similar markup format, we need them to map to the same key in the
urlDataMap object. For this we are using specialDomain_masterDomain_map - We use a regex that matches all valid blogspot URLs
and points to the "blogspot.com" key in the urlDataMap object.

2) If the value mapped to a domain-key is a string, that string is used as the domain-key instead. The "pointed to"
domain-key is called a "master domain". For example, google.com may be used as the master domain for google.co.in etc)

The value mapped to any master domain-key is an array. For an array with only one `urlData` object, the object may
directly be specified instead of the array.

A URL is mapped to a `urlData` object as follows. For any url, from among the array of `urlData` objects mapped
to its domain/master domain, the `urlData` object containing the first matching wildcard pattern/regexp is used.
(And so the "urlData" objects should be ordered accordingly. Eg: The urlData associated with a default/catch-all regexp
should be the last one specified.)

The regexps associated with a `urlData` object are specified using the `urlRegexp` property. Wildcard-like patterns
can also be specified using the `urlPatterns` property, as explained below:
They allow using *'s and @'s as "wildcards":
 - A '*' matches any combination of *zero or more* characters of *ANY* type.
 - A '**' matches any combination of *one or more* characters of *ANY* type.
- A '@' matches any combination of *one or more* characters that are not 'slashes' or 'periods'.

3) Only the part of the url after http(s):// is considered for matching with the provided patterns/regexps.

4) As is convention, a domain name is considered case insensitive, but the rest of the URL isn't

5) Regarding functions specified in the object:
i) They will run in the context of the content script
ii) Most functions will have access to a $CU type variable. If for any reason, the function needs to modify any
properties on it, it must be done indirectly using the jQuery data() function (so that it stays associated with
underlying DOM element(s), rather  than the jQuery set which changes whenever the CUs array is recalculated,
for instance on dom change. E.g: $CU.data('foo', bar) instead of $CU.foo = bar.

The data is structured this way because:
i) it enables efficient lookup (which is not a very big concern as such, but still). This is so, because this way the retrieval of the array of
urlData objects associated with a URL's domain takes O(1) time, and search for the specific urlData object matching
the URL is then restricted to the (very small) array.
ii) it results in better structure/organization compared to having arrays of regexps at the top level.

6) Anywhere a selector is specified, the extended set of jQuery selectors can be used as well.

7) // Guide for standard ("std_") items in urlData:
This applies to SUs and actions (both within page and CU levels), whose names begin with the prefix "std_"
These items need not specify keyboard shortcuts ('kdbShortcuts' property) and brief description ('descr' property).
This is the recommended policy for these items. In this case, the default shortcuts and description shall be applied
to these items. However, if it specifically makes sense in a given case, these values (one or both) should be provided
and they will override the defaults. Note: any keyboard shortcuts, if specified, will *replace* the default ones (as
opposed to supplementing them.) This allows complete control over what keyboard shortcuts are applied to a page.
 */
// TODO: format of each urlData to be explained along with various ways of specifying, and the various keys etc.
// TODO: maybe the formats can be explained at two levels - simple options and advanced ones
// One way of finding out all the properties that can be supplied to this object, is to search for urlData variable
// in the content scripts
defaultSettings.urlDataMap = {

    // this domain key serves only as an example illustrating the structure of a domain-key and value pair.
    "example.com": [
        {
            // If any one of the url-patterns or url-regexps listed below match the actual URL, the corresponding
            // object is considered to be a match. The first matching object found within a domain-key found is returned.
            urlPatterns: ["@.example.com/images/*, www.example.com/archive/images/*"],
            // Use regexps for cases where a simple url-pattern using '*' and '@' won't suffice, for example:
            urlRegexps: [/^www\.000-example\.com\/image|images$/],
            CUs_specifier: ".image, .post"  // NOTE: currently CUs within others CUs are removed
        },

        {
            urlPatterns: ["www.example.com/*"],
            urlRegexps: [], // since the array is empty this is redundant

            /*
             --------** NOTE ** The following comments are outdated. UPDATE THEM!! ----------
             There are two types of shortcuts that can be specified here: page-specific and CU-specific.
             Each shortcut is identified by a property that indicates its purpose, and has associated with it
             a set of keyboard shortcuts that invoke it. Each shortcut also has one of the  properties: 'selector'
             or 'fn'.

             If the 'selector' property is specified, and is a string, a click is invoked on the *first* element
             matching it within the page or the CU, depending on whether the shortcut is page or CU specific.
             If 'selector' specifies an array of selectors, the behavior is identical except that now a series of clicks
             will be invoked in order. (can be used to automate a sequence of clicks). If a pause is required after
             clicking an  element corresponding to a selector, before the element corresponding to the next selector
             can be found, it will be handled automatically)

             If, instead, the 'fn' property is used, it specifies a function that will be executed when the shortcut is
             invoked. The function is passed two arguments -- $selectedCU (which is the jQuery set
             consisting of the elements comprising the CU) and document

             [When using the 'fn' key, given that the functions for both page-specific and CU-specific shortcuts
             are passed the same arguments, it doesn't technically matter if the shortcut is defined as page
             specific or CU specific, except as a matter of good practice.]
             */

            // These are shortcuts on the page that the extension should NOT override
            protectedWebpageShortcuts: ["j", "k"],
            //TODO: consider allowing generalShortcuts etc to be specified here (or in a separate object)
            // if required to specify alternatives for protectedWebpageShortcuts. It will only ADD to the existing
            // list. Any removals should be done using `protectedWebpageShortcuts`?

            CUs_specifier:  {
                selector: ".foo .bar",
                exclude: ".advert"         // TODO: check if this is implemented
                //buildCUAround: ".unit-title" // This can be specified *instead*, If specifying a selector for a CU is not straightforward or possible,
                // then specify this. TODO: complete this.

                // If neither "selector", nor "buildCUAround" work, these can be used instead
                // first: ".heading",
                // last: ".comments",
            },
            CUs_style: {
                "overlayPadding": "5px",
                useInnerElementsToGetOverlaySize: false, // defaults to false; true is used in some sites like hacker news and reddit
                setOverlayZIndexHigh: true  // use high z-index for CU overlay
            },
            CUs_SUs: {
                std_mainEl: ".post_title",  // When a CU is selected, this identifies the element inside it that is given the initial focus (apart from allowing a shortcut to be specified to access it when a CU is selected)
                std_comment: ".comment",   // a "std_" SU can use the "shorthand" notation by directly specifying the selector here
                std_upvote: {
                    selector: ".upvote",   // if the "expanded" notation is used, the selector is specified here

                    // This following two keys are optional since this is a "std_" SU, but if one or both are
                    // specified, they will will override the default value
                    kbdShortcuts: ["u", "v"],
                    descr: "customized description.."
                },
                std_share: {
                    selector: ".share"
//                        kbdShortcuts: ["u", "v"]
                },

                // the following SU, which is not standard (i.e. "std_" prefixed) requires the "expanded" notation
                markAsRead: {
                    descr: "Mark as read",
                    selector: ".mark-read",
                    kbdShortcuts: ["r"]
                }
            },
            CUs_actions: {
                mouseoverOnCUSelection: true // Specifies if a mouseover event should be invoked on particular element on CU selection.
                // Can have 2 types of values: 1) true 2) ".selector"
                // If mouseoverOnSelection = true, mouseover is invoked on the CU itself (more specifically, $CU[0])
                // If mouseoverOnSelection = ".selector", we find element specified by ".selector" in the CU and invoke mouseover on it.
            },

            // the structure of this item matches that of CUs_SUs
            page_SUs: {
                std_searchField: {
                    selector: "#search"
//                    kbdShortcuts: ["/"]
                },
                std_header: {
                // Apart from being identified as an important unit on the page, it is sometimes helpful to specify a
                // header in order to ensure that a new CU, upon selection, is positioned correctly on the page.
                // This is applicable when the page has a fixed header (i.e. one that stays visible even as the page is
                // scrolled).
                // If there are multiple floating headers, specify all of them separated by commas. If you specify a
                // non fixed header, it will simply be ignored for the purpose of positioning the CU causing  any issues.
                    selector: "#header"
                },
                std_nextOrMore: {
                    selector: ".next"
                    //kbdShortcuts: ["g down"]   // this is optional for standard items (i.e. ones prefixed with "std_")
                }
            },
            // the structure of this item matches that of CUs_actions
            page_actions: {
                "std_onCUSelection": {
                    // NOTE: the urlData paratmenter is a deep clone the original
                    fn: function($selectedCU, document, urlData) {
                        // this code will execute whenever a CU is selected
                    }
                    //kbdShortcuts: null  // this is optional for standard items (i.e. ones prefixed with "std_")
                },
                "std_onCUDeselection": {
                    fn: function($deselectedCU, document, urlData) {
                        // this code will execute whenever a CU is deselected
                    }
                }
            },

           /* Specifies the main content on a page. Currently being used for zen mode.

            NOTE: The shorthand notation page_mainContent: "#article-container" can be used to directly specify the
            "selector" property.
            */

            page_mainContent: {
                selector: "#article-container", // selector the main content
                exclude: ".advert" // explicitly specified
            }
        },

        // Data object that will be shared with all URLs under this main domain.
        // More specifically, the matching URL data will extend the shared data to get the final data for a URL.
        {
            shared: "true",
            page_SUs: {
                std_logout: "#logout"
            }
        }
    ],
    "amazon.com": [
        {
            urlPatterns: ["www.amazon.com"],
            CUs_specifier: "#centerA, #centerB, .widget",
            CUs_SUs: {
                // TODO: these don't have any effect right now since they are not focusable (see #178)
                std_mainEl: ".s9TitleText, img"
            }
        },
        {
            urlPatterns: ["www.amazon.com/**"],
            CUs_specifier: ".celwidget, .widget, .unified_widget, .shoveler, .yshShoveler",
            CUs_SUs: {
                std_mainEl: "h3>a"
            }
        }
    ],

    "backbonejs.org":  {
        urlPatterns: ["backbonejs.org*"],
        CUs_specifier: {
            buildCUAround: ".container p:has(.header), h2",
        },
        CUs_style: {
            overlayPadding: "10px",
        }
    },

    "blogspot.com": {
        urlPatterns: ["*.blogspot.*"],
        CUs_specifier: ".post-outer",
        CUs_SUs: {
            std_mainEl: ".post-title a"
        },
        CUs_style: {
            overlayPadding: "5px"
        }
    },

    "craigslist.org": {
        // Matches delhi.craigslist.co.in, grenoble.fr.craigslist.fr, providence.craigslist.org etc.
        urlPatterns: ["*.craigslist.org/*", "*.craigslist.*/*"],
        CUs_specifier: ".row, .nextpage a",
        CUs_style: {
            overlayPadding: "8px",
            useInnerElementsToGetOverlaySize: true
        },
        CUs_SUs: {
            std_star: ".star"
        }
    },

    "indiatimes.com": [
        {
            urlPatterns: ["timesofindia.indiatimes.com/*"],
            page_mainContent: {
                selector: ".left_bdr",
                exclude: "#adhomepage, .ad1, #fr38650, .mTop10_c iframe, #adDiv," +
                    ".main_social, #populatecomment, #outbrain_widget_0, #height_cal, #main-div, #follow_srch, #slidshdiv, #fnt11ba"
            }
        },
        {
            // Example page: http://articles.timesofindia.indiatimes.com/2010-11-22/edit-page/28261930_1_cities-ndmc-lieutenant-governor
            urlPatterns: ["articles.timesofindia.indiatimes.com/*"],
            page_mainContent: {
                selector: "#area-center-w-left, #area-bottom",
                exclude: "#mod-ctr-lt-in-top, .mod-adcpc, #area-article-side"
            }

        },
        {
            urlPatterns: ["blogs.timesofindia.indiatimes.com/*"],
            page_mainContent: "#profileBlock"
        }
    ],

    "ebay.com": [
        {
            // for testing
            urlPatterns: ["www.ebay.com/electronics/cell-phone-pda"],
            CUs_specifier: "ul.e-fs-cnti>li"
        }
    ],

    "facebook.com": [
        {
            // Facebook main feed page
            urlPatterns: ["www.facebook.com", "www.facebook.com/?ref=logo", "www.facebook.com/groups/*", "www.facebook.com/hashtag/*"],
            CUs_specifier: ".genericStreamStory.uiUnifiedStory, ._6kq", //  ._6kq for the new layout
            CUs_SUs: {
                // The last selector in the following apply for the new FB layout (for eg: ._6k6, ._6k2 etc)
                "std_upvote": {kbdShortcuts: ["l", "u"],  selector: ".UFILikeLink,  ._6k6" },
                "std_comment": ".comment_link, ._6k2",
                "std_share": ".share_action_link, ._6j_",
                "std_viewComments": ".UFIPagerLink, .UFIBlingBoxCommentIcon, .prm:contains('Comment')", //.UFIPagerLink for "view more comments" link on both old and new layouts,
                // .UFIBlingBoxCommentIcon and .prm:contains('Comment')" for the comment icon on old and new layout respectively

                // We don't want to focus the following:
                // .highlightSelectorButton is the button on the top right of a post. We don't want it to be selected as
                // a main element. In some posts (such as the "suggested" posts), it is the first focusable in the post.

                // .photoRedesignLink is being applied to images that are part of an album. We don't want to select the
                // first image of albums on FB. See #174.
                //
                // .lfloat: Is applied to a left floating image in the shared content that has a supporting link on its right.
                // In such cases, we want the link to be focused/highlighted instead of the image (because the link is
                // the main shared content).
                // .shareRedesignContainer>a: Similar to the .lfloat case, except that here the image is on top, and the
                // shared link just below the image.
                // See screenshots in #175

                // NOTE: We can afford for these selectors to be non-optimized because these will be looked for inside $CU.
                // If these were meant for the entire page, then some of these would be very bad!

                std_mainEl: ".fbMainStreamAttachment a:first-child:not(.highlightSelectorButton, .fbQuestionPollForm a, ._4q5, .lfloat, .shareRedesignContainer>a), "  +
                    ".uiStreamAttachments a:not(.highlightSelectorButton, .fbQuestionPollForm a, ._4q5, .lfloat, .shareRedesignContainer>a), " +
                    ".uiStreamSubstory .pronoun-link, .shareText a, a.shareText, " +
                    "a._4-eo, ._6m3 a, a._52c6, a._6ki, a._6k_", // these are for the new FB layout

                std_seeMore: ".text_exposed_link>a"
            },
            page_SUs: {
                std_header: "#headNav",
            },
            page_mainContent: ".uiLayer, #pagelet_stream_pager"
        },
        {
            urlRegexps: [/^www\.facebook\.com(?!\/pages).+/], // Match all facebook.com* pages except of the type facebook.com/pages*
            CUs_specifier: "._4_7u .fbTimelineUnit",
            CUs_SUs: {
                "std_upvote": {kbdShortcuts: ["l", "u"],  selector: ".UFILikeLink" },
                "std_comment": ".comment_link",
                "std_share": ".share_action_link",
                //.UFIPagerLink for "view more comments", .mls for the comment icon, and .UFIBlingBoxTimelineCommentIcon for number next to comment icon
                "std_viewComments": ".UFIPagerLink, .mls, .UFIBlingBoxTimelineCommentIcon",
                std_mainEl: ".shareUnit a, .profilePicChangeUnit a, a.coverPhotoChangeUnit, .photoUnit a", // for the timeline page
                "seeMore": {kbdShortcuts: ["m"], selector: ".text_exposed_link>a", descr: "See more"}
            },
            page_SUs: {
                std_header: "#headNav, .stickyHeaderWrap", // #headNav is the main header, the latter is a dynamic header that sometimes shows up.
                std_nextOrMore: "a.uiMorePagerPrimary:contains('Show Older Stories')"
            }

        },
        {
            shared: "true",
            page_SUs: {
                std_logout: "#logout_form input[type=submit]"
            }
        }
    ],

    "feedly.com": {
        urlPatterns:["cloud.feedly.com*"],
        protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
    },

    "github.com": [

        {
            urlPatterns: ["github.com/*/commits/*"],
            CUs_specifier: ".js-navigation-item, .pagination>a:last-child"
        },
        {
            urlPatterns: ["github.com/*/issues/*", "github.com/*/issues?*"],
            CUs_specifier: {
                selector: ".js-navigation-item",
                mouseoverOnCUSelection: true
            },
            CUs_SUs: {
                std_mainEl: ".js-navigation-open",
                std_toggleSelection: ".select-toggle-check",
            }
        },
        {
            // Search in all repositories, Search in current repository:
            urlPatterns: ["github.com/search?*", "github.com/*/search?*"],
            CUs_specifier: ".source, .user-list-item, .code-list-item, .issue-list-item, .next_page",
            CUs_SUs: {
                std_mainEl: "h3 a, .user-list-info>a"
            },
            CUs_style: {
                overlayPadding: "5px"
            }
        },
        {
            urlPatterns: ["github.com", "github.com/organizations/*"],
            CUs_specifier: ".alert, .pagination>a",
            CUs_SUs: {
                std_mainEl: ".title>a:last-child"
            }
        },
        {
            shared: "true",
            page_SUs: {
                std_logout: "#logout"
            }
        },
    ],

    // the following key is redundant due to specialDomain_masterDomain_map array, but is included currently to serve
    // as an example
    "google.co.in": "google.com", // if the mapped value is a string, it is used as the key mapping to the actual value

    "google.com": [
        {
            // google search results page
            urlPatterns: ["www.google.@/*", "www.google.co.@/*"],
            urlRegexps: [], // since the array is empty this is redundant
            /*
             #res li.g: search result
             #brs: "related searches"
             #pnnext: "Next" link
             */
            CUs_specifier: "#res li.g, #brs, #pnnext",
            CUs_style: {
                "overlayPadding": "5px"
            },
            CUs_SUs: {
                /*std_mainEl: "a.l"*/
            },
            CUs_actions: {
//                // This feature has now been removed since google removed the "preview" feature
//                "toggle-preview": {
//                    kbdShortcuts: ["p"],
//                    // this function is meant to work in conjunction with std_onCUDeselection (see below)
//                    fn: function($selectedCU, document, urlData) {
//                        var $previewPane = $('#nycp');
//                        // Closes any open preview on the page.
//                        var closePreview = function() {
//                            if ($previewPane.is(':visible')) { // if the preview pane is already visible
//                                var closePreviewBtn = document.getElementById("nycx");
//                                closePreviewBtn &&  closePreviewBtn.click();
//                            }
//                        };
//                        // Shows preview associated with currently selected CU ($selectedCU)
//                        var showPreview = function() {
//                            var $previewButton = $selectedCU.find(".vspib");
//                            $previewButton.length && $previewButton[0].click();
//                        };
//                        if ($previewPane.is(':visible')) {
//                            closePreview();
//                        }
//                        else {
//                            showPreview();
//                        }
//                    }
//                }
            },
            page_SUs: {
                "within-last-year": {
                    descr: "Show results from last year",
                    kbdShortcuts: ["y"],
                    selector: ".q.qs:contains('Past year')"    // jQuery extensions to CSS selector syntax are supported
                }
            },
            page_actions: {
//                "std_onCUDeselection": {
//                    fn: function($deselectedCU, document, urlData) {
//                        if ($('#nycp').is(':visible')) { // if the preview pane is already visible
//                            var closePreviewBtn = document.getElementById("nycx");
//                            closePreviewBtn &&  closePreviewBtn.click();
//                        }
//                    }
//                }
            }
        },
        {
            // for scholar.google.co*
            urlPatterns: ["scholar.google.@/*", "scholar.google.co.@/*"],
            CUs_specifier: ".gs_r, #gs_n td:last-child",
            CUs_style:{
                overlayPadding: "5px 0 5px 5px"
//                useInnerElementsToGetOverlaySize: true
            },
            CUs_SUs: {
                std_mainEl: ".gs_rt>a"
            }
        },
        {
            // for Gmail
            urlPatterns: ["gmail.com*", "mail.google.com*"],
            protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
        },
        {
            shared: "true",
            page_SUs: {
                std_logout: "#gb_71"
            }
        }
    ],

    "hnsearch.com": [
        {
            urlPatterns: ["www.hnsearch.com/search*"],
            CUs_specifier: ".content-results-wrapper table", // .content-pagination a:contains('Next') main element
            // focus does not work because the link does not have an href. We need to implement a fake focus for such cases.
            CUs_SUs: {
                std_mainEl: ".content-result-subheader a:contains('on:')"
            },
            CUs_style: {
                overlayPadding: "5px"
            }
        }
    ],

    "linkedin.com": [
        {
            urlPatterns: ["www.linkedin.com/*"],
            CUs_specifier: "#my-feed-post .feed-item",
            CUs_style: {
                overlayPadding: "0 0 20px 0",
                setOverlayZIndexHigh: true
            },
            CUs_SUs: {
                std_mainEl: ".new-miniprofile-container a"
            }
        },
    ],

    // Experimental. Does not work well. 
    "medium.com": [
        {
            urlPatterns: ["medium.com", "medium.com/@"],
            CUs_specifier: ".post-item"
        }
    ],

    "nytimes.com": [
        {
            urlPatterns: ["www.nytimes.com/**"],
            page_mainContent: "#article"
        },
        {
            urlPatterns:["www.nytimes.com"],
            CUs_specifier: ".navigationHomeLede, .story, .headlinesOnly, .baseLayoutBelowFold .module>.column, .extendedVideoPlayerModule, #classifiedsWidget, #mostPopWidget, .tabbedBlogModule, .singleRule, #spanABTopRegion, #wsodMarkets"
//            CUs_specifier: ".column.last .columnGroup, #main .module .column, #insideNYTimesBrowser td"
        },
        {
            urlPatterns:["international.nytimes.com"],
            CUs_specifier: ".flush.primary, .story, .headlinesOnly, .baseLayoutBelowFold .module>.column, .extendedVideoPlayerModule, #classifiedsWidget, #mostPopWidget, .tabbedBlogModule, .singleRule, #spanABTopRegion, #wsodMarketsGlobalEditionHPModule"
//            CUs_specifier: ".column.last .columnGroup, #main .module .column, #insideNYTimesBrowser td"
        },
        {
            shared: "true",
            CUs_style: {
                overlayPadding: "2px"
            }
        }
    ],

    "pinterest.com": [
        {
            urlPatterns: ["www.pinterest.com"],
            CUs_specifier: ".item",
            CUs_style: {
                setOverlayZIndexHigh: true,
                highlightCUOnSelection: true
            }
        },
    ],

    "quora.com": [
        {
            urlPatterns: ["www.quora.com/search?*"],
            CUs_specifier: ".query_result, .results_page_add_question",
            CUs_SUs: {
            },
            CUs_style: {
                overlayPadding: "0 0 0 5px"
            }
        },
        {
            // URL pattern for a question page.

            // Matches patterns of type www.quora.com/*/* (where * is any character including a '/')
            // Does NOT match patterns of type www.quora.com/a/b where a is any word and be is one of 'home', 'about',
            // 'questions', 'new'. These are special pages in Quora, pertaining to a topic generally. These should be
            // handled by the CU selector for www.quora.com/* pattern (specified later).
            urlRegexps: [/^www\.quora\.com\/.+\/(?!about$|questions$|new$|home$).+/],
            CUs_specifier: {
                // .question.row: question
                // .main_col>div>.row .row: answer (on a regular question Quora page)
                // .answer_standalone>.row:first-child: answer (on a Quora question page that links to only one answer
                // (let's call such pages one-answer-shared-page), such as:
                // http://www.quora.com/Arvind-Kejriwal/Why-should-someone-vote-for-Arvind-Kejriwal/answer/Abhishek-Shrivastava)
                // .invite_to_answer: As evident, is the 'invite to answer' block
                selector: ".question.row, .main_col>div>.row .row, .invite_to_answer, .wiki_section, .answer_standalone>.row:first-child" /* Working well since May 2013*/
            },
            CUs_style: {
                overlayPadding: "2px 0 0 0"
            },
            CUs_SUs: {
                // .answer_wrapper .answer_user a.user: link to the user that has answered a question (inside an answer
                // unit). Specifying the .answer_wrapper is required to make sure that user links only inside answer units are
                // selected (and not those inside question units).
                // .question_link: link to the question. Used in the one-answer-shared-page.
                std_mainEl: ".question_link, .answer_wrapper .answer_user a.user, .topic_name",
            }
        },
        {
            urlPatterns: ["www.quora.com", "www.quora.com/?share=1"], // The first two patterns match
            // with the main quora feed page.
            CUs_specifier: /*".feed_item, .announcement, .pager_next.action_button"*/  ".e_col.p1.w4_5, .feed_item.row.p1, .row.w5.profile_feed_item",
            // the first selector for quora main page (and a few others), the second one for a page like this one:
            // http://www.quora.com/Front-End-Web-Development
            CUs_SUs: {
                // because Quora has many different kinds of units (and units with the same classes across units),
                // it is important to have the main element data be very specific. otherwise, incorrect/ unexpected
                // main elements will get selected.
                std_mainEl: "a.question_link, h2.board_item_title a, .meta_feed_item a.topic_name, .meta_item_text>a.user",

            },
            CUs_style: {
                overlayPadding: "0 0 0 5px"
            }
        },
        {
            // For a "topic" page such as http://www.quora.com/Front-End-Web-Development or a "question" page such as
            // http://www.quora.com/What-is-the-most-amazing-photo-you-have-ever-taken

            // NOTE: For now, we have pretty much combined the selectors of the feed/ topic page and the question page.
            urlPatterns: ["www.quora.com/@"],
            CUs_specifier: ".question.row, .main_col>div>.row .row, .invite_to_answer, .wiki_section, .e_col.p1.w4_5, .feed_item.row.p1, .row.w5.profile_feed_item",
            CUs_SUs: {
                std_mainEl: ".answer_user>span>a.user, a.question_link, h2.board_item_title a, .meta_feed_item a.topic_name, .meta_item_text>a.user",
            }
        },
        // Same as the URL pattern for the main feed page
        // TODO: check if this data is needed.
        {
            urlPatterns: ["www.quora.com/*"], //
            CUs_specifier: ".e_col.p1.w4_5, .feed_item.row.p1, .row.w5.profile_feed_item",
            CUs_SUs: {
                std_mainEl: "a.question_link, h2.board_item_title a, .meta_feed_item a.topic_name, .meta_item_text>a.user",
            },
            CUs_style: {
                overlayPadding: "0 0 0 5px"
            }
        },
        // Data shared by all pages
        {
            shared: "true",
            page_SUs: {
                std_logout: ".logout a:contains('Logout')",
                std_header: ".fixed_header.header"
            },
            CUs_SUs: {
                std_seeMore: ".more_link",
                "std_share": ".share_link",
                "follow": {
                    selector: ".follow_question",
                    kbdShortcuts:["shift+f"],
                    descr: "Follow"
                },
                "std_viewComments": {
                    kbdShortcuts: ["c", "v c"],
                    selector: ".view_comments"
                },
                "std_upvote": ".add_upvote, .remove_upvote, .rate_up",
                "std_downvote": ".add_downvote, .remove_downvote, .rate_down",
            },
        }
    ],

    // only support on the main page
    "reddit.com": [
        {
            // There is no straighforward CU_specifier selector for the comments page. It used to work well with
            // buildUnitAround using (".arrow.up") but seems to have recently stopped to work. There's likely work needed
            // in the buildUnitAround code.
            urlPatterns: ["www.reddit.com/*/comments/*"],
            protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]

        },
        {
            urlPatterns: ["www.reddit.com", "www.reddit.com/?*", "www.reddit.com/r/*", "www.reddit.com/@"],
            CUs_specifier: {
                selector: ".sitetable>div.thing, .nextprev a[rel='nofollow next']" //works well. doesn't include the promoted article.
            },
            CUs_style: {
                useInnerElementsToGetOverlaySize: true,
                "overlayPadding": "5px 10px 5px 0"
            },
            CUs_SUs: {
                std_mainEl: "a.title",
                "std_viewComments": {kbdShortcuts: ["c", "v c"], selector: ".flat-list.buttons .comments"},
                "hide": {kbdShortcuts: ["h"],  selector: ".hide-button a" },
                "save": {kbdShortcuts: ["shift+s"], selector: ".save-button a"}
            }
        },
        {
            shared: "true",
            page_SUs: {
                std_logout: ".logout a:contains('logout')"
            },
            CUs_SUs: {
                "std_upvote": ".arrow.up, .arrow.upmod",
                "std_downvote": ".arrow.down, .arrow.downmod",
                "std_share": ".share-button .active",
                "hide": {kbdShortcuts: ["h"],  selector: ".hide-button" },
                "report": {kbdShortcuts: ["r"],  selector: ".report-button" },
            }
        },
    ],

    "scribd.com": [
        {
            urlPatterns: ["www.scribd.com/*"],
            page_mainContent: "#document_column, .sticky_bar"
        }
    ],

    "theguardian.com": [
        {
            urlPatterns: ["www.theguardian.com/**"],
            page_mainContent: "#article-header, #content, .share-links.b3"
        }
    ],

//    "coffitivity.com": [
//        {
//            urlPatterns: ["coffitivity.com"],
//            CUs_specifier: ".content, .audiocontroller",
////            CUs_style: {
////                useInnerElementsToGetOverlaySize: true,
////                "overlayPadding": "10px 5px 50px 0px"
////            },
//        }
//    ],

    // Sites included: "*.stackexchange.com", "stackoverflow.com", "superuser.com", "serverfault.com", "stackapps.com",
    // "askubuntu.com"
    // Also, "meta.stackoverflow.com", "meta.superuser.com","meta.stackoverflow.com", etc.

    //StackExchange powered sites included: "mathoverflow.net"
    "stackexchange.com": [
        {
            urlPatterns: ["stackoverflow.com/about"],
            CUs_specifier: ".content-page>div",
            CUs_style: {
                useInnerElementsToGetOverlaySize: true,
                "overlayPadding": "10px 10px 50px 10px"
            },
        },
        {
            // Pages with lists of questions
            // Examples: http://stackoverflow.com/questions, http://stackoverflow.com/questions/tagged/perl,
            // http://stackoverflow.com/
            urlPatterns: ["*.stackexchange.com/questions", "*.stackexchange.com/questions/tagged*",
                "*.stackexchange.com", "*.stackexchange.com/search?*", "*.stackexchange.com/?tab=@"],
            urlRegexps: [/^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)\/questions$/,
                /^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)\/questions\/tagged\//,
                /^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)$/,
                /^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)\/search?/,
                /^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)\/\?tab=[^\\.\/]+/,

                /^(meta\.)?(mathoverflow\.net)\/questions$/,
                /^(meta\.)?(mathoverflow\.net)\/questions\/tagged\//,
                /^(meta\.)?(mathoverflow\.net)\/$/],
            CUs_specifier: ".question-summary, a[rel='next']"
        },
        {
            // Pages with answers to a specific question
            // Example: http://stackoverflow.com/questions/5874652/prop-vs-attr
            urlPatterns: ["*.stackexchange.com/questions/*"],
            urlRegexps: [/^(meta\.)?(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)\/questions\//],
            CUs_specifier: ".question, .answer",
            CUs_style: {
                "overlayPadding": "0 5px 0 5px"
            },
            CUs_SUs: {
                "std_upvote": ".vote-up-off",
                "std_downvote": ".vote-down-off",
                "std_share": ".short-link",
                "std_edit": ".suggest-edit-post",
                "std_comment": ".comments-link",
                "star": {kbdShortcuts: ["r"],  selector: ".star-off", descr: "Star question"}

            },
            CUs_actions: {

            }
        },
        {
            urlRegexps: [/^(meta\.)?(mathoverflow\.net)\/questions\//],
            CUs_specifier: "#question, .answer",
            CUs_style: {
                "overlayPadding": "0 5px 0 5px"
            },
            CUs_SUs: {
                //TODO: specify shortcuts for MathOverflow.
//                   "std_upvote": {keys: ["u"],  selector: ".vote-up-off" },
//                   "std_downvote": {keys: ["d"],  selector: ".vote-down-off" },
//                   "std_share": {keys: ["s"],  selector: ".short-link" },
//                   "edit": {keys: ["e"],  selector: ".suggest-edit-post" },
//                   "add_comment": {keys: ["c"],  selector: ".comments-link" },
//                   "star": {keys: ["r"],  selector: ".star-off" }
            },
            CUs_actions: {

            }

        },
        {
            shared: "true",
            page_SUs: {
                std_logout: [".profile-triangle", ".profile-links a:contains('log out')"] // DOES NOT WORK
            }
        }
    ],

    "stackoverflow.com": "stackexchange.com",
    "superuser.com": "stackexchange.com",
    "serverfault.com": "stackexchange.com",
    "stackapps.com": "stackexchange.com",
    "askubuntu.com": "stackexchange.com",
    "mathoverflow.net" : "stackexchange.com",

    "techcrunch.com": {
        urlPatterns: ["techcrunch.com/*"],
        CUs_specifier: {
            selector: ".top-featured-posts, .post, #paging-below .page-next>a, #paging-below .page-prev>a",
        },
        CUs_style: {
            overlayPadding: "0 10px"
        },
        CUs_SUs: {
            std_mainEl: "h2.headline>a, .featued-post-description .featured-post-link",
        },
        page_SUs: {
            std_header: '#module-header>.top-container',
            std_nextOrMore: ".page-next>a"
        }
    },

    "thehindu.com": [
        {
            urlPatterns: ["www.thehindu.com/**"],
            page_mainContent: "#left-column"
        }
    ],


    "twitter.com": [
        {
            urlPatterns: ["twitter.com/*"], // works on all pages of twitter. Relevant URLS:  main feed page, user page, tweet page
    //        protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
            CUs_specifier: {
                // .inline-reply-tweetbox: Reply to tweet container
                // .view-more-container: "View more in conversation" link container
                // .js-actionable tweet: All tweets (Main tweets + response tweets that show when the main tweet is expanded)
                selector: ".js-actionable-tweet, .stream-user-gallery, .inline-reply-tweetbox, .view-more-container"
            },
            CUs_SUs: {
                std_mainEl: '.js-details',
                reply: {
                    selector: '.js-action-reply',
                    kbdShortcuts: ["r"],
                    descr: "Reply"
                },
                retweet: {
                    selector: '.retweet',
                    kbdShortcuts: ["t"],
                    descr: "Retweet"
                },
                favorite: {
                    selector: '.favorite, .unfavorite',
                    kbdShortcuts: ["v"],
                    descr: "Favorite/ Un-favorite"
                },
                expand: {
                    selector: '.js-details',
                    kbdShortcuts: ["e"],
                    descr: "Expand/ Collapse"
                },
                std_profile: '.js-user-profile-link'

            },
            page_SUs: {
                std_header: ".global-nav"
            },
        },
        {
            shared: "true",
            page_SUs: {
                std_logout: "#signout-button"
            }
        }
    ],

    "underscorejs.org": [
        {
            urlPatterns: ["underscorejs.org/*"],
            CUs_specifier: {
                buildCUAround: "#documentation p:has(.header), h2",
            },
            CUs_style: {
                overlayPadding: "10px"
            }
        }
    ],

    "urbandictionary.com": {
        urlPatterns: ["*.urbandictionary.com*"],
        CUs_specifier: {
            buildCUAround: "td.index"
        }
    },

    "washingtonpost.com": [
        {
            urlPatterns: ["www.washingtonpost.com", "www.washingtonpost.com/regional"],
            CUs_specifier: ".module:not(.right-rail, .hot-topics)", // :not can have comma within in jQuery's extensions to CSS selectors
            CUs_SUs: {
                std_mainEl: ".headline>a, h2>a"
            }
        },
        {
            urlPatterns: ["www.washingtonpost.com/**"],
            page_mainContent: {
                selector: "#content[role=main], #article-leaf-page>.main-content",
                exclude: "#header-v3, #wpni_adi_inline_bb, #article-side-rail, #article-leaf-page-footer-taboola, #echo_container_a"
            }
        }
    ],

    "yahoo.com": [
        {
            urlPatterns: ["www.yahoo.com"],
            CUs_specifier: ".main-story, #stream li, .voh-parent-wrapper, .app",
            CUs_style: {
                setOverlayZIndexHigh: true
            }
        }
    ],

    "ycombinator.com": [
        {
            urlPatterns: ["news.ycombinator.com/item*"],
            CUs_specifier: {
                buildCUAround: "center>a" // upvote link
            },
            CUs_SUs: {
                std_mainEl: ".comhead>a, td.title>a", // commenter's name and shared post's title
                std_comment: {
                    selector: "a:contains('reply')",
                    descr: "Reply",
                    kbdShortcuts: ["r", "c"]
                },
                std_upvote: "center>a"
            }
        },
        {
            urlPatterns: ["news.ycombinator.com*"],
            CUs_specifier: {
                buildCUAround: "td.title>a"
            },
            CUs_style: {
                useInnerElementsToGetOverlaySize: true,
                "overlayPadding": "3px 6px 3px 0"
            },
            CUs_actions: {

            },
            CUs_SUs: {
                "std_mainEl": "td.title>a",
                "std_viewComments": {
                    kbdShortcuts: ["c", "v c"], // overridden to add additional shortcut
                    selector: "a:contains('comment'), a:contains('discuss')"
                },
                "std_upvote": "td:nth-child(2)>center>a"
            }
        }
    ],


    "youtube.com": [
        {
            urlPatterns: ["www.youtube.com/results*"],
            urlRegexps: [],
            protectedWebpageShortcuts: [],
            CUs_specifier:  {
                selector: ".primary-col li"
            },
            CUs_SUs: {
                std_mainEl: ".yt-uix-tile-link"
            }
        },
        {
            urlPatterns: ["www.youtube.com/user/*"],
            CUs_specifier: ".channels-content-item, .c4-spotlight-module, .expanded-shelf-content-item-wrapper",
            CUs_SUs: {
                std_mainEl: ".yt-uix-tile-link, .title>a"
            },
            CUs_style: {
                overlayPadding: "0 0 4px 0"
            },
        },
        {
            urlPatterns: ["www.youtube.com/channel/*"],
            CUs_specifier: ".c4-welcome-primary-col, .feed-item-snippet, .expanded-shelf-content-item, " +
                ".feed-list-item, .yt-shelf-grid-item",
            CUs_SUs: {
                std_mainEl: ".yt-uix-tile-link, .yt-ui-ellipsis a"
            },
            CUs_style: {
                overlayPadding: "0 0 4px 0"
            },
        },
        {
            urlPatterns: ["www.youtube.com/*"],
            CUs_specifier: ".feed-list-item",
            CUs_SUs: {
                std_mainEl: ".feed-item-content a:not(.g-hovercard>a, .g-hovercard), .content-item-detail a, " +
                    "a.yt-uix-tile-link, a.yt-uix-redirect-link"
            },
            CUs_style: {
                overlayPadding: "" // some negative margin-top would be nice to apply.
            }
        },
        {
            shared: "true",
            page_SUs: {
                "upvote": {
                    selector: "#watch-like",
                    kbdShortcuts:["u"],
                    descr: "Like video"
                },
                "downvote": {
                    selector: "#watch-dislike",
                    kbdShortcuts:["d"],
                    descr: "Dislike video"
                },
                std_comment: ".comments-textarea-container textarea"
            }
        }
    ],

    //Data that may need to be removed for friend release. 1) These sites are either not very commonly known. 2) They are
    // experimental and not well supported by Units.
    "sulekha.com": {
        urlPatterns: ["*.sulekha.com/*"],
        CUs_specifier: {
            selector: ".sul_result_container"
        }
    },
    "team-bhp.com": {
        urlPatterns: ["*.team-bhp.com/*"],
        CUs_specifier: {
            selector: ".box>table tr"
        }
    },

    // pages that have their own units.

//    "github.com": {
//        urlPatterns: ["github.com/*"],
//        protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
//    },

     "duckduckgo.com": {
        urlPatterns: ["duckduckgo.com/*"],
        protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
    },

//     "delicious.com": {
//        urlPatterns: ["delicious.com/*"],
//        protectedWebpageShortcuts: ["j", "k", "g", "o", "f", "n"]
//    },




};

// this array allows mapping a special domain to the corresponding "master domain"
var specialDomain_masterDomain_map = [
    {
        // to match domains like google.fr, google.co.in, google.co.uk etc (in addition to google.com, the matching of
        // which is superfluous here as it is the "master domain" key.)
        regexp: /^google\.(?:com|((?:co\.)?[a-z]{2}))$/,
        masterDomainKey: "google.com"
    },
    {
        regexp: /craigslist\.(?:org|((?:co\.)?[a-z]{2}))$/,
        masterDomainKey: "craigslist.org"
    },

    {
        // Match domains *.blogspot.com, *.blogspot.in etc. NOTE: Blogspot is an exception domain because it is registered
        // as a "public suffix". See comments near the top of this file for more details.
        regexp: /blogspot\.(?:com|((?:co\.)?[a-z]{2}))$/,
        masterDomainKey: "blogspot.com"
    }
//    {
//        regexp: /^(stackoverflow\.com|superuser\.com|serverfault\.com|stackapps\.com|askubuntu\.com)/,
//        masterDomainKey: "stackexchange.com"
//    },
//    {
//        regexp: /^(mathoverflow\.net)/,
//        masterDomainKey: "stackexchange.com"
//    }
];
