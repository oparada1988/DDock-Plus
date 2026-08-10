// SPDX-License-Identifier: GPL-3.0-or-later
// Custom Folder Stack for DDock-Plus

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { FolderStackInstance } from './folderStackBase.js';

let stackInstance = null;

export function enable(gettext = (msg => msg), settings = null) {
    if (stackInstance)
        return;

    stackInstance = new FolderStackInstance({
        getFolderFile: () => {
            const customPath = settings ? settings.get_string('custom-folder-path') : '';
            if (!customPath) return null;
            return Gio.File.new_for_path(customPath);
        },
        getTitle: () => {
            const customPath = settings ? settings.get_string('custom-folder-path') : '';
            if (!customPath) return gettext('Custom Folder');
            const file = Gio.File.new_for_path(customPath);
            return file.get_basename() || gettext('Custom Folder');
        },
        iconName: 'folder',
        stripName: 'kiwi-customfolder-strip',
        buttonClass: 'kiwi-customfolder-item',
        getViewMode: () => (settings ? settings.get_string('custom-folder-view-mode') : 'grid'),
        gettextFunc: gettext,
    });

    stackInstance.enable();
}

export function disable() {
    if (stackInstance) {
        stackInstance.disable();
        stackInstance = null;
    }
}

export function reloadFolder() {
    stackInstance?.reloadFolder();
}
