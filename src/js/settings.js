import { CONFIG } from './config.js';

const DEFAULTS = {
    RPC_URL: 'https://rpc.blurt.world',
    USE_COAL: true,
    THEME: CONFIG.DEFAULT_THEME || 'default' // Use admin-defined default, or fallback to standard Bootstrap
};

let settings = {};

/**
 * Loads settings from localStorage or sets defaults.
 */
export function initSettings() {
    try {
        const storedSettings = JSON.parse(localStorage.getItem('blurtbb_settings'));
        settings = { ...DEFAULTS, ...storedSettings };
    } catch (e) {
        settings = { ...DEFAULTS };
    }
    console.log('Settings loaded:', settings);
}

/**
 * Gets a specific setting value.
 * @param {string} key 
 * @returns {any}
 */
export function getSetting(key) {
    return settings[key];
}

/**
 * Saves all current settings to localStorage.
 */
export function saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    localStorage.setItem('blurtbb_settings', JSON.stringify(settings));
    console.log('Settings saved:', settings);
}
