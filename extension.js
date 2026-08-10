// SPDX-License-Identifier: GPL-3.0-or-later
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as CustomFolderStack from './modules/customfolderStack.js';
import * as DocumentsStack from './modules/documentsStack.js';
import * as DownloadsStack from './modules/downloadsStack.js';
import * as DynamicMonitorSwitch from './modules/dynamicMonitorSwitch.js';
import * as HideMinimizedWindows from './modules/hideMinimizedWindows.js';
import * as MinimizedToDock from './modules/minimizedToDock.js';

export default class DDockPlusExtension extends Extension {
    enable() {
        console.log(`[DDock-Plus] Enabling extension ${this.uuid}`);

        try {
            this._settings = this.getSettings('org.gnome.shell.extensions.ddock-plus');

            this._syncThumbnails();
            this._syncMonitorSwitch();
            this._syncStacks();

            this._settingsSignal = this._settings.connect('changed', (settings, key) => {
                if (key.includes('stack') || key.includes('view-mode') || key.includes('custom-folder')) {
                    this._syncStacks();
                } else if (key === 'enable-minimized-thumbnails') {
                    this._syncThumbnails();
                } else if (key.includes('monitor-switch')) {
                    this._syncMonitorSwitch();
                }
            });
        } catch (e) {
            console.error(`[DDock-Plus] Error enabling extension: ${e}`);
        }
    }

    _syncThumbnails() {
        if (!this._settings) return;

        if (this._settings.get_boolean('enable-minimized-thumbnails')) {
            HideMinimizedWindows.enable();
            MinimizedToDock.enable();
        } else {
            MinimizedToDock.disable();
            HideMinimizedWindows.disable();
        }
    }

    _syncMonitorSwitch() {
        if (!this._settings) return;

        if (this._settings.get_boolean('enable-dynamic-monitor-switch')) {
            DynamicMonitorSwitch.disable();
            DynamicMonitorSwitch.enable(this._settings);
        } else {
            DynamicMonitorSwitch.disable();
        }
    }

    _syncStacks() {
        if (!this._settings) return;

        // Downloads Stack
        if (this._settings.get_boolean('enable-downloads-stack')) {
            DownloadsStack.disable();
            DownloadsStack.enable(msg => this.gettext(msg), this._settings);
        } else {
            DownloadsStack.disable();
        }

        // Documents Stack
        if (this._settings.get_boolean('enable-documents-stack')) {
            DocumentsStack.disable();
            DocumentsStack.enable(msg => this.gettext(msg), this._settings);
        } else {
            DocumentsStack.disable();
        }

        // Custom Folder Stack
        if (this._settings.get_boolean('enable-custom-stack') && this._settings.get_string('custom-folder-path')) {
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
            DynamicMonitorSwitch.disable();
            MinimizedToDock.disable();
            HideMinimizedWindows.disable();
        } catch (e) {
            console.error(`[DDock-Plus] Error disabling extension: ${e}`);
        }
    }
}
