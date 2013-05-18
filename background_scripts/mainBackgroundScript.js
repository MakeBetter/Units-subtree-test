(function(mod_settings, mod_getMainDomain) {

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {

            if (request.message === 'getSettings') {
                getSettings(request, sender, sendResponse);
            }
            else if (request.message === 'setIcon') {
                if (sender.tab.active) {
                    setIcon(request.isEnabled);
                }
            }
        }
    );

    // Whenever the active tab  or active window is changed, set the extension icon as enabled or disabled, as valid for the currently
    // active tab.
    chrome.tabs.onActivated.addListener(setCurrentTabIcon);
    chrome.windows.onFocusChanged.addListener(setCurrentTabIcon);
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
        if (changeInfo.url) {
           setCurrentTabIcon();
        }
    });


    function getSettings(request, sender, sendResponse) {
        (function sendResponseWhenReady() {
            if (mod_getMainDomain.publicSuffixMap) {
                var settings = mod_settings.getSettings(request.locationObj);
                sendResponse(settings);
            }
            else {
                setTimeout(sendResponseWhenReady, 100);
            }
        })();
    }

    /***
     * Gets the status of the currently active tab, and sets the extension icon appropriately
     */
    function setCurrentTabIcon() {

            // Get the status of the current tab.
            chrome.tabs.query({active: true, currentWindow:true}, function(tabs){
                var tabId = tabs[0] && tabs[0].id;
                chrome.tabs.sendMessage(tabId, {message: 'isContentScriptEnabled'}, function(response) {
                    // If no response received from the content script (for example, for a new tab), then the icon will be
                    // set to disabled. 
                    setIcon(response);
                });
            });
    }

    /***
     * Set the browser action icon of the extension as enabled or disabled
     * @param {boolean} isEnabled Status of the extension on the active tab
     */
    function setIcon(isEnabled) {
        var iconPath = isEnabled ? "icon.png" : "icon-disabled.png";

        chrome.browserAction.setIcon({
           path: iconPath
        });
    }

})(_u.mod_settings, _u.mod_getMainDomain);
