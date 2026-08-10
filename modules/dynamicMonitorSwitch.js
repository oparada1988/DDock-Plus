// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamic Dock Monitor Switch for DDock-Plus
// Multi-monitor approach: leverages Dash-to-Dock multi-monitor support to show the dock on the active monitor and hide it on inactive monitors.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { dockContainers } from './dockUtils.js';

const D2D_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
const DEFAULT_DELAY_SEC = 2.3;
const BOTTOM_EDGE_MARGIN = 25; // px from bottom edge of monitor to consider "bottom edge"

let enabled = false;
let settingsRef = null;
let d2dSettings = null;
let pollTimerId = 0;

let currentActiveMonitor = -1;
let pendingMonitorIndex = -1;
let hoverStartTimeMs = 0;

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

function _animateContainerShow(container) {
    if (!container) return;
    try {
        container.remove_all_transitions();
    } catch (e) {}

    container.visible = true;
    const initialSlide = container.height > 0 ? container.height + 20 : 120;
    
    // Only set starting position if not already visible/positioned
    if (container.translation_y === 0) {
        container.translation_y = initialSlide;
    }

    container.ease({
        translation_y: 0,
        opacity: 255,
        duration: 250,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
    });
}

function _animateContainerHide(container) {
    if (!container || !container.visible) return;
    try {
        container.remove_all_transitions();
    } catch (e) {}

    const slideDist = container.height > 0 ? container.height + 20 : 120;

    container.ease({
        translation_y: slideDist,
        opacity: 0,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_IN_CUBIC,
        onComplete: () => {
            container.visible = false;
            container.translation_y = 0;
            container.opacity = 255;
        },
    });
}

function _switchToMonitor(targetMonitorIndex) {
    if (currentActiveMonitor === targetMonitorIndex) return;

    console.log(`[DDock-Plus] Switching active dock monitor to ${targetMonitorIndex} (was ${currentActiveMonitor})`);
    currentActiveMonitor = targetMonitorIndex;

    const containers = dockContainers();
    for (const container of containers) {
        const monIdx = _getContainerMonitorIndex(container);
        const shouldBeVisible = (monIdx === targetMonitorIndex);

        if (shouldBeVisible) {
            _animateContainerShow(container);
        } else {
            _animateContainerHide(container);
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
            if (!container.visible) {
                container.visible = true;
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
            if (y >= mon.y + mon.height - 2) {
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
        _switchToMonitor(currentMonitor);
        return GLib.SOURCE_CONTINUE;
    }

    // If pointer is on current active monitor, reset pending
    if (currentMonitor === currentActiveMonitor) {
        pendingMonitorIndex = -1;
        return GLib.SOURCE_CONTINUE;
    }

    // Pointer is on inactive monitor:
    // 1) Instant trigger if pressing cursor at very bottom edge
    if (isAtVeryEdge) {
        pendingMonitorIndex = -1;
        _switchToMonitor(currentMonitor);
        return GLib.SOURCE_CONTINUE;
    }

    // 2) 2.3 second delay trigger if cursor is in bottom edge region
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
            _switchToMonitor(currentMonitor);
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




