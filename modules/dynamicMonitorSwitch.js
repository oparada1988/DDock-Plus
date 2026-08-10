// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamic Dock Monitor Switch for DDock-Plus
// Multi-monitor approach: leverages Dash-to-Dock multi-monitor support to show the dock on the active monitor and hide it on inactive monitors.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockContainers } from './dockUtils.js';

const D2D_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const DEFAULT_DELAY_SEC = 0.3;
const BOTTOM_EDGE_MARGIN = 40; // px from bottom edge of monitor to consider "bottom edge"

let enabled = false;
let settingsRef = null;
let d2dSettings = null;
let pollTimerId = 0;

let currentActiveMonitor = -1;
let pendingMonitorIndex = -1;
let hoverStartTimeMs = 0;

function _getContainerMonitorIndex(container) {
    if (!container) return 0;

    // 1) Direct Dash-to-Dock monitor reference
    if (container._monitor && typeof container._monitor.index === 'number' && container._monitor.index >= 0)
        return container._monitor.index;

    // 2) GObject property variants on DashToDock container
    if (typeof container.monitor_index === 'number' && container.monitor_index >= 0)
        return container.monitor_index;
    if (typeof container.monitorIndex === 'number' && container.monitorIndex >= 0)
        return container.monitorIndex;
    if (typeof container._monitorIndex === 'number' && container._monitorIndex >= 0)
        return container._monitorIndex;

    // 3) Check child slider / dock objects if present
    if (container._slider) {
        if (container._slider._monitor && typeof container._slider._monitor.index === 'number' && container._slider._monitor.index >= 0)
            return container._slider._monitor.index;
        if (typeof container._slider.monitorIndex === 'number' && container._slider.monitorIndex >= 0)
            return container._slider.monitorIndex;
        if (typeof container._slider._monitorIndex === 'number' && container._slider._monitorIndex >= 0)
            return container._slider._monitorIndex;
    }
    if (container._dock) {
        if (container._dock._monitor && typeof container._dock._monitor.index === 'number' && container._dock._monitor.index >= 0)
            return container._dock._monitor.index;
        if (typeof container._dock.monitorIndex === 'number' && container._dock.monitorIndex >= 0)
            return container._dock.monitorIndex;
        if (typeof container._dock._monitorIndex === 'number' && container._dock._monitorIndex >= 0)
            return container._dock._monitorIndex;
    }

    if (typeof container.get_monitor === 'function') {
        try {
            const m = container.get_monitor();
            if (typeof m === 'number' && m >= 0) return m;
            if (m && typeof m.index === 'number' && m.index >= 0) return m.index;
        } catch (e) {}
    }

    if (typeof Main.layoutManager.findIndexForActor === 'function') {
        try {
            const idx = Main.layoutManager.findIndexForActor(container);
            if (typeof idx === 'number' && idx >= 0) return idx;
        } catch (e) {}
    }

    // 4) Physical spatial match against Main.layoutManager.monitors
    const monitors = Main.layoutManager.monitors;
    if (monitors && monitors.length > 0) {
        try {
            const [cx, cy] = container.get_transformed_position();
            for (let i = 0; i < monitors.length; i++) {
                const mon = monitors[i];
                if (cx >= mon.x && cx < mon.x + mon.width && cy >= mon.y && cy < mon.y + mon.height)
                    return i;
            }
        } catch (e) {}
    }

    // 5) Spatial sort-matched fallback pairing containers to monitors
    const containers = dockContainers();
    if (containers.length > 1 && monitors && monitors.length > 1) {
        try {
            const sortedMonitors = monitors.map((m, i) => ({ mon: m, index: i }))
                .sort((a, b) => (a.mon.x - b.mon.x) || (a.mon.y - b.mon.y));
            const sortedContainers = containers.map(c => {
                const [x, y] = c.get_transformed_position();
                return { container: c, x, y };
            }).sort((a, b) => (a.x - b.x) || (a.y - b.y));

            const matchIndex = sortedContainers.findIndex(sc => sc.container === container);
            if (matchIndex >= 0 && matchIndex < sortedMonitors.length)
                return sortedMonitors[matchIndex].index;
        } catch (e) {}
    }

    const idx = containers.indexOf(container);
    if (idx >= 0 && idx < (monitors ? monitors.length : 1))
        return idx;

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

function _showDockContainer(container) {
    if (!container) return;
    try {
        container.remove_all_transitions();
    } catch (e) {}

    container.visible = true;
    container._ignoreHover = false;

    container.ease({
        translation_y: 0,
        opacity: 255,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
}

function _hideDockContainer(container) {
    if (!container) return;
    try {
        container.remove_all_transitions();
    } catch (e) {}

    container._ignoreHover = true;
    const slideDist = container.height > 0 ? container.height + 20 : 120;
    container.ease({
        translation_y: slideDist,
        opacity: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_IN_CUBIC,
    });
}

function _switchToMonitor(targetMonitorIndex, force = false) {
    const containers = dockContainers();
    if (containers.length === 0)
        return;

    if (!force && currentActiveMonitor === targetMonitorIndex) {
        const targetContainer = containers.find(c => _getContainerMonitorIndex(c) === targetMonitorIndex);
        if (targetContainer && targetContainer.opacity === 255 && targetContainer.translation_y === 0)
            return;
    }

    console.log(`[DDock-Plus] Switching active dock monitor to ${targetMonitorIndex} (was ${currentActiveMonitor})`);
    currentActiveMonitor = targetMonitorIndex;

    for (const container of containers) {
        const monIdx = _getContainerMonitorIndex(container);
        const shouldBeVisible = (monIdx === targetMonitorIndex);

        if (shouldBeVisible) {
            _showDockContainer(container);
        } else {
            _hideDockContainer(container);
        }
    }
}

function _updateDockVisibility() {
    if (!enabled)
        return GLib.SOURCE_CONTINUE;

    const monitors = Main.layoutManager.monitors;
    if (!monitors || monitors.length <= 1) {
        // Single monitor setup: keep containers visible and responsive
        const containers = dockContainers();
        for (const container of containers) {
            container._ignoreHover = false;
            if (!container.visible || container.opacity < 255) {
                container.visible = true;
                container.opacity = 255;
                container.translation_y = 0;
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    const [x, y] = global.get_pointer();
    let currentMonitor = -1;
    let isAtBottomEdge = false;
    let isAtVeryEdge = false;

    for (let i = 0; i < monitors.length; i++) {
        const mon = monitors[i];
        if (x >= mon.x && x < mon.x + mon.width && y >= mon.y && y < mon.y + mon.height) {
            currentMonitor = i;
            if (y >= mon.y + mon.height - BOTTOM_EDGE_MARGIN) {
                isAtBottomEdge = true;
            }
            if (y >= mon.y + mon.height - 3) {
                isAtVeryEdge = true;
            }
            break;
        }
    }

    if (currentMonitor < 0) {
        pendingMonitorIndex = -1;
        return GLib.SOURCE_CONTINUE;
    }

    // Initialize active monitor on first check
    if (currentActiveMonitor < 0) {
        currentActiveMonitor = currentMonitor;
        _switchToMonitor(currentMonitor, true);
        return GLib.SOURCE_CONTINUE;
    }

    // Pointer is on current active monitor
    if (currentMonitor === currentActiveMonitor) {
        pendingMonitorIndex = -1;
        const containers = dockContainers();
        const activeContainer = containers.find(c => _getContainerMonitorIndex(c) === currentActiveMonitor);
        if (activeContainer) {
            activeContainer._ignoreHover = false;
            // If mouse is hovering near bottom edge on active monitor, ensure active dock is shown
            if (isAtBottomEdge && (activeContainer.opacity < 255 || activeContainer.translation_y !== 0)) {
                _showDockContainer(activeContainer);
            }
        }
        return GLib.SOURCE_CONTINUE;
    }

    // Pointer is on inactive monitor:
    // 1) Instant trigger if mouse is pressed at physical screen edge
    if (isAtVeryEdge) {
        pendingMonitorIndex = -1;
        _switchToMonitor(currentMonitor, true);
        return GLib.SOURCE_CONTINUE;
    }

    // 2) Responsive hover trigger if cursor is in bottom edge region
    if (isAtBottomEdge) {
        let delaySec = DEFAULT_DELAY_SEC;
        if (settingsRef) {
            try {
                delaySec = settingsRef.get_double('dynamic-monitor-switch-delay');
            } catch (e) {}
        }
        const delayMs = delaySec * 1000;
        const nowMs = GLib.get_monotonic_time() / 1000;

        if (pendingMonitorIndex !== currentMonitor) {
            pendingMonitorIndex = currentMonitor;
            hoverStartTimeMs = nowMs;
        } else if (nowMs - hoverStartTimeMs >= delayMs) {
            pendingMonitorIndex = -1;
            _switchToMonitor(currentMonitor, true);
        }
    } else {
        // Cursor moved out of bottom edge region on target monitor
        if (pendingMonitorIndex === currentMonitor) {
            pendingMonitorIndex = -1;
        }
    }

    return GLib.SOURCE_CONTINUE;
}

export function enable(settings) {
    if (enabled)
        return;

    enabled = true;
    settingsRef = settings;
    currentActiveMonitor = -1;
    pendingMonitorIndex = -1;

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
            try {
                container.remove_all_transitions();
            } catch (e) {}
            container.visible = true;
            container.translation_y = 0;
            container.opacity = 255;
            container._ignoreHover = false;
            delete container._ddockMonitorIndex;
            if (typeof container._show === 'function') {
                try { container._show(); } catch (e) {}
            }
        }
    } catch (e) {
        console.warn(`[DDock-Plus] Error restoring dock visibility on disable: ${e}`);
    }

    settingsRef = null;
    d2dSettings = null;
    currentActiveMonitor = -1;
    pendingMonitorIndex = -1;
    console.log('[DDock-Plus] Dynamic Monitor Switch disabled');
}

