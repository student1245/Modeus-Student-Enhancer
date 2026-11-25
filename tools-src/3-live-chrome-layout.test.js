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
            uniqueStudents,
            calculateAvailableFormSpace,
            updateSearchCompactState,
            toggleSearchPopover,
            clearSearch
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
            document.body.innerHTML = \`
                <div class="main-calendar-form" style="display: flex; align-items: center; position: relative;">
                    <div class="pl-0 title">Мое расписание</div>
                </div>
                <div class="fc-toolbar fc-header-toolbar" style="background: rgb(227, 242, 253); height: 48px; position: relative; box-sizing: border-box; padding: 5px 10px 4px; margin-top: 10px;">
                    <div class="fc-left" style="float: left; height: 34px;"><h2>9 – 15 нояб. 2026 г.</h2></div>
                    <button type="button" class="btn-filter screen-only" style="position: absolute; right: 115px; top: 12px; width: 95px; height: 34px;"><span>Фильтры (1)</span></button>
                    <div class="fc-right" style="position: absolute; right: 10px; top: 12px; width: 106px; height: 34px;"></div>
                </div>
            \`;
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

            // Монтируем карточку занятости .busy-card реальной функцией расширения внутри #mse-pe-overlay
            const busyWrap = document.createElement('div');
            busyWrap.id = 'mse-busy-test-wrap';
            busyWrap.style.width = '240px';
            busyWrap.innerHTML = window.__MSE_PE_DEV__.createBusyCardHtml('У вас пара', [
                'Математический анализ в многомерных пространствах (проф. Иванов И. И.)',
                'Линейная алгебра и аналитическая геометрия (доц. Петров П. П.)',
                'Теория вероятностей и математическая статистика (доц. Сидоров С. С.)'
            ]);
            const peOverlayForBusy = document.getElementById('mse-pe-overlay');
            (peOverlayForBusy || document.body).appendChild(busyWrap);
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
                searchTops: [rIcon.top, rSplit.top],
                pillTop: rPill.top
            };
        `);

        // Все 4 элемента имеют физическую высоту ровно 34px
        metrics.heights.forEach(h => assert.strictEqual(Math.round(h), 34));
        metrics.computedHeights.forEach(ch => assert.strictEqual(ch, '34px'));

        // Кнопки тулбара поиска в .fc-toolbar расположены строго на одной оптической горизонтали
        const [topA, topB] = metrics.searchTops;
        assert.ok(Math.abs(topA - topB) <= 1, 'Иконка и сплит-кнопка должны быть выровнены по top в .fc-toolbar');
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

            // Эмулируем клик пользователя (срабатывает делегированный обработчик клика)
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

    test('6. Плавный GPU-скроллбар (scaleX), CSS-фолбэк 6px, опросник, тосты и чистота консоли (0 runtime-ошибок)', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        const metrics = await cdp.evaluateExpression(`
            // 1. Проверка чистого CSS-фолбэка 6px на элементе без .mse-has-smooth-scroll
            const peOverlay = document.getElementById('mse-pe-overlay');
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'day-cell';
            fallbackDiv.style.cssText = 'width: 100px; height: 100px; overflow-y: scroll; position: absolute; left: -9999px;';
            fallbackDiv.innerHTML = '<div style="height: 500px; width: 100%;">Фолбэк</div>';
            (peOverlay || document.body).appendChild(fallbackDiv);
            const fallbackScrollbarWidth = fallbackDiv.offsetWidth - fallbackDiv.clientWidth;
            fallbackDiv.remove();

            // 2. Проверка GPU-скроллбара на #mse-pe-modal-body
            const body = document.querySelector('#mse-pe-modal-body');
            body.style.maxHeight = '120px';
            body.style.overflowY = 'scroll';
            body.innerHTML = '<div style="height: 500px; width: 100%;">Длинный контент</div>';

            if (window.MSE_attachSmoothScrollbar) {
                window.MSE_attachSmoothScrollbar(body);
            }
            if (body._mseSmoothScrollbar) {
                body._mseSmoothScrollbar.update();
            }

            const modal = document.querySelector('#mse-pe-modal');
            const track = modal ? modal.querySelector('.mse-scroll-track') : null;
            const thumb = track ? track.querySelector('.mse-scroll-thumb') : null;
            const hasSmoothClass = body.classList.contains('mse-has-smooth-scroll');
            const thumbWidth = thumb ? thumb.offsetWidth : 0;
            const thumbTransform = thumb ? getComputedStyle(thumb).transform : '';

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
                fallbackScrollbarWidth,
                hasSmoothClass,
                hasTrack: Boolean(track),
                thumbWidth,
                thumbTransform,
                toastMounted: Boolean(toast),
                surveyMounted: Boolean(survey),
                runtimeErrors: window.__mse_page_errors || []
            };
        `);

        // Чистый CSS-фолбэк без .mse-has-smooth-scroll имеет ширину ровно 6px
        assert.strictEqual(metrics.fallbackScrollbarWidth, 6, 'CSS-фолбэк скроллбара должен иметь ширину ровно 6px');

        // Модальное тело использует GPU-скроллбар
        assert.strictEqual(metrics.hasSmoothClass, true, 'Контейнер должен иметь класс .mse-has-smooth-scroll');
        assert.strictEqual(metrics.hasTrack, true, 'Дорожка .mse-scroll-track должна быть смонтирована');
        assert.strictEqual(metrics.thumbWidth, 6, 'Базовая ширина ползунка .mse-scroll-thumb должна составлять ровно 6px');
        assert.ok(metrics.thumbTransform.includes('0.35') || metrics.thumbTransform.includes('0.34') || metrics.thumbTransform === 'none', 'В покое ползунок масштабирован scaleX(0.35)');

        // Компоненты тоста и опросника успешно смонтированы
        assert.strictEqual(metrics.toastMounted, true, 'Тост-уведомление должно быть смонтировано');
        assert.strictEqual(metrics.surveyMounted, true, 'Опросник должен быть смонтирован');

        // На странице не произошло ни одной runtime-ошибок
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
                <style>
                    #mse-cal-test-wrap .fc-time-grid-event {
                        box-sizing: border-box;
                        font-size: 11px;
                        line-height: 1.25;
                        overflow: hidden;
                        padding: 1px 2px;
                    }
                    #mse-cal-test-wrap .fc-time {
                        font-size: 11px;
                        line-height: 13px;
                        margin-bottom: 2px;
                    }
                    #mse-cal-test-wrap .fc-time small {
                        font-size: 10px;
                        display: inline;
                    }
                    #mse-cal-test-wrap .fc-title {
                        font-size: 12.5px;
                        line-height: 16.25px;
                    }
                </style>
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
                titleRightLeqCapsuleLeft: rCapsuleCol ? (titleContentRight <= rCapsuleCol.left + 2) : false
            };
        `);

        // 1. На карточке с коллизией (АЦУиОС) выставился класс mse-title-clipped
        assert.strictEqual(metrics.cardColHasClass, true, 'Карточка с вытесненным заголовком должна получить класс mse-title-clipped');
        assert.strictEqual(metrics.titleColPaddingRight, '38px', 'Заголовок должен иметь padding-right 38px');
        assert.strictEqual(metrics.titleColTextOverflow, 'ellipsis', 'Текст заголовка должен оканчиваться троеточием');

        // 2. На карточке без коллизии (АЯ-Intl) класс mse-title-clipped НЕ выставляется
        assert.strictEqual(metrics.cardNoColHasClass, false, 'Карточка со свободным заголовком не должна иметь mse-title-clipped');

        // 3. Реальный геометрический инвариант движка Blink: текст заголовка не перекрывает капсулу
        assert.strictEqual(metrics.capsuleExists, true, 'Компактная капсула должна быть смонтирована');
        assert.strictEqual(metrics.titleRightLeqCapsuleLeft, true, 'Текст заголовка не должен пересекаться с капсулой по горизонтали');
    });

    test('8. Адаптивность шапки календаря: матрица экранов 1600px-850px, кнопка-лупа [🔍] и 0px горизонтального скролла', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        // Подготавливаем окружение с календарем и нативными элементами Модеуса
        await cdp.evaluateExpression(`
            document.body.innerHTML = '';
            document.body.className = 'mse-active';
            document.body.style.padding = '0';
            document.body.style.margin = '0';

            const menu = document.createElement('div');
            menu.className = 'menu mobile-menu';
            menu.style.cssText = 'position: fixed; left: 0; top: 0; bottom: 0; z-index: 100;';
            document.body.appendChild(menu);

            const form = document.createElement('div');
            form.className = 'main-calendar-form';
            form.innerHTML = \`
                <div class="pl-0 title" style="width: 217px; height: 34px;">Мое расписание</div>
                <div class="fix-width-select d-inline-block" style="width: 250px; height: 34px;"></div>
                <div class="fix-width-select d-inline-block" style="width: 100px; height: 34px;"></div>
                <div class="location_table" style="width: 200px; height: 34px;">Адреса корпусов</div>
            \`;
            const mainContent = document.createElement('div');
            mainContent.className = 'main-content';
            mainContent.style.cssText = 'box-sizing: border-box;';
            const containerFluid = document.createElement('div');
            containerFluid.className = 'container-fluid';
            containerFluid.style.minWidth = '845px'; // Нативный стиль Модеуса
            containerFluid.appendChild(form);
            document.body.appendChild(mainContent);

            const calWrapper = document.createElement('div');
            calWrapper.className = 'calendar-wrapper';
            calWrapper.style.position = 'relative';
            calWrapper.innerHTML = \`
                <button type="button" class="btn-filter screen-only" style="position: absolute; right: 115px; top: 12px; width: 95px; height: 27px;"><span>Фильтры (1)</span></button>
                <div class="fc-toolbar fc-header-toolbar" style="background: rgb(227, 242, 253); height: 48px; position: relative; box-sizing: border-box; padding: 5px 10px 4px;">
                    <div class="fc-left" style="float: left;"><h2>9 – 15 нояб. 2026 г.</h2></div>
                    <div class="fc-right" style="float: right; width: 107px;"><select class="fc-view-select form-control" style="width: 107px; height: 34px;"><option>Неделя</option></select></div>
                    <div class="fc-clear" style="clear: both;"></div>
                </div>
            \`;
            containerFluid.appendChild(calWrapper);
            mainContent.appendChild(containerFluid);

            // Инициализируем UI расширения
            window.__MSE_INJECTED_DEV__.setupUI();
        `);

        const widths = [1600, 1460, 1400, 1280, 1131, 1024, 860, 850];

        for (const w of widths) {
            for (const hasFriends of [false, true]) {
                await cdp.send('Emulation.setDeviceMetricsOverride', {
                    width: w,
                    height: 800,
                    deviceScaleFactor: 1,
                    mobile: false
                });

                // Переключаем друзей и замеряем геометрию
                const res = await cdp.evaluateExpression(`
                    const dev = window.__MSE_INJECTED_DEV__;
                    dev.selectedStudents.clear();
                    if (${hasFriends}) {
                        for (let i = 1; i <= 10; i++) {
                            dev.selectedStudents.add('Друг ' + i);
                        }
                    }
                    const searchControls = document.getElementById('search-controls');
                    if (searchControls) searchControls.style.display = 'flex';
                    const wrapper = document.getElementById('selected-students-dropdown-wrapper');
                    const countSpan = document.getElementById('selected-count');
                    if (wrapper) wrapper.style.display = ${hasFriends} ? 'block' : 'none';
                    if (countSpan) countSpan.textContent = '${hasFriends ? 10 : 0}';

                    const isMenuExpanded = ${w} > 1100;
                    const sidebarWidth = isMenuExpanded ? 312 : 56;
                    const menu = document.querySelector('div.menu');
                    if (menu) {
                        menu.className = isMenuExpanded ? 'menu mobile-menu' : 'menu mobile-menu menu-small';
                        menu.style.width = sidebarWidth + 'px';
                    }
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.style.marginLeft = sidebarWidth + 'px';
                        mainContent.style.width = (${w} - sidebarWidth) + 'px';
                    }

                    dev.updateSearchCompactState();

                    const container = document.getElementById('enhancer-search-container');
                    const toggleBtn = document.getElementById('search-toggle-btn');
                    const popover = document.getElementById('mse-search-popover');

                    const fcToolbar = document.querySelector('.fc-toolbar') || document.querySelector('.fc-header-toolbar');
                    const freeSpace = dev.calculateAvailableFormSpace(fcToolbar);

                    const containerRect = container.getBoundingClientRect();
                    const containerFitsViewport = containerRect.right <= document.documentElement.clientWidth + 1;

                    const scrollW = document.documentElement.scrollWidth;
                    const clientW = document.documentElement.clientWidth;
                    const hasScroll = scrollW > clientW;

                    const isCompact = container.classList.contains('is-compact');
                    const isUltraCompact = container.classList.contains('is-ultra-compact');
                    const toggleDisplay = getComputedStyle(toggleBtn).display;
                    const popoverDisplay = getComputedStyle(popover).display;

                    // Тестируем открытие поповера в компактном режиме
                    let popoverOpensCleanly = true;
                    if (isCompact) {
                        dev.toggleSearchPopover(true);
                        const openDisplay = getComputedStyle(popover).display;
                        const openRect = popover.getBoundingClientRect();
                        const scrollWhenOpen = document.documentElement.scrollWidth > document.documentElement.clientWidth;
                        popoverOpensCleanly = (openDisplay === 'flex' && openRect.width >= 270 && !scrollWhenOpen);
                        dev.toggleSearchPopover(false);
                        const closedDisplay = getComputedStyle(popover).display;
                        if (closedDisplay !== 'none') popoverOpensCleanly = false;
                    }

                    // Тестируем выпадающий список выбранных студентов и взаимное закрытие
                    let dropdownFitsViewport = true;
                    let mutualCloseWorks = true;
                    if (${hasFriends}) {
                        const selToggle = document.getElementById('selected-students-toggle');
                        const selDropdown = document.getElementById('selected-students-container');
                        selToggle.click();
                        const rDrop = selDropdown.getBoundingClientRect();
                        dropdownFitsViewport = (rDrop.right <= window.innerWidth + 1);

                        if (isCompact) {
                            toggleBtn.click();
                            mutualCloseWorks = (popover.classList.contains('is-open') && getComputedStyle(selDropdown).display === 'none');
                            selToggle.click();
                            mutualCloseWorks = mutualCloseWorks && (!popover.classList.contains('is-open') && getComputedStyle(selDropdown).display === 'flex');
                            selToggle.click();
                        } else {
                            selToggle.click();
                        }
                    }

                    return {
                        w: ${w},
                        hasFriends: ${hasFriends},
                        freeSpace,
                        scrollW,
                        clientW,
                        hasScroll,
                        isCompact,
                        isUltraCompact,
                        inToolbar: container.classList.contains('in-calendar-toolbar'),
                        containerFitsViewport,
                        containerRight: containerRect.right,
                        toggleDisplay,
                        popoverDisplay,
                        popoverOpensCleanly,
                        dropdownFitsViewport,
                        mutualCloseWorks
                    };
                `);

                assert.strictEqual(res.hasScroll, false, `На ширине ${w}px (друзья: ${hasFriends}) не должно быть горизонтального скролла (${res.scrollW} > ${res.clientW})`);
                assert.strictEqual(res.containerFitsViewport, true, `На ширине ${w}px (друзья: ${hasFriends}) правый край блока (${res.containerRight}) не должен выходить за вьюпорт (${res.clientW})`);

                const fullRequired = hasFriends ? 440 : 270;
                const compactWithLabelRequired = hasFriends ? 300 : 125;

                let expectedIsCompact = false;
                let expectedIsUltraCompact = false;

                if (res.freeSpace >= fullRequired) {
                    expectedIsCompact = false;
                    expectedIsUltraCompact = false;
                } else if (res.freeSpace >= compactWithLabelRequired) {
                    expectedIsCompact = true;
                    expectedIsUltraCompact = false;
                } else {
                    expectedIsCompact = true;
                    expectedIsUltraCompact = true;
                }

                assert.strictEqual(res.inToolbar, true, `На ширине ${w}px контейнер поиска должен постоянно находиться в .fc-toolbar`);
                assert.strictEqual(res.isCompact, expectedIsCompact, `На ширине ${w}px (друзья: ${hasFriends}, freeSpace: ${res.freeSpace}) статус isCompact должен быть ${expectedIsCompact}`);
                assert.strictEqual(res.isUltraCompact, expectedIsUltraCompact, `На ширине ${w}px (друзья: ${hasFriends}, freeSpace: ${res.freeSpace}) статус isUltraCompact должен быть ${expectedIsUltraCompact}`);

                if (hasFriends) {
                    assert.strictEqual(res.dropdownFitsViewport, true, `На ширине ${w}px список студентов не должен выходить за правый край экрана`);
                    assert.strictEqual(res.mutualCloseWorks, true, `На ширине ${w}px взаимное закрытие поповеров должно работать корректно`);
                }
                if (res.isCompact) {
                    assert.notStrictEqual(res.toggleDisplay, 'none', `На ширине ${w}px кнопка-лупа должна быть видима`);
                    assert.strictEqual(res.popoverDisplay, 'none', `На ширине ${w}px поповер должен быть скрыт по умолчанию`);
                    assert.strictEqual(res.popoverOpensCleanly, true, `На ширине ${w}px поповер должен открываться без скролла`);
                } else {
                    assert.strictEqual(res.toggleDisplay, 'none', `На ширине ${w}px кнопка-лупа должна быть скрыта`);
                }
            }
        }

        // Проверка постоянства размещения: сужение до 850px -> обратное расширение до 1600px
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 850, height: 800, deviceScaleFactor: 1, mobile: false });
        await cdp.evaluateExpression(`
            const dev = window.__MSE_INJECTED_DEV__;
            dev.selectedStudents.clear();
            for (let i = 1; i <= 10; i++) dev.selectedStudents.add('Друг ' + i);
            const menu = document.querySelector('div.menu');
            if (menu) { menu.className = 'menu mobile-menu menu-small'; menu.style.width = '56px'; }
            const mainContent = document.querySelector('.main-content');
            if (mainContent) { mainContent.style.marginLeft = '56px'; mainContent.style.width = (850 - 56) + 'px'; }
            dev.updateSearchCompactState();
        `);

        const narrowState = await cdp.evaluateExpression(`
            const container = document.getElementById('enhancer-search-container');
            const toolbar = document.querySelector('.fc-toolbar') || document.querySelector('.fc-header-toolbar');
            return {
                inToolbar: container.classList.contains('in-calendar-toolbar'),
                parentIsToolbar: container.parentElement === toolbar
            };
        `);
        assert.strictEqual(narrowState.inToolbar, true, 'На ширине 850px блок должен быть в .fc-toolbar');
        assert.strictEqual(narrowState.parentIsToolbar, true, 'На ширине 850px родителем должен быть .fc-toolbar');

        // Теперь обратно расширяем до 1600px
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 800, deviceScaleFactor: 1, mobile: false });
        await cdp.evaluateExpression(`
            const dev = window.__MSE_INJECTED_DEV__;
            const menu = document.querySelector('div.menu');
            if (menu) { menu.className = 'menu mobile-menu'; menu.style.width = '312px'; }
            const mainContent = document.querySelector('.main-content');
            if (mainContent) { mainContent.style.marginLeft = '312px'; mainContent.style.width = (1600 - 312) + 'px'; }
            dev.updateSearchCompactState();
        `);

        const expandedState = await cdp.evaluateExpression(`
            const container = document.getElementById('enhancer-search-container');
            const toolbar = document.querySelector('.fc-toolbar') || document.querySelector('.fc-header-toolbar');
            return {
                inToolbar: container.classList.contains('in-calendar-toolbar'),
                parentIsToolbar: container.parentElement === toolbar,
                isCompact: container.classList.contains('is-compact'),
                isUltraCompact: container.classList.contains('is-ultra-compact')
            };
        `);
        assert.strictEqual(expandedState.inToolbar, true, 'При расширении до 1600px inToolbar сохраняется');
        assert.strictEqual(expandedState.parentIsToolbar, true, 'При расширении до 1600px контейнер остаётся в .fc-toolbar');
        assert.strictEqual(expandedState.isCompact, false, 'При ширине 1600px блок должен вернуться в полный режим (isCompact: false)');
        assert.strictEqual(expandedState.isUltraCompact, false, 'При ширине 1600px isUltraCompact должен быть false');

        await cdp.send('Emulation.clearDeviceMetricsOverride');
    });

    test('9. Адаптивность календаря: оверлей карточки пары (<= 1380px), зазор шапки и сворачивание бокового меню (1155px)', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        // 1. Проверка сворачивания бокового меню на 1150px
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1150, height: 800, deviceScaleFactor: 1, mobile: false });
        await cdp.evaluateScript(`
            document.body.innerHTML = \`
                <div class="menu">
                    <div class="user-info">
                        <span class="user-name user-full-name">Егор Е. Миллер</span>
                        <span class="user-name user-short-name">Е.Е.</span>
                    </div>
                </div>
                <div class="content">
                    <div class="main-calendar-form">
                        <div class="title"><h3>Мое расписание</h3></div>
                        <div class="fix-width-select grid" style="height: 34px;">Селект</div>
                    </div>
                    <div class="calendar-container">
                        <div class="calendar-row">
                            <div class="cal-col">
                                <div class="fc-toolbar" style="height: 34px; display: flex; justify-content: space-between;">
                                    <div class="fc-left">9 – 15 нояб. 2026 г.</div>
                                    <div class="fc-right">Кнопки тулбара</div>
                                </div>
                                <div class="fc-view-container" style="height: 400px;">Сетка календаря</div>
                            </div>
                            <div class="event-card-block">
                                <div class="event-card-container">
                                    <div class="event-card-container__header">
                                        <span>Открыть</span>
                                        <span class="close-btn">Закрыть</span>
                                    </div>
                                    <div class="event-card-container__content">Детали пары</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            \`;
        `);

        // Проверка бокового меню на 1150px
        const menuCheck = await cdp.evaluateExpression(`
            const menu = document.querySelector('.menu');
            const short = menu ? menu.querySelector('.user-short-name') : null;
            const full = menu ? menu.querySelector('.user-full-name') : null;
            return {
                width: menu ? menu.offsetWidth : null,
                shortVisible: short ? getComputedStyle(short).display !== 'none' : null,
                fullVisible: full ? getComputedStyle(full).display !== 'none' : null
            };
        `);
        assert.strictEqual(menuCheck.width, 68, 'На 1150px ширина .menu должна быть 68px');
        assert.strictEqual(menuCheck.shortVisible, true, 'На 1150px при свёрнутом меню отображаются инициалы (.user-short-name)');
        assert.strictEqual(menuCheck.fullVisible, false, 'На 1150px при свёрнутом меню скрыто полное имя (.user-full-name)');

        // 2. Двухступенчатая проверка оверлея карточки пары:
        // А) На 1250px и 1196px: оверлей при раскрытом меню, штатный поток при свёрнутом
        for (const w of [1250, 1196]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });

            // Раскрытое меню (overlay)
            await cdp.evaluateScript(`
                const menu = document.querySelector('.menu');
                if (menu) menu.className = 'menu';
            `);
            const expRes = await cdp.evaluateExpression(`
                const row = document.querySelector('.calendar-row');
                const calCol = row ? row.firstElementChild : null;
                const card = document.querySelector('.event-card-block');
                const cardComp = card ? getComputedStyle(card) : null;
                return {
                    cardPosition: cardComp ? cardComp.position : null,
                    calColWidth: calCol ? calCol.offsetWidth : null,
                    rowWidth: row ? row.offsetWidth : null
                };
            `);
            assert.strictEqual(expRes.cardPosition, 'absolute', `На ${w}px при раскрытом меню карточка пары должна быть overlay`);
            assert.strictEqual(expRes.calColWidth, expRes.rowWidth, `На ${w}px при раскрытом меню календарь занимает 100% ширины`);

            // Свёрнутое меню (штатный поток сбоку)
            await cdp.evaluateScript(`
                const menu = document.querySelector('.menu');
                if (menu) menu.className = 'menu menu-small';
            `);
            const colRes = await cdp.evaluateExpression(`
                const card = document.querySelector('.event-card-block');
                const cardComp = card ? getComputedStyle(card) : null;
                return {
                    cardPosition: cardComp ? cardComp.position : null
                };
            `);
            assert.strictEqual(colRes.cardPosition, 'static', `На ${w}px при свёрнутом меню карточка пары открывается штатно сбоку (in-flow)`);
        }

        // Б) На 1171px и 983px: безусловный оверлей независимо от состояния меню
        for (const w of [1171, 983]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
            for (const isSmall of [false, true]) {
                await cdp.evaluateScript(`
                    const menu = document.querySelector('.menu');
                    if (menu) menu.className = ${isSmall} ? 'menu menu-small' : 'menu';
                `);
                const uncondRes = await cdp.evaluateExpression(`
                    const row = document.querySelector('.calendar-row');
                    const calCol = row ? row.firstElementChild : null;
                    const card = document.querySelector('.event-card-block');
                    const cardComp = card ? getComputedStyle(card) : null;
                    return {
                        cardPosition: cardComp ? cardComp.position : null,
                        calColWidth: calCol ? calCol.offsetWidth : null,
                        rowWidth: row ? row.offsetWidth : null
                    };
                `);
                assert.strictEqual(uncondRes.cardPosition, 'absolute', `На ${w}px (menu-small: ${isSmall}) карточка пары всегда overlay`);
                assert.strictEqual(uncondRes.calColWidth, uncondRes.rowWidth, `На ${w}px (menu-small: ${isSmall}) календарь сохраняет 100% ширины`);
            }
        }

        // 3. Проверка вертикального зазора на 1600px, 1340px, 1155px, 850px
        for (const w of [1600, 1340, 1155, 850]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
            const gapRes = await cdp.evaluateExpression(`
                const form = document.querySelector('.main-calendar-form');
                const titleH3 = form ? form.querySelector('.title h3') : null;
                return {
                    formHeight: form ? form.offsetHeight : null,
                    h3MarginTop: titleH3 ? getComputedStyle(titleH3).marginTop : null,
                    h3MarginBottom: titleH3 ? getComputedStyle(titleH3).marginBottom : null
                };
            `);
            assert.notStrictEqual(gapRes.h3MarginBottom, '0px', `На ширине ${w}px вертикальные маржины h3 не должны обнуляться`);
        }

        await cdp.send('Emulation.clearDeviceMetricsOverride');
    });

    test('10. Адаптивность физкультуры: полноэкранный режим без серых полей, 0px горизонтального скролла на 1000px, кнопка-лупа друга и двухстрочные карточки', async (t) => {
        if (!chromeOnline) {
            t.skip('Debug Chrome недоступен на порту 9222. Тест пропущен.');
            return;
        }

        // 1. Монтируем реалистичные данные в окно физкультуры
        await cdp.evaluateScript(`
            const mockModules = [
                {
                    moduleElementId: 'mod-1',
                    name: 'Элективные дисциплины по физической культуре и спорту',
                    selectedTeamIds: ['team-volleyball-enrolled'],
                    cycles: [
                        {
                            teams: [
                                {
                                    id: 'team-ofp-1',
                                    name: 'ФК: Общая физическая подготовка (4) ПН 08:30 СК Колокол (ул. Ленина, 16)',
                                    teachers: ['Иванов И. И.'],
                                    available: 15,
                                    limit: 20
                                },
                                {
                                    id: 'team-basketball-1',
                                    name: 'ФК: Баскетбол (2) ПН 08:30 СК Колокол (ул. Ленина, 16)',
                                    teachers: ['Смирнов С. С.'],
                                    available: 5,
                                    limit: 20
                                },
                                {
                                    id: 'team-football-1',
                                    name: 'ФК: Мини-футбол (2) ПН 08:30 СК Колокол (ул. Ленина, 16)',
                                    teachers: ['Кузнецов К. К.'],
                                    available: 8,
                                    limit: 20
                                },
                                {
                                    id: 'team-swimming-1',
                                    name: 'ФК: Плавание (1) ПН 08:30 СК Колокол (ул. Ленина, 16)',
                                    teachers: ['Попов П. П.'],
                                    available: 4,
                                    limit: 15
                                },
                                {
                                    id: 'team-badminton-1',
                                    name: 'ФК: Бадминтон (1) ПН 08:30 СК Колокол (ул. Ленина, 16)',
                                    teachers: ['Соколов С. С.'],
                                    available: 3,
                                    limit: 12
                                },
                                {
                                    id: 'team-tennis-1',
                                    name: 'ФК: Настольный теннис (2) ПН 10:15 СК Олимпия (ул. Пржевальского, 37)',
                                    teachers: ['Петров П. П.'],
                                    available: 1,
                                    limit: 10
                                },
                                {
                                    id: 'team-volleyball-enrolled',
                                    name: 'ФК: Волейбол (2) ВТ 12:00 СОК Зодчий (ул. Луначарского, 2, корп. 5)',
                                    teachers: ['Сидорова А. С.'],
                                    available: 0,
                                    limit: 25
                                }
                            ]
                        }
                    ]
                }
            ];

            localStorage.setItem('mse_friends_list', JSON.stringify([
                { personId: 'p-1', fullName: 'Иванов Иван' },
                { personId: 'p-2', fullName: 'Константинопольский Константин' },
                { personId: 'p-3', fullName: 'Петров Петр' },
                { personId: 'p-4', fullName: 'Сидоров Сидор' },
                { personId: 'p-5', fullName: 'Кузнецов Алексей' },
                { personId: 'p-6', fullName: 'Смирнов Дмитрий' }
            ]));

            window.MSE_PE.openModal(mockModules, {}, 'camp-1', 'stud-1', new Map());
        `);

        // 2. Проверка размещения кнопки закрытия внутри header-panel и крупного заголовка H2
        const headerMetrics = await cdp.evaluateExpression(`
            const overlay = document.getElementById('mse-pe-overlay');
            const container = overlay ? overlay.querySelector('.container') : null;
            const header = overlay ? overlay.querySelector('.header-panel') : null;
            const closeBtn = document.getElementById('mse-pe-close');
            const h2 = header ? header.querySelector('h2') : null;
            const h2Computed = h2 ? getComputedStyle(h2) : null;

            const rHeader = header ? header.getBoundingClientRect() : null;
            const rClose = closeBtn ? closeBtn.getBoundingClientRect() : null;

            return {
                isInsideHeader: !!(closeBtn && header && header.contains(closeBtn)),
                containerMarginLeft: container ? getComputedStyle(container).marginLeft : null,
                containerMarginRight: container ? getComputedStyle(container).marginRight : null,
                closeInsideBounds: !!(rHeader && rClose && rClose.right <= rHeader.right + 2 && rClose.top >= rHeader.top - 2 && rClose.bottom <= rHeader.bottom + 2),
                h2FontSize: h2Computed ? parseFloat(h2Computed.fontSize) : 0,
                h2FontWeight: h2Computed ? h2Computed.fontWeight : ''
            };
        `);
        assert.strictEqual(headerMetrics.isInsideHeader, true, 'Кнопка закрытия обязана монтироваться внутри .header-panel');
        assert.strictEqual(headerMetrics.containerMarginLeft, '0px', 'Контейнер не должен иметь боковых маржинов');
        assert.strictEqual(headerMetrics.containerMarginRight, '0px', 'Контейнер не должен иметь боковых маржинов');
        assert.strictEqual(headerMetrics.closeInsideBounds, true, 'Кнопка закрытия должна оставаться строго в границах шапки');
        assert.ok(headerMetrics.h2FontSize >= 22, `Размер шрифта заголовка должен быть не менее 22px (фактический: ${headerMetrics.h2FontSize}px)`);
        assert.strictEqual(headerMetrics.h2FontWeight, '700', 'Жирность заголовка должна быть 700');

        // 3. Матрица разрешений: [1750, 1440, 1290, 1121, 1000]
        const viewports = [1750, 1440, 1290, 1121, 1000];
        for (const w of viewports) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
            await new Promise(r => setTimeout(r, 40));

            const data = await cdp.evaluateExpression(`
                const overlay = document.getElementById('mse-pe-overlay');
                const container = overlay.querySelector('.container');
                const header = overlay.querySelector('.header-panel');
                const h2 = header.querySelector('h2');
                const closeBtn = document.getElementById('mse-pe-close');
                const filtersGroup = overlay.querySelector('.filters-group');
                const table = overlay.querySelector('table');
                const friendToggleBtn = document.getElementById('pe-friendToggleBtn');

                const rHeader = header.getBoundingClientRect();
                const rH2 = h2.getBoundingClientRect();
                const rClose = closeBtn.getBoundingClientRect();
                const rFilters = filtersGroup.getBoundingClientRect();

                const windowCenterX = window.innerWidth / 2;
                const h2CenterX = rH2.left + rH2.width / 2;
                const filtersCenterX = rFilters.left + rFilters.width / 2;

                const isSingleRow = (Math.abs(rH2.top - rFilters.top) < 15);
                const h2TopPadding = Math.round(rH2.top - rHeader.top);
                const closeTopPadding = Math.round(rClose.top - rHeader.top);
                const closeRightDist = Math.round(rHeader.right - rClose.right);

                // 1. Проверка отсутствия горизонтального скролла
                const scrollDiff = Math.max(0, overlay.scrollWidth - overlay.clientWidth, container.scrollWidth - container.clientWidth);

                // 2. Проверка, что фильтры в одну строку
                const filterItems = Array.from(filtersGroup.children).filter(c => getComputedStyle(c).display !== 'none');
                const itemTops = filterItems.map(c => Math.round(c.getBoundingClientRect().top));
                const itemBottoms = filterItems.map(c => Math.round(c.getBoundingClientRect().bottom));
                const isFiltersOneLine = (Math.max(...itemTops) < Math.min(...itemBottoms));

                // 3. Проверка кнопки-лупы друга
                const toggleDisplay = friendToggleBtn ? getComputedStyle(friendToggleBtn).display : 'none';

                // 4. Проверка двухстрочной карточки
                const card = table.querySelector('.sport-card');
                let cardCheck = null;
                if (card) {
                    const topRow = card.querySelector('.sc-top');
                    const bottomRow = card.querySelector('.sc-bottom');
                    const titleText = card.querySelector('.sc-title-text');
                    const countEl = card.querySelector('.sc-count');
                    const slotsEl = card.querySelector('.sc-slots');

                    const rTop = topRow ? topRow.getBoundingClientRect() : null;
                    const rBottom = bottomRow ? bottomRow.getBoundingClientRect() : null;
                    const rTitle = titleText ? titleText.getBoundingClientRect() : null;
                    const rCount = countEl ? countEl.getBoundingClientRect() : null;
                    const distance = (rTitle && rCount) ? (rCount.left - rTitle.right) : 999;

                    const slotsTotal = slotsEl ? slotsEl.querySelector('.sc-slots-total') : null;
                    const slotsTotalMarginLeft = slotsTotal ? parseFloat(getComputedStyle(slotsTotal).marginLeft) : 0;

                    cardCheck = {
                        hasTwoRows: !!(topRow && bottomRow && rTop && rBottom && rTop.bottom <= rBottom.top + 1),
                        slotsInBottomRow: !!(bottomRow && bottomRow.contains(slotsEl)),
                        countVisible: !!(countEl && rCount && rCount.width > 0),
                        countDistance: Math.round(distance * 10) / 10,
                        slotsTotalMarginLeft
                    };
                }

                // 4. Проверка бокового скроллбара оверлея под шапкой
                const overlayTrack = overlay.querySelector('.mse-scroll-track-fixed');
                const rOverlayTrack = overlayTrack ? overlayTrack.getBoundingClientRect() : null;
                const isTrackBelowHeader = rOverlayTrack ? (rOverlayTrack.top >= rHeader.bottom - 1) : true;

                // 5. Проверка переполненной ячейки и ее скроллбара
                let cellScrollCheck = null;
                const cellWraps = Array.from(overlay.querySelectorAll('.day-cell-wrap'));
                for (const wrap of cellWraps) {
                    const scrollEl = wrap.querySelector('.day-cell');
                    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 2) {
                        const track = wrap.querySelector('.mse-scroll-track');
                        const thumb = track ? track.querySelector('.mse-scroll-thumb') : null;
                        const rThumb = thumb ? thumb.getBoundingClientRect() : null;
                        const compThumb = thumb ? getComputedStyle(thumb) : null;
                        cellScrollCheck = {
                            found: true,
                            trackFound: Boolean(track),
                            thumbFound: Boolean(thumb),
                            thumbHeight: rThumb ? rThumb.height : 0,
                            thumbOpacity: compThumb ? parseFloat(compThumb.opacity) : 0
                        };
                        break;
                    }
                }

                return {
                    isSingleRow,
                    h2TopPadding,
                    closeTopPadding,
                    closeRightDist,
                    h2CenterDiff: Math.abs(h2CenterX - windowCenterX),
                    filtersCenterDiff: Math.abs(filtersCenterX - windowCenterX),
                    scrollDiff,
                    isFiltersOneLine,
                    toggleDisplay,
                    cardCheck,
                    isTrackBelowHeader,
                    cellScrollCheck
                };
            `);

            assert.strictEqual(data.scrollDiff, 0, `На ширине ${w}px должен быть строго 0px горизонтального скролла`);
            assert.strictEqual(data.isFiltersOneLine, true, `На ширине ${w}px фильтры должны располагаться строго в 1 строку`);
            assert.strictEqual(data.isTrackBelowHeader, true, `На ширине ${w}px боковой скроллбар оверлея должен начинаться под шапкой`);
            if (data.cellScrollCheck) {
                assert.strictEqual(data.cellScrollCheck.trackFound, true, `На ширине ${w}px дорожка скролла ячейки должна быть смонтирована`);
                assert.ok(data.cellScrollCheck.thumbHeight >= 28, `На ширине ${w}px высота ползунка ячейки должна быть >= 28px`);
                assert.ok(data.cellScrollCheck.thumbOpacity >= 0.6, `На ширине ${w}px ползунок ячейки должен быть виден в покое (opacity >= 0.6)`);
            }

            if (w > 1640) {
                assert.strictEqual(data.isSingleRow, true, `На ширине ${w}px (> 1640px) шапка должна быть в одну строку`);
                assert.ok(data.h2TopPadding >= 18, `На ширине ${w}px сверху должен быть воздух (padding >= 18px, факт: ${data.h2TopPadding}px)`);
            } else {
                assert.strictEqual(data.isSingleRow, false, `На ширине ${w}px (<= 1640px) шапка должна переходить в две строки`);
                assert.ok(data.h2CenterDiff <= 10, `На ширине ${w}px заголовок h2 должен быть отцентрирован по горизонтали (дельта: ${data.h2CenterDiff}px <= 10px)`);
                assert.ok(data.filtersCenterDiff <= 10, `На ширине ${w}px панель фильтров должна быть отцентрирована по горизонтали (дельта: ${data.filtersCenterDiff}px <= 10px)`);
                assert.ok(data.closeTopPadding >= 16 && data.closeTopPadding <= 24, `На ширине ${w}px кнопка [x] должна быть в правом верхнем углу (top: ${data.closeTopPadding}px)`);
                assert.ok(data.closeRightDist <= 25, `На ширине ${w}px кнопка [x] должна быть прижата к правому краю (right: ${data.closeRightDist}px)`);
            }

            if (w <= 1240) {
                assert.notStrictEqual(data.toggleDisplay, 'none', `На ширине ${w}px (<=1240) кнопка-лупа друга должна быть видима`);
            } else {
                assert.strictEqual(data.toggleDisplay, 'none', `На ширине ${w}px (>1240) кнопка-лупа должна быть скрыта`);
            }

            assert.ok(data.cardCheck, `На ширине ${w}px карточка спорта должна существовать`);
            assert.strictEqual(data.cardCheck.hasTwoRows, true, `На ширине ${w}px карточка должна иметь две строки`);
            assert.strictEqual(data.cardCheck.slotsInBottomRow, true, `На ширине ${w}px свободные места должны быть на второй строке`);
            assert.strictEqual(data.cardCheck.countVisible, true, `На ширине ${w}px счетчик групп .sc-count должен быть виден`);
            assert.ok(data.cardCheck.countDistance <= 6, `На ширине ${w}px счетчик групп .sc-count должен стоять вплотную к названию спорта (зазор ${data.cardCheck.countDistance}px <= 6px)`);
            assert.ok(data.cardCheck.slotsTotalMarginLeft >= 2, `На ширине ${w}px между доступными и общими местами должен быть отступ (margin-left: ${data.cardCheck.slotsTotalMarginLeft}px >= 2px)`);
        }

        // 4. Проверка открытия и закрытия поповера друга на 1000px и скроллбара списка друзей
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
        const popoverRes = await cdp.evaluateExpression(`
            const toggleBtn = document.getElementById('pe-friendToggleBtn');
            const container = document.getElementById('pe-friendContainer');
            const popover = document.getElementById('pe-friendPopover');
            const dropdown = document.getElementById('pe-friendDropdown');

            const displayBefore = getComputedStyle(popover).display;
            toggleBtn.click();
            const displayAfter = getComputedStyle(popover).display;
            const isOpenClass = container.classList.contains('is-popover-open');
            const itemsCount = dropdown ? dropdown.querySelectorAll('.pe-friend-item').length : 0;
            const dropdownList = dropdown ? dropdown.querySelector('.pe-friend-dropdown-list') : null;
            const track = dropdown ? dropdown.querySelector('.mse-scroll-track') : null;
            const thumb = track ? track.querySelector('.mse-scroll-thumb') : null;
            const hasListScrollbar = dropdownList ? (dropdownList.scrollHeight > dropdownList.clientHeight) : false;
            const thumbWidth = thumb ? thumb.offsetWidth : (dropdownList ? dropdownList.offsetWidth - dropdownList.clientWidth : 0);

            // Нажатие Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            const displayAfterEsc = getComputedStyle(popover).display;
            const isOpenAfterEsc = container.classList.contains('is-popover-open');

            return {
                displayBefore,
                displayAfter,
                isOpenClass,
                itemsCount,
                hasListScrollbar,
                hasTrack: Boolean(track),
                thumbWidth,
                displayAfterEsc,
                isOpenAfterEsc
            };
        `);

        assert.strictEqual(popoverRes.displayBefore, 'none', 'Поповер должен быть скрыт до клика');
        assert.strictEqual(popoverRes.displayAfter, 'flex', 'Поповер должен стать видимым после клика');
        assert.strictEqual(popoverRes.isOpenClass, true, 'Контейнер должен получить класс is-popover-open');
        assert.strictEqual(popoverRes.itemsCount, 6, 'В выпадающем списке должны отрендериться 6 друзей из localStorage');
        assert.strictEqual(popoverRes.hasListScrollbar, true, 'Список друзей должен иметь активный скроллбар при переполнении');
        assert.strictEqual(popoverRes.hasTrack, true, 'Дорожка .mse-scroll-track списка друзей должна быть смонтирована');
        assert.strictEqual(popoverRes.thumbWidth, 6, 'Ширина ползунка .mse-scroll-thumb списка друзей должна составлять ровно 6px');
        assert.strictEqual(popoverRes.displayAfterEsc, 'none', 'Поповер должен закрыться при нажатии Escape');
        assert.strictEqual(popoverRes.isOpenAfterEsc, false, 'Класс is-popover-open должен сняться при закрытии');

        await cdp.send('Emulation.clearDeviceMetricsOverride');
    });
});
