// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamic Dock Monitor Switch for DDock-Plus
// Automatically moves the dock to another monitor when mouse cursor dwells at display edge.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockContainers } from './dockUtils.js';

const D2D_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const EDGE_THRESHOLD = 8; // px threshold from monitor edge

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
    if (d2dSettings) {
        const pref = d2dSettings.get_int('preferred-monitor');
        if (pref >= 0)
            return pref;
    }
    const containers = dockContainers();
    if (containers.length > 0 && containers[0]._monitorIndex !== undefined)
        return containers[0]._monitorIndex;

    return Main.layoutManager.primaryIndex;
}

function _isCursorAtDockEdge(mon, x, y, dockPos) {
    switch (dockPos) {
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

    const monitors = Main.layoutManager.monitors;
    if (!monitors || monitors.length <= 1)
        return GLib.SOURCE_CONTINUE;

    const [x, y] = global.get_pointer();
    const currentDockMon = _getCurrentDockMonitorIndex();

    let targetMonIndex = -1;
    for (let i = 0; i < monitors.length; i++) {
        const mon = monitors[i];
        if (x >= mon.x && x < mon.x + mon.width && y >= mon.y && y < mon.y + mon.height) {
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
            const delaySec = settingsRef ? settingsRef.get_double('dynamic-monitor-switch-delay') : 2.5;
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

    const containers = dockContainers();
    const currentContainer = containers.length > 0 ? containers[0] : null;
    const slider = currentContainer?._slider ?? null;

    if (slider && typeof slider._animateOut === 'function') {
        // Step 1: Slide out (autohide animation)
        slider._animateOut(0.3, 0);

        // Step 2: After slide out completes, change monitor setting
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
            if (d2dSettings)
                d2dSettings.set_int('preferred-monitor', targetMonitorIndex);

            // Step 3: Allow Dash-to-Dock to reposition and slide back in (unhide animation)
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                const newContainers = dockContainers();
                const newSlider = newContainers.length > 0 ? newContainers[0]._slider : null;
                if (newSlider && typeof newSlider._animateIn === 'function')
                    newSlider._animateIn(0.3, 0);

                isSwitching = false;
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    } else {
        // Direct fallback switch
        if (d2dSettings)
            d2dSettings.set_int('preferred-monitor', targetMonitorIndex);

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            isSwitching = false;
            return GLib.SOURCE_REMOVE;
        });
    }
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
