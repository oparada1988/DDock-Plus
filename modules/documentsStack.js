// SPDX-License-Identifier: GPL-3.0-or-later
// Documents Stack for DDock-Plus

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { FolderStackInstance } from './folderStackBase.js';

let stackInstance = null;

export function enable(gettext = (msg => msg), settings = null) {
    if (stackInstance)
        return;

    stackInstance = new FolderStackInstance({
        getFolderFile: () => {
            const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS) ??
                GLib.build_filenamev([GLib.get_home_dir(), 'Documents']);
            return Gio.File.new_for_path(path);
        },
        getTitle: () => gettext('Documents'),
        iconName: 'folder-documents',
        stripName: 'kiwi-documents-strip',
        buttonClass: 'kiwi-documents-item',
        getViewMode: () => (settings ? settings.get_string('documents-view-mode') : 'list'),
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
