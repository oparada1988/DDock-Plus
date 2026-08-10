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

        // Custom Icon Selection
        const iconPresets = [
            { label: 'Default Folder (folder)', value: 'folder' },
            { label: 'Pictures (folder-pictures)', value: 'folder-pictures' },
            { label: 'Music (folder-music)', value: 'folder-music' },
            { label: 'Videos (folder-videos)', value: 'folder-videos' },
            { label: 'Documents (folder-documents)', value: 'folder-documents' },
            { label: 'Downloads (folder-download)', value: 'folder-download' },
            { label: 'Games (applications-games)', value: 'applications-games' },
            { label: 'Development (folder-development)', value: 'folder-development' },
            { label: 'Saved / Search (folder-saved-search)', value: 'folder-saved-search' },
            { label: 'Home (user-home)', value: 'user-home' },
            { label: 'Custom Icon / File Path...', value: 'custom' },
        ];

        const presetLabels = iconPresets.map(p => p.label);
        const presetModel = Gtk.StringList.new(presetLabels);

        const currentIcon = settings.get_string('custom-folder-icon') || 'folder';
        const initialPresetIndex = iconPresets.findIndex(p => p.value === currentIcon);

        const iconPresetCombo = new Adw.ComboRow({
            title: 'Icon Preset',
            subtitle: 'Quickly choose a standard folder icon',
            model: presetModel,
            selected: initialPresetIndex !== -1 ? initialPresetIndex : iconPresets.length - 1,
        });

        const customIconRow = new Adw.ActionRow({
            title: 'Custom Icon Name / File',
            subtitle: 'Enter system icon name or select an image file (.png, .svg)',
        });

        const iconPreview = new Gtk.Image({
            pixel_size: 24,
            valign: Gtk.Align.CENTER,
        });

        const updateIconPreview = (val) => {
            if (!val) val = 'folder';
            try {
                const gicon = Gio.Icon.new_for_string(val);
                iconPreview.set_from_gicon(gicon);
            } catch (e) {
                iconPreview.set_from_icon_name('folder');
            }
        };
        updateIconPreview(currentIcon);
        customIconRow.add_prefix(iconPreview);

        const iconEntry = new Gtk.Entry({
            text: currentIcon,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            placeholder_text: 'e.g. folder-pictures or /path/to/icon.png',
        });

        let updatingFromPreset = false;

        const setIconValue = (val) => {
            if (!val) val = 'folder';
            settings.set_string('custom-folder-icon', val);
            updateIconPreview(val);
        };

        iconEntry.connect('changed', () => {
            if (updatingFromPreset) return;
            const text = iconEntry.get_text().trim();
            const iconVal = text || 'folder';
            setIconValue(iconVal);

            const foundIdx = iconPresets.findIndex(p => p.value === iconVal);
            if (foundIdx !== -1 && foundIdx !== iconPresets.length - 1) {
                iconPresetCombo.selected = foundIdx;
            } else {
                iconPresetCombo.selected = iconPresets.length - 1;
            }
        });

        iconPresetCombo.connect('notify::selected', () => {
            const idx = iconPresetCombo.selected;
            if (idx >= 0 && idx < iconPresets.length - 1) {
                const val = iconPresets[idx].value;
                updatingFromPreset = true;
                iconEntry.set_text(val);
                setIconValue(val);
                updatingFromPreset = false;
            }
        });

        const browseIconBtn = new Gtk.Button({
            label: 'Browse Image',
            valign: Gtk.Align.CENTER,
        });
        browseIconBtn.connect('clicked', () => {
            const dialog = new Gtk.FileChooserNative({
                title: 'Select Custom Icon Image',
                transient_for: window,
                action: Gtk.FileChooserAction.OPEN,
                modal: true,
            });

            const filter = new Gtk.FileFilter();
            filter.set_name('Image Files (*.png, *.svg, *.jpg)');
            filter.add_mime_type('image/png');
            filter.add_mime_type('image/svg+xml');
            filter.add_mime_type('image/jpeg');
            dialog.add_filter(filter);

            dialog.connect('response', (d, responseId) => {
                if (responseId === Gtk.ResponseType.ACCEPT) {
                    const file = d.get_file();
                    if (file) {
                        const path = file.get_path();
                        iconPresetCombo.selected = iconPresets.length - 1;
                        updatingFromPreset = true;
                        iconEntry.set_text(path);
                        setIconValue(path);
                        updatingFromPreset = false;
                    }
                }
                d.destroy();
            });

            dialog.show();
        });

        const iconBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });
        iconBox.append(iconEntry);
        iconBox.append(browseIconBtn);

        customIconRow.add_suffix(iconBox);

        customGroup.add(iconPresetCombo);
        customGroup.add(customIconRow);
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

        window.add(page);
    }
}

