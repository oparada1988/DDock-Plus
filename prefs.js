// SPDX-License-Identifier: GPL-3.0-or-later
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DDockPlusPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.ddock-plus');
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

        const customFolderRow = new Adw.ActionRow({
            title: 'Custom Folder',
        });

        const updateCustomFolderSubtitle = () => {
            const currentPath = settings.get_string('custom-folder-path');
            if (currentPath) {
                const file = Gio.File.new_for_path(currentPath);
                customFolderRow.set_subtitle(file.get_basename() || currentPath);
            } else {
                customFolderRow.set_subtitle('No Folder Selected');
            }
        };
        updateCustomFolderSubtitle();

        const selectFolderBtn = new Gtk.Button({
            label: 'Select Folder',
            valign: Gtk.Align.CENTER,
        });
        selectFolderBtn.connect('clicked', () => {
            const dialog = new Gtk.FileChooserNative({
                title: 'Select Custom Folder',
                transient_for: window,
                action: Gtk.FileChooserAction.SELECT_FOLDER,
                modal: true,
            });

            dialog.connect('response', (d, responseId) => {
                if (responseId === Gtk.ResponseType.ACCEPT) {
                    const file = d.get_file();
                    if (file) {
                        settings.set_string('custom-folder-path', file.get_path());
                        updateCustomFolderSubtitle();
                    }
                }
                d.destroy();
            });

            dialog.show();
        });

        customFolderRow.add_suffix(selectFolderBtn);
        customFolderRow.set_activatable_widget(selectFolderBtn);
        customGroup.add(customFolderRow);

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

        // ------------------------------------------------------------- Window Thumbnails
        const thumbnailsGroup = new Adw.PreferencesGroup({
            title: 'Minimized Windows',
            description: 'Park thumbnails of minimized windows in the dock',
        });
        const thumbnailsSwitch = new Adw.SwitchRow({
            title: 'Enable Window Thumbnails',
            subtitle: 'Park thumbnails of minimized windows in macOS style',
        });
        settings.bind('enable-minimized-thumbnails', thumbnailsSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        thumbnailsGroup.add(thumbnailsSwitch);
        page.add(thumbnailsGroup);

        // ------------------------------------------------------------- Dynamic Monitor Switch
        const monitorGroup = new Adw.PreferencesGroup({
            title: 'Dynamic Monitor Switch',
            description: 'Automatically move dock to display when mouse cursor rests at display edge',
        });
        const monitorSwitch = new Adw.SwitchRow({
            title: 'Enable Dynamic Monitor Switch',
            subtitle: 'Move dock to display when mouse rests at screen edge',
        });
        settings.bind('enable-dynamic-monitor-switch', monitorSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        monitorGroup.add(monitorSwitch);

        const delayRow = new Adw.ActionRow({
            title: 'Switch Delay (seconds)',
            subtitle: 'Time to hold cursor at display edge before moving dock',
        });
        const spinBtn = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 10.0,
                step_increment: 0.5,
                page_increment: 1.0,
                value: settings.get_double('dynamic-monitor-switch-delay') || 2.5,
            }),
            climb_rate: 0.5,
            digits: 1,
            valign: Gtk.Align.CENTER,
        });
        spinBtn.connect('value-changed', (spin) => {
            settings.set_double('dynamic-monitor-switch-delay', spin.get_value());
        });
        delayRow.add_suffix(spinBtn);
        delayRow.set_activatable_widget(spinBtn);
        monitorGroup.add(delayRow);
        page.add(monitorGroup);

        window.add(page);
    }
}
