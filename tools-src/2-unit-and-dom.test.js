/**
 * Modeus Student Enhancer (MSE) — Автоматизированный набор тестов
 * Шаг 2: Модульные и DOM-тесты вычислительной и интерфейсной логики расширения
 *
 * Раннер: node:test и node:assert/strict
 * Команда для запуска: node --test tools-src/*.test.js
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

// Сравнение объектов между разными Realm VM без ошибки ERR_ASSERTION из-за прототипов
function assertDeepEqual(actual, expected, message) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
}

// --- Легковесный тестовый DOM и фабрика моков (Clean TestDOM) ---

class MockClassList {
    constructor(element) {
        this.element = element;
        this.classes = new Set();
    }
    add(...names) {
        names.forEach(n => n && this.classes.add(String(n)));
        this._sync();
    }
    remove(...names) {
        names.forEach(n => this.classes.delete(String(n)));
        this._sync();
    }
    contains(name) {
        return this.classes.has(String(name));
    }
    toggle(name, force) {
        const str = String(name);
        const shouldAdd = force !== undefined ? Boolean(force) : !this.classes.has(str);
        if (shouldAdd) this.classes.add(str);
        else this.classes.delete(str);
        this._sync();
        return shouldAdd;
    }
    _sync() {
        this.element._className = Array.from(this.classes).join(' ');
    }
}

class MockElement {
    constructor(tagName, documentRef = null) {
        this.tagName = String(tagName).toUpperCase();
        this.nodeType = this.tagName === '#TEXT' ? 3 : (this.tagName === '#FRAGMENT' ? 11 : 1);
        this.documentRef = documentRef;
        this.id = '';
        this._className = '';
        this.classList = new MockClassList(this);
        this.attributes = new Map();
        this.dataset = {};
        this.style = {};
        this.children = [];
        this.childNodes = [];
        this.parentElement = null;
        this.listeners = new Map();
        this._textContent = '';
        this._innerHTML = '';
    }

    get className() {
        return this._className;
    }
    set className(val) {
        this._className = String(val || '');
        this.classList.classes = new Set(this._className.split(/\s+/).filter(Boolean));
    }

    get textContent() {
        if (this.nodeType === 3) return this._textContent;
        if (this.children.length === 0) return this._textContent;
        return this.children.map(c => c.textContent).join('');
    }
    set textContent(val) {
        this._textContent = String(val ?? '');
        this.children = [];
        this.childNodes = [];
    }

    get innerText() {
        return this.textContent;
    }
    set innerText(val) {
        this.textContent = val;
    }

    get innerHTML() {
        return this._innerHTML || this.textContent;
    }
    set innerHTML(html) {
        this._innerHTML = String(html || '');
        this.children = [];
        this.childNodes = [];
        this._parseInnerTags(this._innerHTML);
    }

    _parseInnerTags(html) {
        const tagRegex = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/g;
        let match;
        while ((match = tagRegex.exec(html)) !== null) {
            const tagName = match[1] || match[4];
            const rawAttrs = match[2] || match[5] || '';
            const childEl = new MockElement(tagName, this.documentRef);

            const idMatch = rawAttrs.match(/\bid=["']([^"']+)["']/i);
            if (idMatch) {
                childEl.id = idMatch[1];
                if (this.documentRef) this.documentRef._registerId(childEl.id, childEl);
            }
            const classMatch = rawAttrs.match(/\bclass=["']([^"']+)["']/i);
            if (classMatch) childEl.className = classMatch[1];

            const actionMatch = rawAttrs.match(/\bdata-action=["']([^"']+)["']/i);
            if (actionMatch) childEl.dataset.action = actionMatch[1];

            childEl.textContent = (match[3] || '').replace(/<[^>]+>/g, '').trim();
            this.appendChild(childEl);
        }
    }

    setAttribute(name, value) {
        const valStr = String(value);
        this.attributes.set(name.toLowerCase(), valStr);
        if (name.toLowerCase() === 'id') {
            this.id = valStr;
            if (this.documentRef) this.documentRef._registerId(valStr, this);
        } else if (name.toLowerCase() === 'class') {
            this.className = valStr;
        } else if (name.toLowerCase().startsWith('data-')) {
            const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
            this.dataset[key] = valStr;
        }
    }
    getAttribute(name) {
        const key = name.toLowerCase();
        if (key === 'id') return this.id || null;
        if (key === 'class') return this.className || null;
        return this.attributes.has(key) ? this.attributes.get(key) : null;
    }
    hasAttribute(name) {
        return this.attributes.has(name.toLowerCase());
    }
    removeAttribute(name) {
        this.attributes.delete(name.toLowerCase());
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        this.childNodes.push(child);
        return child;
    }
    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            this.childNodes.splice(idx, 1);
            child.parentElement = null;
        }
        return child;
    }
    remove() {
        if (this.parentElement) {
            this.parentElement.removeChild(this);
        }
    }
    contains(node) {
        let curr = node;
        while (curr) {
            if (curr === this) return true;
            curr = curr.parentElement;
        }
        return false;
    }
    cloneNode(deep = false) {
        const clone = new MockElement(this.tagName, this.documentRef);
        clone.id = this.id;
        clone.className = this.className;
        clone.textContent = this._textContent;
        clone.attributes = new Map(this.attributes);
        clone.dataset = { ...this.dataset };
        if (deep) {
            this.children.forEach(c => clone.appendChild(c.cloneNode(true)));
        }
        return clone;
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    removeEventListener(type, listener) {
        if (!this.listeners.has(type)) return;
        const list = this.listeners.get(type).filter(l => l !== listener);
        this.listeners.set(type, list);
    }
    dispatchEvent(event) {
        const list = this.listeners.get(event.type) || [];
        list.forEach(cb => cb.call(this, event));
        if (this.parentElement && !event.cancelBubble) {
            this.parentElement.dispatchEvent(event);
        }
        return true;
    }
    click() {
        this.dispatchEvent({ type: 'click', target: this, cancelBubble: false, stopPropagation: () => {} });
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
        const results = [];
        const parts = selector.trim().split(/\s+/);

        const matchesSingle = (el, sel) => {
            if (!el || el.nodeType !== 1) return false;
            let s = sel.trim();

            const notMatches = s.match(/:not\(([^)]+)\)/g);
            if (notMatches) {
                for (const nm of notMatches) {
                    const inner = nm.slice(5, -1).trim();
                    if (matchesSingle(el, inner)) return false;
                    s = s.replace(nm, '');
                }
            }

            const attrMatches = s.match(/\[([a-zA-Z0-9_-]+)(?:=(?:["']([^"']*)["']|([^\]]+)))?\]/g);
            if (attrMatches) {
                for (const am of attrMatches) {
                    const parsed = am.match(/\[([a-zA-Z0-9_-]+)(?:=(?:["']([^"']*)["']|([^\]]+)))?\]/);
                    if (parsed) {
                        const attrName = parsed[1].toLowerCase();
                        const expectedVal = parsed[2] !== undefined ? parsed[2] : parsed[3];
                        if (!el.hasAttribute(attrName)) return false;
                        if (expectedVal !== undefined && el.getAttribute(attrName) !== expectedVal) return false;
                    }
                    s = s.replace(am, '');
                }
            }

            const idMatches = s.match(/#([a-zA-Z0-9_-]+)/g);
            if (idMatches) {
                for (const im of idMatches) {
                    if (el.id !== im.slice(1)) return false;
                    s = s.replace(im, '');
                }
            }

            const classMatches = s.match(/\.([a-zA-Z0-9_-]+)/g);
            if (classMatches) {
                for (const cm of classMatches) {
                    const hasCls = el.classList?.contains ? el.classList.contains(cm.slice(1)) : el.classList?.has?.(cm.slice(1));
                    if (!hasCls) return false;
                    s = s.replace(cm, '');
                }
            }

            s = s.trim();
            if (s && s !== '*') {
                if (el.tagName !== s.toUpperCase()) return false;
            }
            return true;
        };

        const traverse = (el) => {
            for (const child of el.children) {
                if (parts.length === 1) {
                    if (matchesSingle(child, parts[0])) results.push(child);
                } else {
                    if (matchesSingle(child, parts[parts.length - 1])) {
                        let ancestor = child.parentElement;
                        let matched = false;
                        while (ancestor && ancestor !== el.parentElement) {
                            if (matchesSingle(ancestor, parts[0])) {
                                matched = true;
                                break;
                            }
                            ancestor = ancestor.parentElement;
                        }
                        if (matched) results.push(child);
                    }
                }
                traverse(child);
            }
        };
        traverse(this);
        return results;
    }

    closest(selector) {
        let curr = this;
        const clean = selector.trim();
        while (curr) {
            if (clean.startsWith('[data-action]') && curr.dataset?.action) return curr;
            if (clean.startsWith('.') && curr.classList?.contains(clean.slice(1))) return curr;
            if (clean.startsWith('#') && curr.id === clean.slice(1)) return curr;
            curr = curr.parentElement;
        }
        return null;
    }

    getBoundingClientRect() {
        return {
            top: 0,
            left: 0,
            bottom: this.clientHeight || 50,
            right: this.clientWidth || 100,
            width: this.clientWidth || 100,
            height: this.clientHeight || 50
        };
    }
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

class MockDocument {
    constructor() {
        this._elementsById = new Map();
        this.documentElement = new MockElement('HTML', this);
        this.head = new MockElement('HEAD', this);
        this.body = new MockElement('BODY', this);
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
    }
    _registerId(id, el) {
        this._elementsById.set(id, el);
    }
    createElement(tagName) {
        return new MockElement(tagName, this);
    }
    createDocumentFragment() {
        return new MockElement('#FRAGMENT', this);
    }
    createTextNode(text) {
        const el = new MockElement('#TEXT', this);
        el.textContent = text;
        return el;
    }
    getElementById(id) {
        const el = this._elementsById.get(id);
        if (el && this.documentElement.contains(el)) return el;
        return this.documentElement.querySelector(`#${id}`);
    }
    querySelector(selector) {
        return this.documentElement.querySelector(selector);
    }
    querySelectorAll(selector) {
        return this.documentElement.querySelectorAll(selector);
    }
    addEventListener() {}
    removeEventListener() {}
}

function createMockEnvironment(initialUrl = 'https://utmn.modeus.org/') {
    const doc = new MockDocument();
    const urlObj = new URL(initialUrl);
    const localStore = new MockStorage();
    const sessionStore = new MockStorage();

    const mockWindow = {
        document: doc,
        location: {
            href: initialUrl,
            hash: urlObj.hash,
            pathname: urlObj.pathname,
            hostname: urlObj.hostname,
            replace: (newUrl) => {
                mockWindow.location.href = newUrl;
                try {
                    const u = new URL(newUrl, 'https://utmn.modeus.org/');
                    mockWindow.location.pathname = u.pathname;
                    mockWindow.location.hash = u.hash;
                } catch { }
            }
        },
        history: {
            replaceState: (_, __, newUrl) => { mockWindow.location.pathname = newUrl; },
            pushState: (_, __, newUrl) => { mockWindow.location.pathname = newUrl; }
        },
        localStorage: localStore,
        sessionStorage: sessionStore,
        performance: { now: () => performance.now() },
        crypto: crypto.webcrypto,
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        TextEncoder,
        TextDecoder,
        Uint8Array,
        URL,
        URLSearchParams,
        AbortController,
        setInterval: () => 1,
        clearInterval: () => {},
        setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
        clearTimeout: () => {},
        innerWidth: 1200,
        innerHeight: 800,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
        Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_FRAGMENT_NODE: 11 },
        MutationObserver: class {
            observe() {}
            disconnect() {}
            takeRecords() { return []; }
        },
        XMLHttpRequest: class {
            open() {}
            send() {}
            setRequestHeader() {}
        },
        chrome: {
            storage: {
                sync: {
                    get: async () => ({ enabled: true }),
                    set: async () => {}
                },
                local: {
                    get: async () => ({}),
                    set: async () => {},
                    remove: async () => {}
                }
            },
            runtime: {
                getURL: (p) => `chrome-extension://mse/${p}`,
                getManifest: () => ({ version: '2.2.5' })
            }
        },
        console: {
            log: () => {},
            warn: () => {},
            error: () => {},
            info: () => {}
        }
    };

    mockWindow.window = mockWindow;
    mockWindow.self = mockWindow;
    mockWindow.top = mockWindow;
    mockWindow.global = mockWindow;
    mockWindow.globalThis = mockWindow;

    return mockWindow;
}

// --- Загрузчик модулей с инъекцией хуков в памяти (Approach A) ---

function executeScriptWithHook(relPath, hookAssignment, env) {
    const absPath = path.join(ROOT_DIR, relPath);
    const code = fs.readFileSync(absPath, 'utf8');

    let instrumentedCode;
    if (relPath.includes('sso-autologin.js')) {
        // Для async IIFE sso-autologin инжектируем хук в начало тела IIFE (где функции хостятся)
        instrumentedCode = code.replace(
            /\(async\s*\(\)\s*=>\s*\{/,
            `$& \n${hookAssignment}\n`
        );
    } else if (relPath.includes('pe-module.js')) {
        // Для pe-module инжектируем хук перед последним 'return {'
        const lastReturn = code.lastIndexOf('return {');
        instrumentedCode = code.slice(0, lastReturn) + `\n${hookAssignment}\n` + code.slice(lastReturn);
    } else {
        // Для injected.js и keeper-early.js инжектируем перед закрывающей скобкой IIFE
        instrumentedCode = code.replace(
            /\}\)\(\);\s*$/,
            `\n${hookAssignment}\n})();`
        );
    }

    const context = vm.createContext(env);
    new vm.Script(instrumentedCode, { filename: relPath }).runInContext(context);
    return env;
}

// --- Тестовые наборы проверок Шага 2 ---

describe('Шаг 2: Модульные и DOM-тесты логики расширения', () => {

    describe('1. Сессия, токены и холодный старт (keeper-early.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_KEEPER__ = { parseJwtPayload, resolveBackupIdTokenExpiry, hasValidToken, AUTH_STORAGE_KEYS };
            }`;
            executeScriptWithHook('src/keeper-early.js', hook, env);
            hooks = env.__MSE_KEEPER__;
        });

        test('parseJwtPayload: корректно парсит 3-сегментный JWT с base64url символами', () => {
            const payloadObj = { sub: 'student_123', name: 'Иван Иванов', exp: 1750000000 };
            const b64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            const token = `header.${b64}.signature`;

            const parsed = hooks.parseJwtPayload(token);
            assertDeepEqual(parsed, payloadObj);
        });

        test('parseJwtPayload: устойчив к отсутствию паддинга = (длина не кратна 4)', () => {
            for (let len = 1; len <= 8; len++) {
                const payloadObj = { data: 'a'.repeat(len) };
                const b64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64').replace(/=/g, '');
                const token = `header.${b64}.signature`;
                const parsed = hooks.parseJwtPayload(token);
                assertDeepEqual(parsed, payloadObj, `Не удалось распарсить JWT длины ${b64.length}`);
            }
        });

        test('parseJwtPayload: возвращает null для невалидных данных (битый JSON, < 3 частей)', () => {
            assert.strictEqual(hooks.parseJwtPayload('invalid_token'), null);
            assert.strictEqual(hooks.parseJwtPayload('a.not_base64_json.c'), null);
            assert.strictEqual(hooks.parseJwtPayload(null), null);
            assert.strictEqual(hooks.parseJwtPayload(12345), null);
        });

        test('resolveBackupIdTokenExpiry: извлекает exp * 1000 и фолбэчится на expires_at', () => {
            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const b64 = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64');
            const token = `h.${b64}.s`;

            const backupWithToken = { id_token: token };
            assert.strictEqual(hooks.resolveBackupIdTokenExpiry(backupWithToken), expSec * 1000);

            const backupFallback = { id_token_expires_at: '1700000000000' };
            assert.strictEqual(hooks.resolveBackupIdTokenExpiry(backupFallback), 1700000000000);
            assert.strictEqual(hooks.resolveBackupIdTokenExpiry(null), 0);
        });

        test('hasValidToken: проверяет свежесть access_token, id_token и backup в localStorage', () => {
            const now = Date.now();
            assert.strictEqual(hooks.hasValidToken(), false);

            env.sessionStorage.setItem('access_token', 'valid_access');
            env.sessionStorage.setItem('expires_at', String(now + 60000));
            assert.strictEqual(hooks.hasValidToken(), true);

            env.sessionStorage.clear();
            const expSec = Math.floor(now / 1000) + 7200;
            const b64 = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64');
            env.sessionStorage.setItem('id_token', `h.${b64}.s`);
            assert.strictEqual(hooks.hasValidToken(), true);

            env.sessionStorage.clear();
            const backup = { id_token: `h.${b64}.s` };
            env.localStorage.setItem('mse_auth_backup', JSON.stringify(backup));
            assert.strictEqual(hooks.hasValidToken(), true);

            const expiredSec = Math.floor(now / 1000) - 100;
            const b64Exp = Buffer.from(JSON.stringify({ exp: expiredSec })).toString('base64');
            env.localStorage.setItem('mse_auth_backup', JSON.stringify({ id_token: `h.${b64Exp}.s` }));
            assert.strictEqual(hooks.hasValidToken(), false);
        });

        test('хэш #mse_logout=1: очищает сессию и перенаправляет на WSO2 prompt=login', () => {
            const logoutEnv = createMockEnvironment('https://utmn.modeus.org/#mse_logout=1');
            logoutEnv.localStorage.setItem('mse_auth_backup', 'data');
            logoutEnv.sessionStorage.setItem('access_token', 'token');

            executeScriptWithHook('src/keeper-early.js', '', logoutEnv);

            assert.strictEqual(logoutEnv.localStorage.getItem('mse_auth_backup'), null);
            assert.strictEqual(logoutEnv.sessionStorage.getItem('access_token'), null);
            assert.ok(logoutEnv.location.href.includes('prompt=login'));
            assert.ok(logoutEnv.location.href.includes('https://auth.modeus.org/oauth2/authorize'));
        });

        test('хэш #access_token=...: сохраняет 9 ключей и очищает URL в / через replaceState', () => {
            const hash = '#access_token=acc123&id_token=id456&expires_in=3600&session_state=state789';
            const authEnv = createMockEnvironment(`https://utmn.modeus.org/${hash}`);

            executeScriptWithHook('src/keeper-early.js', '', authEnv);

            assert.strictEqual(authEnv.sessionStorage.getItem('access_token'), 'acc123');
            assert.strictEqual(authEnv.sessionStorage.getItem('id_token'), 'id456');
            assert.strictEqual(authEnv.sessionStorage.getItem('session_state'), 'state789');
            assert.ok(authEnv.localStorage.getItem('mse_auth_backup') !== null);
            assert.strictEqual(authEnv.location.pathname, '/');
        });
    });

    describe('2. Криптография и автовход ADFS (sso-autologin.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://fs.utmn.ru/adfs/ls/');
            // enabled: false предотвращает сетевую и DOM активность при тестировании крипто-хелперов
            env.chrome.storage.sync.get = async () => ({ enabled: false });

            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_SSO__ = { encryptCredentials, decryptCredentials };
            }`;
            executeScriptWithHook('src/sso-autologin.js', hook, env);
            hooks = env.__MSE_SSO__;
        });

        test('encryptCredentials/decryptCredentials: полный цикл AES-GCM 256 бит', async () => {
            const username = 'test_student@utmn.ru';
            const password = 'SecretPassword123!';

            const vault = await hooks.encryptCredentials(username, password);
            assert.ok(vault.ciphertextBase64, 'Шифротекст должен присутствовать');
            assert.ok(vault.ivBase64, 'IV вектор должен присутствовать');
            assert.ok(vault.keyJwk, 'JWK ключ должен присутствовать');

            const decrypted = await hooks.decryptCredentials(vault);
            assertDeepEqual(decrypted, { username, password });
        });

        test('encryptCredentials: генерирует уникальный случайный IV для каждого вызова', async () => {
            const vault1 = await hooks.encryptCredentials('user', 'pass');
            const vault2 = await hooks.encryptCredentials('user', 'pass');
            assert.notStrictEqual(vault1.ivBase64, vault2.ivBase64, 'IV должен быть уникальным');
            assert.notStrictEqual(vault1.ciphertextBase64, vault2.ciphertextBase64);
        });

        test('decryptCredentials: корректно возвращает null при повреждении шифротекста или ключа', async () => {
            const vault = await hooks.encryptCredentials('user', 'pass');

            const badCiphertext = { ...vault, ciphertextBase64: 'broken_base64_data==' };
            const res1 = await hooks.decryptCredentials(badCiphertext);
            assert.strictEqual(res1, null);

            const badIv = { ...vault, ivBase64: 'broken_iv' };
            const res2 = await hooks.decryptCredentials(badIv);
            assert.strictEqual(res2, null);

            const res3 = await hooks.decryptCredentials(null);
            assert.strictEqual(res3, null);
        });
    });

    describe('3. Таблица успеваемости и расчёт баллов (injected.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_INJECTED__ = {
                    parseNumericGrade,
                    createGradeBadge,
                    createUnknownGradeBadge,
                    calculateMultiPointScore,
                    resolveLessonMaxGrades,
                    setLessonMaxGrade: (id, grade) => mseLessonMaxGrades.set(id, grade),
                    setLessonNameToMaxGrade: (key, grade) => mseLessonNameToMaxGrade.set(key, grade),
                    clearLessonGradeMaps: () => {
                        mseLessonMaxGrades.clear();
                        mseLessonNameToMaxGrade.clear();
                    }
                };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);
            hooks = env.__MSE_INJECTED__;
        });

        test('parseNumericGrade: корректно парсит "0" как число 0, а не null', () => {
            assert.strictEqual(hooks.parseNumericGrade('0'), 0);
            assert.strictEqual(hooks.parseNumericGrade(0), 0);
            assert.strictEqual(hooks.parseNumericGrade(' 0.0 '), 0);
            assert.strictEqual(hooks.parseNumericGrade('0,0'), 0);
        });

        test('parseNumericGrade: парсит целые и десятичные числа с точкой и запятой', () => {
            assert.strictEqual(hooks.parseNumericGrade('15'), 15);
            assert.strictEqual(hooks.parseNumericGrade('85.5'), 85.5);
            assert.strictEqual(hooks.parseNumericGrade(' 92,4 '), 92.4);
        });

        test('parseNumericGrade: возвращает null для невалидных значений', () => {
            assert.strictEqual(hooks.parseNumericGrade(''), null);
            assert.strictEqual(hooks.parseNumericGrade('н/я'), null);
            assert.strictEqual(hooks.parseNumericGrade('зачет'), null);
            assert.strictEqual(hooks.parseNumericGrade('- '), null);
            assert.strictEqual(hooks.parseNumericGrade(null), null);
            assert.strictEqual(hooks.parseNumericGrade(undefined), null);
        });

        test('calculateMultiPointScore: вычисляет набранные баллы и максимальный результат', () => {
            const grades = ['5', '3.5', 'н/я'];
            const maxes = [5, 5, 5];

            const score = hooks.calculateMultiPointScore(grades, maxes);
            assert.strictEqual(score.totalEarned, 8.5);
            assert.strictEqual(score.evaluatedMax, 10);

            const zeroMax = hooks.calculateMultiPointScore(['0'], [0]);
            assert.strictEqual(zeroMax.totalEarned, 0);
            assert.strictEqual(zeroMax.evaluatedMax, 0);
        });

        test('createGradeBadge: создаёт DOM-элемент .mse-max-grade с разметкой /max', () => {
            const badge = hooks.createGradeBadge(10);
            assert.strictEqual(badge.tagName, 'SPAN');
            assert.strictEqual(badge.className, 'mse-max-grade');
            assert.strictEqual(badge.textContent, ' /10');

            const invalidBadge = hooks.createGradeBadge(0);
            assert.strictEqual(invalidBadge.nodeType, 11); // Фрагмент документа DocumentFragment
        });

        test('createUnknownGradeBadge: создаёт бейдж неизвестного максимума .mse-max-unknown', () => {
            const badge = hooks.createUnknownGradeBadge();
            assert.strictEqual(badge.tagName, 'SPAN');
            assert.ok(badge.classList.contains('mse-max-grade'));
            assert.ok(badge.classList.contains('mse-max-unknown'));
            assert.strictEqual(badge.textContent, ' / ?');
        });

        test('resolveLessonMaxGrades: неоцениваемое занятие с null по ID не берёт баллы семинара по имени (Раздел 2.3)', () => {
            hooks.clearLessonGradeMaps();
            const courseUnitId = 'course-unit-math-1';
            const lectureLesson = { id: 'lesson-lecture-01', name: 'Математический анализ' };
            const seminarLesson = { id: 'lesson-seminar-01', name: 'Математический анализ' };

            // Семинар с тем же названием оценивается в 10 баллов (записан в fallback по имени)
            hooks.setLessonNameToMaxGrade(`${courseUnitId}:Математический анализ`, [10]);

            // Лекция явно зарегистрирована в техкарте как неоцениваемая (null)
            hooks.setLessonMaxGrade(lectureLesson.id, null);

            // Инвариант: для лекции возвращается null, а не fallback-баллы [10]
            assert.strictEqual(hooks.resolveLessonMaxGrades(lectureLesson, courseUnitId), null);

            // Для неизвестного ID срабатывает fallback по названию занятия
            assertDeepEqual(hooks.resolveLessonMaxGrades(seminarLesson, courseUnitId), [10]);

            // Для null занятия возвращается null
            assert.strictEqual(hooks.resolveLessonMaxGrades(null, courseUnitId), null);
        });
    });

    describe('4. Расписание, друзья и подсказки (injected.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://utmn.modeus.org/');
            env.localStorage.setItem('mse_my_specialty', 'Прикладная информатика');
            env.localStorage.setItem('mse_my_profile', 'Разработка ПО');

            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_INJECTED__ = {
                    isSameStudyDirection,
                    calculateSpotlightCardPosition,
                    getFriends,
                    addFriend,
                    removeFriend,
                    highlightEventsForStudents,
                    selectedStudents,
                    eventCache,
                    uniqueStudents,
                    clearSearch,
                    processUrlChange,
                    updateCardLayout,
                    highlightSingleCard,
                    hasUnmarkedCalendarEvents,
                    hasUnenhancedBuildingEvents,
                    enhanceBuildingNames,
                    setBuildingMap: (map) => { buildingMap = map; },
                    handleMainDomMutations,
                    CLASS_MSE_SEARCH_FILTERING_ACTIVE
                };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);
            hooks = env.__MSE_INJECTED__;
        });

        test('isSameStudyDirection: сравнивает направление и профиль подготовки студента', () => {
            const sameStudent = { specialtyName: 'Прикладная информатика', specialtyProfile: 'Разработка ПО' };
            assert.strictEqual(hooks.isSameStudyDirection(sameStudent), true);

            const diffProfile = { specialtyName: 'Прикладная информатика', specialtyProfile: 'ИТ-менеджмент' };
            assert.strictEqual(hooks.isSameStudyDirection(diffProfile), false);

            const diffSpecialty = { specialtyName: 'Юриспруденция', specialtyProfile: 'Разработка ПО' };
            assert.strictEqual(hooks.isSameStudyDirection(diffSpecialty), false);

            assert.strictEqual(hooks.isSameStudyDirection(null), false);
        });

        test('calculateSpotlightCardPosition: центрирует карточку и разворачивает влево у края экрана', () => {
            const targetEl = env.document.createElement('div');
            targetEl.getBoundingClientRect = () => ({ top: 100, right: 300, bottom: 140, left: 200, width: 100, height: 40 });

            const posRight = hooks.calculateSpotlightCardPosition(targetEl, 310);
            assert.strictEqual(posRight.left, 314); // Граница rect.right (300) + смещение (14)
            assert.strictEqual(posRight.top, 100);

            // Разворот влево при приближении к правому краю (1150 + 14 + 310 > 1200 - 10)
            targetEl.getBoundingClientRect = () => ({ top: 100, right: 1150, bottom: 140, left: 1050, width: 100, height: 40 });
            const posLeft = hooks.calculateSpotlightCardPosition(targetEl, 310);
            assert.strictEqual(posLeft.left, 726); // Граница rect.left (1050) - cardWidth (310) - смещение (14)
        });

        test('управление друзьями: добавление, валидация полей и удаление', () => {
            assertDeepEqual(hooks.getFriends(), []);

            hooks.addFriend('id-1', 'Алексей Смирнов');
            const friends1 = hooks.getFriends();
            assert.strictEqual(friends1.length, 1);
            assert.strictEqual(friends1[0].fullName, 'Алексей Смирнов');

            // Защита от дубликатов по ID
            hooks.addFriend('id-1', 'Алексей Дубль');
            assert.strictEqual(hooks.getFriends().length, 1);

            hooks.removeFriend('id-1');
            assertDeepEqual(hooks.getFriends(), []);
        });

        test('processUrlChange: клик по паре (?selectedEvent) или смена фильтров не сбрасывает поиск общих пар', () => {
            env.window.location.href = 'https://utmn.modeus.org/schedule-calendar/my?calendar=2026-W45';
            hooks.selectedStudents.add('Иванов Иван');
            hooks.processUrlChange();
            assert.strictEqual(hooks.selectedStudents.size, 1);

            // 1. Клик по паре (открытие боковой панели selectedEvent с добавлением eventsFilter)
            env.window.location.href = 'https://utmn.modeus.org/schedule-calendar/my?selectedEvent=%7B%22eventId%22%3A%22ev-1%22%7D&calendar=2026-W45&eventsFilter=%7B%22attendee%22%3A%5B%7B%22key%22%3A%22my-id%22%7D%5D%7D';
            hooks.processUrlChange();
            assert.strictEqual(hooks.selectedStudents.size, 1, 'Поиск не должен сбрасываться при клике на пару');
            assert.ok(hooks.selectedStudents.has('Иванов Иван'));

            // 2. Переключение фильтра в URL в рамках того же календаря
            env.window.location.href = 'https://utmn.modeus.org/schedule-calendar/my?selectedEvent=%7B%22eventId%22%3A%22ev-1%22%7D&calendar=2026-W45&eventsFilter=%7B%22attendee%22%3A%5B%7B%22key%22%3A%22my-id%22%7D%5D%2C%22eventFormat%22%3A%5B%22offline%22%5D%7D';
            hooks.processUrlChange();
            assert.strictEqual(hooks.selectedStudents.size, 1, 'Поиск не должен сбрасываться при переключении фильтров для того же студента');

            // 3. Переход в расписание друга (реальная смена владельца календаря)
            env.window.location.href = 'https://utmn.modeus.org/schedule-calendar/my?calendar=2026-W45&eventsFilter=%7B%22attendee%22%3A%5B%7B%22key%22%3A%22friend-id%22%7D%5D%7D';
            hooks.processUrlChange();
            assert.strictEqual(hooks.selectedStudents.size, 0, 'Поиск должен очиститься при смене владельца календаря');
        });

        test('highlightSingleCard: не пересоздает существующий узел бейджа в DOM, но всегда вызывает updateCardLayout', () => {
            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';
            card.setAttribute('data-event-id', 'ev-test-1');
            const content = env.document.createElement('div');
            content.className = 'fc-content';
            const title = env.document.createElement('div');
            title.className = 'fc-title';
            title.textContent = 'Математический анализ';
            content.appendChild(title);
            card.appendChild(content);
            env.document.body.appendChild(card);

            hooks.uniqueStudents.set('Иванов Иван', { id: 'p-1', fullName: 'Иванов Иван' });
            hooks.eventCache.set('ev-test-1', {
                name: 'Математический анализ',
                fullDisplayName: 'Математический анализ',
                startsAtLocal: '10:15',
                attendees: new Set(['Иванов Иван'])
            });

            // 1. Первое монтирование подсветки
            const normalizedSelected = new Set(['Иванов Иван']);
            hooks.highlightSingleCard(card, normalizedSelected);

            const bannerBefore = card.querySelector('.mse-event-match-tooltip');
            assert.ok(bannerBefore, 'Бейдж должен быть смонтирован в DOM');
            assert.strictEqual(card.classList.contains('search-highlight'), true);

            // 2. Повторный вызов: узел бейджа в DOM не должен пересоздаваться
            hooks.highlightSingleCard(card, normalizedSelected);
            const bannerAfter = card.querySelector('.mse-event-match-tooltip');
            assert.strictEqual(bannerBefore, bannerAfter, 'Существующий DOM-узел бейджа должен оставаться без удаления');
        });

        test('updateCardLayout: предотвращает повторную перезапись innerHTML при неизменном renderKey', () => {
            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';
            card.clientHeight = 50; // Короткая карточка
            const content = env.document.createElement('div');
            content.className = 'fc-content';
            const banner = env.document.createElement('div');
            banner.className = 'mse-event-match-tooltip';
            content.appendChild(banner);
            card.appendChild(content);

            hooks.updateCardLayout(card, ['Иванов Иван']);
            const htmlFirst = banner.innerHTML;
            const renderKeyFirst = banner.dataset.mseRenderKey;
            assert.ok(renderKeyFirst.startsWith('c:'), 'Для короткой карточки должен установиться compact режим');

            // Симулируем метку на DOM-узле
            banner.__customMarker = 123;
            hooks.updateCardLayout(card, ['Иванов Иван']);

            assert.strictEqual(banner.dataset.mseRenderKey, renderKeyFirst);
            assert.strictEqual(banner.__customMarker, 123, 'Свойства узла не должны сбрасываться при неизменном renderKey');
            assert.strictEqual(banner.innerHTML, htmlFirst);
        });

        test('hasUnmarkedCalendarEvents: корректно определяет появление карточек без разметки подсветки', () => {
            const unmarkedCard = env.document.createElement('div');
            unmarkedCard.className = 'fc-time-grid-event';

            const markedCard = env.document.createElement('div');
            markedCard.className = 'fc-time-grid-event search-fade';

            assert.strictEqual(hooks.hasUnmarkedCalendarEvents([{ addedNodes: [unmarkedCard] }]), true);
            assert.strictEqual(hooks.hasUnmarkedCalendarEvents([{ addedNodes: [markedCard] }]), false);
            assert.strictEqual(hooks.hasUnmarkedCalendarEvents([{ addedNodes: [] }]), false);
        });

        test('mse-search-filtering-active: выставляется на document.body при активном поиске и снимается при очистке', () => {
            assert.strictEqual(env.document.body.classList.contains(hooks.CLASS_MSE_SEARCH_FILTERING_ACTIVE), false);

            hooks.selectedStudents.add('Иванов Иван');
            hooks.highlightEventsForStudents();
            assert.strictEqual(env.document.body.classList.contains(hooks.CLASS_MSE_SEARCH_FILTERING_ACTIVE), true);

            hooks.clearSearch();
            assert.strictEqual(env.document.body.classList.contains(hooks.CLASS_MSE_SEARCH_FILTERING_ACTIVE), false);
        });

        test('handleMainDomMutations: синхронно восстанавливает классы подсветки до отрисовки кадра', () => {
            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';
            card.setAttribute('data-event-id', 'ev-sync-1');
            const content = env.document.createElement('div');
            content.className = 'fc-content';
            const title = env.document.createElement('div');
            title.className = 'fc-title';
            title.textContent = 'Физика';
            content.appendChild(title);
            card.appendChild(content);
            env.document.body.appendChild(card);

            hooks.uniqueStudents.set('Иванов Иван', { id: 'p-1', fullName: 'Иванов Иван' });
            hooks.eventCache.set('ev-sync-1', {
                name: 'Физика',
                fullDisplayName: 'Физика',
                startsAtLocal: '12:00',
                attendees: new Set(['Иванов Иван'])
            });
            hooks.selectedStudents.add('Иванов Иван');

            // Симулируем появление неразмеченной карточки в мутации
            hooks.handleMainDomMutations([{ addedNodes: [card] }]);

            // Проверяем, что подсветка восстановилась СИНХРОННО (без ожидания таймеров)
            assert.strictEqual(card.classList.contains('search-highlight'), true, 'Класс search-highlight должен выставиться синхронно');
            assert.ok(card.querySelector('.mse-event-match-tooltip'), 'Бейдж должен смонтироваться синхронно');
        });

        test('hasUnenhancedBuildingEvents: определяет появление карточек без атрибута data-mse-buildings-enhanced="1"', () => {
            const unmarkedCard = env.document.createElement('div');
            unmarkedCard.className = 'fc-time-grid-event';

            const markedCard = env.document.createElement('div');
            markedCard.className = 'fc-time-grid-event';
            markedCard.setAttribute('data-mse-buildings-enhanced', '1');

            assert.strictEqual(hooks.hasUnenhancedBuildingEvents([{ addedNodes: [unmarkedCard] }]), true);
            assert.strictEqual(hooks.hasUnenhancedBuildingEvents([{ addedNodes: [markedCard] }]), false);
            assert.strictEqual(hooks.hasUnenhancedBuildingEvents([{ addedNodes: [] }]), false);
        });

        test('enhanceBuildingNames: подменяет коды корпусов на понятные названия и маркирует карточки атрибутом data-mse-buildings-enhanced="1"', () => {
            hooks.setBuildingMap({ '05': 'ул. Перекопская, 15а' });

            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';

            const timeDiv = env.document.createElement('div');
            timeDiv.className = 'fc-time';

            const buildingSmall = env.document.createElement('small');
            buildingSmall.className = 'text-muted';
            buildingSmall.textContent = 'Корпус-05, Ауд. 302';
            timeDiv.appendChild(buildingSmall);
            card.appendChild(timeDiv);
            env.document.body.appendChild(card);

            hooks.enhanceBuildingNames();

            assert.strictEqual(buildingSmall.textContent, 'ул. Перекопская, 15а, Ауд. 302');
            assert.strictEqual(buildingSmall.getAttribute('data-enhanced-building'), 'true');
            assert.strictEqual(card.getAttribute('data-mse-buildings-enhanced'), '1');
        });

        test('handleMainDomMutations: синхронно подменяет названия корпусов при добавлении карточек даже без выбранных друзей (selectedStudents.size === 0)', () => {
            hooks.setBuildingMap({ '01': 'ул. Ленина, 16' });
            hooks.selectedStudents.clear();

            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';

            const timeDiv = env.document.createElement('div');
            timeDiv.className = 'fc-time';

            const buildingSmall = env.document.createElement('small');
            buildingSmall.className = 'text-muted';
            buildingSmall.textContent = 'Корпус-01';
            timeDiv.appendChild(buildingSmall);
            card.appendChild(timeDiv);
            env.document.body.appendChild(card);

            hooks.handleMainDomMutations([{ addedNodes: [card] }]);

            assert.strictEqual(buildingSmall.textContent, 'ул. Ленина, 16', 'Название корпуса должно быть подменено синхронно');
            assert.strictEqual(card.getAttribute('data-mse-buildings-enhanced'), '1', 'Карточка должна быть промаркирована как обработанная');
        });
    });

    describe('5. Умный подбор физкультуры (pe-module.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_PE_HOOKS__ = {
                    getSlotsStatusClass,
                    resolveCampus,
                    getSlotIndex,
                    getConflict,
                    getTeacherRatingBadgeHtml,
                    setLocalReviews: (map) => { localTeacherReviews = map; },
                    setCurrentSchedule: (sch) => { currentSchedule = sch; }
                };
            }`;
            executeScriptWithHook('src/pe-module.js', hook, env);
            hooks = env.__MSE_PE_HOOKS__;
        });

        test('getSlotsStatusClass: возвращает точные классы slots-ok, slots-low, slots-zero', () => {
            assert.strictEqual(hooks.getSlotsStatusClass(10), 'slots-ok');
            assert.strictEqual(hooks.getSlotsStatusClass(4), 'slots-ok');
            assert.strictEqual(hooks.getSlotsStatusClass(3), 'slots-low');
            assert.strictEqual(hooks.getSlotsStatusClass(1), 'slots-low');
            assert.strictEqual(hooks.getSlotsStatusClass(0), 'slots-zero');
            assert.strictEqual(hooks.getSlotsStatusClass(-2), 'slots-zero');
        });

        test('resolveCampus: сопоставляет корпуса ТюмГУ по адресу/ключевым словам', () => {
            assert.strictEqual(hooks.resolveCampus('ул. Барнаульская, 41').name, 'Эко-парк');
            assert.strictEqual(hooks.resolveCampus('ул. Пржевальского, 37').name, 'Олимпия');
            assert.strictEqual(hooks.resolveCampus('ул. Перекопская, 15а').name, 'Матфак');
            assert.strictEqual(hooks.resolveCampus('ул. Пирогова, 3').name, 'Биофак');
            assert.strictEqual(hooks.resolveCampus('Рощинское шоссе').name, 'Аграрный уник');
            assert.strictEqual(hooks.resolveCampus('ул. Ленина, 6').name, 'СОК');
            assert.strictEqual(hooks.resolveCampus('ул. Проезд 9 Мая, 5').name, 'ШО');
            assert.strictEqual(hooks.resolveCampus('ул. Неизвестная, 100').name, 'Другой корпус');
        });

        test('getSlotIndex: определяет корректный индекс пары по времени начала', () => {
            assert.strictEqual(hooks.getSlotIndex('08:30'), 0);
            assert.strictEqual(hooks.getSlotIndex('8:30'), 0);
            assert.strictEqual(hooks.getSlotIndex('10:15'), 1);
            assert.strictEqual(hooks.getSlotIndex('12:00'), 2);
            assert.strictEqual(hooks.getSlotIndex('14:00'), 3);
            assert.strictEqual(hooks.getSlotIndex('15:45'), 4);
            assert.strictEqual(hooks.getSlotIndex('17:30'), 5);
            assert.strictEqual(hooks.getSlotIndex('19:15'), 6);
            assert.strictEqual(hooks.getSlotIndex('00:00'), -1);
            assert.strictEqual(hooks.getSlotIndex(null), -1);
        });

        test('getConflict: находит конфликт пары при пересечении в расписании', () => {
            hooks.setCurrentSchedule({
                'ПН': { '08:30': { title: 'Математика' } }
            });
            const conflict = hooks.getConflict('ПН', 0);
            assert.ok(conflict !== null, 'Должен быть обнаружен конфликт');
            assert.strictEqual(conflict.user.title, 'Математика');
            assert.strictEqual(hooks.getConflict('ПН', 1), null);
            assert.strictEqual(hooks.getConflict('ВТ', 0), null);
        });

        test('getTeacherRatingBadgeHtml: генерирует бейджи на основе словаря отзывов', () => {
            hooks.setLocalReviews(new Map([
                ['Петров Петр Петрович', { type: 'Положительная' }],
                ['Сидоров Сидор Сидорович', { type: 'Отрицательная' }],
                ['Иванов Иван Иванович', { type: 'Нейтральная' }]
            ]));

            const posHtml = hooks.getTeacherRatingBadgeHtml('Петров Петр Петрович');
            assert.ok(posHtml.includes('rating-pos'));
            assert.ok(posHtml.includes('Положительная'));

            const negHtml = hooks.getTeacherRatingBadgeHtml('Сидоров Сидор Сидорович');
            assert.ok(negHtml.includes('rating-neg'));
            assert.ok(negHtml.includes('Отрицательная'));

            const neuHtml = hooks.getTeacherRatingBadgeHtml('Иванов Иван Иванович');
            assert.ok(neuHtml.includes('rating-neu'));
            assert.ok(neuHtml.includes('Нейтральная'));

            const noneHtml = hooks.getTeacherRatingBadgeHtml('Неизвестный Преподаватель');
            assert.ok(noneHtml.includes('rating-none'));
            assert.ok(noneHtml.includes('Нет отзывов'));
        });
    });

    describe('6. Парсер обновлений GitHub и таргетинг опросов (injected.js)', () => {
        let env;
        let hooks;

        beforeEach(() => {
            env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_INJECTED__ = {
                    compareSemVer,
                    isVersionGreater,
                    cleanMarkdownText,
                    extractReleaseHighlights,
                    shouldAutoOpenUpdatePopover,
                    recordUpdateDismiss,
                    recordUpdateOutsideClick,
                    shouldShowSurvey,
                    isQuestionAnswerValid
                };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);
            hooks = env.__MSE_INJECTED__;
        });

        test('compareSemVer / isVersionGreater: семантическое сравнение версий', () => {
            assert.strictEqual(hooks.compareSemVer('2.4.10', '2.4.2'), 1);
            assert.strictEqual(hooks.compareSemVer('2.4.0', '2.4.0'), 0);
            assert.strictEqual(hooks.compareSemVer('3.0.0', '2.9.9'), 1);
            assert.strictEqual(hooks.compareSemVer('1.9.0', '2.0.0'), -1);

            assert.strictEqual(hooks.isVersionGreater('2.4.10', '2.4.2'), true);
            assert.strictEqual(hooks.isVersionGreater('2.4.0', '2.4.0'), false);
        });

        test('cleanMarkdownText / extractReleaseHighlights: очистка Markdown разметки', () => {
            const raw = '### Что нового:\n- Добавлена [кнопка](https://example.com) **поиска**\n- Исправлен *баг*';
            const cleaned = hooks.cleanMarkdownText('Добавлена [кнопка](https://example.com) **поиска**');
            assert.strictEqual(cleaned, 'Добавлена кнопка поиска');

            const highlights = hooks.extractReleaseHighlights(raw);
            assert.ok(Array.isArray(highlights));
            assert.strictEqual(highlights.length, 2);
            assert.strictEqual(highlights[0], 'Добавлена кнопка поиска');
        });

        test('extractReleaseHighlights: парсит скрытый блок highlights и отсекает внешние буллиты', () => {
            const bodyWithComment = '<!-- highlights\r\n- Фича 1\r\n- Фича 2\r\n-->\r\n### Техническое\r\n- Скрытый багфикс';
            const highlights = hooks.extractReleaseHighlights(bodyWithComment);
            assertDeepEqual(highlights, ['Фича 1', 'Фича 2']);
        });

        test('машина состояний обновлений: dismissCount, пауза 12ч (outside), 72ч (dismiss) и тайминги', () => {
            const version = '2.5.0';
            const storageKey = 'mse_update_notice';
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), true);

            // Клик вне поповера (outside click) -> пауза 12ч
            hooks.recordUpdateOutsideClick(version);
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), false);

            // Истечение 12ч паузы: сдвигаем snoozedUntil в прошлое и очищаем сессию
            const outsideState = JSON.parse(env.localStorage.getItem(storageKey));
            outsideState.snoozedUntil = Date.now() - 1000;
            env.localStorage.setItem(storageKey, JSON.stringify(outsideState));
            env.sessionStorage.clear();
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), true, 'После истечения 12ч автопоказ возобновляется');

            // Первое нажатие «Позже» (dismissCount = 1) -> пауза 72ч
            hooks.recordUpdateDismiss(version);
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), false);

            // Сдвигаем dismissedAt на 73 часа назад (порог 72ч истек) и очищаем сессию -> второй автопоказ
            const dismissState1 = JSON.parse(env.localStorage.getItem(storageKey));
            assert.strictEqual(dismissState1.dismissCount, 1);
            dismissState1.dismissedAt = Date.now() - 73 * 60 * 60 * 1000;
            env.localStorage.setItem(storageKey, JSON.stringify(dismissState1));
            env.sessionStorage.clear();
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), true, 'После 73 часов разрешён второй автопоказ');

            // Повторный клик «Позже» (dismissCount = 2)
            hooks.recordUpdateDismiss(version);
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), false);

            // При dismissCount >= 2 даже со сдвигом на 200 часов назад автопоказ навсегда отключен
            const dismissState2 = JSON.parse(env.localStorage.getItem(storageKey));
            assert.strictEqual(dismissState2.dismissCount, 2);
            dismissState2.dismissedAt = Date.now() - 200 * 60 * 60 * 1000;
            env.localStorage.setItem(storageKey, JSON.stringify(dismissState2));
            env.sessionStorage.clear();
            assert.strictEqual(hooks.shouldAutoOpenUpdatePopover(version), false, 'При dismissCount >= 2 автопоказ навсегда отключен');
        });

        test('shouldShowSurvey: соблюдение всех условий продуктового таргетинга', () => {
            const config = {
                id: 'survey_2026',
                enabled: true,
                targeting: {
                    minDaysSinceInstall: 0,
                    minQualifiedDays: 0,
                    minTotalActiveSeconds: 0
                }
            };
            assert.strictEqual(hooks.shouldShowSurvey(config), true);

            // Вечный отказ
            env.localStorage.setItem('mse_surveys_disabled_forever', '1');
            assert.strictEqual(hooks.shouldShowSurvey(config), false);
            env.localStorage.removeItem('mse_surveys_disabled_forever');

            // Опрос уже закрыт
            env.localStorage.setItem('mse_survey_dismissed_survey_2026', '1');
            assert.strictEqual(hooks.shouldShowSurvey(config), false);
            env.localStorage.removeItem('mse_survey_dismissed_survey_2026');

            // Отложенный показ (snooze)
            env.localStorage.setItem('mse_survey_snooze_until', String(Date.now() + 100000));
            assert.strictEqual(hooks.shouldShowSurvey(config), false);
        });

        test('isQuestionAnswerValid: валидация обязательных полей и кастомных опций', () => {
            // Одиночный выбор стандартной опции
            assert.strictEqual(hooks.isQuestionAnswerValid(false, new Set(['Вариант 1']), ''), true);
            // Ничего не выбрано
            assert.strictEqual(hooks.isQuestionAnswerValid(false, new Set(), ''), false);
            // Выбран кастомный вариант, но поле ввода пустое
            assert.strictEqual(hooks.isQuestionAnswerValid(false, new Set(['__custom__']), '   '), false);
            // Выбран кастомный вариант и введен текст
            assert.strictEqual(hooks.isQuestionAnswerValid(false, new Set(['__custom__']), 'Мой ответ'), true);
            // Множественный выбор: стандартная опция + пустой кастом -> валидно
            assert.strictEqual(hooks.isQuestionAnswerValid(true, new Set(['Вариант 1', '__custom__']), ''), true);
        });
    });

    describe('7. Детерминированная очистка ресурсов stopAndCleanUp (injected.js)', () => {
        test('stopAndCleanUp: останавливает таймеры, восстанавливает нативные API и удаляет DOM', () => {
            const env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_INJECTED__ = { stopAndCleanUp };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);

            // Создаем моковые DOM узлы, которые расширение добавляет на страницу
            const stopBtn = env.document.createElement('button'); stopBtn.id = 'enhancer-stop-button';
            const toastCont = env.document.createElement('div'); toastCont.id = 'mse-toast-container';
            const friendsMenu = env.document.createElement('div'); friendsMenu.id = 'mse-friends-menu';
            env.document.body.appendChild(stopBtn);
            env.document.body.appendChild(toastCont);
            env.document.body.appendChild(friendsMenu);

            assert.ok(env.document.getElementById('enhancer-stop-button') !== null);

            // Вызываем процедуру остановки
            env.__MSE_INJECTED__.stopAndCleanUp();

            assert.strictEqual(env.document.getElementById('enhancer-stop-button'), null);
            assert.strictEqual(env.document.getElementById('mse-toast-container'), null);
            assert.strictEqual(env.document.getElementById('mse-friends-menu'), null);
        });
    });

});
