// SPDX-License-Identifier: GPL-3.0-or-later
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as CustomFolderStack from './modules/customfolderStack.js';
import * as DocumentsStack from './modules/documentsStack.js';
import * as DownloadsStack from './modules/downloadsStack.js';
import * as HideMinimizedWindows from './modules/hideMinimizedWindows.js';
import * as MinimizedToDock from './modules/minimizedToDock.js';
import * as DockOutline from './modules/dockOutline.js';

export default class DDockPlusExtension extends Extension {
    enable() {
        console.log(`[DDock-Plus] Enabling extension ${this.uuid}`);

        try {
            this._settings = this.getSettings('org.gnome.shell.extensions.ddock-plus');

            this._syncThumbnails();
            this._syncStacks();
            DockOutline.enable(this._settings);

            this._settingsSignal = this._settings.connect('changed', (settings, key) => {
                if (key.includes('stack') || key.includes('view-mode') || key.includes('custom-folder')) {
                    this._syncStacks();
                } else if (key === 'enable-minimized-thumbnails') {
                    this._syncThumbnails();
                }
            });
        } catch (e) {
            console.error(`[DDock-Plus] Error enabling extension: ${e}`);
        }
    }

    _safeGetBoolean(key, defaultValue = false) {
        if (!this._settings) return defaultValue;
        try {
            return this._settings.get_boolean(key);
        } catch (e) {
            return defaultValue;
        }
    }

    _syncThumbnails() {
        if (!this._settings) return;

        if (this._safeGetBoolean('enable-minimized-thumbnails', true)) {
            HideMinimizedWindows.enable();
            MinimizedToDock.enable();
        } else {
            MinimizedToDock.disable();
            HideMinimizedWindows.disable();
        }
    }

    _syncStacks() {
        if (!this._settings) return;

        // Downloads Stack
        if (this._safeGetBoolean('enable-downloads-stack', true)) {
            DownloadsStack.disable();
            DownloadsStack.enable(msg => this.gettext(msg), this._settings);
        } else {
            DownloadsStack.disable();
        }

        // Documents Stack
        if (this._safeGetBoolean('enable-documents-stack', true)) {
            DocumentsStack.disable();
            DocumentsStack.enable(msg => this.gettext(msg), this._settings);
        } else {
            DocumentsStack.disable();
        }

        // Custom Folder Stack
        let customPath = '';
        try {
            customPath = this._settings.get_string('custom-folder-path');
        } catch (e) {}

        if (this._safeGetBoolean('enable-custom-stack', false) && customPath) {
            CustomFolderStack.disable();
            CustomFolderStack.enable(msg => this.gettext(msg), this._settings);
        } else {
            CustomFolderStack.disable();
        }
    }

    disable() {
        console.log(`[DDock-Plus] Disabling extension ${this.uuid}`);

        try {
            if (this._settings && this._settingsSignal) {
                this._settings.disconnect(this._settingsSignal);
                this._settingsSignal = null;
            }
            this._settings = null;

            CustomFolderStack.disable();
            DocumentsStack.disable();
            DownloadsStack.disable();
            MinimizedToDock.disable();
            HideMinimizedWindows.disable();
            DockOutline.disable();
        } catch (e) {
            console.error(`[DDock-Plus] Error disabling extension: ${e}`);
        }
    }
}

