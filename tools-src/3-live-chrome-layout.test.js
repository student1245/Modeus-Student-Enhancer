/**
 * Шаг 3 системы автоматизированного тестирования Modeus Student Enhancer (MSE).
 * Живые геометрические и визуальные тесты в браузере Chrome через нативный Chrome DevTools Protocol (CDP).
 *
 * Архитектурные принципы:
 * 1. Zero-dependency: нативные fetch и WebSocket (Node.js 24+), без сторонних библиотек.
 * 2. Graceful skip: если Debug Chrome не запущен (порт 9222 недоступен), тест аккуратно пропускается.
 * 3. Изолированная песочница: разметка рендерится реальным кодом расширения на вкладке about:blank.
 * 4. Мгновенные детерминированные замеры: анимации и переходы принудительно отключены (transition: none).
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const CDP_HTTP_BASE = 'http://127.0.0.1:9222';

// --- Минималистичный клиент Chrome DevTools Protocol (CDP) ---

class NativeCdpSession {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.msgId = 0;
        this.pendingRequests = new Map();
    }

    async connect() {
        if (this.ws.readyState === WebSocket.OPEN) return;
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.id && this.pendingRequests.has(data.id)) {
                const { resolve, reject } = this.pendingRequests.get(data.id);
                this.pendingRequests.delete(data.id);
                if (data.error) reject(new Error(data.error.message));
                else resolve(data.result);
            }
        };
    }

    send(method, params = {}) {
        const id = ++this.msgId;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluateScript(scriptCode) {
        const res = await this.send('Runtime.evaluate', {
            expression: `(function() { ${scriptCode}; return true; })()`,
            returnByValue: true
        });
        if (res.exceptionDetails) {
            const err = res.exceptionDetails.exception?.description || 'Ошибка выполнения скрипта';
            throw new Error(err);
        }
        return res.result?.value;
    }

    async evaluateExpression(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression: `(function() {\n${expression}\n})()`,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            const err = res.exceptionDetails.exception?.description || 'Ошибка вычисления выражения';
            throw new Error(err);
        }
        return res.result?.value;
    }

    close() {
        try {
            this.ws.close();
        } catch {
            // Игнорируем ошибки закрытия сокета
        }
    }
}

// --- Утилиты управления тестовой вкладкой Chrome ---

async function isChromeCdpAvailable() {
    try {
        const res = await fetch(`${CDP_HTTP_BASE}/json/version`, {
            signal: AbortSignal.timeout(1200)
        });
        return res.ok;
    } catch {
        return false;
    }
}

async function createIsolatedTab() {
    const res = await fetch(`${CDP_HTTP_BASE}/json/new?about:blank`, { method: 'PUT' });
    if (!res.ok) throw new Error(`Не удалось создать вкладку Chrome: ${res.statusText}`);
    return await res.json();
}

async function closeIsolatedTab(tabId) {
    if (!tabId) return;
    try {
        await fetch(`${CDP_HTTP_BASE}/json/close/${tabId}`, { method: 'PUT' });
    } catch {
        // Игнорируем ошибки закрытия вкладки
    }
}

// --- Подготовка модулей расширения для песочницы ---

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function preparePeModuleWithHooks() {
    const raw = readProjectFile('src/pe-module.js');
    const hook = `
    if (typeof window !== 'undefined') {
        window.__MSE_PE_DEV__ = { createBusyCardHtml };
    }`;
    const lastReturn = raw.lastIndexOf('return {');
    return raw.slice(0, lastReturn) + `\n${hook}\n` + raw.slice(lastReturn);
}

function prepareInjectedWithHooks() {
    const raw = readProjectFile('src/injected.js');
    const hook = `
    if (typeof window !== 'undefined') {
        window.__MSE_INJECTED_DEV__ = {
            setupUI,
            highlightEventsForStudents,
            selectedStudents,
            eventCache,
            uniqueStudents
        };
    }`;
    return raw.replace(/\}\)\(\);\s*$/, `\n${hook}\n})();`);
}

// --- Сьют живых геометрических тестов ---

describe('Шаг 3: Живые геометрические и визуальные тесты в Chrome (CDP)', async () => {
    let cdp = null;
    let tabTarget = null;
    let chromeOnline = false;

    before(async () => {
        chromeOnline = await isChromeCdpAvailable();
        if (!chromeOnline) return;

        tabTarget = await createIsolatedTab();
        cdp = new NativeCdpSession(tabTarget.webSocketDebuggerUrl);
        await cdp.connect();
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

        // 1. Установка полифиллов хранилища для контекста about:blank
        await cdp.evaluateScript(`
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

            // Перехват runtime-ошибок страницы
            window.__mse_page_errors = [];
            window.addEventListener('error', e => window.__mse_page_errors.push(e.message));
            window.addEventListener('unhandledrejection', e => window.__mse_page_errors.push(String(e.reason)));
        `);

        // 2. Инъекция реальных стилей с отключением анимаций для детерминированных замеров
        const cssStyles = readProjectFile('styles/styles.css');
        const cssPe = readProjectFile('styles/pe-styles.css');
        const combinedCss = `
            ${cssStyles}
            ${cssPe}
            *, *::before, *::after {
                transition: none !important;
                animation: none !important;
            }
            body {
                margin: 0;
                padding: 24px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
        `;
        await cdp.evaluateScript(`
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(combinedCss)};
            document.head.appendChild(style);

            // Каркас хост-страницы расписания Modeus
            document.body.innerHTML = '<div class="main-calendar-form"></div>';
        `);

        // 3. Загрузка реальных модулей расширения
        await cdp.evaluateScript(readProjectFile('src/icons.js'));
        await cdp.evaluateScript(preparePeModuleWithHooks());
        await cdp.evaluateScript(prepareInjectedWithHooks());

        // 4. Генерация реального интерфейса через функции расширения
        await cdp.evaluateScript(`
            // Монтируем тулбар календаря
            window.__MSE_INJECTED_DEV__.setupUI();
            
            // Отображаем блок выбранных студентов для замера сплит-кнопки
            const splitWrap = document.querySelector('#selected-students-dropdown-wrapper');
            if (splitWrap) splitWrap.style.display = 'inline-flex';

            // Симулируем обновление для рендера .ver-pill-btn и .ver-popover
            window.MSE_testUpdate('2.5.0');

            // Монтируем интерфейс физкультуры
            window.MSE_PE.openModal([], {}, '', '', new Map());

            // Открываем модальное окно секции физкультуры
            const modalOverlay = document.getElementById('mse-pe-modal-overlay');
            if (modalOverlay) modalOverlay.style.display = 'flex';

            // Монтируем карточку занятости .busy-card реальной функцией расширения
            const busyWrap = document.createElement('div');
            busyWrap.id = 'mse-busy-test-wrap';
            busyWrap.style.width = '240px';
            busyWrap.innerHTML = window.__MSE_PE_DEV__.createBusyCardHtml('У вас пара', [
                'Математический анализ в многомерных пространствах (проф. Иванов И. И.)',
                'Линейная алгебра и аналитическая геометрия (доц. Петров П. П.)',
                'Теория вероятностей и математическая статистика (доц. Сидоров С. С.)'
            ]);
            document.body.appendChild(busyWrap);
        `);
    });

    after(async () => {
        if (cdp) cdp.close();
        if (tabTarget) await closeIsolatedTab(tabTarget.id);
    });

    test('1. Тулбар: строгая высота 34px и оптическое выравнивание элементов в одну линию', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222 (--remote-debugging-port=9222). Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            const pillBtn = document.querySelector('.ver-pill-btn');
            const iconBtn = document.querySelector('#add-friends-to-search-btn');
            const splitBtn = document.querySelector('.split-btn');
            const pillCheck = document.querySelector('#pe-considerSchedule');

            const rPill = pillBtn.getBoundingClientRect();
            const rIcon = iconBtn.getBoundingClientRect();
            const rSplit = splitBtn.getBoundingClientRect();
            const rCheck = pillCheck.getBoundingClientRect();

            return {
                heights: [rPill.height, rIcon.height, rSplit.height, rCheck.height],
                computedHeights: [
                    getComputedStyle(pillBtn).height,
                    getComputedStyle(iconBtn).height,
                    getComputedStyle(splitBtn).height,
                    getComputedStyle(pillCheck).height
                ],
                toolbarTops: [rPill.top, rIcon.top, rSplit.top]
            };
        `);

        // Все 4 элемента имеют физическую высоту ровно 34px
        metrics.heights.forEach(h => assert.strictEqual(Math.round(h), 34));
        metrics.computedHeights.forEach(ch => assert.strictEqual(ch, '34px'));

        // Кнопки тулбара расположены строго на одной оптической горизонтали
        const [topA, topB, topC] = metrics.toolbarTops;
        assert.ok(Math.abs(topA - topB) <= 1, 'Кнопка обновления и иконка должны быть выровнены по top');
        assert.ok(Math.abs(topB - topC) <= 1, 'Иконка и сплит-кнопка должны быть выровнены по top');
    });

    test('2. Поповер обновления .ver-popover: позиция строго под кнопкой .ver-pill-btn', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            const pillBtn = document.querySelector('.ver-pill-btn');
            const popover = document.querySelector('.ver-popover');
            const rBtn = pillBtn.getBoundingClientRect();
            const rPop = popover.getBoundingClientRect();

            return {
                btnBottom: rBtn.bottom,
                popoverTop: rPop.top,
                gap: rPop.top - rBtn.bottom,
                width: rPop.width,
                rightDiff: Math.abs(rPop.right - rBtn.right),
                isWithinWindow: rPop.right <= window.innerWidth
            };
        `);

        // Поповер расположен строго под кнопкой с нормативным зазором
        assert.ok(metrics.popoverTop > metrics.btnBottom, 'Поповер должен находиться ниже кнопки');
        assert.ok(metrics.gap >= 8 && metrics.gap <= 14, `Зазор между кнопкой и поповером (${metrics.gap}px) в норме 8..14px`);

        // Правый край поповера выровнен по кнопке
        assert.ok(metrics.rightDiff <= 2, 'Поповер должен быть выровнен по правому краю кнопки');
        assert.ok(metrics.isWithinWindow, 'Поповер не должен выходить за правую границу экрана');
    });

    test('3. Карточка .busy-card: физический прирост высоты и поворот шеврона при клике', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            const card = document.querySelector('.busy-card');
            const chevron = card.querySelector('.busy-chevron');

            const hCollapsed = card.getBoundingClientRect().height;
            const chevronTransformBefore = chevron ? getComputedStyle(chevron).transform : 'none';

            // Эмулируем клик пользователя (срабатывает onclick="this.classList.toggle('expanded')")
            card.click();

            const hExpanded = card.getBoundingClientRect().height;
            const chevronTransformAfter = chevron ? getComputedStyle(chevron).transform : 'none';

            return {
                hCollapsed,
                hExpanded,
                heightDiff: hExpanded - hCollapsed,
                chevronTransformBefore,
                chevronTransformAfter
            };
        `);

        // Высота свёрнутой карточки компактна (2 строки)
        assert.ok(metrics.hCollapsed >= 44 && metrics.hCollapsed <= 75, `Высота свёрнутой карточки (${metrics.hCollapsed}px) в норме`);

        // При раскрытии высота реально увеличивается
        assert.ok(metrics.heightDiff >= 20, `Высота карточки должна вырасти при раскрытии (рост: ${metrics.heightDiff}px)`);

        // Шеврон вращается на 180 градусов
        assert.strictEqual(metrics.chevronTransformBefore, 'none');
        assert.strictEqual(metrics.chevronTransformAfter, 'matrix(-1, 0, 0, -1, 0, 0)');
    });

    test('4. Модальное окно физкультуры #mse-pe-modal: идеальное центрирование по осям X и Y', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            const modal = document.querySelector('#mse-pe-modal');
            const rModal = modal.getBoundingClientRect();

            return {
                width: rModal.width,
                modalCenterX: rModal.left + rModal.width / 2,
                windowCenterX: window.innerWidth / 2,
                modalCenterY: rModal.top + rModal.height / 2,
                windowCenterY: window.innerHeight / 2
            };
        `);

        // Модалка имеет ограничение ширины max-width: 620px
        assert.ok(metrics.width <= 620, 'Ширина модалки не должна превышать 620px');

        // Идеальное центрирование по горизонтали и вертикали
        assert.ok(Math.abs(metrics.modalCenterX - metrics.windowCenterX) <= 1.5, 'Модалка должна быть центрирована по горизонтали');
        assert.ok(Math.abs(metrics.modalCenterY - metrics.windowCenterY) <= 3, 'Модалка должна быть центрирована по вертикали');
    });

    test('5. Кнопка закрытия модалки #mse-pe-modal-close-btn: локализация внутри шапки без телепортации', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            const btn = document.querySelector('#mse-pe-modal-close-btn');
            const header = document.querySelector('#mse-pe-modal-header');

            const rBtn = btn.getBoundingClientRect();
            const rHeader = header.getBoundingClientRect();

            return {
                isTopInside: rBtn.top >= rHeader.top,
                isBottomInside: rBtn.bottom <= rHeader.bottom,
                isRightInside: rBtn.right <= rHeader.right,
                distToHeaderRight: rHeader.right - rBtn.right,
                distToWindowRight: window.innerWidth - rBtn.right,
                positionStyle: getComputedStyle(btn).position
            };
        `);

        // Кнопка находится строго внутри вертикальных и горизонтальных границ шапки
        assert.ok(metrics.isTopInside, 'Кнопка закрытия не должна вылезать вверх');
        assert.ok(metrics.isBottomInside, 'Кнопка закрытия не должна вылезать вниз');
        assert.ok(metrics.isRightInside, 'Кнопка закрытия не должна выходить за правый край шапки');

        // Кнопка прижата к правому краю шапки с учётом внутреннего padding
        assert.ok(metrics.distToHeaderRight <= 25, 'Кнопка должна быть прижата к правому краю шапки модалки');

        // Инвариант защиты от телепортации: кнопка отстоит от правого края окна браузера
        assert.ok(metrics.distToWindowRight > 100, `Кнопка не должна телепортироваться к краю экрана (отступ ${metrics.distToWindowRight}px)`);
        assert.strictEqual(metrics.positionStyle, 'static');
    });

    test('6. Кастомный скроллбар 6px, опросник, тосты и чистота консоли (0 runtime-ошибок)', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            // Проверка ширины кастомного скроллбара
            const body = document.querySelector('#mse-pe-modal-body');
            body.style.maxHeight = '120px';
            body.style.overflowY = 'scroll';
            body.innerHTML = '<div style="height: 500px; width: 100%;">Длинный контент</div>';
            const scrollbarWidth = body.offsetWidth - body.clientWidth;

            // Вызов реальных функций показа тоста и опросника
            window.MSE_showToast('Тестовое уведомление MSE', 'success');
            window.MSE_simulateSurvey({
                id: 'live_test_survey',
                title: 'Тестовый опрос',
                questions: [{
                    id: 'q1',
                    text: 'Вопрос',
                    options: ['Ответ 1', 'Ответ 2']
                }]
            });

            const toast = document.querySelector('.mse-toast');
            const survey = document.querySelector('#mse-survey-popup');

            return {
                scrollbarWidth,
                toastMounted: Boolean(toast),
                surveyMounted: Boolean(survey),
                runtimeErrors: window.__mse_page_errors || []
            };
        `);

        // Кастомный скроллбар pe-styles.css имеет ширину ровно 6px
        assert.strictEqual(metrics.scrollbarWidth, 6, 'Ширина скроллбара в модалке должна составлять ровно 6px');

        // Компоненты тоста и опросника успешно смонтированы
        assert.strictEqual(metrics.toastMounted, true, 'Тост-уведомление должно быть смонтировано');
        assert.strictEqual(metrics.surveyMounted, true, 'Опросник должен быть смонтирован');

        // На странице не произошло ни одной runtime-ошибки
        assert.deepStrictEqual(metrics.runtimeErrors, [], 'В консоли браузера не должно быть runtime-ошибок');
    });

    test('7. Карточки календаря: динамическая детекция коллизии заголовка и компактной капсулы (.mse-title-clipped)', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            // Монтируем реальный фрагмент календаря FullCalendar
            const calWrap = document.createElement('div');
            calWrap.id = 'mse-cal-test-wrap';
            calWrap.style.cssText = 'position: relative; width: 600px; height: 300px;';
            calWrap.innerHTML = \`
                <!-- Карточка 1: Короткий адрес ("01, 101"), время в 1 строку, заголовок на строке 2 (НЕТ коллизии) -->
                <div id="test-card-no-collision" class="fc-time-grid-event fc-v-event fc-event fc-start fc-end" data-event-id="ev-no-col" style="position: absolute; top: 10px; left: 10px; width: 140px; height: 60px;">
                    <div class="fc-content">
                        <div class="fc-time">
                            <span>10:15 - 11:45</span>
                            <small class="text-muted">01, 101</small>
                        </div>
                        <div class="fc-title">АЯ-Intl / Практика</div>
                    </div>
                </div>

                <!-- Карточка 2: Длинный адрес ("ул. Перекопская, 15а, Ауд. 302"), время переносится на 2 строки, выталкивая заголовок на строку 3 на уровень капсулы (ЕСТЬ коллизия) -->
                <div id="test-card-collision" class="fc-time-grid-event fc-v-event fc-event fc-start fc-end" data-event-id="ev-col" style="position: absolute; top: 10px; left: 180px; width: 140px; height: 60px;">
                    <div class="fc-content">
                        <div class="fc-time">
                            <span>10:15 - 11:45</span>
                            <small class="text-muted">ул. Перекопская, 15а, Ауд. 302</small>
                        </div>
                        <div class="fc-title">АЦУиОС / Лабораторная работа</div>
                    </div>
                </div>
            \`;
            document.body.appendChild(calWrap);

            // Настраиваем кэш и данные участников
            const dev = window.__MSE_INJECTED_DEV__;
            dev.uniqueStudents.set('Иванов Иван', { id: 'p-ivan', fullName: 'Иванов Иван' });
            dev.eventCache.set('ev-no-col', {
                name: 'АЯ-Intl / Практика',
                fullDisplayName: 'АЯ-Intl / Практика',
                startsAtLocal: '10:15',
                attendees: new Set(['Иванов Иван'])
            });
            dev.eventCache.set('ev-col', {
                name: 'АЦУиОС / Лабораторная работа',
                fullDisplayName: 'АЦУиОС / Лабораторная работа',
                startsAtLocal: '10:15',
                attendees: new Set(['Иванов Иван'])
            });

            dev.selectedStudents.clear();
            dev.selectedStudents.add('Иванов Иван');

            // Запускаем реальный пайплайн подсветки событий расширения
            dev.highlightEventsForStudents();

            const cardNoCol = document.getElementById('test-card-no-collision');
            const cardCol = document.getElementById('test-card-collision');

            const titleNoCol = cardNoCol.querySelector('.fc-title');
            const titleCol = cardCol.querySelector('.fc-title');
            const capsuleCol = cardCol.querySelector('.mse-compact-capsule');

            const styleCol = getComputedStyle(titleCol);
            const styleNoCol = getComputedStyle(titleNoCol);

            const rCardCol = cardCol.getBoundingClientRect();
            const rTitleCol = titleCol.getBoundingClientRect();
            const rCapsuleCol = capsuleCol ? capsuleCol.getBoundingClientRect() : null;
            const titleContentRight = rTitleCol.right - parseFloat(styleCol.paddingRight || '0');

            return {
                cardNoColHasClass: cardNoCol.classList.contains('mse-title-clipped'),
                cardColHasClass: cardCol.classList.contains('mse-title-clipped'),
                titleColPaddingRight: styleCol.paddingRight,
                titleColWhiteSpace: styleCol.whiteSpace,
                titleColTextOverflow: styleCol.textOverflow,
                titleNoColWhiteSpace: styleNoCol.whiteSpace,
                capsuleExists: Boolean(capsuleCol),
                titleRightLeqCapsuleLeft: rCapsuleCol ? (titleContentRight <= rCapsuleCol.left + 1) : false
            };
        `);

        // 1. На карточке с коллизией (АЦУиОС) выставился класс mse-title-clipped
        assert.strictEqual(metrics.cardColHasClass, true, 'Карточка с вытесненным заголовком должна получить класс mse-title-clipped');
        assert.strictEqual(metrics.titleColPaddingRight, '38px', 'Заголовок должен иметь padding-right 38px');
        assert.strictEqual(metrics.titleColWhiteSpace, 'nowrap', 'Заголовок должен обрезаться в одну строку (white-space: nowrap)');
        assert.strictEqual(metrics.titleColTextOverflow, 'ellipsis', 'Текст заголовка должен оканчиваться троеточием');

        // 2. На карточке без коллизии (АЯ-Intl) класс mse-title-clipped НЕ выставляется
        assert.strictEqual(metrics.cardNoColHasClass, false, 'Карточка со свободным заголовком не должна иметь mse-title-clipped');
        assert.notStrictEqual(metrics.titleNoColWhiteSpace, 'nowrap', 'Свободный заголовок не должен принудительно обрезаться в одну строку');

        // 3. Реальный геометрический инвариант движка Blink: текст заголовка не перекрывает капсулу
        assert.strictEqual(metrics.capsuleExists, true, 'Компактная капсула должна быть смонтирована');
        assert.strictEqual(metrics.titleRightLeqCapsuleLeft, true, 'Текст заголовка не должен пересекаться с капсулой по горизонтали');
    });
});
