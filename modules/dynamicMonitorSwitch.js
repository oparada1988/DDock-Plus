// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamic Dock Monitor Switch for DDock-Plus
// Multi-monitor approach: leverages Dash-to-Dock multi-monitor support to show the dock on the active monitor and hide it on inactive monitors.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockContainers } from './dockUtils.js';

const D2D_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';

let enabled = false;
let settingsRef = null;
let d2dSettings = null;
let pollTimerId = 0;

function _getContainerMonitorIndex(container) {
    if (container._monitorIndex !== undefined && container._monitorIndex >= 0)
        return container._monitorIndex;
    if (container._slider && container._slider._monitorIndex !== undefined && container._slider._monitorIndex >= 0)
        return container._slider._monitorIndex;
    if (typeof container.get_monitor === 'function') {
        try {
            return container.get_monitor();
        } catch (e) {}
    }

    const monitors = Main.layoutManager.monitors;
    if (monitors && monitors.length > 0) {
        try {
            const [cx, cy] = container.get_transformed_position();
            for (let i = 0; i < monitors.length; i++) {
                const m = monitors[i];
                if (cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height)
                    return i;
            }
        } catch (e) {}
    }
    return 0;
}

function _ensureMultiMonitorEnabled() {
    if (d2dSettings) {
        try {
            if (!d2dSettings.get_boolean('multi-monitor')) {
                console.log('[DDock-Plus] Enabling multi-monitor in Dash-to-Dock');
                d2dSettings.set_boolean('multi-monitor', true);
            }
        } catch (e) {
            console.warn(`[DDock-Plus] Could not set multi-monitor setting in D2D: ${e}`);
        }
    }
}

function _updateDockVisibility() {
    if (!enabled)
        return GLib.SOURCE_CONTINUE;

    const monitors = Main.layoutManager.monitors;
    if (!monitors || monitors.length <= 1) {
        // Single monitor setup: keep containers visible
        const containers = dockContainers();
        for (const container of containers) {
            if (!container.visible)
                container.visible = true;
        }
        return GLib.SOURCE_CONTINUE;
    }

    const [x, y] = global.get_pointer();
    let currentMonitor = -1;
    for (let i = 0; i < monitors.length; i++) {
        const mon = monitors[i];
        if (x >= mon.x && x < mon.x + mon.width && y >= mon.y && y < mon.y + mon.height) {
            currentMonitor = i;
            break;
        }
    }

    if (currentMonitor < 0)
        return GLib.SOURCE_CONTINUE;

    const containers = dockContainers();
    if (containers.length === 0)
        return GLib.SOURCE_CONTINUE;

    for (const container of containers) {
        const monIdx = _getContainerMonitorIndex(container);
        const shouldBeVisible = (monIdx === currentMonitor);

        if (container.visible !== shouldBeVisible) {
            container.visible = shouldBeVisible;
            console.log(`[DDock-Plus] Dock container monitor ${monIdx} set visible=${shouldBeVisible}`);
        }
    }

    return GLib.SOURCE_CONTINUE;
}

export function enable(settings) {
    if (enabled)
        return;

    enabled = true;
    settingsRef = settings;

    try {
        d2dSettings = new Gio.Settings({ schema_id: D2D_SCHEMA });
    } catch (e) {
        console.warn(`[DDock-Plus] Dash-to-Dock schema not available: ${e}`);
        d2dSettings = null;
    }

    _ensureMultiMonitorEnabled();
    _updateDockVisibility();

    pollTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, _updateDockVisibility);
    console.log('[DDock-Plus] Dynamic Monitor Switch (Multi-Dock Active Monitor Mode) enabled');
}

export function disable() {
    if (!enabled)
        return;

    enabled = false;
    if (pollTimerId > 0) {
        GLib.source_remove(pollTimerId);
        pollTimerId = 0;
    }

    try {
        const containers = dockContainers();
        for (const container of containers) {
            container.visible = true;
        }
    } catch (e) {
        console.warn(`[DDock-Plus] Error restoring dock visibility on disable: ${e}`);
    }

    settingsRef = null;
    d2dSettings = null;
    console.log('[DDock-Plus] Dynamic Monitor Switch disabled');
}



