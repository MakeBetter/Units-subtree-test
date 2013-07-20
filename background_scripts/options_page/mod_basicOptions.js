// JSHint Config
/* global mod_optionsHelper, _u, Mousetrap*/
/* exported mod_basicOptions */

var mod_basicOptions = (function(mod_commonHelper, mod_settings, mod_optionsHelper) {
    "use strict";

    /*-- Public interface --*/
    var thisModule = {
        render: render,
        setup: setup
    };

    // Misc Settings to be displayed in the basic settings UI
    var basicMiscSettings = {
        selectCUOnLoad: "Select Content Unit on page on load",
        keepSelectedCUCentered: "Keep selected CU centered on page",
        enhanceActiveElementVisibility: "Enhance the active element style",
        pageScrollDelta: "Page scroll delta"
    };

    var element_miscSettings = document.getElementById("misc-settings"),
        element_generalShortcuts = document.getElementById("general-keyboard-shortcuts"),


        class_editingHelpMessage = "input-help-message",
        class_kbdShortcut = "kbdshortcut",
        class_addShortcut = "add-shortcut",
        class_deleteShortcut = "delete-shortcut";

    function setup() {
        // Event handlers
        element_miscSettings.addEventListener("change", saveOptions_miscSettings);
        element_generalShortcuts.addEventListener("focusout", saveOptions_generalShortcuts);

        element_generalShortcuts.querySelector("table").addEventListener("click", onShortcutsTableClick);

//        document.getElementById("general-keyboard-shortcuts").addEventListener("mouseover", showContextualButtons);
//        document.getElementById("general-keyboard-shortcuts").addEventListener("mouseleave", hideContextualButtons);

//        document.getElementById("basic-options").addEventListener("input", showMessage_editingHelp);
//        document.addEventListener("focusout", hideMessage_editingHelp);

        element_generalShortcuts.addEventListener("focusin", showMessage_startKbdShortcutInput);
        element_generalShortcuts.addEventListener("keydown", captureKeyboardShortcut);

    }

    function getShortcutInputUI(kbdShortcut) {
        var kbdShortcutsHtml = "";
        kbdShortcutsHtml+= "<div class= '"+ class_kbdShortcut + "'>";
        kbdShortcutsHtml += "<input type='text' value='" + kbdShortcut + "'/>";
        kbdShortcutsHtml += "<span class='delete-button hidden " + class_deleteShortcut + "'>&times;</span></div>";

        var dummyElement = document.createElement("div");
        dummyElement.innerHTML = kbdShortcutsHtml;
        return dummyElement.firstElementChild;
    }

    function _render(settings) {

        var miscSettingsContainer = document.querySelector("#misc-settings>table"),
            generalShortcutsContainer = document.querySelector("#general-keyboard-shortcuts>table");

        // Reset contents
        miscSettingsContainer.innerHTML = '';
        generalShortcutsContainer.innerHTML = '';

        var tbody, tr, settingValue, innerHtml, key;

        tbody = document.createElement("tbody");

        for (key in basicMiscSettings) {

            tr = document.createElement('tr');
            tr.setAttribute("id", key);
            innerHtml = '<td>' + basicMiscSettings[key] + '</td>';

            settingValue = settings.miscSettings[key];

            if (typeof settingValue === "boolean") {

                innerHtml += "<td><input type='checkbox'" + (settingValue ? "checked" : "") + "/></td>";
            }
            else {
                innerHtml += "<td><input type='text' value='" + settingValue + "'</td>";
            }

            tr.innerHTML = innerHtml;
            tbody.appendChild(tr);
        }

        miscSettingsContainer.appendChild(tbody);


        // Populate general keyboard shortcuts
        var generalShortcuts = settings.generalShortcuts,
            shortcut;

        tbody = document.createElement("tbody");

        for (key in generalShortcuts) {
            shortcut = generalShortcuts[key];

            tr = document.createElement('tr');
            tr.setAttribute("id", key);

            innerHtml = '<td>' + shortcut.descr + '</td>';

            var kbdShortcuts, kbdShortcut, kbdShortcutsHtml = "";

            kbdShortcuts = shortcut.kbdShortcuts;
            for (var i = 0; i < kbdShortcuts.length; i++) {
                kbdShortcut = kbdShortcuts[i];
                kbdShortcutsHtml += getShortcutInputUI(kbdShortcut).outerHTML;
            }
            kbdShortcutsHtml += "<button class='hidden " + class_addShortcut+ "'> + </button>";

            innerHtml += "<td>" + kbdShortcutsHtml + "</td>";

            tr.innerHTML = innerHtml;
            tbody.appendChild(tr);
        }

        generalShortcutsContainer.appendChild(tbody);

    }

    function render() {
        mod_settings.getUserSettings(_render);
    }

    function getKeyboardShortcutsForRow(row) {
        var shortcutInputs = row.querySelectorAll("." + class_kbdShortcut + ">input"),
            shortcuts = [];

        for (var i = 0; i < shortcutInputs.length; i++) {
            var shortcut = shortcutInputs[i];
            shortcuts.push(shortcut.value);
        }

        return shortcuts;
    }

    function saveOptions_miscSettings(event) {
        var target = event.target;
        if (target.tagName.toLowerCase() !== "input") {
            return;
        }

        var parentRow = mod_optionsHelper.getClosestAncestorOfTagType(target, "tr");

        if (!parentRow) {
            return;
        }

        var settingKey = parentRow.id,
            settingValue;

        if (target.type.toLowerCase() == "checkbox") {
            settingValue = target.checked;
        }
        else {
            settingValue = target.value;
        }

        // Save settings
        var settings = mod_settings.getUserSettings(null, {getBasic: true});
        settings.miscSettings[settingKey] = settingValue;
        mod_optionsHelper.saveOptions(settings, "Option saved", _render);

    }

    function saveOptions_generalShortcuts(event) {
        var target = event.target;

        if (target.tagName.toLowerCase() !== "input") {
            return;
        }

        var parentRow = mod_optionsHelper.getClosestAncestorOfTagType(target, "tr");

        if (!parentRow) {
            return;
        }

        var value = target.value,
            targetOriginalValue = target.dataset.originalValue;

        // If no value is entered, then reset the UI. 
        if (!value) {
            
            // If the textbox has no previous associated shortcut, then remove this textbox from the UI.
            if (!targetOriginalValue) {
                removeContainingShortcutUI(target);
            }

            // Else, reset the value of the textbox with its original value
            target.value = targetOriginalValue;
            return;
        }

        var settingKey = parentRow.id;

        // Save settings
        var settings = mod_settings.getUserSettings(null, {getBasic: true});
        settings.generalShortcuts[settingKey].kbdShortcuts = getKeyboardShortcutsForRow(parentRow);
        mod_optionsHelper.saveOptions(settings, "Option saved");
    }


    function showMessage_editingHelp(event) {
        var target = event.target,
            messageElement = document.createElement("span");

        messageElement.classList.add(class_editingHelpMessage);
        messageElement.textContent = "Press enter or click outside the textbox to save.";

        var parent = target.parentElement;

        if (!parent.querySelectorAll("." + class_editingHelpMessage).length) {
            parent.appendChild(messageElement);
        }
    }

    function hideMessage_editingHelp(event) {
        var target = event.target,
            messageElement = target.nextElementSibling;

        if (messageElement && messageElement.classList.contains(class_editingHelpMessage)) {
            messageElement.remove();
        }
    }

    function showMessage_startKbdShortcutInput(event) {
        var target = event.target;
        target.setAttribute("data-original-value", target.value);
        target.value = "";
        target.setAttribute("placeholder", "Type a shortcut");
    }

    function captureKeyboardShortcut(event) {
        var target = event.target,
            targetValue = target.value,
            modifiers = Mousetrap.eventModifiers(event),
            characterTyped = Mousetrap.characterFromEvent(event);

        // If the character typed is one of the modifiers, then disregard the input
        if (!characterTyped || modifiers.indexOf(characterTyped) > -1) {
            return;
        }

        // For sequence shortcuts. Append the current typed shortcut to existing value
        if (targetValue) {
            targetValue += " ";
        }


        for (var i = 0; i < modifiers.length; i++) {
            var modifier = modifiers[i];
            targetValue += modifier + "+";
        }

        targetValue += characterTyped;

        target.value = targetValue;
        target.style.width = Math.max((target.value.length + 1) * 7, target.offsetWidth) + "px"; // Increase width of the
        // textbox if input very large.

        event.preventDefault();

    }

    function showContextualButtons(event) {
        console.log(event.target);
        var buttons, shortcutRow,
            query = "." + class_addShortcut + ", ." + class_deleteShortcut;
        if (event.target.tagName.toLowerCase() === "td") {
            shortcutRow = event.target.parentElement;
            buttons = shortcutRow.querySelectorAll(query);

            for (var i = 0; i < buttons.length; i++) {
                var button = buttons[i];
                button.classList.remove("hidden");
            }
        }
    }

    function hideContextualButtons(event) {
        var buttons, shortcutRow,
            query = "." + class_addShortcut + ", ." + class_deleteShortcut;
        if (event.target.tagName.toLowerCase() === "td") {
            shortcutRow = event.target.parentElement;
            buttons = shortcutRow.querySelectorAll(query);

            for (var i = 0; i < buttons.length; i++) {
                var button = buttons[i];
                button.classList.add("hidden");
            }
        }
    }

    function onShortcutsTableClick(event) {
        var target = event.target,
            parentRow = mod_optionsHelper.getClosestAncestorOfTagType(target, "tr"),
            settingKey = parentRow && parentRow.id,
            shortcutValue;


        if (target.classList.contains(class_addShortcut)) {
            showTextboxForAddingShortcut(parentRow);
            event.preventDefault();
        }
        else if (target.classList.contains(class_deleteShortcut)){
            deleteShortcut(target);
        }
    }

    function showTextboxForAddingShortcut(row) {
        var clone = getShortcutInputUI(""),
            input = clone.querySelector("input[type=text]"),
            addButton = row.querySelector("." + class_addShortcut);

        row.lastElementChild.insertBefore(clone, addButton);
        input.focus();

        return false;
    }

    function removeContainingShortcutUI(element) {
        var shortcutContainer = mod_optionsHelper.getClosestAncestorOfTagType(element, "div");

        shortcutContainer.remove();
    }

    function deleteShortcut(target) {
        var parentRow = mod_optionsHelper.getClosestAncestorOfTagType(target, "tr"),
            settingKey = parentRow.id,
            settings = mod_settings.getUserSettings(null, {getBasic: true});

        removeContainingShortcutUI(target);
        settings.generalShortcuts[settingKey].kbdShortcuts = getKeyboardShortcutsForRow(parentRow);

        mod_optionsHelper.saveOptions(settings, "Shortcut deleted", _render);
    }

    return thisModule;

})(_u.mod_commonHelper, _u.mod_settings, mod_optionsHelper);
