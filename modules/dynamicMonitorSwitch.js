// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamic Dock Monitor Switch for DDock-Plus
// Automatically moves the dock to another monitor when mouse cursor dwells at display edge.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockContainers } from './dockUtils.js';

const D2D_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const EDGE_THRESHOLD = 16; // px threshold from monitor edge for reliable triggering

let enabled = false;
let settingsRef = null;
let d2dSettings = null;
let pollTimerId = 0;

let dwellTargetMonitor = -1;
let dwellStartTime = 0;
let isSwitching = false;

function _resetDwellState() {
    dwellTargetMonitor = -1;
    dwellStartTime = 0;
}

function _getCurrentDockMonitorIndex() {
    const monitors = Main.layoutManager.monitors;
    if (!monitors || monitors.length === 0)
        return Main.layoutManager.primaryIndex;

    if (d2dSettings) {
        try {
            const connector = d2dSettings.get_string('preferred-monitor-by-connector');
            if (connector) {
                for (let i = 0; i < monitors.length; i++) {
                    if (monitors[i].connector === connector)
                        return i;
                }
            }
        } catch (e) {
            // connector key might not be available or set
        }

        const pref = d2dSettings.get_int('preferred-monitor');
        if (pref === -2 || pref === -1)
            return Main.layoutManager.primaryIndex;
        if (pref >= 0 && pref < monitors.length)
            return pref;
    }
    const containers = dockContainers();
    if (containers.length > 0) {
        const container = containers[0];
        if (container._monitorIndex !== undefined && container._monitorIndex >= 0)
            return container._monitorIndex;
        if (typeof container.get_monitor === 'function')
            return container.get_monitor();
    }

    return Main.layoutManager.primaryIndex;
}

function _isCursorAtDockEdge(mon, x, y, dockPos) {
    const pos = (dockPos || 'BOTTOM').toUpperCase();
    switch (pos) {
    case 'TOP':
        return y <= mon.y + EDGE_THRESHOLD;
    case 'LEFT':
        return x <= mon.x + EDGE_THRESHOLD;
    case 'RIGHT':
        return x >= mon.x + mon.width - EDGE_THRESHOLD;
    case 'BOTTOM':
    default:
        return y >= mon.y + mon.height - EDGE_THRESHOLD;
    }
}

function _checkCursorEdge() {
    if (isSwitching || !enabled)
        return GLib.SOURCE_CONTINUE;

    if (d2dSettings && d2dSettings.get_boolean('multi-monitor'))
        return GLib.SOURCE_CONTINUE;

    const monitors = Main.layoutManager.monitors;
    if (!monitors || monitors.length <= 1)
        return GLib.SOURCE_CONTINUE;

    const [x, y] = global.get_pointer();
    const currentDockMon = _getCurrentDockMonitorIndex();

    let targetMonIndex = -1;
    for (let i = 0; i < monitors.length; i++) {
        const mon = monitors[i];
        if (x >= mon.x && x <= mon.x + mon.width && y >= mon.y && y <= mon.y + mon.height) {
            targetMonIndex = i;
            break;
        }
    }

    if (targetMonIndex < 0 || targetMonIndex === currentDockMon) {
        _resetDwellState();
        return GLib.SOURCE_CONTINUE;
    }

    const mon = monitors[targetMonIndex];
    const dockPos = d2dSettings ? (d2dSettings.get_string('dock-position') || 'BOTTOM') : 'BOTTOM';

    if (_isCursorAtDockEdge(mon, x, y, dockPos)) {
        if (dwellTargetMonitor !== targetMonIndex) {
            dwellTargetMonitor = targetMonIndex;
            dwellStartTime = GLib.get_monotonic_time();
        } else {
            const elapsed = (GLib.get_monotonic_time() - dwellStartTime) / 1000000.0;
            let delaySec = 0.8;
            if (settingsRef) {
                try {
                    delaySec = settingsRef.get_double('dynamic-monitor-switch-delay');
                } catch (e) {
                    delaySec = 0.8;
                }
            }
            if (elapsed >= delaySec) {
                _triggerMonitorSwitch(targetMonIndex);
                _resetDwellState();
            }
        }
    } else {
        _resetDwellState();
    }

    return GLib.SOURCE_CONTINUE;
}

function _triggerMonitorSwitch(targetMonitorIndex) {
    isSwitching = true;
    console.log(`[DDock-Plus] Dynamic Monitor Switch triggered: moving dock to monitor ${targetMonitorIndex}`);

    if (d2dSettings) {
        d2dSettings.set_int('preferred-monitor', targetMonitorIndex);
        const monitors = Main.layoutManager.monitors;
        if (monitors && monitors[targetMonitorIndex] && monitors[targetMonitorIndex].connector) {
            try {
                d2dSettings.set_string('preferred-monitor-by-connector', monitors[targetMonitorIndex].connector);
                console.log(`[DDock-Plus] Set preferred-monitor-by-connector to ${monitors[targetMonitorIndex].connector}`);
            } catch (e) {
                console.warn(`[DDock-Plus] Failed setting preferred-monitor-by-connector: ${e}`);
            }
        }
    }

    // Lock switching during reposition layout phase to avoid loop triggers
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
        isSwitching = false;
        return GLib.SOURCE_REMOVE;
    });
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

    pollTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, _checkCursorEdge);
}

export function disable() {
    if (!enabled)
        return;

    enabled = false;
    if (pollTimerId > 0) {
        GLib.source_remove(pollTimerId);
        pollTimerId = 0;
    }
    _resetDwellState();
    isSwitching = false;
    settingsRef = null;
    d2dSettings = null;
}


