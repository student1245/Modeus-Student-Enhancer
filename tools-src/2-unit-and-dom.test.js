/**
 * Modeus Student Enhancer (MSE) — Автоматизированный набор тестов
 * Шаг 2: Модульные и DOM-тесты вычислительной и интерфейсной логики расширения
 *
 * Раннер: node:test и node:assert/strict
 * Команда для запуска: node --test tools-src/*.test.js
 */

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const crypto = require('node:crypto');
const {
    readProjectFile,
    getManifestVersion,
    instrumentScriptWithHook,
    MockStorage
} = require('./test-helpers.js');

const MANIFEST_VERSION = getManifestVersion();

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

class MockStyle {
    setProperty(prop, val) {
        const camel = prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        this[camel] = String(val);
        this[prop] = String(val);
    }
    removeProperty(prop) {
        const camel = prop.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
        delete this[camel];
        delete this[prop];
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
        this.style = new MockStyle();
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
        const childText = this.children.map(c => c.textContent).join('');
        if (!this._textContent) return childText;
        if (!childText) return this._textContent;
        return (this._textContent + ' ' + childText).trim();
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
        const VOID_TAGS = new Set(['INPUT', 'IMG', 'BR', 'HR', 'META', 'LINK']);
        const stack = [this];
        const regex = /<!--[\s\S]*?-->|<(?:\/([a-zA-Z0-9-]+)|([a-zA-Z0-9-]+)([^>]*?)(\/?))>|([^<]+)/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            if (match[0].startsWith('<!--')) continue;
            if (match[1]) {
                const closeTag = match[1].toUpperCase();
                for (let i = stack.length - 1; i > 0; i--) {
                    if (stack[i].tagName === closeTag) {
                        stack.splice(i, stack.length - i);
                        break;
                    }
                }
            } else if (match[2]) {
                const tagName = match[2].toUpperCase();
                const rawAttrs = match[3] || '';
                const isSelfClosing = match[4] === '/' || VOID_TAGS.has(tagName);
                const childEl = new MockElement(tagName, this.documentRef);

                const idMatch = rawAttrs.match(/\bid=["']([^"']+)["']/i);
                if (idMatch) {
                    childEl.id = idMatch[1];
                    if (this.documentRef) this.documentRef._registerId(childEl.id, childEl);
                }
                const classMatch = rawAttrs.match(/\bclass=["']([^"']+)["']/i);
                if (classMatch) childEl.className = classMatch[1];

                const titleMatch = rawAttrs.match(/\btitle=["']([^"']+)["']/i);
                if (titleMatch) childEl.setAttribute('title', titleMatch[1]);

                const actionMatch = rawAttrs.match(/\bdata-action=["']([^"']+)["']/i);
                if (actionMatch) childEl.dataset.action = actionMatch[1];

                const styleMatch = rawAttrs.match(/\bstyle=["']([^"']+)["']/i);
                if (styleMatch) {
                    const styleStr = styleMatch[1];
                    styleStr.split(';').forEach(rule => {
                        const parts = rule.split(':').map(s => s && s.trim());
                        if (parts[0] && parts[1]) {
                            const camelKey = parts[0].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
                            childEl.style[camelKey] = parts[1];
                        }
                    });
                }

                stack[stack.length - 1].appendChild(childEl);
                if (!isSelfClosing) stack.push(childEl);
            } else if (match[5]) {
                const text = match[5].trim();
                if (text && stack[stack.length - 1] !== this) {
                    stack[stack.length - 1]._textContent = (stack[stack.length - 1]._textContent ? stack[stack.length - 1]._textContent + ' ' : '') + text;
                }
            }
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
        } else if (this.documentRef && !event.cancelBubble) {
            this.documentRef.dispatchEvent(event);
        }
        return true;
    }
    click() {
        const event = {
            type: 'click',
            target: this,
            cancelBubble: false,
            stopPropagation() { this.cancelBubble = true; },
            composedPath: () => {
                const path = [];
                let curr = this;
                while (curr) { path.push(curr); curr = curr.parentElement; }
                return path;
            }
        };
        this.dispatchEvent(event);
    }
    focus() {
        this.dispatchEvent({ type: 'focus', target: this, cancelBubble: false, stopPropagation: () => {} });
    }
    blur() {
        this.dispatchEvent({ type: 'blur', target: this, cancelBubble: false, stopPropagation: () => {} });
    }
    select() {
        this.dispatchEvent({ type: 'select', target: this, cancelBubble: false, stopPropagation: () => {} });
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

class MockDocument {
    constructor() {
        this._elementsById = new Map();
        this.documentElement = new MockElement('HTML', this);
        this.head = new MockElement('HEAD', this);
        this.body = new MockElement('BODY', this);
        this.documentElement.appendChild(this.head);
        this.documentElement.appendChild(this.body);
        this.listeners = new Map();
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
        return true;
    }
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
        getComputedStyle: (el) => el.style || { display: 'block', marginLeft: '0px', marginRight: '0px' },
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; }
            observe() {}
            unobserve() {}
            disconnect() {}
        },
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
                getManifest: () => ({ version: MANIFEST_VERSION })
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
    const context = vm.createContext(env);
    if ((relPath.includes('pe-module.js') || relPath.includes('injected.js')) && !env.MSE_SHARED) {
        const sharedCode = readProjectFile('src/shared-utils.js');
        new vm.Script(sharedCode, { filename: 'src/shared-utils.js' }).runInContext(context);
    }

    const instrumentedCode = instrumentScriptWithHook(relPath, hookAssignment);
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

        test('хэш #mse_logout=1: очищает сессию, сохраняет state/nonce и перенаправляет на WSO2 prompt=login', () => {
            const logoutEnv = createMockEnvironment('https://utmn.modeus.org/#mse_logout=1');
            logoutEnv.localStorage.setItem('mse_auth_backup', 'data');
            logoutEnv.sessionStorage.setItem('access_token', 'token');

            executeScriptWithHook('src/keeper-early.js', '', logoutEnv);

            assert.strictEqual(logoutEnv.localStorage.getItem('mse_auth_backup'), null);
            assert.strictEqual(logoutEnv.sessionStorage.getItem('access_token'), null);
            const expectedState = logoutEnv.sessionStorage.getItem('mse_oauth_expected_state');
            const expectedNonce = logoutEnv.sessionStorage.getItem('mse_oauth_expected_nonce');
            assert.ok(expectedState && expectedState.length >= 32, 'Должен генерироваться криптостойкий state');
            assert.ok(expectedNonce && expectedNonce.length >= 32, 'Должен генерироваться криптостойкий nonce');
            assert.ok(logoutEnv.location.href.includes('prompt=login'));
            assert.ok(logoutEnv.location.href.includes(`state=${expectedState}`));
            assert.ok(logoutEnv.location.href.includes(`nonce=${expectedNonce}`));
            assert.ok(logoutEnv.location.href.includes('https://auth.modeus.org/oauth2/authorize'));
        });

        test('хэш #access_token=...: сохраняет 9 ключей только при совпадении state/nonce и очищает URL', () => {
            const state = 'valid_state_token_123';
            const nonce = 'valid_nonce_token_456';
            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const idB64 = Buffer.from(JSON.stringify({ sub: 'stud-1', nonce, exp: expSec })).toString('base64url');
            const idToken = `header.${idB64}.sig`;

            const hash = `#access_token=acc123&id_token=${idToken}&state=${state}&expires_in=3600&session_state=state789`;
            const authEnv = createMockEnvironment(`https://utmn.modeus.org/${hash}`);
            authEnv.sessionStorage.setItem('mse_oauth_expected_state', state);
            authEnv.sessionStorage.setItem('mse_oauth_expected_nonce', nonce);

            executeScriptWithHook('src/keeper-early.js', '', authEnv);

            assert.strictEqual(authEnv.sessionStorage.getItem('access_token'), 'acc123');
            assert.strictEqual(authEnv.sessionStorage.getItem('id_token'), idToken);
            assert.strictEqual(authEnv.sessionStorage.getItem('session_state'), 'state789');
            assert.strictEqual(authEnv.sessionStorage.getItem('mse_oauth_expected_state'), null, 'Ожидаемый state должен очищаться после проверки');
            assert.strictEqual(authEnv.sessionStorage.getItem('mse_oauth_expected_nonce'), null, 'Ожидаемый nonce должен очищаться после проверки');
            assert.ok(authEnv.localStorage.getItem('mse_auth_backup') !== null);
            assert.strictEqual(authEnv.location.pathname, '/');
        });

        test('хэш #access_token=...: отклоняет поддельные токены при отсутствии или несовпадении state/nonce', () => {
            const nonce = 'valid_nonce_token';
            const idB64 = Buffer.from(JSON.stringify({ sub: 'stud-1', nonce })).toString('base64url');
            const idToken = `header.${idB64}.sig`;

            // 1. Нет сохранённых mse_oauth_expected_* (обычный Angular flow или внешний вброс)
            const noExpectedEnv = createMockEnvironment(`https://utmn.modeus.org/#access_token=evil&id_token=${idToken}&state=any`);
            executeScriptWithHook('src/keeper-early.js', '', noExpectedEnv);
            assert.strictEqual(noExpectedEnv.sessionStorage.getItem('access_token'), null);
            assert.strictEqual(noExpectedEnv.localStorage.getItem('mse_auth_backup'), null);

            // 2. Несовпадение state (Login CSRF)
            const badStateEnv = createMockEnvironment(`https://utmn.modeus.org/#access_token=evil&id_token=${idToken}&state=wrong_state`);
            badStateEnv.sessionStorage.setItem('mse_oauth_expected_state', 'expected_state');
            badStateEnv.sessionStorage.setItem('mse_oauth_expected_nonce', nonce);
            executeScriptWithHook('src/keeper-early.js', '', badStateEnv);
            assert.strictEqual(badStateEnv.sessionStorage.getItem('access_token'), null);
            assert.strictEqual(badStateEnv.localStorage.getItem('mse_auth_backup'), null);
            assert.strictEqual(badStateEnv.sessionStorage.getItem('mse_oauth_expected_state'), null);

            // 3. Несовпадение nonce в id_token
            const badNonceEnv = createMockEnvironment(`https://utmn.modeus.org/#access_token=evil&id_token=${idToken}&state=expected_state`);
            badNonceEnv.sessionStorage.setItem('mse_oauth_expected_state', 'expected_state');
            badNonceEnv.sessionStorage.setItem('mse_oauth_expected_nonce', 'other_nonce');
            executeScriptWithHook('src/keeper-early.js', '', badNonceEnv);
            assert.strictEqual(badNonceEnv.sessionStorage.getItem('access_token'), null);
            assert.strictEqual(badNonceEnv.localStorage.getItem('mse_auth_backup'), null);
        });

        test('mse_disabled=1: keeper-early.js уважает глобальный выключатель (enabled: false)', () => {
            const state = 'valid_state_token_123';
            const nonce = 'valid_nonce_token_456';
            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const idB64 = Buffer.from(JSON.stringify({ sub: 'stud-1', nonce, exp: expSec })).toString('base64url');
            const idToken = `header.${idB64}.sig`;

            // 1. При mse_disabled=1 не перехватывает #access_token= и не реанимирует сессию из бэкапа
            const disabledEnv = createMockEnvironment(`https://utmn.modeus.org/#access_token=acc123&id_token=${idToken}&state=${state}&expires_in=3600`);
            disabledEnv.localStorage.setItem('mse_disabled', '1');
            disabledEnv.localStorage.setItem('mse_auth_backup', JSON.stringify({ access_token: 'old_acc', id_token: idToken }));
            disabledEnv.sessionStorage.setItem('mse_oauth_expected_state', state);
            disabledEnv.sessionStorage.setItem('mse_oauth_expected_nonce', nonce);

            executeScriptWithHook('src/keeper-early.js', '', disabledEnv);
            assert.strictEqual(disabledEnv.sessionStorage.getItem('access_token'), null);
            assert.strictEqual(disabledEnv.location.pathname, '/');

            // 2. При mse_disabled=1 не реагирует на #mse_logout=1
            const disabledLogoutEnv = createMockEnvironment('https://utmn.modeus.org/#mse_logout=1');
            disabledLogoutEnv.localStorage.setItem('mse_disabled', '1');
            disabledLogoutEnv.sessionStorage.setItem('access_token', 'keep_me');
            executeScriptWithHook('src/keeper-early.js', '', disabledLogoutEnv);
            assert.strictEqual(disabledLogoutEnv.sessionStorage.getItem('access_token'), 'keep_me');
            assert.strictEqual(disabledLogoutEnv.location.href, 'https://utmn.modeus.org/#mse_logout=1');
        });

        test('хэш #access_token=...: отклоняет некорректный expires_in (0, отрицательный, NaN, Infinity)', () => {
            const state = 'valid_state_exp';
            const nonce = 'valid_nonce_exp';
            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const idB64 = Buffer.from(JSON.stringify({ sub: 'stud-1', nonce, exp: expSec })).toString('base64url');
            const idToken = `header.${idB64}.sig`;

            ['0', '-10', 'NaN', 'Infinity', 'abc'].forEach(badExpiresIn => {
                const badExpEnv = createMockEnvironment(`https://utmn.modeus.org/#access_token=acc_bad&id_token=${idToken}&state=${state}&expires_in=${badExpiresIn}`);
                badExpEnv.sessionStorage.setItem('mse_oauth_expected_state', state);
                badExpEnv.sessionStorage.setItem('mse_oauth_expected_nonce', nonce);

                executeScriptWithHook('src/keeper-early.js', '', badExpEnv);
                assert.strictEqual(badExpEnv.sessionStorage.getItem('access_token'), null, `expires_in=${badExpiresIn} должен быть отклонён`);
                assert.strictEqual(badExpEnv.localStorage.getItem('mse_auth_backup'), null);
            });
        });

        test('восстановление mse_auth_backup: копирует в sessionStorage только ключи из allowlist AUTH_STORAGE_KEYS', () => {
            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const idB64 = Buffer.from(JSON.stringify({ sub: 'stud-1', exp: expSec })).toString('base64url');
            const idToken = `header.${idB64}.sig`;

            const restoreEnv = createMockEnvironment('https://utmn.modeus.org/');
            restoreEnv.localStorage.setItem('mse_auth_backup', JSON.stringify({
                access_token: 'restored_access',
                id_token: idToken,
                session_state: 'sess_1',
                evil_injected_key: 'pwned',
                mse_debug: '1'
            }));

            executeScriptWithHook('src/keeper-early.js', '', restoreEnv);

            assert.strictEqual(restoreEnv.sessionStorage.getItem('access_token'), 'restored_access');
            assert.strictEqual(restoreEnv.sessionStorage.getItem('id_token'), idToken);
            assert.strictEqual(restoreEnv.sessionStorage.getItem('session_state'), 'sess_1');
            assert.strictEqual(restoreEnv.sessionStorage.getItem('evil_injected_key'), null);
            assert.strictEqual(restoreEnv.sessionStorage.getItem('mse_debug'), null);
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
                window.__MSE_SSO__ = { encryptCredentials, decryptCredentials, isVaultExpired, getVaultMaxAgeMs };
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

        test('TTL сейфа (90 дней): просроченный или невалидный updatedAt отклоняется', async () => {
            const vault = await hooks.encryptCredentials('user', 'pass');
            assert.strictEqual(hooks.isVaultExpired(vault), false);

            const expiredVault = { ...vault, updatedAt: Date.now() - hooks.getVaultMaxAgeMs() - 1000 };
            assert.strictEqual(hooks.isVaultExpired(expiredVault), true);
            assert.strictEqual(await hooks.decryptCredentials(expiredVault), null);

            const missingTsVault = { ...vault, updatedAt: undefined };
            assert.strictEqual(hooks.isVaultExpired(missingTsVault), true);
            assert.strictEqual(await hooks.decryptCredentials(missingTsVault), null);
        });

        test('saveOnSubmit + bindRememberFormSubmit: дожидается записи сейфа до отправки формы и блокирует повторный сабмит в процессе шифрования', async () => {
            const formEnv = createMockEnvironment('https://fs.utmn.ru/adfs/ls/');
            const eventsLog = [];
            let resolveStorageWrite;
            const storageWritePromise = new Promise(r => { resolveStorageWrite = r; });

            const formEl = formEnv.document.createElement('form');
            formEl.id = 'loginForm';
            const userInput = formEnv.document.createElement('input');
            userInput.id = 'userNameInput';
            userInput.value = 'student@utmn.ru';
            const passInput = formEnv.document.createElement('input');
            passInput.id = 'passwordInput';
            passInput.value = 'MyStrongPass123!';
            const submitBtn = formEnv.document.createElement('span');
            submitBtn.id = 'submitButton';

            formEl.appendChild(userInput);
            formEl.appendChild(passInput);
            formEl.appendChild(submitBtn);
            formEnv.document.body.appendChild(formEl);

            const origSubmitClick = submitBtn.click.bind(submitBtn);
            let submitClickCount = 0;
            submitBtn.click = () => {
                submitClickCount++;
                eventsLog.push(`submitButton.click:${submitClickCount}`);
                origSubmitClick();
            };
            formEnv.HTMLFormElement = {
                prototype: {
                    submit: function () { eventsLog.push('form.submit'); }
                }
            };

            let savedVault = null;
            formEnv.chrome.storage.local.get = async () => ({});
            formEnv.chrome.storage.local.set = async (obj) => {
                if (obj.mse_sso_vault) {
                    await storageWritePromise;
                    savedVault = obj.mse_sso_vault;
                    eventsLog.push('storage.set:done');
                }
            };
            formEnv.setTimeout = () => 1;

            executeScriptWithHook('src/sso-autologin.js', '', formEnv);
            // Ждём завершения инициализации async IIFE (монтирования UI)
            await new Promise(r => setImmediate(r));

            const checkbox = formEnv.document.getElementById('mse-remember-checkbox');
            assert.ok(checkbox, 'Чекбокс «Запомнить меня» должен быть смонтирован');
            checkbox.checked = true;
            checkbox.dispatchEvent({ type: 'change', target: checkbox, cancelBubble: false, stopPropagation() {} });

            // При простом вводе или отметке чекбокса сейф ещё НЕ должен сохраняться
            assert.strictEqual(savedVault, null, 'Сейф не должен записываться до отправки формы');

            // Имитируем нажатие Enter (keydown + немедленный keypress)
            let preventedKeydown = false;
            let preventedKeypress = false;
            passInput.dispatchEvent({
                type: 'keydown',
                key: 'Enter',
                keyCode: 13,
                target: passInput,
                cancelBubble: false,
                preventDefault() { preventedKeydown = true; },
                stopPropagation() {},
                stopImmediatePropagation() {}
            });
            passInput.dispatchEvent({
                type: 'keypress',
                key: 'Enter',
                keyCode: 13,
                target: passInput,
                cancelBubble: false,
                preventDefault() { preventedKeypress = true; },
                stopPropagation() {},
                stopImmediatePropagation() {}
            });

            await new Promise(r => setImmediate(r));
            assert.strictEqual(preventedKeydown, true, 'Первый Enter должен вызывать preventDefault');
            assert.strictEqual(preventedKeypress, true, 'Повторный keypress во время шифрования тоже должен блокироваться');
            assert.strictEqual(submitClickCount, 0, 'Отправка формы не должна происходить до завершения chrome.storage.local.set');

            // Завершаем запись в storage и проверяем строгий порядок: сначала storage.set:done, затем submitButton.click
            resolveStorageWrite();
            await new Promise(r => setTimeout(r, 20));

            assert.ok(savedVault && savedVault.ciphertextBase64, 'Сейф должен быть сохранён перед отправкой формы');
            assert.strictEqual(submitClickCount, 1, 'После сохранения формы должна произойти ровно одна штатная отправка');
            assertDeepEqual(eventsLog, ['storage.set:done', 'submitButton.click:1']);
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
                    getFriends,
                    addFriend,
                    removeFriend,
                    isSameStudyDirection,
                    calculateSpotlightCardPosition,
                    processUrlChange,
                    selectedStudents,
                    eventCache,
                    uniqueStudents,
                    getWeekTimeRange,
                    saveWeekEventsToCache,
                    getWeekEventsFromCache,
                    weekEventsCache,
                    handleMainDomMutations,
                    highlightEventsForStudents,
                    enhanceBuildingNames,
                    setBuildingMap: (map) => { buildingMap = map; },
                    clearSearch,
                    setupUI,
                    updateSearchCompactState,
                    toggleSearchPopover,
                    updateSelectedStudentsDisplay,
                    selectStudentSuggestion,
                    renderUpdateUI,
                    ID_SEARCH_CONTAINER,
                    ID_SEARCH_TOGGLE_BTN,
                    ID_SEARCH_POPOVER,
                    ID_SEARCH_INPUT
                };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);
            hooks = env.__MSE_INJECTED__;
        });

        test('1. Управление друзьями и определение одногруппников (CRUD, профиль, спотлайт)', () => {
            // 1. Управление списком друзей: CRUD, валидация полей и защита от дубликатов
            assertDeepEqual(hooks.getFriends(), []);

            hooks.addFriend('id-1', 'Алексей Смирнов');
            const friends = hooks.getFriends();
            assert.strictEqual(friends.length, 1);
            assert.strictEqual(friends[0].fullName, 'Алексей Смирнов');

            // Защита от дубликатов по ID
            hooks.addFriend('id-1', 'Алексей Дубль');
            assert.strictEqual(hooks.getFriends().length, 1);

            hooks.removeFriend('id-1');
            assertDeepEqual(hooks.getFriends(), []);

            // 2. Определение одногруппников: сравнение направления и профиля
            const sameStudent = { specialtyName: 'Прикладная информатика', specialtyProfile: 'Разработка ПО' };
            assert.strictEqual(hooks.isSameStudyDirection(sameStudent), true);

            const diffProfile = { specialtyName: 'Прикладная информатика', specialtyProfile: 'ИТ-менеджмент' };
            assert.strictEqual(hooks.isSameStudyDirection(diffProfile), false);

            const diffSpecialty = { specialtyName: 'Юриспруденция', specialtyProfile: 'Разработка ПО' };
            assert.strictEqual(hooks.isSameStudyDirection(diffSpecialty), false);

            assert.strictEqual(hooks.isSameStudyDirection(null), false);

            // 3. Вычисление позиции спотлайт-карточки
            const targetEl = env.document.createElement('div');
            targetEl.getBoundingClientRect = () => ({ top: 100, right: 300, bottom: 140, left: 200, width: 100, height: 40 });

            const posRight = hooks.calculateSpotlightCardPosition(targetEl, 310);
            assert.strictEqual(posRight.left, 314); // rect.right (300) + offset (14)
            assert.strictEqual(posRight.top, 100);

            // Разворот влево при приближении к правому краю (1150 + 14 + 310 > 1200 - 10)
            targetEl.getBoundingClientRect = () => ({ top: 100, right: 1150, bottom: 140, left: 1050, width: 100, height: 40 });
            const posLeft = hooks.calculateSpotlightCardPosition(targetEl, 310);
            assert.strictEqual(posLeft.left, 726); // rect.left (1050) - cardWidth (310) - offset (14)
        });

        test('2. Навигация по URL: сохранение поиска при клике на пару/фильтрах и сброс при смене владельца', () => {
            env.window.location.href = 'https://utmn.modeus.org/schedule-calendar/my?calendar=2026-W45';
            hooks.selectedStudents.add('Иванов Иван');
            hooks.processUrlChange();
            assert.strictEqual(hooks.selectedStudents.size, 1);

            // 1. Клик по паре (открытие боковой панели selectedEvent с сохранением владельца my-id)
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

        test('3. Вычисление границ недели и кэширование событий расписания (TTL 20 минут, лимит 100)', () => {
            // 1. Математический расчёт границ недели из calendarParam (понедельник 00:00 - воскресенье 23:59:59 UTC)
            const mondayParam = JSON.stringify({ view: 'agendaWeek', date: '2026-11-09' });
            const mondayRange = hooks.getWeekTimeRange(mondayParam);
            assert.strictEqual(mondayRange.timeMin, '2026-11-09T00:00:00Z');
            assert.strictEqual(mondayRange.timeMax, '2026-11-15T23:59:59Z');
            assert.strictEqual(mondayRange.mondayYmd, '2026-11-09');
            assert.strictEqual(mondayRange.sundayYmd, '2026-11-15');

            // Середина недели (четверг) вычисляет тот же понедельник
            const midWeekParam = JSON.stringify({ view: 'agendaWeek', date: '2026-11-12' });
            const midWeekRange = hooks.getWeekTimeRange(midWeekParam);
            assert.strictEqual(midWeekRange.mondayYmd, '2026-11-09');
            assert.strictEqual(midWeekRange.sundayYmd, '2026-11-15');

            // Високосный год и переход месяца
            const leapYearParam = JSON.stringify({ view: 'agendaWeek', date: '2024-02-29' });
            const leapYearRange = hooks.getWeekTimeRange(leapYearParam);
            assert.strictEqual(leapYearRange.mondayYmd, '2024-02-26');
            assert.strictEqual(leapYearRange.sundayYmd, '2024-03-03');

            // Фолбэк на DOM-заголовки .fc-day-header при отсутствии или повреждении calendarParam
            const headerMon = env.document.createElement('div');
            headerMon.className = 'fc-day-header';
            headerMon.setAttribute('data-date', '2026-11-16');
            const headerSun = env.document.createElement('div');
            headerSun.className = 'fc-day-header';
            headerSun.setAttribute('data-date', '2026-11-22');
            env.document.body.appendChild(headerMon);
            env.document.body.appendChild(headerSun);

            const fallbackRange = hooks.getWeekTimeRange('invalid-json');
            assert.strictEqual(fallbackRange.mondayYmd, '2026-11-16');
            assert.strictEqual(fallbackRange.timeMax, '2026-11-22T23:59:59Z');
            headerMon.remove();
            headerSun.remove();

            // 2. Кэширование расписания недели в памяти (weekEventsCache)
            hooks.weekEventsCache.clear();
            const testPayload = { _embedded: { events: [{ id: 'ev-cached-1' }] } };
            hooks.saveWeekEventsToCache('p1_2026-11-09', testPayload);

            const cached = hooks.getWeekEventsFromCache('p1_2026-11-09');
            assert.strictEqual(cached, testPayload, 'Кэш должен возвращать сохраненные данные недели');

            // Истечение TTL (> 20 минут)
            const entry = hooks.weekEventsCache.get('p1_2026-11-09');
            entry.timestamp = Date.now() - (21 * 60 * 1000);
            assert.strictEqual(hooks.getWeekEventsFromCache('p1_2026-11-09'), null, 'Просроченная запись должна инвалидироваться');
            assert.strictEqual(hooks.weekEventsCache.has('p1_2026-11-09'), false, 'Просроченная запись должна удаляться из Map');

            // LRU-вытеснение при превышении лимита в 100 записей
            for (let i = 1; i <= 100; i++) {
                hooks.saveWeekEventsToCache(`key_${i}`, { index: i });
            }
            assert.strictEqual(hooks.weekEventsCache.size, 100);
            assert.ok(hooks.weekEventsCache.has('key_1'), 'Первый ключ должен присутствовать до переполнения');

            // 101-й элемент вытесняет key_1
            hooks.saveWeekEventsToCache('key_101', { index: 101 });
            assert.strictEqual(hooks.weekEventsCache.size, 100);
            assert.strictEqual(hooks.weekEventsCache.has('key_1'), false, 'Самый старый ключ должен быть вытеснен');
            assert.ok(hooks.weekEventsCache.has('key_101'), 'Новый ключ должен быть добавлен');

            hooks.weekEventsCache.clear();
        });

        test('4. Идемпотентный рендер, синхронное восстановление DOM при мутациях и очистка поиска', () => {
            hooks.setBuildingMap({ '05': 'ул. Перекопская, 15а' });

            // 1. Создаём структуру карточки занятия в FullCalendar
            const card = env.document.createElement('div');
            card.className = 'fc-time-grid-event';
            card.setAttribute('data-event-id', 'ev-sync-1');

            const content = env.document.createElement('div');
            content.className = 'fc-content';

            const timeDiv = env.document.createElement('div');
            timeDiv.className = 'fc-time';
            const buildingSmall = env.document.createElement('small');
            buildingSmall.className = 'text-muted';
            buildingSmall.textContent = 'Корпус-05, Ауд. 302';
            timeDiv.appendChild(buildingSmall);
            content.appendChild(timeDiv);

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

            // 2. Симулируем мутацию DOM (появление карточки в FullCalendar)
            hooks.handleMainDomMutations([{ addedNodes: [card] }]);

            // Синхронная подмена названия корпуса
            assert.strictEqual(buildingSmall.textContent, 'ул. Перекопская, 15а, Ауд. 302');
            assert.strictEqual(card.getAttribute('data-mse-buildings-enhanced'), '1');

            // Синхронная подсветка общей пары и бейдж
            assert.strictEqual(card.classList.contains('search-highlight'), true);
            assert.strictEqual(env.document.body.classList.contains('mse-search-filtering-active'), true);
            const bannerBefore = card.querySelector('.mse-event-match-tooltip');
            assert.ok(bannerBefore, 'Бейдж должен смонтироваться в DOM синхронно');

            // 3. Идемпотентность: повторная мутация не пересоздаёт существующий DOM-узел бейджа
            hooks.handleMainDomMutations([{ addedNodes: [card] }]);
            const bannerAfter = card.querySelector('.mse-event-match-tooltip');
            assert.strictEqual(bannerBefore, bannerAfter, 'Существующий DOM-узел бейджа должен оставаться без пересоздания');

            // 4. Очистка поиска: clearSearch снимает все классы подсветки, удаляет бейджи и сбрасывает состояние body
            hooks.clearSearch();
            assert.strictEqual(card.classList.contains('search-highlight'), false);
            assert.strictEqual(card.classList.contains('mse-search-filtering-active'), false);
            assert.strictEqual(env.document.body.classList.contains('mse-search-filtering-active'), false);
            assert.strictEqual(card.querySelector('.mse-event-match-tooltip'), null);
            assert.strictEqual(hooks.selectedStudents.size, 0);
        });

        test('5. Адаптивность шапки календаря, кнопка-лупа [🔍] и плавающий поповер #mse-search-popover', () => {
            // 1. Создаём меню, форму .main-calendar-form и тулбар .fc-toolbar с нативными элементами Модеуса
            const menu = env.document.createElement('div');
            menu.className = 'menu mobile-menu';
            env.document.body.appendChild(menu);

            const form = env.document.createElement('form');
            form.className = 'main-calendar-form';
            form.clientWidth = 1200;
            env.document.body.appendChild(form);

            const titleDiv = env.document.createElement('div');
            titleDiv.className = 'pl-0 title';
            titleDiv.offsetWidth = 200;
            form.appendChild(titleDiv);

            const selectDiv = env.document.createElement('div');
            selectDiv.className = 'fix-width-select';
            selectDiv.offsetWidth = 250;
            form.appendChild(selectDiv);

            const fcToolbar = env.document.createElement('div');
            fcToolbar.className = 'fc-toolbar fc-header-toolbar';
            fcToolbar.clientWidth = 1200;
            env.document.body.appendChild(fcToolbar);

            const fcLeft = env.document.createElement('div');
            fcLeft.className = 'fc-left';
            fcLeft.getBoundingClientRect = () => ({ right: 270, width: 270, left: 0, top: 50, bottom: 98, height: 48 });
            fcToolbar.appendChild(fcLeft);

            const filterBtn = env.document.createElement('button');
            filterBtn.className = 'btn-filter';
            fcToolbar.appendChild(filterBtn);

            const fcRight = env.document.createElement('div');
            fcRight.className = 'fc-right';
            fcRight.getBoundingClientRect = () => ({ right: 1200, width: 106, left: 1094, top: 50, bottom: 98, height: 48 });
            fcToolbar.appendChild(fcRight);

            // 2. Инициализируем UI календаря
            hooks.setupUI();

            const container = env.document.getElementById(hooks.ID_SEARCH_CONTAINER);
            assert.ok(container, 'Контейнер поиска должен быть смонтирован в .fc-toolbar');
            assert.strictEqual(container.parentElement, fcToolbar, 'Постоянным родителем поиска обязан быть .fc-toolbar');

            // Симулируем обновление для проверки постоянного монтирования .ver-anchor в .main-calendar-form
            hooks.renderUpdateUI('2.5.0', 'https://example.com/release', 'Release notes', { forceShow: true });
            const updateAnchor = env.document.getElementById('mse-update-anchor');
            assert.ok(updateAnchor, 'Кнопка обновления расширения .ver-anchor должна быть создана');
            assert.strictEqual(updateAnchor.parentElement, form, '.ver-anchor обязана монтироваться в белую шапку .main-calendar-form');

            const toggleBtn = env.document.getElementById(hooks.ID_SEARCH_TOGGLE_BTN);
            const popover = env.document.getElementById(hooks.ID_SEARCH_POPOVER);
            const input = env.document.getElementById(hooks.ID_SEARCH_INPUT);
            assert.ok(toggleBtn, 'Кнопка-лупа #search-toggle-btn должна быть создана');
            assert.ok(popover, 'Поповер #mse-search-popover должен быть создан');
            assert.ok(input, 'Поле ввода #student-search-input должно быть создано');

            const setSpace = (freePx) => {
                // freeSpace = rightBoundary - leftBoundary - 16;
                // rightBoundary (filterBtn.left) = leftBoundary (270) + 16 + freePx
                const fLeft = 270 + 16 + freePx;
                const totalW = fLeft + 115;
                env.window.innerWidth = totalW;
                env.document.documentElement.clientWidth = totalW;
                fcToolbar.clientWidth = totalW;
                fcToolbar.getBoundingClientRect = () => ({ right: totalW, width: totalW, left: 0, top: 50, bottom: 98, height: 48 });
                filterBtn.getBoundingClientRect = () => ({ right: fLeft + 95, width: 95, left: fLeft, top: 62, bottom: 96, height: 34 });
            };

            // 3. Без друзей: широкий экран (freeSpace >= 270): полный режим (is-compact и is-ultra-compact отсутствуют)
            setSpace(350);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.classList.contains('is-compact'), false, 'При freeSpace >= 270 не должен активироваться is-compact');
            assert.strictEqual(container.classList.contains('is-ultra-compact'), false);
            assert.strictEqual(container.parentElement, fcToolbar, 'Контейнер остаётся в .fc-toolbar');

            // 4. Без друзей: компактный режим (125 <= freeSpace < 270): .is-compact
            setSpace(200);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.classList.contains('is-compact'), true, 'При 125 <= freeSpace < 270 должен выставляться .is-compact');
            assert.strictEqual(container.classList.contains('is-ultra-compact'), false);

            // 5. По умолчанию в компактном режиме поповер закрыт (is-open отсутствует)
            assert.strictEqual(popover.classList.contains('is-open'), false, 'Поповер по умолчанию должен быть закрыт');
            assert.strictEqual(toggleBtn.classList.contains('is-active'), false, 'Кнопка-лупа по умолчанию не активна');

            // 6. Клик по кнопке-лупе открывает поповер
            toggleBtn.click();
            assert.strictEqual(popover.classList.contains('is-open'), true, 'Клик по кнопке-лупе должен открыть поповер (.is-open)');
            assert.strictEqual(toggleBtn.classList.contains('is-active'), true, 'Кнопка-лупа должна получить .is-active');

            // 7. Повторный клик закрывает поповер
            toggleBtn.click();
            assert.strictEqual(popover.classList.contains('is-open'), false, 'Повторный клик по кнопке-лупе должен закрыть поповер');

            // 8. Открытие и клик вне поповера закрывает его
            toggleBtn.click();
            assert.strictEqual(popover.classList.contains('is-open'), true);
            env.document.body.click();
            assert.strictEqual(popover.classList.contains('is-open'), false, 'Клик вне поповера должен закрыть его');

            // 9. Нажатие клавиши Escape закрывает поповер
            toggleBtn.click();
            assert.strictEqual(popover.classList.contains('is-open'), true);
            input.dispatchEvent({ type: 'keydown', key: 'Escape' });
            assert.strictEqual(popover.classList.contains('is-open'), false, 'Escape должен закрыть поповер');

            // 10. С друзьями: проверка ступеней Full -> Compact A -> Compact B (ultra-compact)
            // Полный режим: freeSpace >= 420
            setSpace(450);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.classList.contains('is-compact'), false);

            // Выбираем студента (hasSelected = true)
            hooks.selectedStudents.add('Иванов Иван');
            hooks.updateSelectedStudentsDisplay();

            // Ступень A: 275 <= freeSpace < 420 -> is-compact, но слово "Выбрано:" остаётся
            setSpace(320);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.classList.contains('is-compact'), true, 'При выборе студентов и freeSpace < 420 должен активироваться .is-compact');
            assert.strictEqual(container.classList.contains('is-ultra-compact'), false, 'На ступени А слово "Выбрано:" должно оставаться видимым');

            // Ступень Б: freeSpace < 275 -> is-ultra-compact
            setSpace(230);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.classList.contains('is-compact'), true);
            assert.strictEqual(container.classList.contains('is-ultra-compact'), true, 'На ступени Б должен выставляться .is-ultra-compact');

            // 11. Взаимное закрытие выпадающего списка выбранных студентов и поповера поиска
            const selToggle = env.document.getElementById('selected-students-toggle');
            const selContainer = env.document.getElementById('selected-students-container');

            // Открываем список выбранных студентов
            selToggle.click();
            assert.strictEqual(selContainer.style.display, 'flex');

            // Клик по кнопке-лупе открывает поповер и должен закрыть список студентов
            toggleBtn.click();
            assert.strictEqual(popover.classList.contains('is-open'), true);
            assert.strictEqual(selContainer.style.display, 'none', 'Открытие поповера поиска должно закрыть выпадающий список студентов');

            // Клик по кнопке списка студентов должен закрыть поповер поиска
            selToggle.click();
            assert.strictEqual(selContainer.style.display, 'flex');
            assert.strictEqual(popover.classList.contains('is-open'), false, 'Открытие списка студентов должно закрыть поповер поиска');

            // 12. Постоянство размещения: при любом сужении/расширении контейнер всегда в .fc-toolbar
            setSpace(100);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.parentElement, fcToolbar, 'При экстремальном сужении контейнер остаётся в .fc-toolbar');
            assert.strictEqual(container.classList.contains('is-compact'), true);
            assert.strictEqual(container.classList.contains('is-ultra-compact'), true);

            setSpace(600);
            hooks.updateSearchCompactState();
            assert.strictEqual(container.parentElement, fcToolbar, 'При обратном расширении контейнер также остаётся в .fc-toolbar');
            assert.strictEqual(container.classList.contains('is-compact'), false);
            assert.strictEqual(container.classList.contains('is-ultra-compact'), false);

            // 13. Переключение недели (пересоздание .fc-toolbar): бесшовное сохранение живого DOM-узла (cachedSearchContainer)
            assert.strictEqual(hooks.selectedStudents.size, 1);

            // Имитируем удаление .fc-toolbar и создание нового при смене недели в FullCalendar
            fcToolbar.remove();
            const newFcToolbar = env.document.createElement('div');
            newFcToolbar.className = 'fc-toolbar fc-header-toolbar';
            env.document.body.appendChild(newFcToolbar);
            const newFilterBtn = env.document.createElement('button');
            newFilterBtn.className = 'btn-filter';
            newFcToolbar.appendChild(newFilterBtn);

            // Вызываем setupUI (как это делает MutationObserver/debouncedMutationHandler при пересоздании тулбара)
            hooks.setupUI();

            const reattachedContainer = env.document.getElementById(hooks.ID_SEARCH_CONTAINER);
            assert.ok(reattachedContainer, 'Контейнер поиска обязан присутствовать в новом тулбаре');
            assert.strictEqual(reattachedContainer, container, 'При пересоздании тулбара обязан переиспользоваться тот же самый живой DOM-экземпляр без пересоздания');
            assert.strictEqual(reattachedContainer.parentElement, newFcToolbar, 'Контейнер должен быть прикреплен к новому .fc-toolbar');

            const controls = env.document.getElementById('search-controls');
            assert.ok(controls, '#search-controls обязан присутствовать');
            assert.notStrictEqual(controls.style.display, 'none', 'Панель #search-controls не должна скрываться в display: none');

            const newWrapper = env.document.getElementById('selected-students-dropdown-wrapper');
            const newCount = env.document.getElementById('selected-count');
            const newItems = env.document.querySelectorAll('.selected-student-tag');
            assert.ok(newWrapper, 'Обертка выбранных студентов должна существовать в новом тулбаре');
            assert.strictEqual(newWrapper.style.display, 'block', 'Кнопка выбранных студентов должна оставаться видимой (display: block) после переключения недели');
            assert.strictEqual(newCount.textContent, '1', 'Счётчик выбранных студентов должен сохраняться');
            assert.strictEqual(newItems.length, 1, 'Список тегов выбранных студентов должен сохраняться');
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
                    createSportCardElement,
                    createBusyCardHtml,
                    createSectionCardElement,
                    getPersonIdByName,
                    apiSwapAction,
                    setLocalReviews: (map) => { localTeacherReviews = map; },
                    setCurrentSchedule: (sch) => { currentSchedule = sch; },
                    setModules: (mods) => { allModules = mods; parseData(); },
                    setApiContext: (campId, studId) => { apiCampaignId = campId; apiStudentId = studId; },
                    getModules: () => allModules,
                    getEnrolledTeamsMap: () => enrolledTeamsMap,
                    buildBookingSelectedTeamsUrl,
                    renderBusySlotHtml
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

        test('createSportCardElement: двухстрочная структура карточки, slots на 2-й строке, независимый счетчик sc-count', () => {
            const group = [
                { avail: 10, total: 15, campus: 'Олимпия', enrolled: false },
                { avail: 5, total: 5, campus: 'Олимпия', enrolled: false }
            ];
            const card = hooks.createSportCardElement('Общая физическая подготовка', group, 'ПН', '08:30', 0);

            assert.ok(card, 'Карточка должна быть создана');
            assert.strictEqual(card.classList.contains('sport-card'), true);

            // 1-я строка (.sc-top): название и счетчик групп
            const topRow = card.querySelector('.sc-top');
            assert.ok(topRow, '1-я строка .sc-top должна присутствовать');
            const nameEl = topRow.querySelector('.sc-name');
            const titleText = nameEl.querySelector('.sc-title-text');
            const countEl = nameEl.querySelector('.sc-count');

            assert.strictEqual(titleText.textContent, 'Общая физическая подготовка');
            assert.strictEqual(titleText.getAttribute('title'), 'Общая физическая подготовка');
            assert.strictEqual(countEl.textContent, '· 2');

            // 2-я строка (.sc-bottom): корпус и свободные места
            const bottomRow = card.querySelector('.sc-bottom');
            assert.ok(bottomRow, '2-я строка .sc-bottom должна присутствовать');
            const locEl = bottomRow.querySelector('.sc-loc');
            const slotsEl = bottomRow.querySelector('.sc-slots');

            assert.strictEqual(locEl.textContent, 'Олимпия');
            assert.ok(slotsEl.classList.contains('slots-ok'));
            assert.ok(slotsEl.textContent.includes('15'));
            assert.ok(slotsEl.textContent.includes('/20'));
        });

        test('createBusyCardHtml: верстка заголовка с защитой от вытеснения шеврона', () => {
            const html = hooks.createBusyCardHtml('У вас пара', ['Философия (лекция)']);
            assert.ok(html.includes('busy-card'));
            assert.ok(html.includes('busy-header-left'));
            assert.ok(html.includes('title="У вас пара"'));
            assert.ok(html.includes('<span>У вас пара</span>'));
            assert.ok(html.includes('busy-title'));
            assert.ok(html.includes('Философия (лекция)'));
        });

        test('openModal / DOM: разметка полноэкранного окна, закрытие в header-panel и поповер поиска друга', () => {
            env.window.MSE_PE.openModal([], {}, 'camp-1', 'stud-1', new Map());

            const overlay = env.document.getElementById('mse-pe-overlay');
            assert.ok(overlay, '#mse-pe-overlay должен быть смонтирован в DOM');

            const container = overlay.querySelector('.container');
            assert.ok(container, '.container должен присутствовать');

            const headerPanel = overlay.querySelector('.header-panel');
            assert.ok(headerPanel, '.header-panel должен присутствовать');

            const closeBtn = env.document.getElementById('mse-pe-close');
            assert.ok(closeBtn, 'Кнопка закрытия #mse-pe-close должна быть смонтирована');
            assert.strictEqual(closeBtn.parentElement, headerPanel, 'Кнопка закрытия обязана монтироваться внутри .header-panel');

            // Элементы поиска друга
            const friendContainer = env.document.getElementById('pe-friendContainer');
            const friendToggleBtn = env.document.getElementById('pe-friendToggleBtn');
            const friendPopover = env.document.getElementById('pe-friendPopover');
            const friendInput = env.document.getElementById('pe-friendInput');
            const friendBtn = env.document.getElementById('pe-friendBtn');
            const friendDropdown = env.document.getElementById('pe-friendDropdown');

            assert.ok(friendContainer, '#pe-friendContainer должен существовать');
            assert.ok(friendToggleBtn, 'Кнопка-лупа #pe-friendToggleBtn должна существовать');
            assert.ok(friendPopover, '#pe-friendPopover должен существовать');
            assert.ok(friendInput, '#pe-friendInput должен существовать внутри поповера');
            assert.ok(friendBtn, '#pe-friendBtn должен существовать внутри поповера');
            assert.ok(friendDropdown, '#pe-friendDropdown должен существовать внутри поповера');

            // Проверка открытия/закрытия поповера по клику на кнопку-лупу
            assert.strictEqual(friendContainer.classList.contains('is-popover-open'), false);
            friendToggleBtn.click();
            assert.strictEqual(friendContainer.classList.contains('is-popover-open'), true);
            friendToggleBtn.click();
            assert.strictEqual(friendContainer.classList.contains('is-popover-open'), false);
        });

        test('getPersonIdByName: не падает при поврежденном JSON в mse_friends_list и переходит к API', async () => {
            env.localStorage.setItem('mse_friends_list', '{broken-json');
            let apiCalled = false;
            env.window.fetch = async () => {
                apiCalled = true;
                return {
                    ok: true,
                    json: async () => ({
                        _embedded: { persons: [{ id: 'p-api-1', fullName: 'Иванов Иван' }] }
                    })
                };
            };

            const person = await hooks.getPersonIdByName('Иванов');
            assert.strictEqual(apiCalled, true, 'При битом кэше друзей должен выполняться fallback-запрос к API');
            assertDeepEqual(person, { id: 'p-api-1', name: 'Иванов Иван' });
        });

        test('apiSwapAction: успешный компенсирующий откат POST oldTeamId при ошибке записи в новую секцию', async () => {
            const modules = [{
                moduleElementId: 'mod-1',
                name: 'Спорт',
                selectedTeamIds: ['team-old'],
                cycles: [{
                    teams: [
                        { id: 'team-old', name: 'ФК: Волейбол ПН 08:30 Олимпия', available: 5, limit: 20, teachers: ['Иванов И.И.'] },
                        { id: 'team-new', name: 'ФК: Баскетбол ВТ 10:15 Матфак', available: 2, limit: 20, teachers: ['Петров П.П.'] }
                    ]
                }]
            }];
            hooks.setApiContext('camp-1', 'stud-1');
            hooks.setModules(modules);

            const requests = [];
            env.window.fetch = async (url, options) => {
                const body = JSON.parse(options.body);
                requests.push({ method: options.method, url, body });
                if (options.method === 'POST' && body[0] === 'team-new') {
                    return { ok: false, status: 409, statusText: 'Conflict', text: async () => JSON.stringify({ message: 'Мест больше нет' }) };
                }
                return { ok: true, status: 200, text: async () => '{}' };
            };

            const toasts = [];
            env.window.MSE_showToast = (message, type) => { toasts.push({ message, type }); };

            await hooks.apiSwapAction('team-new', 'team-old', 'mod-1');

            assertDeepEqual(
                requests.map(r => [r.method, r.body[0]]),
                [['DELETE', 'team-old'], ['POST', 'team-new'], ['POST', 'team-old']]
            );
            assertDeepEqual(hooks.getModules()[0].selectedTeamIds, ['team-old']);
            assert.strictEqual(hooks.getEnrolledTeamsMap().has('team-old'), true);
            assert.strictEqual(hooks.getModules()[0].cycles[0].teams[0].available, 5, 'Счётчик свободных мест старой секции должен восстановиться');
            assert.strictEqual(toasts.length, 1);
            assert.strictEqual(toasts[0].type, 'warning');
            assert.ok(toasts[0].message.includes('Старая запись успешно восстановлена'));
        });

        test('apiSwapAction: честное сообщение об ошибке при провале и записи, и компенсирующего отката', async () => {
            const modules = [{
                moduleElementId: 'mod-1',
                name: 'Спорт',
                selectedTeamIds: ['team-old'],
                cycles: [{
                    teams: [
                        { id: 'team-old', name: 'ФК: Волейбол ПН 08:30 Олимпия', available: 1, limit: 20, teachers: ['Иванов И.И.'] },
                        { id: 'team-new', name: 'ФК: Баскетбол ВТ 10:15 Матфак', available: 1, limit: 20, teachers: ['Петров П.П.'] }
                    ]
                }]
            }];
            hooks.setApiContext('camp-1', 'stud-1');
            hooks.setModules(modules);

            const requests = [];
            env.window.fetch = async (url, options) => {
                const body = JSON.parse(options.body);
                requests.push({ method: options.method, body });
                if (options.method === 'DELETE') {
                    return { ok: true, status: 200, text: async () => '{}' };
                }
                return { ok: false, status: 409, statusText: 'Conflict', text: async () => JSON.stringify({ message: 'Секция занята' }) };
            };

            const toasts = [];
            env.window.MSE_showToast = (message, type) => { toasts.push({ message, type }); };

            await hooks.apiSwapAction('team-new', 'team-old', 'mod-1');

            assertDeepEqual(
                requests.map(r => [r.method, r.body[0]]),
                [['DELETE', 'team-old'], ['POST', 'team-new'], ['POST', 'team-old']]
            );
            assertDeepEqual(hooks.getModules()[0].selectedTeamIds, []);
            assert.strictEqual(hooks.getEnrolledTeamsMap().has('team-old'), false);
            assert.strictEqual(toasts.length, 1);
            assert.strictEqual(toasts[0].type, 'error');
            assert.ok(toasts[0].message.includes('откат старой не удался'));
        });

        test('createSectionCardElement: показывает предупреждение смены группы при малом остатке мест (avail <= 2)', () => {
            hooks.setModules([{
                moduleElementId: 'mod-1',
                selectedTeamIds: ['team-old'],
                cycles: [{
                    teams: [
                        { id: 'team-old', name: 'ФК: Волейбол ПН 08:30 Олимпия', available: 5, limit: 20, teachers: ['Иванов'] },
                        { id: 'team-low', name: 'ФК: Баскетбол ВТ 10:15 Матфак', available: 2, limit: 20, teachers: ['Петров'] },
                        { id: 'team-ok', name: 'ФК: Плавание СР 12:00 Олимпия', available: 3, limit: 20, teachers: ['Сидоров'] }
                    ]
                }]
            }]);

            const cardLow = hooks.createSectionCardElement({
                id: 'team-low', secNum: 2, sport: 'Баскетбол', day: 'ВТ', time: '10:15',
                campus: 'Матфак', address: 'ул. Перекопская, 15а', mapLink: '', prof: 'Петров', avail: 2, total: 20, enrolled: false
            });
            assert.ok(cardLow.querySelector('.replace-hint-warn'), 'При avail <= 2 должно выводиться предупреждение смены группы');

            const cardOk = hooks.createSectionCardElement({
                id: 'team-ok', secNum: 3, sport: 'Плавание', day: 'СР', time: '12:00',
                campus: 'Олимпия', address: 'ул. Пржевальского, 37', mapLink: '', prof: 'Сидоров', avail: 3, total: 20, enrolled: false
            });
            assert.strictEqual(cardOk.querySelector('.replace-hint-warn'), null, 'При avail > 2 предупреждение о малом остатке мест не выводится');
        });

        test('безопасность pe-module: блокировка CSPT, экранирование ID и отсутствие двойного экранирования friendName', () => {
            hooks.setApiContext('camp-1', 'stud-1');
            assert.ok(hooks.buildBookingSelectedTeamsUrl('mod-1').includes('/students/stud-1/campaigns/camp-1/'));

            // Попытка CSPT через campaignId / studentId / moduleId
            assert.throws(() => hooks.buildBookingSelectedTeamsUrl('../admin'), /Некорректный идентификатор/);
            hooks.setApiContext('camp-1', '..%2Fadmin');
            assert.throws(() => hooks.buildBookingSelectedTeamsUrl('mod-1'), /Некорректный идентификатор/);

            // Экранирование ID команды в кнопке и отсутствие двойного экранирования friendName
            const xssCard = hooks.createSectionCardElement({
                id: 't" onclick="alert(1)', secNum: '<1>', sport: 'Фитнес', day: 'ПН', time: '10:15',
                campus: 'Олимпия', address: 'ул. Пржевальского, 37', mapLink: '', prof: 'Петров', avail: 5, total: 10, enrolled: true
            });
            assert.strictEqual(xssCard.innerHTML.includes('" onclick="alert(1)'), false);
            assert.ok(xssCard.innerHTML.includes('&quot;'));

            const busyHtml = hooks.renderBusySlotHtml({ friend: ['Математика'] }, "O'Connor & Co");
            assert.strictEqual(busyHtml.includes('&amp;#039;'), false, 'Не должно быть двойного экранирования имени друга');
            assert.ok(busyHtml.includes('O&#039;Connor &amp; Co'));
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
                    isQuestionAnswerValid,
                    buildFinalQuestionAnswer,
                    buildQuestionCustomOptionHtml,
                    handleAuthStorageSync,
                    fetchEventAttendees,
                    findTriggeringCard,
                    createSilentOAuthRequest,
                    applyRefreshedTokens,
                    resolveSafeSurveyWebhookUrl,
                    DEFAULT_SURVEY_WEBHOOK_URL,
                    resolveSafeReleaseUrl,
                    DEFAULT_RELEASE_URL,
                    parsePeCampaignPathParams,
                    syncMyPersonIdCache
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

        test('OAuth state/nonce валидация в Session Keeper: приём валидных и отклонение поддельных токенов', () => {
            const req1 = hooks.createSilentOAuthRequest();
            const req2 = hooks.createSilentOAuthRequest();
            assert.ok(req1.state.length >= 32 && req1.nonce.length >= 32, 'state и nonce должны быть криптостойкими');
            assert.notStrictEqual(req1.state, req2.state, 'Каждый запрос должен генерировать уникальный state');
            assert.notStrictEqual(req1.nonce, req2.nonce, 'Каждый запрос должен генерировать уникальный nonce');

            const expSec = Math.floor(Date.now() / 1000) + 3600;
            const validIdPayload = Buffer.from(JSON.stringify({ sub: 'stud-1', nonce: req1.nonce, exp: expSec })).toString('base64url');
            const validIdToken = `h.${validIdPayload}.s`;

            // 1. Валидный callback с совпадающими state и nonce
            const validParams = new URLSearchParams(`access_token=acc_ok&id_token=${validIdToken}&state=${req1.state}&expires_in=3600`);
            const okResult = hooks.applyRefreshedTokens(validParams, { expectedState: req1.state, expectedNonce: req1.nonce });
            assert.ok(okResult, 'Валидные токены должны приниматься');
            assert.strictEqual(okResult.accessToken, 'acc_ok');
            assert.strictEqual(env.sessionStorage.getItem('access_token'), 'acc_ok');

            // 2. Отклонение при подмене state (CSRF)
            env.sessionStorage.clear();
            env.localStorage.clear();
            const forgedStateParams = new URLSearchParams(`access_token=acc_csrf&id_token=${validIdToken}&state=forged_state&expires_in=3600`);
            assert.strictEqual(hooks.applyRefreshedTokens(forgedStateParams, { expectedState: req1.state, expectedNonce: req1.nonce }), null);
            assert.strictEqual(env.sessionStorage.getItem('access_token'), null);
            assert.strictEqual(env.localStorage.getItem('mse_auth_backup'), null);

            // 3. Отклонение при несовпадении nonce в id_token
            const forgedNonceId = `h.${Buffer.from(JSON.stringify({ sub: 'stud-1', nonce: 'wrong_nonce', exp: expSec })).toString('base64url')}.s`;
            const forgedNonceParams = new URLSearchParams(`access_token=acc_replay&id_token=${forgedNonceId}&state=${req1.state}&expires_in=3600`);
            assert.strictEqual(hooks.applyRefreshedTokens(forgedNonceParams, { expectedState: req1.state, expectedNonce: req1.nonce }), null);
            assert.strictEqual(env.sessionStorage.getItem('access_token'), null);

            // 4. Отклонение при отсутствии ожидаемых state/nonce
            assert.strictEqual(hooks.applyRefreshedTokens(validParams, {}), null);

            // 5. Отклонение при некорректном expires_in (0, отрицательный, NaN, Infinity)
            ['0', '-50', 'NaN', 'Infinity', 'abc'].forEach(badExp => {
                env.sessionStorage.clear();
                const badParams = new URLSearchParams(`access_token=acc_bad&id_token=${validIdToken}&state=${req1.state}&expires_in=${badExp}`);
                assert.strictEqual(
                    hooks.applyRefreshedTokens(badParams, { expectedState: req1.state, expectedNonce: req1.nonce }),
                    null,
                    `expires_in=${badExp} обязан отклоняться`
                );
                assert.strictEqual(env.sessionStorage.getItem('access_token'), null);
            });
        });

        test('resolveSafeSurveyWebhookUrl: всегда возвращает DEFAULT_SURVEY_WEBHOOK_URL и игнорирует сторонние значения', () => {
            const arbitraryGoogleHook = 'https://script.google.com/macros/s/AKfycb123456/exec';
            assert.strictEqual(hooks.resolveSafeSurveyWebhookUrl(arbitraryGoogleHook), hooks.DEFAULT_SURVEY_WEBHOOK_URL);

            const badUrls = [
                'https://evil.example.com/steal',
                'http://script.google.com/macros/s/insecure/exec',
                'https://script.google.com/other/path',
                'https://script.google.com.evil.com/macros/s/spoof/exec',
                'javascript:alert(1)',
                ''
            ];
            badUrls.forEach(badUrl => {
                assert.strictEqual(
                    hooks.resolveSafeSurveyWebhookUrl(badUrl),
                    hooks.DEFAULT_SURVEY_WEBHOOK_URL,
                    `Любой сторонний URL "${badUrl}" обязан игнорироваться в пользу DEFAULT_SURVEY_WEBHOOK_URL`
                );
            });
        });

        test('resolveSafeReleaseUrl: разрешает только официальный префикс релизов GitHub и отклоняет чужие домены / http://', () => {
            const validReleaseUrl = 'https://github.com/student1245/Modeus-Student-Enhancer/releases/tag/v2.2.6';
            assert.strictEqual(hooks.resolveSafeReleaseUrl(validReleaseUrl), validReleaseUrl);

            const unsafeUrls = [
                'http://github.com/student1245/Modeus-Student-Enhancer/releases/tag/v2.2.6',
                'https://evil.example.com/malware.zip',
                'https://github.com/attacker/Modeus-Student-Enhancer/releases/tag/v9.9.9',
                'https://github.com/student1245/Modeus-Student-Enhancer/releases/../../attacker/evil',
                'javascript:alert(1)',
                '',
                null
            ];
            unsafeUrls.forEach(url => {
                assert.strictEqual(
                    hooks.resolveSafeReleaseUrl(url),
                    hooks.DEFAULT_RELEASE_URL,
                    `Недоверенный URL "${url}" должен откатываться к DEFAULT_RELEASE_URL`
                );
            });
        });

        test('parsePeCampaignPathParams: блокирует CSPT (..%2F, ?query, #hash) при парсинге URL физкультуры', () => {
            const validUuidUrl = 'https://utmn.modeus.org/learning-path-selection/menus/11111111-2222-3333-4444-555555555555/student/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?tab=1#sec';
            assertDeepEqual(hooks.parsePeCampaignPathParams(validUuidUrl), {
                campaignId: '11111111-2222-3333-4444-555555555555',
                bookingStudentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
            });

            const validSlugUrl = 'https://utmn.modeus.org/learning-path-selection/menus/camp-1/student/stud_2?foo=bar';
            assertDeepEqual(hooks.parsePeCampaignPathParams(validSlugUrl), {
                campaignId: 'camp-1',
                bookingStudentId: 'stud_2'
            });

            const csptUrls = [
                'https://utmn.modeus.org/learning-path-selection/menus/camp-1/student/..%2F..%2Fadmin',
                'https://utmn.modeus.org/learning-path-selection/menus/..%2Fevil/student/stud-1',
                'https://utmn.modeus.org/learning-path-selection/menus/../student/stud-1',
                'https://utmn.modeus.org/learning-path-selection/menus/camp-1/student/..',
                'https://utmn.modeus.org/other-page?fake=/menus/camp-1/student/stud-1'
            ];
            csptUrls.forEach(url => {
                assert.strictEqual(hooks.parsePeCampaignPathParams(url), null, `CSPT URL "${url}" должен быть отклонён`);
            });
        });

        test('syncMyPersonIdCache: очищает профиль (mse_my_specialty/mse_my_profile) при смене person_id, сохраняя mse_friends_list', () => {
            env.localStorage.setItem('mse_my_person_id', 'student-old');
            env.localStorage.setItem('mse_my_specialty', 'Старая специальность');
            env.localStorage.setItem('mse_my_profile', 'Старый профиль');
            env.localStorage.setItem('mse_friends_list', JSON.stringify([{ id: 'f-1', fullName: 'Друг 1' }]));

            // Тот же пользователь -> профиль не трогается
            hooks.syncMyPersonIdCache('student-old');
            assert.strictEqual(env.localStorage.getItem('mse_my_specialty'), 'Старая специальность');

            // Другой пользователь -> профиль очищен, список друзей сохранён
            hooks.syncMyPersonIdCache('student-new');
            assert.strictEqual(env.localStorage.getItem('mse_my_person_id'), 'student-new');
            assert.strictEqual(env.localStorage.getItem('mse_my_specialty'), null);
            assert.strictEqual(env.localStorage.getItem('mse_my_profile'), null);
            assert.ok(env.localStorage.getItem('mse_friends_list') !== null);
        });

        test('опросы: отсутствие двойного экранирования, ограничение 500 символов и maxlength в DOM', () => {
            const rawAnswer = '  A & "B" <C>  ';
            const built = hooks.buildFinalQuestionAnswer(false, new Set(['__custom__']), rawAnswer);
            assert.strictEqual(built, 'Свой вариант: A & "B" <C>', 'В JSON должен сохраняться сырой обрезанный текст без HTML-сущностей');

            const longInput = 'x'.repeat(650);
            const builtLong = hooks.buildFinalQuestionAnswer(false, new Set(['__custom__']), longInput);
            assert.strictEqual(builtLong, `Свой вариант: ${'x'.repeat(500)}`);

            const html = hooks.buildQuestionCustomOptionHtml('checkbox', true, 'A & "B"');
            assert.ok(html.includes('maxlength="500"'), 'Поле ввода должно иметь атрибут maxlength="500"');
            assert.ok(html.includes('value="A &amp; &quot;B&quot;"'), 'Экранирование должно выполняться однократно при рендере DOM');
            assert.strictEqual(html.includes('&amp;amp;'), false, 'Двойного экранирования быть не должно');
        });

        test('handleAuthStorageSync: отклоняет просроченный id_token и принимает валидный при межвкладочной синхронизации', () => {
            const nowSec = Math.floor(Date.now() / 1000);
            const expiredToken = `h.${Buffer.from(JSON.stringify({ sub: 's1', exp: nowSec - 60 })).toString('base64url')}.s`;
            const validToken = `h.${Buffer.from(JSON.stringify({ sub: 's1', exp: nowSec + 3600 })).toString('base64url')}.s`;

            hooks.handleAuthStorageSync({
                key: 'mse_auth_backup',
                newValue: JSON.stringify({ access_token: 'stale_acc', id_token: expiredToken })
            });
            assert.strictEqual(env.sessionStorage.getItem('access_token'), null, 'Просроченный токен из storage event должен отклоняться');

            hooks.handleAuthStorageSync({
                key: 'mse_auth_backup',
                newValue: JSON.stringify({ access_token: 'fresh_acc', id_token: validToken })
            });
            assert.strictEqual(env.sessionStorage.getItem('access_token'), 'fresh_acc');
            assert.strictEqual(env.sessionStorage.getItem('id_token'), validToken);
        });

        test('API и селекторы: блокировка CSPT в fetchEventAttendees и безопасное экранирование в findTriggeringCard', async () => {
            let fetchCalled = false;
            env.window.fetch = async () => {
                fetchCalled = true;
                return { ok: true, json: async () => [] };
            };
            const badRes = await hooks.fetchEventAttendees('../admin', 'tok');
            assert.strictEqual(badRes, null);
            assert.strictEqual(fetchCalled, false, 'При невалидном eventId запрос к API не должен отправляться');

            assert.doesNotThrow(() => hooks.findTriggeringCard({ id: 'popover-"bad"\\id' }));
        });
    });

    describe('7. Детерминированная очистка ресурсов stopAndCleanUp (injected.js)', () => {
        test('stopAndCleanUp: останавливает таймеры, восстанавливает нативные API, удаляет DOM и mse_auth_backup', () => {
            const env = createMockEnvironment('https://utmn.modeus.org/');
            const hook = `
            if (typeof window !== 'undefined') {
                window.__MSE_INJECTED__ = { stopAndCleanUp };
            }`;
            executeScriptWithHook('src/injected.js', hook, env);

            env.localStorage.setItem('mse_auth_backup', JSON.stringify({ access_token: 'secret', id_token: 'secret_id' }));

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
            assert.strictEqual(env.localStorage.getItem('mse_auth_backup'), null, 'stopAndCleanUp обязан удалять mse_auth_backup');
        });

        test('остановка по событию mse:stop: content.js при enabled=false останавливает работающий injected.js и сбрасывает mse_auth_backup', async () => {
            const env = createMockEnvironment('https://utmn.modeus.org/');
            env.CustomEvent = CustomEvent;
            let onMessageHandler = null;
            env.chrome.runtime.onMessage = {
                addListener: (cb) => { onMessageHandler = cb; }
            };
            env.chrome.storage.onChanged = { addListener: () => {} };
            env.chrome.storage.sync.get = async () => ({ enabled: true });
            env.chrome.storage.local.get = async () => ({});
            env.fetch = async () => ({ ok: false, status: 404, text: async () => '' });

            executeScriptWithHook('src/injected.js', '', env);
            assert.ok(env.window.studentEnhancer, 'injected.js должен инициализировать window.studentEnhancer');
            env.localStorage.setItem('mse_auth_backup', JSON.stringify({ access_token: 'secret' }));

            executeScriptWithHook('src/content.js', '', env);
            await new Promise(r => setImmediate(r));
            assert.strictEqual(typeof onMessageHandler, 'function', 'content.js должен регистрировать обработчик runtime.onMessage');

            onMessageHandler({ type: 'mse:sync-enabled', enabled: false }, {}, () => {});

            assert.strictEqual(env.localStorage.getItem('mse_disabled'), '1');
            assert.strictEqual(env.localStorage.getItem('mse_auth_backup'), null, 'mse_auth_backup должен удаляться при отключении');
            assert.strictEqual(env.window.studentEnhancer, undefined, 'Событие mse:stop должно останавливать injected.js и удалять window.studentEnhancer');
        });
    });

});
