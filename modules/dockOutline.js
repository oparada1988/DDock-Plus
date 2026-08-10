// SPDX-License-Identifier: GPL-3.0-or-later
// Dock Outline customization module for DDock-Plus.

import * as dockUtils from './dockUtils.js';

let settingsSignalIds = [];
let _settings = null;
let _globalSignals = [];
let _sources = {};
let _attachedContainers = new Set();

export function enable(settings) {
    _settings = settings;

    const keys = [
        'enable-dock-outline',
        'dock-outline-width',
        'dock-outline-color',
        'dock-outline-style',
        'dock-outline-auto-radius',
        'dock-outline-radius',
    ];

    keys.forEach(key => {
        const signalId = _settings.connect(`changed::${key}`, () => {
            syncOutline();
        });
        settingsSignalIds.push(signalId);
    });

    dockUtils.watchDocks({
        attach: container => {
            _attachedContainers.add(container);
            syncOutlineForContainer(container);
        },
        count: () => _attachedContainers.size,
        globalSignals: _globalSignals,
        sources: _sources,
    });

    syncOutline();
}

function getOutlineStyle() {
    if (!_settings) return null;

    const enabled = _settings.get_boolean('enable-dock-outline');
    if (!enabled) return null;

    const width = Math.min(Math.max(_settings.get_int('dock-outline-width'), 0), 5);
    if (width === 0) return null;

    const color = _settings.get_string('dock-outline-color') || 'rgba(255, 255, 255, 0.45)';
    const style = _settings.get_string('dock-outline-style') || 'solid';
    const autoRadius = _settings.get_boolean('dock-outline-auto-radius');
    const radius = Math.min(Math.max(_settings.get_int('dock-outline-radius'), 0), 30);

    let css = `border: ${width}px ${style} ${color};`;
    if (!autoRadius) {
        css += ` border-radius: ${radius}px;`;
    }

    return css;
}

export function syncOutline() {
    if (!_settings) return;
    const containers = dockUtils.dockContainers();
    containers.forEach(container => {
        _attachedContainers.add(container);
        syncOutlineForContainer(container);
    });
}

function syncOutlineForContainer(container) {
    const cssStyle = getOutlineStyle();
    const dash = dockUtils.dashOf(container);
    const target = dash || container;

    if (cssStyle) {
        target.set_style(cssStyle);
    } else {
        target.set_style(null);
        if (dash) container.set_style(null);
    }
}

export function disable() {
    if (_settings && settingsSignalIds.length > 0) {
        settingsSignalIds.forEach(id => _settings.disconnect(id));
        settingsSignalIds = [];
    }

    dockUtils.disconnectAll(_globalSignals);
    _globalSignals = [];

    if (_sources.dockSearch) {
        import('gi://GLib').then(GLib => {
            GLib.default.Source.remove(_sources.dockSearch);
            _sources.dockSearch = 0;
        }).catch(() => {});
    }

    _attachedContainers.forEach(container => {
        try {
            const dash = dockUtils.dashOf(container);
            if (dash) dash.set_style(null);
            container.set_style(null);
        } catch (e) {}
    });

    _attachedContainers.clear();
    _settings = null;
}
