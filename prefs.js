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

        // ------------------------------------------------------------- Dock Outline & Style
        const outlineGroup = new Adw.PreferencesGroup({
            title: 'Dock Outline & Style',
            description: 'Add and customize a border outline around the dock',
        });

        const outlineSwitch = new Adw.SwitchRow({
            title: 'Enable Dock Outline',
            subtitle: 'Show border outline around the dock container',
        });
        settings.bind('enable-dock-outline', outlineSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        outlineGroup.add(outlineSwitch);

        // Width scale (0px to 5px)
        const widthScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 5, 1);
        widthScale.set_draw_value(true);
        widthScale.set_value_pos(Gtk.PositionType.RIGHT);
        widthScale.set_value(settings.get_int('dock-outline-width'));
        widthScale.connect('value-changed', () => {
            settings.set_int('dock-outline-width', Math.round(widthScale.get_value()));
        });

        const widthRow = new Adw.ActionRow({
            title: 'Outline Width',
            subtitle: 'Adjust border thickness (0px to 5px)',
        });
        widthRow.add_suffix(widthScale);
        outlineGroup.add(widthRow);

        // Color customization
        const colorPresets = [
            { label: 'Semi-Transparent White', value: 'rgba(255, 255, 255, 0.45)' },
            { label: 'Solid White', value: '#ffffff' },
            { label: 'Accent Blue', value: '#3584e4' },
            { label: 'Emerald Green', value: '#2ec27e' },
            { label: 'Translucent Black', value: 'rgba(0, 0, 0, 0.5)' },
            { label: 'Custom CSS Color...', value: 'custom' },
        ];

        const colorPresetCombo = new Adw.ComboRow({
            title: 'Color Preset',
            subtitle: 'Choose a quick preset or define a custom color',
            model: Gtk.StringList.new(colorPresets.map(p => p.label)),
        });

        const currentColor = settings.get_string('dock-outline-color') || 'rgba(255, 255, 255, 0.45)';
        const initialColorIdx = colorPresets.findIndex(p => p.value === currentColor);
        colorPresetCombo.selected = initialColorIdx !== -1 ? initialColorIdx : colorPresets.length - 1;

        const colorEntryRow = new Adw.ActionRow({
            title: 'Custom CSS Color',
            subtitle: 'Enter hex code (#ffffff) or RGBA color (rgba(255, 255, 255, 0.45))',
        });

        const colorEntry = new Gtk.Entry({
            text: currentColor,
            valign: Gtk.Align.CENTER,
            hexpand: true,
            placeholder_text: 'e.g. #3584e4 or rgba(255, 255, 255, 0.45)',
        });

        let updatingColorPreset = false;

        colorEntry.connect('changed', () => {
            if (updatingColorPreset) return;
            const text = colorEntry.get_text().trim();
            if (text) {
                settings.set_string('dock-outline-color', text);
                const foundIdx = colorPresets.findIndex(p => p.value === text);
                if (foundIdx !== -1 && foundIdx !== colorPresets.length - 1) {
                    colorPresetCombo.selected = foundIdx;
                } else {
                    colorPresetCombo.selected = colorPresets.length - 1;
                }
            }
        });

        colorPresetCombo.connect('notify::selected', () => {
            const idx = colorPresetCombo.selected;
            if (idx >= 0 && idx < colorPresets.length - 1) {
                const val = colorPresets[idx].value;
                updatingColorPreset = true;
                colorEntry.set_text(val);
                settings.set_string('dock-outline-color', val);
                updatingColorPreset = false;
            }
        });

        colorEntryRow.add_suffix(colorEntry);
        outlineGroup.add(colorPresetCombo);
        outlineGroup.add(colorEntryRow);

        // Border Style (Solid, Dashed, Dotted, Double)
        const styleOptions = ['Solid', 'Dashed', 'Dotted', 'Double'];
        const styleValues = ['solid', 'dashed', 'dotted', 'double'];
        const currentStyle = settings.get_string('dock-outline-style') || 'solid';
        const initialStyleIdx = styleValues.indexOf(currentStyle);

        const styleCombo = new Adw.ComboRow({
            title: 'Border Style',
            subtitle: 'Choose outline stroke pattern',
            model: Gtk.StringList.new(styleOptions),
            selected: initialStyleIdx !== -1 ? initialStyleIdx : 0,
        });

        styleCombo.connect('notify::selected', () => {
            const idx = styleCombo.selected;
            if (idx >= 0 && idx < styleValues.length) {
                settings.set_string('dock-outline-style', styleValues[idx]);
            }
        });
        outlineGroup.add(styleCombo);

        // Rounded Corners Handling
        const autoRadiusSwitch = new Adw.SwitchRow({
            title: 'Auto Corner Radius',
            subtitle: 'Automatically match the dock container corner radius',
        });
        settings.bind('dock-outline-auto-radius', autoRadiusSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        outlineGroup.add(autoRadiusSwitch);

        const radiusScale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 30, 1);
        radiusScale.set_draw_value(true);
        radiusScale.set_value_pos(Gtk.PositionType.RIGHT);
        radiusScale.set_value(settings.get_int('dock-outline-radius'));
        radiusScale.connect('value-changed', () => {
            settings.set_int('dock-outline-radius', Math.round(radiusScale.get_value()));
        });

        const radiusRow = new Adw.ActionRow({
            title: 'Custom Corner Radius',
            subtitle: 'Set fixed corner rounding (0px to 30px)',
        });
        radiusRow.add_suffix(radiusScale);

        const updateRadiusSensitivity = () => {
            radiusRow.set_sensitive(!autoRadiusSwitch.active);
        };
        updateRadiusSensitivity();
        autoRadiusSwitch.connect('notify::active', updateRadiusSensitivity);

        outlineGroup.add(radiusRow);
        page.add(outlineGroup);

        window.add(page);
    }
}

