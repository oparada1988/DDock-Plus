// SPDX-License-Identifier: GPL-3.0-or-later
// Shared Folder Stack Engine for DDock-Plus
// Supports both Fan (List) View and 4x6 Grid View for any monitored folder.

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {
    applyIconOffset, dashEndsWithSeparator, dashOf, disconnectAll, makeDashItem,
    makeDashSeparator, makeStrip, prefersDark, scaleFactor, syncDarken, watchDocks,
} from './dockUtils.js';

const MAX_FAN_ROWS = 10;
const GRID_COLS = 4;
const GRID_ROWS = 6;
const MAX_GRID_ITEMS = GRID_COLS * GRID_ROWS; // 24 items max

const FILE_ICON = 1.3;        // file icon, in dash icon sizes
const ROW_SPACING = 1.2;      // step along the arc, in file icon sizes
const FAN_START = 3;          // degrees of tilt on the first row
const FAN_STEP = 1.4;         // degrees added per row
const NAME_LIMIT = 36;        // characters before a fan name is elided
const GRID_NAME_LIMIT = 14;   // characters before a grid name is elided
const TOP_MARGIN = 24;        // px kept clear above the topmost row
const ROW_ANIMATION = 150;    // ms for a row to travel to or from the dock
const ROW_STAGGER = 12;       // ms between one row leaving and the next
const STACK_DEPTH = 5;        // thumbnails deep the pile is drawn
const STACK_STEP = 0.04;      // offset between two piled thumbnails, in icon sizes
const STACK_TILT = 2.2;       // degrees added per thumbnail down the pile
const REFRESH_DELAY = 400;    // ms of a quiet folder before rereading
const STACK_EXTENT = 1;       // how much of the icon box the whole pile fills
const LIST_BATCH = 64;
const LIST_ATTRIBUTES = [
    'standard::name',
    'standard::display-name',
    'standard::is-hidden',
    'standard::is-backup',
    'standard::icon',
    'time::modified',
    'thumbnail::path',
].join(',');

function _openUri(uri) {
    Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
}

function _modified(info) {
    return info.get_attribute_uint64('time::modified');
}

function _fileIcon(info, size) {
    const box = new St.Widget({
        layout_manager: new Clutter.BinLayout(),
        width: size * scaleFactor(),
        height: size * scaleFactor(),
    });

    const thumbnail = info.get_attribute_byte_string('thumbnail::path');
    const [format, imageWidth, imageHeight] = thumbnail
        ? GdkPixbuf.Pixbuf.get_file_info(thumbnail) : [null, 0, 0];

    if (format) {
        const fit = Math.min(size / imageWidth, size / imageHeight);
        const texture = St.TextureCache.get_default().load_file_async(
            Gio.File.new_for_path(thumbnail),
            Math.round(imageWidth * fit), Math.round(imageHeight * fit),
            scaleFactor(), 1);
        const framed = imageWidth !== imageHeight;
        const frame = new St.Bin({
            style_class: framed ? 'kiwi-fan-thumbnail' : '',
            child: texture,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        frame.connect('notify::allocation', () => {
            const allocation = frame.get_allocation_box();
            frame.offscreen_redirect =
                allocation.get_width() >= 1 && allocation.get_height() >= 1
                    ? Clutter.OffscreenRedirect.ALWAYS : 0;
        });
        box.add_child(frame);
    } else {
        box.add_child(new St.Icon({
            style_class: 'kiwi-fan-file-icon',
            gicon: info.get_icon(),
            icon_size: size,
        }));
    }

    return box;
}

function _displayName(info, limit = NAME_LIMIT) {
    const name = info.get_display_name();
    return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
}

export class FolderStackInstance {
    constructor(options) {
        this.getFolderFile = options.getFolderFile;
        this.getTitle = options.getTitle;
        this.iconName = options.iconName || 'folder';
        this.stripName = options.stripName || 'kiwi-folder-strip';
        this.buttonClass = options.buttonClass || 'kiwi-downloads-item';
        this.getViewMode = options.getViewMode || (() => 'list');
        this.gettextFunc = options.gettextFunc || (msg => msg);

        this.enabled = false;
        this.docks = [];
        this.globalSignals = [];
        this.activePopup = null; // { overlay, grab, info, type }
        this.recent = [];
        this.recentCount = 0;
        this.recentKey = '';
        this.folderMonitor = null;
        this.sources = { dockSearch: 0, replace: 0, refresh: 0 };
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;

        const overviewId = Main.overview.connect('showing', () => this.closePopup());
        this.globalSignals.push([Main.overview, overviewId]);

        this._setupMonitor();
        this._refresh();

        if (Main.layoutManager._startingUp) {
            const startupId = Main.layoutManager.connect('startup-complete', () => this._watchDocks());
            this.globalSignals.push([Main.layoutManager, startupId]);
            return;
        }
        this._watchDocks();
    }

    disable() {
        this.enabled = false;

        for (const key of Object.keys(this.sources)) {
            if (this.sources[key])
                GLib.Source.remove(this.sources[key]);
            this.sources[key] = 0;
        }

        this.closePopup();

        disconnectAll(this.globalSignals);
        this.globalSignals = [];

        [...this.docks].forEach(info => this._detachDock(info));

        this.folderMonitor?.cancel();
        this.folderMonitor = null;
        this.recent = [];
        this.recentCount = 0;
        this.recentKey = '';
    }

    reloadFolder() {
        if (!this.enabled) return;
        this._setupMonitor();
        this._refresh();
    }

    _setupMonitor() {
        this.folderMonitor?.cancel();
        this.folderMonitor = null;

        const folder = this.getFolderFile();
        if (!folder || !folder.query_exists(null))
            return;

        try {
            this.folderMonitor = folder.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
            const changedId = this.folderMonitor.connect('changed', () => this._queueRefresh());
            this.globalSignals.push([this.folderMonitor, changedId]);
        } catch (e) {
            console.error(`[DDock-Plus] Error monitoring folder: ${e}`);
        }
    }

    _queueRefresh() {
        if (this.sources.refresh)
            GLib.Source.remove(this.sources.refresh);
        this.sources.refresh = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_DELAY, () => {
            this.sources.refresh = 0;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refresh() {
        const folder = this.getFolderFile();
        if (!folder || !folder.query_exists(null)) {
            this.recent = [];
            this.recentCount = 0;
            this.recentKey = '';
            this.docks.forEach(info => this._syncButton(info));
            return;
        }

        this._listFolderFiles(folder, files => {
            if (!this.enabled) return;
            const maxNeeded = Math.max(MAX_FAN_ROWS, MAX_GRID_ITEMS);
            this.recent = files.slice(0, maxNeeded);
            this.recentCount = files.length;

            const key = `${this.recentCount}:${this.recent.map(info => [
                info.get_name(),
                _modified(info),
                info.get_attribute_byte_string('thumbnail::path') ?? '',
            ].join('@')).join('|')}`;

            if (key === this.recentKey) return;
            this.recentKey = key;

            this.docks.forEach(info => this._syncButton(info));
        });
    }

    _listFolderFiles(folder, callback) {
        folder.enumerate_children_async(
            LIST_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null,
            (source, result) => {
                let enumerator = null;
                try {
                    enumerator = source.enumerate_children_finish(result);
                } catch (_) {}
                if (enumerator)
                    this._readBatch(enumerator, [], callback);
                else
                    callback([]);
            });
    }

    _readBatch(enumerator, found, callback) {
        enumerator.next_files_async(LIST_BATCH, GLib.PRIORITY_DEFAULT, null,
            (source, result) => {
                let infos = [];
                try {
                    infos = source.next_files_finish(result);
                } catch (_) {
                    infos = [];
                }

                if (infos.length === 0) {
                    source.close_async(GLib.PRIORITY_DEFAULT, null, null);
                    found.sort((a, b) => _modified(b) - _modified(a));
                    callback(found);
                    return;
                }

                for (const info of infos) {
                    if (!info.get_is_hidden() && !info.get_is_backup())
                        found.push(info);
                }
                this._readBatch(source, found, callback);
            });
    }

    /* ------------------------------------------------------------- Dock Icon Stack */

    _pileMetrics(dash) {
        const depth = Math.min(this.recent.length, STACK_DEPTH);
        const span = Math.max(0, depth - 1) * STACK_STEP;
        return {
            depth,
            size: Math.round(dash.iconSize * (STACK_EXTENT - span)),
            step: Math.round(dash.iconSize * STACK_STEP * scaleFactor()),
        };
    }

    _stackIcon(dash) {
        const scale = scaleFactor();
        const box = new St.Widget({
            style_class: 'kiwi-downloads-stack',
            layout_manager: new Clutter.BinLayout(),
            width: Math.round(dash.iconSize * scale),
            height: Math.round(dash.iconSize * scale),
        });

        box.add_child(new St.Icon({
            gicon: new Gio.ThemedIcon({ name: this.iconName }),
            icon_size: dash.iconSize,
        }));

        const { depth: pileDepth, size, step } = this._pileMetrics(dash);
        box.cards = [];
        for (let depth = pileDepth - 1; depth >= 0; depth--) {
            const card = _fileIcon(this.recent[depth], size);
            card.set({
                translation_x: depth * step,
                translation_y: -depth * step,
                rotation_angle_z: depth * STACK_TILT,
            });
            box.add_child(card);
            box.cards[depth] = card;
        }
        return box;
    }

    _makeButton(info) {
        const { dash } = info;
        const button = new St.Button({
            style_class: this.buttonClass,
            can_focus: true,
            track_hover: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.set_child(this._stackIcon(dash));

        applyIconOffset(dash, button);

        button.connect('notify::pressed', () => syncDarken(info.button, info.container.has_style_class_name('kiwi-dock-styled')));
        button.connect('clicked', () => this.togglePopup(info));
        return button;
    }

    _syncButton(info) {
        if (info.button && !this.activePopup)
            info.button.set_child(this._stackIcon(info.dash));
    }

    /* ------------------------------------------------------------- Popups (Fan / Grid) */

    togglePopup(info) {
        if (this.activePopup) {
            this.closePopup();
        } else {
            const mode = this.getViewMode();
            if (mode === 'grid') {
                this._showGrid(info);
            } else {
                this._showFan(info);
            }
        }
    }

    closePopup() {
        if (!this.activePopup) return;
        const { type } = this.activePopup;
        if (type === 'grid') {
            this._closeGrid();
        } else {
            this._closeFan();
        }
    }

    /* ------------------------------------------------------------- Fan (List) View */

    _showFan(info) {
        this._lockDock(info, true);

        const [buttonX, buttonY] = info.button.get_transformed_position();
        const [buttonWidth, buttonHeight] = info.button.get_transformed_size();
        const geometry = Main.layoutManager.monitors[info.dash._monitorIndex] ??
            Main.layoutManager.primaryMonitor;
        const scale = scaleFactor();
        const iconSize = Math.round(info.dash.iconSize * FILE_ICON);
        const spacing = Math.round(iconSize * scale * ROW_SPACING);

        const anchorX = buttonX + buttonWidth / 2;
        const anchorY = buttonY;
        const stack = info.button.child;
        const cards = stack.cards ?? [];
        const pileX = anchorX;
        const pileY = buttonY + buttonHeight / 2;
        const pile = this._pileMetrics(info.dash);
        const cardStart = depth => ({
            x: pileX + depth * pile.step,
            y: pileY - depth * pile.step,
            scale: pile.size / iconSize,
            tilt: depth * STACK_TILT,
        });

        const room = Math.floor((anchorY - geometry.y - TOP_MARGIN) / spacing) - 1;
        const shown = this.recent.slice(0, Math.max(0, Math.min(MAX_FAN_ROWS, room)));

        const overlay = new St.Widget({
            name: 'kiwi-downloads-fan',
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
        Main.layoutManager.addTopChrome(overlay);

        const folder = this.getFolderFile();
        const rows = [];

        for (const file of shown) {
            rows.push(this._makeFanRow(
                _displayName(file), _fileIcon(file, iconSize), 'kiwi-fan-icon',
                () => {
                    if (folder) _openUri(folder.get_child(file.get_name()).get_uri());
                    this.closePopup();
                }));
        }

        const rest = this.recentCount - shown.length;
        let text = this.gettextFunc('Open in Files');
        if (rest > 0)
            text = this.gettextFunc('%d More in Files').replace('%d', rest);
        else if (shown.length === 0)
            text = this.gettextFunc('Empty');

        const more = this._makeFanRow(
            text,
            new St.Icon({
                style_class: 'kiwi-fan-more-icon',
                icon_name: 'go-next-symbolic',
                icon_size: Math.round(iconSize * 0.3),
            }),
            'kiwi-fan-more',
            () => {
                if (folder) _openUri(folder.get_uri());
                this.closePopup();
            });
        more.add_style_class_name('kiwi-fan-more-row');
        rows.push(more);

        let x = anchorX;
        let y = anchorY;
        let angle = FAN_START;
        rows.forEach((row, index) => {
            overlay.insert_child_at_index(row, 0);
            x += Math.sin(angle * Math.PI / 180) * spacing;
            y -= Math.cos(angle * Math.PI / 180) * spacing;
            this._placeFanRow(row, x, y, angle);
            row.card = cards[index] ?? null;
            row.start = cardStart(Math.min(index, Math.max(0, pile.depth - 1)));
            this._animateFanRowIn(row, index);
            angle += FAN_STEP;
        });

        for (const card of cards.slice(rows.length))
            card.ease({ opacity: 0, duration: 1, delay: rows.length * ROW_STAGGER });

        const grab = Main.pushModal(overlay, { actionMode: Shell.ActionMode.POPUP });
        overlay.connect('button-press-event', (actor, event) => {
            if (global.stage.get_event_actor(event) !== actor)
                return Clutter.EVENT_PROPAGATE;
            this.closePopup();
            return Clutter.EVENT_STOP;
        });
        overlay.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.closePopup();
            return Clutter.EVENT_STOP;
        });

        this.activePopup = { overlay, grab, rows, info, type: 'fan' };
    }

    _makeFanRow(text, iconActor, iconClass, onActivate) {
        const row = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER });
        const label = new St.Label({
            style_class: 'kiwi-fan-label',
            text,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const icon = new St.Button({
            style_class: iconClass,
            child: iconActor,
            y_align: Clutter.ActorAlign.CENTER,
        });

        icon.connect('notify::pressed', () => syncDarken(icon));
        icon.connect('clicked', onActivate);

        if (prefersDark()) {
            label.add_style_class_name('dark');
            icon.add_style_class_name('dark');
        }

        row.add_child(label);
        row.add_child(icon);
        row.label = label;
        row.iconButton = icon;
        return row;
    }

    _placeFanRow(row, x, y, degrees) {
        const [, , width, height] = row.get_preferred_size();
        const [, , iconWidth] = row.iconButton.get_preferred_size();
        row.set_size(width, height);
        row.set_position(Math.round(x - width + iconWidth / 2), Math.round(y - height / 2));
        row.set_pivot_point((width - iconWidth / 2) / width, 0.5);
        row.rotation_angle_z = degrees;
    }

    _rowPivot(row) {
        const [x, y] = row.get_position();
        const [pivotX, pivotY] = row.get_pivot_point();
        return [x + row.width * pivotX, y + row.height * pivotY];
    }

    _animateFanRowIn(row, index) {
        const [pivotX, pivotY] = this._rowPivot(row);
        const { start, card } = row;
        const tilt = row.rotation_angle_z;

        row.set({
            translation_x: start.x - pivotX,
            translation_y: start.y - pivotY,
            scale_x: start.scale,
            scale_y: start.scale,
            rotation_angle_z: start.tilt,
        });
        row.label.opacity = 0;

        const delay = index * ROW_STAGGER;
        row.label.ease({
            opacity: 255,
            duration: ROW_ANIMATION,
            delay,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        card?.ease({ opacity: 0, duration: 1, delay });
        row.ease({
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            rotation_angle_z: tilt,
            duration: ROW_ANIMATION,
            delay,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                row.offscreen_redirect = Clutter.OffscreenRedirect.ALWAYS;
            },
        });
    }

    _closeFan() {
        if (!this.activePopup || this.activePopup.type !== 'fan') return;

        const { overlay, grab, rows, info } = this.activePopup;
        this.activePopup = null;

        Main.popModal(grab);
        this._lockDock(info, false);
        overlay.reactive = false;

        const stack = info.button?.child;
        rows.forEach((row, index) => {
            const [pivotX, pivotY] = this._rowPivot(row);
            const { start, card } = row;
            row.offscreen_redirect = 0;
            row.label.ease({
                opacity: 0,
                duration: ROW_ANIMATION,
                delay: (rows.length - 1 - index) * ROW_STAGGER,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
            });
            row.ease({
                translation_x: start.x - pivotX,
                translation_y: start.y - pivotY,
                scale_x: start.scale,
                scale_y: start.scale,
                rotation_angle_z: start.tilt,
                duration: ROW_ANIMATION,
                delay: (rows.length - 1 - index) * ROW_STAGGER,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onStopped: () => {
                    if (card)
                        card.opacity = 255;
                    if (index > 0)
                        return;
                    this._dropOverlay(overlay);
                    this._syncButton(info);
                },
            });
        });

        for (const card of stack?.cards.slice(rows.length) ?? []) {
            card.ease({
                opacity: 255,
                duration: 1,
                delay: (rows.length - 1) * ROW_STAGGER,
            });
        }
    }

    /* ------------------------------------------------------------- 4x6 Grid View */

    _showGrid(info) {
        this._lockDock(info, true);

        const overlay = new St.Widget({
            name: 'kiwi-stack-grid-overlay',
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
            width: global.stage.width,
            height: global.stage.height,
        });
        Main.layoutManager.addTopChrome(overlay);

        const gridBox = new St.BoxLayout({
            style_class: 'kiwi-grid-popup',
            vertical: true,
            reactive: true,
        });
        if (prefersDark())
            gridBox.add_style_class_name('dark');

        // Title Header
        const titleText = typeof this.getTitle === 'function' ? this.getTitle() : this.getTitle;
        const header = new St.BoxLayout({ style_class: 'kiwi-grid-header' });
        const titleLabel = new St.Label({
            style_class: 'kiwi-grid-title',
            text: titleText,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(titleLabel);
        gridBox.add_child(header);

        // 4x6 Grid items container
        const shown = this.recent.slice(0, MAX_GRID_ITEMS);
        const folder = this.getFolderFile();

        const gridContainer = new St.BoxLayout({
            style_class: 'kiwi-grid-container',
            vertical: true,
        });

        let currentLine = null;
        shown.forEach((file, index) => {
            if (index % GRID_COLS === 0) {
                currentLine = new St.BoxLayout({ style_class: 'kiwi-grid-row' });
                gridContainer.add_child(currentLine);
            }

            const itemBtn = new St.Button({
                style_class: 'kiwi-grid-tile',
                can_focus: true,
                track_hover: true,
            });

            const cellBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.CENTER });
            const iconActor = _fileIcon(file, 52);
            iconActor.add_style_class_name('kiwi-grid-thumbnail');
            cellBox.add_child(iconActor);

            const label = new St.Label({
                style_class: 'kiwi-grid-label',
                text: _displayName(file, GRID_NAME_LIMIT),
                x_align: Clutter.ActorAlign.CENTER,
            });
            cellBox.add_child(label);

            itemBtn.set_child(cellBox);
            itemBtn.connect('clicked', () => {
                if (folder) _openUri(folder.get_child(file.get_name()).get_uri());
                this.closePopup();
            });

            currentLine.add_child(itemBtn);
        });

        gridBox.add_child(gridContainer);

        // Footer: "Open in Files"
        const rest = this.recentCount - shown.length;
        let footerText = this.gettextFunc('Open in Files');
        if (rest > 0)
            footerText = this.gettextFunc('%d More in Files').replace('%d', rest);
        else if (shown.length === 0)
            footerText = this.gettextFunc('Empty');

        const footerBtn = new St.Button({
            style_class: 'kiwi-grid-footer-button',
            can_focus: true,
            label: footerText,
        });
        footerBtn.connect('clicked', () => {
            if (folder) _openUri(folder.get_uri());
            this.closePopup();
        });
        gridBox.add_child(footerBtn);

        overlay.add_child(gridBox);

        // Calculate Position
        const [buttonX, buttonY] = info.button.get_transformed_position();
        const [buttonWidth, buttonHeight] = info.button.get_transformed_size();
        const monitor = Main.layoutManager.monitors[info.dash._monitorIndex] ?? Main.layoutManager.primaryMonitor;

        const [, , prefWidth, prefHeight] = gridBox.get_preferred_size();
        let popupX = Math.round(buttonX + buttonWidth / 2 - prefWidth / 2);
        let popupY = Math.round(buttonY - prefHeight - 12);

        // Keep within monitor screen bounds
        popupX = Math.max(monitor.x + 16, Math.min(monitor.x + monitor.width - prefWidth - 16, popupX));
        popupY = Math.max(monitor.y + 16, popupY);

        gridBox.set_position(popupX, popupY);
        gridBox.set_pivot_point(0.5, 1.0);
        gridBox.set({ scale_x: 0.9, scale_y: 0.9, opacity: 0 });

        gridBox.ease({
            scale_x: 1.0,
            scale_y: 1.0,
            opacity: 255,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        const grab = Main.pushModal(overlay, { actionMode: Shell.ActionMode.POPUP });
        overlay.connect('button-press-event', (actor, event) => {
            if (global.stage.get_event_actor(event) !== actor)
                return Clutter.EVENT_PROPAGATE;
            this.closePopup();
            return Clutter.EVENT_STOP;
        });
        overlay.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this.closePopup();
            return Clutter.EVENT_STOP;
        });

        this.activePopup = { overlay, grab, gridBox, info, type: 'grid' };
    }

    _closeGrid() {
        if (!this.activePopup || this.activePopup.type !== 'grid') return;

        const { overlay, grab, gridBox, info } = this.activePopup;
        this.activePopup = null;

        Main.popModal(grab);
        this._lockDock(info, false);
        overlay.reactive = false;

        gridBox.ease({
            scale_x: 0.9,
            scale_y: 0.9,
            opacity: 0,
            duration: 120,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._dropOverlay(overlay);
                this._syncButton(info);
            },
        });
    }

    /* ------------------------------------------------------------- Helpers & Dock Watcher */

    _dropOverlay(overlay) {
        if (!overlay.get_stage()) return;
        Main.layoutManager.removeChrome(overlay);
        overlay.destroy();
    }

    _lockDock(info, locked) {
        const container = info.container;
        if (!container._updateDashVisibility || !container.get_stage())
            return;

        info.dash.requiresVisibility = locked;
        if (locked) {
            container._updateDashVisibility();
            container._ignoreHover = true;
        } else {
            container._ignoreHover = false;
            container._box.sync_hover();
            container._updateDashVisibility();
        }
    }

    _placeItem(info) {
        if (!info.item)
            this._buildItem(info);

        const strip = info.dash._boxContainer.get_children()
            .find(child => child.name === 'kiwi-minimized-strip') ?? info.strip;

        if (info.item.get_parent() !== strip) {
            info.item.get_parent()?.remove_child(info.item);
            if (info.stripSignal) {
                const [previous, id] = info.stripSignal;
                previous.disconnect(id);
            }
            strip.add_child(info.item);
            info.stripSignal = [strip, strip.connect('child-added', () => this._queueReplace())];
        }

        const first = strip.get_first_child();
        const divider = first?.get_style_class_name?.()?.includes('dash-separator');
        const index = divider ? 1 : 0;
        if (strip.get_children().indexOf(info.item) !== index)
            strip.set_child_at_index(info.item, index);

        this._syncSeparator(info, strip === info.strip);
    }

    _syncSeparator(info, own) {
        const wanted = own && !dashEndsWithSeparator(info.dash);

        if (wanted && !info.separator) {
            info.separator = makeDashSeparator(info.dash);
            info.strip.insert_child_at_index(info.separator, 0);
        } else if (!wanted && info.separator) {
            info.separator.destroy();
            info.separator = null;
        }
    }

    _buildItem(info) {
        info.iconSize = info.dash.iconSize;
        info.button = this._makeButton(info);
        const titleText = typeof this.getTitle === 'function' ? this.getTitle() : this.getTitle;
        info.item = makeDashItem(info.dash, info.button, titleText);
        info.item.connect('destroy', () => {
            info.item = null;
            info.button = null;
            this._queueReplace();
        });
        info.item.show(false);
    }

    _queueReplace() {
        if (this.sources.replace || !this.enabled)
            return;
        this.sources.replace = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.sources.replace = 0;
            this.docks.forEach(info => this._placeItem(info));
            return GLib.SOURCE_REMOVE;
        });
    }

    _attachDock(dockContainer) {
        const dash = dashOf(dockContainer);
        if (!dash?._box || !dash._boxContainer)
            return;
        if (this.docks.some(existing => existing.dash === dash))
            return;

        const isHorizontal = dash._isHorizontal ?? true;
        const strip = makeStrip(dash, this.stripName);
        dash._boxContainer.insert_child_above(strip, dash._box);

        const info = {
            dash,
            container: dockContainer,
            strip,
            item: null,
            button: null,
            iconSize: dash.iconSize,
            signals: [],
            stripSignal: null,
            separator: null,
        };

        const containerId = dash._boxContainer.connect('child-added', () => this._queueReplace());
        info.signals.push([dash._boxContainer, containerId]);

        const boxAddedId = dash._box.connect('child-added', () => this._queueReplace());
        info.signals.push([dash._box, boxAddedId]);
        const boxRemovedId = dash._box.connect('child-removed', () => this._queueReplace());
        info.signals.push([dash._box, boxRemovedId]);

        const sizeId = dash._box.connect(
            isHorizontal ? 'notify::height' : 'notify::width', () => {
                if (dash.iconSize === info.iconSize || !info.button)
                    return;
                info.iconSize = dash.iconSize;
                this._syncButton(info);
                applyIconOffset(dash, info.button);
            });
        info.signals.push([dash._box, sizeId]);

        const destroyId = dash.connect('destroy', () => this._detachDock(info, false));
        info.signals.push([dash, destroyId]);

        this.docks.push(info);
        this._placeItem(info);
        this._queueReplace();
    }

    _detachDock(info, removeActors = true) {
        disconnectAll(info.signals);
        info.signals = [];

        if (info.stripSignal) {
            const [strip, id] = info.stripSignal;
            strip.disconnect(id);
            info.stripSignal = null;
        }

        this.closePopup();

        if (removeActors) {
            info.item?.destroy();
            info.strip.destroy();
        }
        info.item = null;
        info.button = null;
        info.separator = null;

        this.docks = this.docks.filter(other => other !== info);
    }

    _watchDocks() {
        watchDocks({
            attach: dockContainer => this._attachDock(dockContainer),
            count: () => this.docks.length,
            globalSignals: this.globalSignals,
            sources: this.sources,
        });
    }
}
