/**
 * Общие вспомогательные утилиты для всех уровней тестирования (tools-src/*).
 * Устраняет дублирование файловых хелперов, инструментирования модулей и моков хранилищ.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function parseJsonFile(relPath) {
    const raw = readProjectFile(relPath);
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`Невалидный JSON в файле ${relPath}: ${err.message}`);
    }
}

function getManifestVersion() {
    return parseJsonFile('manifest.json').version;
}

function stripComments(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

/**
 * Внедряет тестовый хук внутрь IIFE целевого модуля расширения без модификации файла на диске.
 * @param {string} relPath
 * @param {string} hookAssignment
 * @returns {string}
 */
function instrumentScriptWithHook(relPath, hookAssignment) {
    const code = readProjectFile(relPath);
    if (!hookAssignment) return code;

    if (relPath.includes('sso-autologin.js')) {
        return code.replace(
            /\(async\s*\(\)\s*=>\s*\{/,
            `$& \n${hookAssignment}\n`
        );
    }
    if (relPath.includes('pe-module.js')) {
        const lastReturn = code.lastIndexOf('return {');
        return code.slice(0, lastReturn) + `\n${hookAssignment}\n` + code.slice(lastReturn);
    }
    return code.replace(
        /\}\)\(\);\s*$/,
        `\n${hookAssignment}\n})();`
    );
}

class MockStorage {
    constructor() {
        this._map = new Map();
    }
    getItem(key) {
        return this._map.has(key) ? this._map.get(key) : null;
    }
    setItem(key, value) {
        this._map.set(String(key), String(value));
    }
    removeItem(key) {
        this._map.delete(String(key));
    }
    clear() {
        this._map.clear();
    }
    get length() {
        return this._map.size;
    }
    key(index) {
        return Array.from(this._map.keys())[index] || null;
    }
}

/**
 * Генерирует JS-код для установки моков localStorage/sessionStorage внутри вкладки Chrome (about:blank).
 * @returns {string}
 */
function getBrowserStoragePolyfillScript() {
    return `
        const createStorage = () => {
            const map = new Map();
            return {
                getItem: k => map.has(k) ? map.get(k) : null,
                setItem: (k, v) => map.set(String(k), String(v)),
                removeItem: k => map.delete(String(k)),
                clear: () => map.clear(),
                key: i => Array.from(map.keys())[i] || null,
                get length() { return map.size; }
            };
        };
        Object.defineProperty(window, 'localStorage', { value: createStorage(), configurable: true });
        Object.defineProperty(window, 'sessionStorage', { value: createStorage(), configurable: true });
    `;
}

module.exports = {
    ROOT_DIR,
    readProjectFile,
    parseJsonFile,
    getManifestVersion,
    stripComments,
    instrumentScriptWithHook,
    MockStorage,
    getBrowserStoragePolyfillScript
};
