// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DDockPlusPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });

        // ------------------------------------------------------------- Downloads Stack
        const downloadsGroup = new Adw.PreferencesGroup({
            title: 'Downloads Stack',
            description: 'Display ~/Downloads folder contents directly in the dock',
        });

        const downloadsSwitch = new Adw.SwitchRow({
            title: 'Enable Downloads Stack',
            subtitle: 'Show Downloads stack item on the dock',
        });
        settings.bind('enable-downloads-stack', downloadsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        downloadsGroup.add(downloadsSwitch);

        const downloadsModeModel = Gtk.StringList.new(['Fan / List View', '4x6 Grid View']);
        const downloadsCombo = new Adw.ComboRow({
            title: 'View Mode',
            subtitle: 'Choose between curved arc Fan or 4x6 Grid layout',
            model: downloadsModeModel,
            selected: settings.get_string('downloads-view-mode') === 'grid' ? 1 : 0,
        });
        downloadsCombo.connect('notify::selected', () => {
            settings.set_string('downloads-view-mode', downloadsCombo.selected === 1 ? 'grid' : 'list');
        });
        downloadsGroup.add(downloadsCombo);
        page.add(downloadsGroup);

        // ------------------------------------------------------------- Documents Stack
        const documentsGroup = new Adw.PreferencesGroup({
            title: 'Documents Stack',
            description: 'Display ~/Documents folder contents directly in the dock',
        });

        const documentsSwitch = new Adw.SwitchRow({
            title: 'Enable Documents Stack',
            subtitle: 'Show Documents stack item on the dock',
        });
        settings.bind('enable-documents-stack', documentsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        documentsGroup.add(documentsSwitch);

        const documentsModeModel = Gtk.StringList.new(['Fan / List View', '4x6 Grid View']);
        const documentsCombo = new Adw.ComboRow({
            title: 'View Mode',
            subtitle: 'Choose between curved arc Fan or 4x6 Grid layout',
            model: documentsModeModel,
            selected: settings.get_string('documents-view-mode') === 'grid' ? 1 : 0,
        });
        documentsCombo.connect('notify::selected', () => {
            settings.set_string('documents-view-mode', documentsCombo.selected === 1 ? 'grid' : 'list');
        });
        documentsGroup.add(documentsCombo);
        page.add(documentsGroup);

        // ------------------------------------------------------------- Custom Folder Stack
        const customGroup = new Adw.PreferencesGroup({
            title: 'Custom Folder Stack',
            description: 'Display any custom directory contents in the dock',
        });

        const customSwitch = new Adw.SwitchRow({
            title: 'Enable Custom Folder Stack',
            subtitle: 'Show custom directory stack item on the dock',
        });
        settings.bind('enable-custom-stack', customSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(customSwitch);

        const customPathRow = new Adw.EntryRow({
            title: 'Custom Folder Path',
            text: settings.get_string('custom-folder-path'),
        });
        customPathRow.connect('changed', () => {
            settings.set_string('custom-folder-path', customPathRow.text.trim());
        });
        customGroup.add(customPathRow);

        const customModeModel = Gtk.StringList.new(['Fan / List View', '4x6 Grid View']);
        const customCombo = new Adw.ComboRow({
            title: 'View Mode',
            subtitle: 'Choose between curved arc Fan or 4x6 Grid layout',
            model: customModeModel,
            selected: settings.get_string('custom-folder-view-mode') === 'grid' ? 1 : 0,
        });
        customCombo.connect('notify::selected', () => {
            settings.set_string('custom-folder-view-mode', customCombo.selected === 1 ? 'grid' : 'list');
        });
        customGroup.add(customCombo);
        page.add(customGroup);

        window.add(page);
    }
}
