(() => {
    const META_VERSION = 'modeus-enhancer-version';
    const CURRENT_VERSION = document.querySelector(`meta[name="${META_VERSION}"]`)?.content || '0.0.0';
    const STORAGE_KEY_DEBUG = 'mse_debug'; // Флаг режима отладки (1 / true)

    // Стартовая визитка расширения (выводится всегда при запуске)
    console.log(
        `%c Modeus Enhancer %c v${CURRENT_VERSION} `,
        'background: #2196F3; color: #fff; padding: 3px 5px; border-radius: 3px 0 0 3px; font-weight: bold;',
        'background: #333; color: #fff; padding: 3px 5px; border-radius: 0 3px 3px 0;'
    );
    console.log('%cby @JasonVurhyz', 'font-style: italic; color: #555; margin-bottom: 5px;');
    console.log('%cMade with ❤️ for UTMN students', 'font-style: italic; color: #555; margin-bottom: 5px;');
    console.log('%cБаги и отзывы: @Theguestroom_bot', 'color: #2196F3; margin-bottom: 5px;');
    console.log('Расширение для улучшения интерфейса Modeus. Добавляет отзывы о преподавателях, список друзей, поиск общих пар и улучшает отображение названий корпусов.');
    console.log('----------------------------------------');

    // Динамическая проверка флага отладки (runtime без перезагрузки)
    const isDebug = () => {
        try {
            return localStorage.getItem(STORAGE_KEY_DEBUG) === 'true' ||
                   localStorage.getItem(STORAGE_KEY_DEBUG) === '1' ||
                   window.__MSE_DEBUG__ === true;
        } catch {
            return window.__MSE_DEBUG__ === true;
        }
    };

    // Обход фильтра Verbose в DevTools: отладочные логи выводятся через console.log с цветовой контекстуализацией
    const logger = {
        isDebug,
        debug(...args) {
            if (isDebug()) {
                console.log('%c[MSE]', 'color: #2196F3; font-weight: bold;', ...args);
            }
        },
        info(...args) {
            if (isDebug()) {
                console.log('%c[MSE]', 'color: #2196F3; font-weight: bold;', ...args);
            }
        },
        session(...args) {
            if (isDebug()) {
                console.log('%c[MSE Session]', 'color: #0284c7; font-weight: bold;', ...args);
            }
        },
        network(...args) {
            if (isDebug()) {
                console.log('%c[MSE Network]', 'color: #8b5cf6; font-weight: bold;', ...args);
            }
        },
        calendar(...args) {
            if (isDebug()) {
                console.log('%c[MSE Calendar]', 'color: #10b981; font-weight: bold;', ...args);
            }
        },
        db(...args) {
            if (isDebug()) {
                console.log('%c[MSE DB]', 'color: #f59e0b; font-weight: bold;', ...args);
            }
        },
        warn(...args) {
            console.warn('[MSE]', ...args);
        },
        error(...args) {
            console.error('[MSE]', ...args);
        }
    };

    const getSessionStatus = () => {
        const accessToken = sessionStorage.getItem('access_token');
        const expiresAt = Number(sessionStorage.getItem('expires_at') || 0);

        if (!accessToken) {
            return { hasToken: false, secondsLeft: 0, statusText: 'Токен отсутствует в sessionStorage' };
        }
        if (!expiresAt) {
            return { hasToken: true, secondsLeft: 0, statusText: 'Токен активен (expires_at не задан)' };
        }

        const secondsLeft = Math.round((expiresAt - Date.now()) / 1000);
        if (secondsLeft <= 0) {
            return { hasToken: true, secondsLeft, statusText: `Токен истек (${Math.abs(secondsLeft)} сек. назад)` };
        }

        const minLeft = Math.floor(secondsLeft / 60);
        const secMod = secondsLeft % 60;
        return {
            hasToken: true,
            secondsLeft,
            statusText: `Активен (~${minLeft} мин ${secMod} сек)`
        };
    };

    const printDebugStatus = () => {
        const session = getSessionStatus();
        console.log(
            `%c[MSE Status] Версия: v${CURRENT_VERSION} | Статус токена: ${session.statusText} | Остаток жизни: ${session.secondsLeft} сек.`,
            'color: #0284c7; font-weight: bold;'
        );
    };

    window.MSE_logger = logger;
    window.MSE_status = printDebugStatus;
    window.MSE_enableDebug = () => {
        try {
            localStorage.setItem(STORAGE_KEY_DEBUG, '1');
        } catch {}
        window.__MSE_DEBUG__ = true;
        console.log('[MSE] Режим отладки ВКЛЮЧЕН (мгновенно, F5 не требуется)');
        printDebugStatus();
    };
    window.MSE_disableDebug = () => {
        try {
            localStorage.removeItem(STORAGE_KEY_DEBUG);
        } catch {}
        window.__MSE_DEBUG__ = false;
        console.log('[MSE] Режим отладки ВЫКЛЮЧЕН');
    };

    if (window.studentEnhancer) {
        logger.warn('Скрипт уже запущен.');
        return;
    }

    // DOM-метатеги (мост данных Base64 из content.js, ADR-002)
    const META_BUILDINGS = 'modeus-buildings-map';
    const META_REVIEWS = 'modeus-teacher-reviews';

    // Внешние сервисы и репозиторий
    const GITHUB_USER = 'student1245';
    const GITHUB_REPO = 'Modeus-Student-Enhancer';
    const FEEDBACK_BOT_URL = 'https://t.me/Theguestroom_bot';

    // Ключи локальных хранилищ (localStorage / sessionStorage)
    const STORAGE_KEY_FRIENDS = 'mse_friends_list';
    const FRIENDS_STORAGE_KEY = STORAGE_KEY_FRIENDS; // обратная совместимость
    const STORAGE_KEY_AUTH_BACKUP = 'mse_auth_backup';
    const STORAGE_KEY_MY_SPECIALTY = 'mse_my_specialty';
    const STORAGE_KEY_MY_PROFILE = 'mse_my_profile';
    const STORAGE_KEY_MY_PERSON_ID = 'mse_my_person_id';
    const STORAGE_KEY_LAST_UPDATE_CHECK = 'mse_last_update_check';
    const STORAGE_KEY_LATEST_RELEASE = 'mse_latest_release';
    const STORAGE_KEY_DISMISSED_UPDATE_PREFIX = 'mse_dismissed_v';

    // Авторизация OAuth 2.0 и Session Keeper (ADR-001)
    const OAUTH_CLIENT_ID = 'sKir7YQnOUu4G0eCfn3tTxnBfzca';
    const OAUTH_REDIRECT_URI = 'https://utmn.modeus.org/';
    const OAUTH_AUTH_URL = 'https://auth.modeus.org/oauth2/authorize';
    const AUTH_STORAGE_KEYS = [
        'access_token',
        'access_token_stored_at',
        'expires_at',
        'id_token',
        'id_token_claims_obj',
        'id_token_expires_at',
        'id_token_stored_at',
        'nonce',
        'session_state'
    ];

    // Эндпоинты Modeus API и GitHub API
    const API_BASE = 'https://utmn.modeus.org';
    const API_CALENDAR_SEARCH = `${API_BASE}/schedule-calendar-v2/api/calendar/events/search?tz=Asia/Tyumen`;
    const API_CALENDAR_EVENTS = `${API_BASE}/schedule-calendar-v2/api/calendar/events`;
    const API_COURSES = `${API_BASE}/courses/api/course-units`;
    const API_BOOKING = `${API_BASE}/course-unit-booking/api/v1/students`;
    const API_GITHUB_LATEST = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`;

    // Интервалы времени и лимиты
    const SESSION_CHECK_INTERVAL_MS = 20000;              // Проверка жизни токена каждые 20 сек
    const SESSION_REFRESH_THRESHOLD_SEC = 60;             // Порог запуска тихой сессии (за 60 сек)
    const SESSION_BURN_THRESHOLD_SEC = 90;                // Порог дожигания сервером старого токена
    const SESSION_SMART_WAIT_MARGIN_SEC = 3;              // Запас ожидания истечения токена в секундах
    const SESSION_POLL_INTERVAL_MS = 50;                  // Опрос хэша фрейма каждые 50 мс
    const SESSION_IFRAME_TIMEOUT_MS = 12000;              // Таймаут ожидания фрейма обновления
    const DOM_CHECK_READY_INTERVAL_MS = 200;              // Опрос готовности календаря при старте
    const MUTATION_DEBOUNCE_DELAY_MS = 250;               // Дебаунс реакции на мутации DOM
    const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;  // Кэш проверки релизов GitHub (2 часа)
    const SEARCH_SUGGESTIONS_LIMIT = 7;                   // Максимум подсказок студентов в поиске
    const PE_SCHEDULE_DAYS = 21;                          // Горизонт дней для расписания физкультуры

    // Классы и идентификаторы элементов DOM
    const CLASS_MSE_ACTIVE = 'mse-active';
    const ID_SILENT_REFRESHER = 'mse-silent-refresher';
    const ID_SEARCH_CONTAINER = 'enhancer-search-container';
    const ID_STOP_BUTTON = 'enhancer-stop-button';
    const ID_TEACHER_TOOLTIP = 'teacher-tooltip';
    const ID_TOAST_CONTAINER = 'mse-toast-container';
    const ID_FRIENDS_MENU = 'mse-friends-menu';
    const ID_RETURN_TO_ME_MENU = 'mse-return-to-me-menu';
    const ID_UPDATE_BADGE = 'mse-update-badge';
    const ID_UPDATE_POPUP = 'mse-update-popup';
    const ID_FEEDBACK_FOOTER = 'mse-feedback-footer';
    const ID_OPEN_PE_BTN = 'mse-open-pe-btn';

    // Справочники корпусов и отзывы
    let buildingMap = {};
    let teacherReviews = new Map();

    // Профиль пользователя
    let mySpecialty = localStorage.getItem(STORAGE_KEY_MY_SPECIALTY) || null;
    let myProfile = localStorage.getItem(STORAGE_KEY_MY_PROFILE) || null;
    let myPersonId = localStorage.getItem(STORAGE_KEY_MY_PERSON_ID) || null;

    // Календарь и поиск общих пар
    let currentWeekStart = null;
    let currentEventId = null;
    let eventCache = new Map();
    let uniqueStudents = new Map();
    let lastSearchResults = new Map();
    let selectedStudents = new Set();

    // Успеваемость и технологические карты
    let mseCourseRealizationsMap = new Map();
    let mseLessonMaxGrades = new Map();
    let mseLessonNameToMaxGrade = new Map();
    let mseLoadedCourseUnits = new Set();

    // Служебные переменные и таймеры
    let debounceTimer = null;
    let checkReadyTimer = null;
    let sessionHealthInterval = null;
    let lastPeData = null;

    // Сохранение оригинальных нативных методов сети и истории браузера
    const nativeFetch = window.fetch;
    const nativeXhrOpen = XMLHttpRequest.prototype.open;
    const nativeXhrSend = XMLHttpRequest.prototype.send;
    const nativePushState = history.pushState;

    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const normalizeName = name => name ? name.trim().replace(/\s+/g, ' ').replace(/ё/g, 'е').replace(/Ё/g, 'Е').normalize() : '';

    // Безопасное экранирование HTML для защиты от XSS
    const escapeHtml = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // Неблокирующие всплывающие уведомления (Toast) вместо alert()
    const showToast = (message, type = 'info', durationMs = 4000) => {
        let container = qs(`#${ID_TOAST_CONTAINER}`);
        if (!container) {
            container = document.createElement('div');
            container.id = ID_TOAST_CONTAINER;
            document.body.appendChild(container);
        }

        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const toast = document.createElement('div');
        toast.className = `mse-toast mse-toast-${type}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'mse-toast-icon';
        iconSpan.textContent = icons[type] || 'ℹ️';

        const textSpan = document.createElement('span');
        textSpan.className = 'mse-toast-message';
        textSpan.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mse-toast-close';
        closeBtn.innerHTML = '&times;';
        closeBtn.setAttribute('aria-label', 'Закрыть');

        toast.appendChild(iconSpan);
        toast.appendChild(textSpan);
        toast.appendChild(closeBtn);
        container.appendChild(toast);

        const dismiss = () => {
            if (toast.classList.contains('mse-toast-hiding')) return;
            toast.classList.add('mse-toast-hiding');
            setTimeout(() => {
                toast.remove();
                if (container && container.childNodes.length === 0) {
                    container.remove();
                }
            }, 300);
        };

        closeBtn.addEventListener('click', dismiss);
        if (durationMs > 0) {
            setTimeout(dismiss, durationMs);
        }
    };

    window.showToast = showToast;
    window.MSE_showToast = showToast;

    // Активация стилей расширения (styles.css)
    document.body.classList.add(CLASS_MSE_ACTIVE);

    const processPersonSearchResponse = (responseText) => {
        try {
            const data = JSON.parse(responseText);
            const persons = data?._embedded?.persons || [];
            logger.network(`Поиск персон (/persons/search): найдено ${persons.length} чел.`);
            lastSearchResults.clear();
            persons.forEach(person => {
                if (person.id && person.fullName) {
                    const normalized = normalizeName(person.fullName);
                    lastSearchResults.set(normalized, {
                        id: person.id,
                        fullName: person.fullName
                    });
                }
            });
            setTimeout(updateAddFriendButtons, 300);
        } catch (e) {
            logger.warn('Не удалось обработать ответ от /persons/search', e);
        }
    };

    function interceptNetworkRequests() {
        window.fetch = async (...args) => {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            const response = await nativeFetch(...args);

            if (url.includes('/api/people/persons/search')) {
                const responseText = await response.clone().text();
                processPersonSearchResponse(responseText);
            }

            if (url.includes('/module-elements/')) {
                try {
                    const data = await response.clone().json();
                    if (data.cycles && data.cycles.length > 0 && data.cycles[0].teams) {
                        lastPeData = data;
                        const teamsCount = data.cycles[0].teams.length;
                        logger.network(`Физкультура (/module-elements/): перехвачены секции (цикл: "${data.cycles[0].name || '1'}", команд: ${teamsCount})`);
                    }
                } catch (e) { logger.warn('Ошибка парсинга физры:', e); }
            }
            return response;
        };

        XMLHttpRequest.prototype.open = function (method, url) {
            this._mseUrl = typeof url === 'string' ? url : (url ? url.toString() : '');
            return nativeXhrOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('load', function () {
                const url = this._mseUrl || this.responseURL || '';

                if (url.includes('/api/people/persons/search')) {
                    const resp = this.response;
                    const text = typeof resp === 'string' ? resp : JSON.stringify(resp);
                    processPersonSearchResponse(text);
                }

                // ПАССИВНО читаем /primary (без подмены самого ответа):
                if (url.includes('/academic-period-results-table/primary')) {
                    try {
                        let data = this.response;
                        if (typeof data === 'string') data = JSON.parse(data);
                        processPrimaryGradesData(data);
                    } catch (e) {
                        logger.warn('Ошибка чтения primary:', e);
                    }
                }
            });
            return nativeXhrSend.apply(this, arguments);
        };
    }
    interceptNetworkRequests();

    let isSilentRefreshing = false;
    let smartWaitTimer = null;

    function saveAuthTokensBackup() {
        const token = sessionStorage.getItem('access_token');
        if (!token) return;

        const backupData = {};
        AUTH_STORAGE_KEYS.forEach(key => {
            const val = sessionStorage.getItem(key);
            if (val !== null) backupData[key] = val;
        });

        try {
            localStorage.setItem(STORAGE_KEY_AUTH_BACKUP, JSON.stringify(backupData));
        } catch (e) {
            logger.warn('Не удалось сохранить бэкап сессии', e);
        }
    }

    function triggerSilentRefresh() {
        if (isSilentRefreshing) {
            logger.session('Запрос на продление отклонен: фоновый iframe уже запущен');
            return;
        }
        isSilentRefreshing = true;

        logger.session('Сессия скоро истекает. Запуск скрытого iframe для фонового продления...');

        const redirectUri = encodeURIComponent(OAUTH_REDIRECT_URI);
        const nonce = Math.random().toString(36).substring(2);
        const state = Math.random().toString(36).substring(2);

        const authUrl = `${OAUTH_AUTH_URL}?response_type=id_token%20token&client_id=${OAUTH_CLIENT_ID}&state=${state}&redirect_uri=${redirectUri}&scope=openid&nonce=${nonce}`;

        const ifr = document.createElement('iframe');
        ifr.id = ID_SILENT_REFRESHER;
        ifr.style.cssText = 'position: absolute !important; width: 0 !important; height: 0 !important; border: none !important; display: none !important;';
        ifr.src = authUrl;
        document.body.appendChild(ifr);

        let resolved = false;

        const checkTokens = () => {
            if (resolved) return;
            try {
                const hash = ifr.contentWindow?.location?.hash;
                if (hash && hash.includes('access_token')) {
                    resolved = true;
                    clearInterval(pollTimer);

                    const params = new URLSearchParams(hash.replace(/^#/, ''));
                    const accessToken = params.get('access_token');
                    const idToken = params.get('id_token');
                    const expiresIn = Number(params.get('expires_in') || 3600);
                    const sessionState = params.get('session_state');

                    if (accessToken) {
                        const oldToken = sessionStorage.getItem('access_token');
                        const now = Date.now();
                        const expiresAt = now + expiresIn * 1000;

                        sessionStorage.setItem('access_token', accessToken);
                        sessionStorage.setItem('access_token_stored_at', String(now));
                        sessionStorage.setItem('expires_at', String(expiresAt));
                        if (idToken) sessionStorage.setItem('id_token', idToken);
                        if (sessionState) sessionStorage.setItem('session_state', sessionState);

                        saveAuthTokensBackup();

                        // 1. Если сервер все еще дожигает старый токен:
                        if (accessToken === oldToken && expiresIn <= SESSION_BURN_THRESHOLD_SEC) {
                            logger.session(`Ответ получен: сервер еще дожигает старый токен (осталось ${expiresIn} сек.). Ждем точного завершения...`);
                            clearTimeout(smartWaitTimer);
                            smartWaitTimer = setTimeout(() => {
                                smartWaitTimer = null;
                                triggerSilentRefresh();
                            }, (expiresIn + SESSION_SMART_WAIT_MARGIN_SEC) * 1000);
                        } else {
                            // 2. УСПЕХ: сбрасываем любые таймеры ожидания!
                            clearTimeout(smartWaitTimer);
                            smartWaitTimer = null;

                            const totalMin = Math.round(expiresIn / 60);
                            logger.session(`Ответ получен! Токен успешно продлен в фоне. Новый срок жизни: ${expiresIn} сек. (~${totalMin} мин.)`);
                        }
                    }

                    ifr.remove();
                    isSilentRefreshing = false;
                }
            } catch (e) {
                // Штатная ошибка безопасности (CORS) пока во фрейме идет переадресация через Keycloak
            }
        };

        const pollTimer = setInterval(checkTokens, SESSION_POLL_INTERVAL_MS);
        ifr.onload = checkTokens;

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                clearInterval(pollTimer);
                ifr.remove();
                isSilentRefreshing = false;
                logger.warn('[MSE Session] Тайм-аут фонового обновления токена');
            }
        }, SESSION_IFRAME_TIMEOUT_MS);
    }

    // Мониторим здоровье токена каждые 20 секунд
    function monitorSessionHealth() {
        saveAuthTokensBackup();

        // ВАЖНО: Если мы уже завели точный таймер ожидания смерти токена — не лезем параллельно!
        if (smartWaitTimer) return;

        const expiresAt = Number(sessionStorage.getItem('expires_at') || 0);
        if (!expiresAt) {
            logger.session('Мониторинг сессии: expires_at не найден в sessionStorage (пропуск проверки)');
            return;
        }

        const secondsLeft = Math.round((expiresAt - Date.now()) / 1000);
        logger.session(`Проверка токена: осталось ${secondsLeft} сек. (порог автопродления: ${SESSION_REFRESH_THRESHOLD_SEC} сек.)`);

        // Обновляем за 60 секунд до конца
        if (secondsLeft <= SESSION_REFRESH_THRESHOLD_SEC) {
            triggerSilentRefresh();
        }
    }

    saveAuthTokensBackup();
    sessionHealthInterval = setInterval(monitorSessionHealth, SESSION_CHECK_INTERVAL_MS);

    // Удаляем бэкап при явном выходе (с возможностью снятия слушателя при очистке)
    const handleLogoutClick = (e) => {
        if (e.target.closest('a[href*="logout"], button[id*="logout"], .logout-btn')) {
            localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
        }
    };
    window.addEventListener('click', handleLogoutClick);

    // Безопасное декодирование Base64 в UTF-8 без устаревших escape/unescape
    const decodeBase64Utf8 = (base64) => {
        try {
            const binary = atob(base64);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return decodeURIComponent(escape(atob(base64)));
        }
    };

    (function loadDataFromMeta() {
        try {
            const buildingsMeta = qs(`meta[name="${META_BUILDINGS}"]`);
            if (buildingsMeta?.content) {
                const json = decodeBase64Utf8(buildingsMeta.content);
                buildingMap = JSON.parse(json) || {};
                logger.db(`База корпусов: успешно загружено ${Object.keys(buildingMap).length} корпусов`);
            } else {
                logger.db('База корпусов: метатег не найден (мост данных ожидает инициализации)');
            }
        } catch (e) { logger.warn('Ошибка загрузки buildings.json', e); }
        try {
            const reviewsMeta = qs(`meta[name="${META_REVIEWS}"]`);
            if (reviewsMeta?.content) {
                const json = decodeBase64Utf8(reviewsMeta.content);
                teacherReviews = new Map(Object.entries(JSON.parse(json) || {}));
                logger.db(`База отзывов: успешно загружено ${teacherReviews.size} отзывов о преподавателях`);
            } else {
                logger.db('База отзывов: метатег не найден (мост данных ожидает инициализации)');
            }
        } catch (e) { logger.warn('Ошибка загрузки teacher_reviews.json', e); }
    })();

    const getFriends = () => {
        try {
            return JSON.parse(localStorage.getItem(FRIENDS_STORAGE_KEY) || '[]');
        } catch (e) {
            logger.warn('Ошибка чтения списка друзей из localStorage', e);
            localStorage.removeItem(FRIENDS_STORAGE_KEY);
            return [];
        }
    };

    const saveFriends = (friends) => {
        localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify(friends));
        renderFriendsMenu();
    };

    const addFriend = (id, fullName) => {
        const friends = getFriends();
        if (!friends.some(f => f.id === id)) {
            friends.push({ id, fullName });
            saveFriends(friends);
        }
    };

    const removeFriend = (id) => {
        let friends = getFriends();
        const friendToRemove = friends.find(f => f.id === id);
        if (friendToRemove) {
            friends = friends.filter(f => f.id !== id);
            saveFriends(friends);
        }
    };

    const generateFriendUrl = (personId) => {
        const url = new URL(window.location.origin + '/schedule-calendar/my');
        const filter = {
            attendee: [{ key: personId }], courseUnit: [], cycleRealization: [], room: [],
            eventHoldingStatus: [], specialtyCode: [], learningStartYear: [],
            profileName: [], curriculum: [], typeId: []
        };
        url.searchParams.set('eventsFilter', JSON.stringify(filter));
        return url.href;
    };

    const renderFriendsMenu = () => {
        const mainMenuContainer = qs('modeus-main-menu p-panelmenu > .p-panelmenu.p-component');
        if (!mainMenuContainer) { return; }

        // Удаляем старые панели, если они были
        qs(`#${ID_FRIENDS_MENU}`)?.remove();
        qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();

        const friends = getFriends();
        const friendListHTML = friends.length > 0
            ? friends.map(friend => `
                <li class="p-menuitem ng-star-inserted" style="position: relative;">
                    <a role="treeitem" class="p-menuitem-link ng-star-inserted" href="${generateFriendUrl(friend.id)}" title="${escapeHtml(friend.fullName)}">
                        <span class="p-menuitem-text ng-star-inserted">${escapeHtml(friend.fullName)}</span>
                    </a>
                    <span class="mse-remove-friend-btn" data-id="${escapeHtml(friend.id)}" title="Удалить из друзей">×</span>
                </li>
            `).join('')
            : '<li class="p-menuitem ng-star-inserted"><a class="p-menuitem-link" style="opacity: 0.6; cursor: default;"><span class="p-menuitem-text">Нет друзей</span></a></li>';

        // 1. Панель «Друзья» (цельная, нормальный выпадающий список)
        const friendsMenuPanel = document.createElement('div');
        friendsMenuPanel.id = ID_FRIENDS_MENU;
        friendsMenuPanel.className = 'p-panelmenu-panel ng-star-inserted';
        friendsMenuPanel.innerHTML = `
            <div class="p-component p-panelmenu-header">
                <a class="p-panelmenu-header-link ng-star-inserted" tabindex="0">
                    <span class="p-menuitem-icon fa fa-users ng-star-inserted"></span>
                    <span class="p-menuitem-text ng-star-inserted">Друзья</span>
                    <span class="p-panelmenu-icon pi pi-chevron-right ng-star-inserted"></span>
                </a>
            </div>
            <div class="p-toggleable-content" style="display: none; overflow: hidden;">
                <div class="p-panelmenu-content">
                    <ul class="p-submenu-list p-panelmenu-root-submenu">${friendListHTML}</ul>
                </div>
            </div>`;
        mainMenuContainer.appendChild(friendsMenuPanel);

        // 2. Отдельная панель «Вернуться к себе» — идет строго ПОД блоком друзей
        if (myPersonId) {
            const returnMenuPanel = document.createElement('div');
            returnMenuPanel.id = ID_RETURN_TO_ME_MENU;
            returnMenuPanel.className = 'p-panelmenu-panel ng-star-inserted';
            returnMenuPanel.innerHTML = `
                <div class="p-component p-panelmenu-header">
                    <a class="p-panelmenu-header-link ng-star-inserted" href="${generateFriendUrl(myPersonId)}" title="Вернуться к своему расписанию">
                        <span class="p-menuitem-icon fa fa-user ng-star-inserted"></span>
                        <span class="p-menuitem-text ng-star-inserted">Вернуться к себе</span>
                    </a>
                </div>`;
            mainMenuContainer.appendChild(returnMenuPanel);
        }

        // Открытие / закрытие списка друзей
        const header = qs('.p-panelmenu-header a', friendsMenuPanel);
        const content = qs('.p-toggleable-content', friendsMenuPanel);
        if (header && content) {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                const isOpened = content.style.display !== 'none';
                content.style.display = isOpened ? 'none' : 'block';
                header.parentElement.classList.toggle('p-highlight', !isOpened);
                qs('.p-panelmenu-icon', header).classList.toggle('pi-chevron-down', !isOpened);
                qs('.p-panelmenu-icon', header).classList.toggle('pi-chevron-right', isOpened);
            });
        }

        // Крестики удаления
        qsa('.mse-remove-friend-btn', friendsMenuPanel).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFriend(btn.dataset.id);
            });
        });
    };

    const renderFooterFeedback = () => {
        const aside = qs('modeus-aside-panel');
        if (!aside || qs(`#${ID_FEEDBACK_FOOTER}`)) return;

        // Находим строку с почтой техподдержки Modeus
        const mailEl = qsa('modeus-aside-panel *').find(el =>
            el.children.length === 0 && el.textContent.includes('help@modeus.org')
        );

        if (mailEl) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.id = ID_FEEDBACK_FOOTER;
            feedbackDiv.style.cssText = 'margin-top: 10px; margin-bottom: 10px; font-size: 12px; line-height: 1.4;';
            feedbackDiv.innerHTML = `
                <div style="opacity: 0.85;">Баги и отзывы (Enhancer):</div>
                <a href="${FEEDBACK_BOT_URL}" target="_blank" style="color: #f0f4f7; text-decoration: underline;">
                    Telegram: @Theguestroom_bot
                </a>
            `;
            // Вставляем аккуратно под почтой Modeus
            mailEl.insertAdjacentElement('afterend', feedbackDiv);
        }
    };

    const updateAddFriendButtons = () => {
        const filterList = qs('.p-multiselect-items-wrapper ul.p-multiselect-items');
        if (!filterList) return;

        const friends = getFriends();
        const friendIds = new Set(friends.map(f => f.id));
        const items = qsa('li.p-multiselect-item', filterList);

        if (items.length === 0) return;

        for (const item of items) {
            const label = item.getAttribute('aria-label');
            if (!label) continue;

            const normalizedLabel = normalizeName(label);
            const person = lastSearchResults.get(normalizedLabel);

            if (!person || !person.id) { continue; }

            const personId = person.id;
            const isFriend = friendIds.has(personId);

            let btn = item.querySelector('.mse-add-friend-btn');

            if (!btn) {
                btn = document.createElement('span');
                btn.className = 'mse-add-friend-btn';

                const itemContent = item.querySelector('.item');
                if (itemContent) {
                    itemContent.style.display = 'flex';
                    itemContent.style.alignItems = 'center';
                    itemContent.style.width = '100%';
                    itemContent.appendChild(btn);

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();

                        const currentFriends = getFriends();
                        const isCurrentlyFriend = currentFriends.some(f => f.id === personId);

                        if (isCurrentlyFriend) {
                            removeFriend(personId);
                            e.target.innerHTML = '🤍';
                            e.target.title = 'Добавить в друзья';
                            e.target.style.color = '#000';
                        } else {
                            addFriend(personId, label);
                            e.target.innerHTML = '❤️';
                            e.target.title = 'Удалить из друзей';
                            e.target.style.color = '';
                        }
                    });
                }
            }

            if (btn) {
                btn.innerHTML = isFriend ? '❤️' : '🤍';
                btn.title = isFriend ? 'Удалить из друзей' : 'Добавить в друзья';
                btn.style.color = isFriend ? '' : '#000';
            }
        }
    };

    const enhanceBuildingNames = () => {
        if (Object.keys(buildingMap).length === 0) return;

        const buildingRegex = /Корпус-(\d{2})/i;

        qsa('.fc-time small.text-muted:not([data-enhanced-building])').forEach(el => {
            const match = el.textContent.match(buildingRegex);
            if (match) {
                const code = match[1];
                if (buildingMap[code]) {
                    el.textContent = el.textContent.replace(match[0], buildingMap[code]);
                    el.setAttribute('data-enhanced-building', 'true');
                }
            }
        });

        qsa('ngb-popover-window p:not([data-enhanced-building])').forEach(el => {
            if (el.textContent.includes('Корпус-')) {
                const match = el.textContent.match(buildingRegex);
                if (match) {
                    const code = match[1];
                    if (buildingMap[code]) {
                        el.textContent = el.textContent.replace(match[0], buildingMap[code]);
                        el.setAttribute('data-enhanced-building', 'true');
                    }
                }
            }
        });

        const sidebarLocationHeader = qs('.location-info__header-text:not([data-enhanced-building])');
        if (sidebarLocationHeader) {
            const match = sidebarLocationHeader.textContent.match(buildingRegex);
            if (match) {
                const code = match[1];
                if (buildingMap[code]) {
                    sidebarLocationHeader.textContent = sidebarLocationHeader.textContent.replace(match[0], buildingMap[code]);
                    sidebarLocationHeader.setAttribute('data-enhanced-building', 'true');

                    const buildingFieldLabel = Array.from(qsa('.param-name')).find(el => el.textContent.trim() === 'ЗДАНИЕ');
                    if (buildingFieldLabel) {
                        const buildingFieldValue = buildingFieldLabel.nextElementSibling;
                        if (buildingFieldValue) {
                            buildingFieldValue.textContent = buildingMap[code];
                        }
                    }
                }
            }
        }
    };

    const stopAndCleanUp = () => {
        // 1. Остановка наблюдателей и таймеров
        if (window.studentEnhancer?.observer) {
            window.studentEnhancer.observer.disconnect();
        }
        if (sessionHealthInterval) clearInterval(sessionHealthInterval);
        if (checkReadyTimer) clearInterval(checkReadyTimer);
        if (smartWaitTimer) clearTimeout(smartWaitTimer);
        if (debounceTimer) clearTimeout(debounceTimer);

        // 2. Полное восстановление нативных прототипов и методов браузера
        window.fetch = nativeFetch;
        XMLHttpRequest.prototype.open = nativeXhrOpen;
        XMLHttpRequest.prototype.send = nativeXhrSend;
        history.pushState = nativePushState;

        // 3. Снятие глобальных обработчиков событий
        window.removeEventListener('popstate', processUrlChange);
        window.removeEventListener('click', handleLogoutClick);

        // 4. Очистка внедрённых DOM-элементов и деактивация стилей
        document.body.classList.remove(CLASS_MSE_ACTIVE);
        qs(`#${ID_SEARCH_CONTAINER}`)?.remove();
        qs(`#${ID_TEACHER_TOOLTIP}`)?.remove();
        qs(`#${ID_STOP_BUTTON}`)?.remove();
        qs(`#${ID_TOAST_CONTAINER}`)?.remove();
        qs(`#${ID_FRIENDS_MENU}`)?.remove();
        qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();
        qs(`#${ID_SILENT_REFRESHER}`)?.remove();
        qs(`#${ID_UPDATE_BADGE}`)?.remove();
        qs(`#${ID_UPDATE_POPUP}`)?.remove();
        qs(`#${ID_FEEDBACK_FOOTER}`)?.remove();
        qs(`#${ID_OPEN_PE_BTN}`)?.remove();

        clearSearch();
        delete window.studentEnhancer;
        logger.debug('Скрипт полностью остановлен, нативные прототипы и таймеры очищены.');
    };

    const enhanceLists = () => {
        const friends = getFriends();
        const friendNames = new Set(friends.map(f => normalizeName(f.fullName)));
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));

        // Ищем все теги <p>, в которых потенциально могут быть имена студентов (работает везде)
        qsa('p:not([data-enhanced])').forEach(p => {
            const nameOnPage = normalizeName(p.textContent);
            const studentInfo = uniqueStudents.get(nameOnPage);

            if (studentInfo) {
                let customStyle = '';
                let badges = '';

                // Иконки СЛЕВА
                if (friendNames.has(nameOnPage)) {
                    badges += '<span title="Ваш друг" style="cursor:help; margin-right:4px;">❤️</span>';
                }
                // Проверяем совпадение направления
                const isSameSpecialty = mySpecialty && studentInfo.specialtyName && (studentInfo.specialtyName === mySpecialty);

                // Проверяем совпадение профиля (если у вас есть профиль — он должен совпадать; если профиля нет у обоих — достаточно направления)
                const isSameProfile = myProfile
                    ? (studentInfo.specialtyProfile && studentInfo.specialtyProfile === myProfile)
                    : true;

                if (isSameSpecialty && isSameProfile) {
                    const tooltipText = myProfile
                        ? `Обучается на вашем направлении и профиле (${myProfile})`
                        : 'Обучается на вашем направлении';
                    badges += `<span title="${escapeHtml(tooltipText)}" style="cursor:help; margin-right:4px;">🎓</span>`;
                }

                // Убрал inline-block, теперь фон будет облегать текст без разрыва
                if (normalizedSelected.has(nameOnPage)) {
                    customStyle = 'background: rgba(40, 167, 69, 0.3); border-radius: 3px; padding: 0 3px; font-weight: bold; color: #000;';
                }

                // Сборка: Иконки -> Имя -> Специальность с безопасным экранированием
                p.innerHTML = `${badges}<span style="${customStyle}">${escapeHtml(studentInfo.fullName)}</span><span class="student-details">${escapeHtml(studentInfo.details)}</span>`;
                p.setAttribute('data-enhanced', 'true');
            }
        });

        qsa('.teachers-list li > div:not(.title) div:not([data-enhanced-teacher])').forEach(div => {
            const teacherName = normalizeName(div.textContent);
            div.addEventListener('mouseenter', (e) => {
                let tooltip = qs(`#${ID_TEACHER_TOOLTIP}`);
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = ID_TEACHER_TOOLTIP;
                    document.body.appendChild(tooltip);
                }
                const review = teacherReviews.get(teacherName);
                if (review) {
                    const safeReview = escapeHtml(review.review).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
                    tooltip.innerHTML = `<div class="tooltip-header">${escapeHtml(review.emoji)} ${escapeHtml(review.type)}</div><div class="tooltip-body">${safeReview}</div>`;
                } else {
                    tooltip.innerHTML = `<div class="tooltip-header">🤔</div><div class="tooltip-body">Нет информации об этом преподавателе.</div>`;
                }
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = `${window.scrollX + rect.left}px`;
                tooltip.style.top = `${window.scrollY + rect.bottom + 5}px`;
                tooltip.style.display = 'block';
            });
            div.addEventListener('mouseleave', () => qs(`#${ID_TEACHER_TOOLTIP}`)?.remove());
            div.setAttribute('data-enhanced-teacher', 'true');
        });
    };

    const formatShortName = (fullName) => {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}. ${parts[2][0]}.`;
        if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
        return fullName;
    };

    const highlightEventsForStudents = () => {
        if (selectedStudents.size === 0) { clearHighlight(); return; }
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));

        qsa('.fc-time-grid-event').forEach(el => {
            const eventId = el.getAttribute('data-event-id');
            el.classList.remove('search-highlight', 'search-fade');

            el.querySelectorAll('.mse-event-match-tooltip').forEach(e => e.remove());
            el.removeAttribute('title');

            if (eventId && eventCache.has(eventId)) {
                const eventAttendees = eventCache.get(eventId).attendees;
                const matchedStudents = [...normalizedSelected].filter(student => eventAttendees.has(student));

                if (matchedStudents.length > 0) {
                    el.classList.add('search-highlight');

                    // 1. Короткие имена на самой карточке (влезет намного больше!)
                    const shortNames = matchedStudents.map(formatShortName).join(', ');

                    // 2. Полные имена во всплывающей системной подсказке при наведении
                    const fullNamesList = matchedStudents.join('\n• ');
                    el.setAttribute('title', `Совместная пара с:\n• ${fullNamesList}`);

                    const matchText = document.createElement('div');
                    matchText.className = 'mse-event-match-tooltip';
                    matchText.title = `Совместная пара с:\n• ${fullNamesList}`;
                    matchText.innerHTML = `<strong>С вами:</strong> ${escapeHtml(shortNames)}`;

                    const container = el.querySelector('.fc-content') || el;
                    container.appendChild(matchText);
                } else {
                    el.classList.add('search-fade');
                }
            } else {
                el.classList.add('search-fade');
            }
        });
    };

    const clearHighlight = () => {
        qsa('.search-highlight, .search-fade').forEach(el => el.classList.remove('search-highlight', 'search-fade'));
        qsa('.mse-event-match-tooltip').forEach(e => e.remove());
    };

    const clearSearch = () => {
        const searchInput = qs('#student-search-input');
        if (searchInput) searchInput.value = '';
        const suggestions = qs('#search-suggestions');
        if (suggestions) suggestions.style.display = 'none';
        selectedStudents.clear();
        updateSelectedStudentsDisplay();
        clearHighlight();
    };

    const updateSelectedStudentsDisplay = () => {
        const wrapper = qs('#selected-students-dropdown-wrapper');
        const container = qs('#selected-students-container');
        const countSpan = qs('#selected-count');
        if (!container || !wrapper) return;

        if (selectedStudents.size > 0) {
            wrapper.style.display = 'block';
            countSpan.textContent = selectedStudents.size;
            container.innerHTML = [...selectedStudents].map(name =>
                `<div class="selected-student-tag">${escapeHtml(name)}<button class="remove-student-btn" data-name="${escapeHtml(name)}">×</button></div>`
            ).join('');

            qsa('.remove-student-btn', container).forEach(btn => {
                btn.addEventListener('click', (e) => {
                    selectedStudents.delete(e.target.getAttribute('data-name'));
                    updateSelectedStudentsDisplay();
                    highlightEventsForStudents();
                });
            });
        } else {
            wrapper.style.display = 'none';
            container.style.display = 'none';
            container.innerHTML = '';
        }
    };

    const updateSuggestions = (e) => {
        const query = normalizeName(e.target.value.toLowerCase());
        const suggestionsBox = qs('#search-suggestions');
        suggestionsBox.innerHTML = '';
        if (query.length < 2) { suggestionsBox.style.display = 'none'; return; }

        // Фильтруем с учетом замены е/ё
        const matches = [...uniqueStudents.values()].filter(s =>
            s.fullName && normalizeName(s.fullName).toLowerCase().includes(query)
        );

        // Сортируем: сначала те, у кого ФАМИЛИЯ начинается с запроса, а не отчество
        matches.sort((a, b) => {
            const aStarts = normalizeName(a.fullName).toLowerCase().startsWith(query);
            const bStarts = normalizeName(b.fullName).toLowerCase().startsWith(query);
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return 0;
        });

        if (matches.length > 0) {
            suggestionsBox.innerHTML = matches.slice(0, SEARCH_SUGGESTIONS_LIMIT).map(s =>
                `<div class="suggestion-item" data-name="${escapeHtml(s.fullName)}">
                    <div class="suggestion-name">${escapeHtml(s.fullName)}</div>
                    <div class="suggestion-details">${escapeHtml(s.details)}</div>
                </div>`
            ).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    };

    const linkDomEventsToCache = () => {
        if (eventCache.size === 0) return 0;
        const assignedIds = new Set();
        let linkedCount = 0;
        qsa('.fc-time-grid-event').forEach(el => {
            const existingId = el.getAttribute('data-event-id');
            if (existingId && eventCache.has(existingId)) {
                assignedIds.add(existingId);
                linkedCount++;
                return;
            }
            const title = normalizeName(qs('.fc-title', el)?.textContent);
            const time = qs('.fc-time', el)?.getAttribute('data-full')?.split(' - ')[0]?.trim();
            if (!title || !time) return;

            for (const [id, data] of eventCache.entries()) {
                if (assignedIds.has(id)) continue;
                const cacheName = normalizeName(data.name);
                const cacheFull = normalizeName(data.fullDisplayName);
                if ((cacheFull === title || cacheName === title || cacheFull.includes(title)) && data.startsAtLocal.includes(time)) {
                    el.setAttribute('data-event-id', id);
                    assignedIds.add(id);
                    linkedCount++;
                    break;
                }
            }
        });
        return linkedCount;
    };

    const getActiveCalendarPersonId = (myJwtPersonId) => {
        try {
            const urlObj = new URL(window.location.href);
            const filterParam = urlObj.searchParams.get('eventsFilter');
            if (filterParam) {
                const filter = JSON.parse(filterParam);
                if (filter.attendee && filter.attendee.length > 0 && filter.attendee[0].key) {
                    return filter.attendee[0].key;
                }
            }
        } catch (e) {
            logger.warn('Не удалось распарсить eventsFilter из URL:', e);
        }
        return myJwtPersonId;
    };

    const loadAllData = async () => {
        const statusEl = qs('#search-status');
        const controlsEl = qs('#search-controls');
        try {
            if (controlsEl) controlsEl.style.display = 'none';
            if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Загрузка данных...'; statusEl.style.color = '#2196F3'; }

            const token = sessionStorage.getItem('id_token');
            if (!token) throw new Error("Токен не найден.");
            const parseJwt = (t) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            const myJwtPersonId = parseJwt(token).person_id || parseJwt(token).sub;

            myPersonId = myJwtPersonId;
            localStorage.setItem(STORAGE_KEY_MY_PERSON_ID, myPersonId);

            const activePersonId = getActiveCalendarPersonId(myJwtPersonId);

            const dateHeaders = qsa('.fc-day-header[data-date]');
            if (dateHeaders.length > 0) {
                currentWeekStart = dateHeaders[0].getAttribute('data-date');
            }

            if (dateHeaders.length < 1) {
                if (statusEl) statusEl.textContent = 'Календарь не загружен.';
                if (controlsEl) controlsEl.style.display = 'flex';
                return;
            }

            const timeMin = `${dateHeaders[0].getAttribute('data-date')}T00:00:00Z`;
            const timeMax = `${dateHeaders[dateHeaders.length - 1].getAttribute('data-date')}T23:59:59Z`;

            if (statusEl) statusEl.textContent = '1/2: Загрузка событий...';

            // Запрашиваем события именно того человека, чей календарь открыт на экране!
            const eventsResponse = await fetch(API_CALENDAR_SEARCH, {
                method: "POST",
                headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify({ size: 500, timeMin, timeMax, attendeePersonId: [activePersonId] })
            });

            if (!eventsResponse.ok) throw new Error(`Ошибка API (события): ${eventsResponse.status}`);
            const eventsData = await eventsResponse.json();
            const events = eventsData._embedded?.events || [];
            logger.calendar(`Этап 1: загружено ${events.length} событий на неделю (${timeMin.slice(0, 10)} — ${timeMax.slice(0, 10)})`);

            if (events.length === 0) {
                if (statusEl) statusEl.textContent = 'Событий на неделе нет.';
                if (controlsEl) controlsEl.style.display = 'flex';
                eventCache.clear();
                uniqueStudents.clear();
                return;
            }

            const courseUnits = eventsData._embedded?.['course-unit-realizations'] || [];
            const courseUnitMap = new Map(courseUnits.map(cu => [cu.id, cu.nameShort]));
            if (statusEl) statusEl.textContent = `2/2: Загрузка студентов (0/${events.length})`;
            let loadedCount = 0;

            eventCache.clear();
            uniqueStudents.clear();

            const attendeePromises = events.map(event =>
                fetch(`${API_CALENDAR_EVENTS}/${event.id}/attendees`, { headers: { "authorization": `Bearer ${token}` } })
                    .then(res => res.ok ? res.json() : [])
                    .then(attendees => {
                        loadedCount++;
                        if (statusEl) statusEl.textContent = `2/2: Загрузка студентов (${loadedCount}/${events.length})`;
                        return { event, attendees: attendees || [] };
                    })
            );

            const results = await Promise.all(attendeePromises);
            results.forEach(({ event, attendees }) => {
                const studentList = new Set();
                attendees.forEach(s => {
                    if (s.roleId === 'STUDENT') {
                        const normalized = normalizeName(s.fullName);

                        if (s.personId === myJwtPersonId) {
                            if (s.specialtyName) {
                                mySpecialty = s.specialtyName.trim();
                                localStorage.setItem(STORAGE_KEY_MY_SPECIALTY, mySpecialty);
                            }
                            if (s.specialtyProfile) {
                                myProfile = s.specialtyProfile.trim();
                                localStorage.setItem(STORAGE_KEY_MY_PROFILE, myProfile);
                            }
                        }

                        if (!uniqueStudents.has(normalized)) {
                            let details = s.specialtyName || 'Специальность не указана';
                            if (s.specialtyProfile && s.specialtyProfile !== s.specialtyName) details += ` : ${s.specialtyProfile}`;

                            uniqueStudents.set(normalized, {
                                id: s.personId,
                                fullName: s.fullName,
                                details,
                                specialtyName: s.specialtyName ? s.specialtyName.trim() : null,
                                specialtyProfile: s.specialtyProfile ? s.specialtyProfile.trim() : null
                            });
                        }
                        studentList.add(normalized);
                    }
                });
                const courseUnitId = event._links['course-unit-realization'].href.split('/').pop();
                const moduleShortName = courseUnitMap.get(courseUnitId) || '';
                eventCache.set(event.id, { name: event.name, fullDisplayName: `${moduleShortName} / ${event.name}`, startsAtLocal: event.startsAtLocal, attendees: studentList });
            });

            logger.calendar(`Этап 2: загружены участники для ${events.length} событий (уникальных студентов: ${uniqueStudents.size})`);

            const linkedCount = linkDomEventsToCache();
            logger.calendar(`Этап 3: завершена привязка к DOM (привязано ${linkedCount} карточек событий)`);

            if (statusEl) statusEl.style.display = 'none';
            if (controlsEl) controlsEl.style.display = 'flex';
            if (selectedStudents.size > 0) highlightEventsForStudents();
        } catch (err) {
            if (statusEl) { statusEl.textContent = `Ошибка: ${err.message}`; statusEl.style.color = 'red'; }
            if (controlsEl) controlsEl.style.display = 'flex';
            logger.error('Критическая ошибка загрузки данных расписания:', err);
        }
        checkExtensionUpdate();
    };

    // ПРОВЕРКА ОБНОВЛЕНИЯ КОДА РАСШИРЕНИЯ
    const checkExtensionUpdate = async () => {
        // Чтобы не спамить запросами к GitHub, проверяем не чаще одного раза в 2 часа
        const lastCheck = localStorage.getItem(STORAGE_KEY_LAST_UPDATE_CHECK);
        const cachedRelease = localStorage.getItem(STORAGE_KEY_LATEST_RELEASE);
        let releaseData = null;

        if (lastCheck && (Date.now() - Number(lastCheck) < UPDATE_CHECK_INTERVAL_MS) && cachedRelease) {
            try { releaseData = JSON.parse(cachedRelease); } catch (e) { logger.warn('Не удалось распарсить кэш релиза:', e); }
        } else {
            try {
                const res = await fetch(API_GITHUB_LATEST);
                if (res.ok) {
                    releaseData = await res.json();
                    localStorage.setItem(STORAGE_KEY_LATEST_RELEASE, JSON.stringify(releaseData));
                    localStorage.setItem(STORAGE_KEY_LAST_UPDATE_CHECK, String(Date.now()));
                }
            } catch (e) {
                logger.warn('Не удалось проверить обновление расширения на GitHub:', e);
            }
        }

        if (!releaseData) return;

        const isNewerVersion = (latest, current) => {
            const l = latest.split('.').map(Number);
            const c = current.split('.').map(Number);
            for (let i = 0; i < Math.max(l.length, c.length); i++) {
                const numL = l[i] || 0;
                const numC = c[i] || 0;
                if (numL > numC) return true;
                if (numL < numC) return false;
            }
            return false;
        };

        const latestVersion = releaseData.tag_name?.replace(/[^0-9.]/g, '');
        const safeReleaseUrl = /^https?:\/\//i.test(releaseData.html_url || '')
            ? escapeHtml(releaseData.html_url)
            : '#';

        // Проверяем: строго если на GitHub версия ВЫШЕ текущей
        if (latestVersion && isNewerVersion(latestVersion, CURRENT_VERSION)) {
            // 1. Маленький бейдж возле поиска
            const controls = qs('#search-controls');
            if (controls && !qs(`#${ID_UPDATE_BADGE}`)) {
                const badge = document.createElement('a');
                badge.id = ID_UPDATE_BADGE;
                badge.href = safeReleaseUrl;
                badge.target = '_blank';
                badge.title = 'Доступна новая версия расширения!';
                badge.innerHTML = `<span>⚡ v${escapeHtml(latestVersion)}</span>`;
                controls.insertBefore(badge, controls.firstChild);
            }

            // 2. Всплывающее предложение (если пользователь не нажимал "Позже" в этой сессии)
            if (localStorage.getItem(STORAGE_KEY_DISMISSED_UPDATE_PREFIX + latestVersion) !== '1' && !qs(`#${ID_UPDATE_POPUP}`)) {
                const popup = document.createElement('div');
                popup.id = ID_UPDATE_POPUP;
                popup.innerHTML = `
                    <div class="mse-update-title">🚀 Доступно обновление Enhancer!</div>
                    <div class="mse-update-text">Вышла версия <b>v${escapeHtml(latestVersion)}</b> с новыми функциями и исправлениями. Перейдите по ссылке, чтобы узнать, что появилось нового!</div>
                    <div class="mse-update-actions">
                        <a href="${safeReleaseUrl}" target="_blank" id="mse-update-btn">Посмотреть / Скачать</a>
                        <button id="mse-dismiss-btn">Позже</button>
                    </div>
                `;
                document.body.appendChild(popup);

                qs('#mse-dismiss-btn', popup).addEventListener('click', () => {
                    localStorage.setItem(STORAGE_KEY_DISMISSED_UPDATE_PREFIX + latestVersion, '1');
                    popup.remove();
                });
                qs('#mse-update-btn', popup).addEventListener('click', () => {
                    popup.remove();
                });
            }
        }
    };

    let lastCalendarParam = null;
    let lastFilterParam = null;
    const processUrlChange = () => {
        const currentUrl = window.location.href;
        const urlObj = new URL(currentUrl);

        // 1. Открытие карточки пары (боковая панель)
        const param = urlObj.searchParams.get('selectedEvent');
        try {
            if (param && param !== '""') newEventId = JSON.parse(param).eventId;
        } catch (e) {
            logger.warn('Не удалось распарсить selectedEvent из URL:', e);
        }
        if (newEventId !== currentEventId) {
            currentEventId = newEventId;
            setTimeout(() => { enhanceLists(); }, 250);
        } else if (!newEventId) {
            currentEventId = null;
        }

        // 2. Отслеживание смены пользователя или недели в URL
        if (currentUrl.includes('/schedule-calendar/')) {
            const calendarParam = urlObj.searchParams.get('calendar');
            const filterParam = urlObj.searchParams.get('eventsFilter');

            // Если сменился владелец календаря (перешли к другу или вернулись к себе)
            if (lastFilterParam !== filterParam) {
                lastFilterParam = filterParam;
                clearSearch();
                setTimeout(() => { loadAllData(); }, 300);
            } else if (lastCalendarParam && lastCalendarParam !== calendarParam) {
                // Если просто переключили неделю
                lastCalendarParam = calendarParam;
                setTimeout(() => {
                    const refreshBtn = qs('#refresh-data-btn');
                    if (refreshBtn) refreshBtn.click();
                }, 400);
            } else if (!lastCalendarParam) {
                lastCalendarParam = calendarParam;
            }
        }
    };

    const setupUI = () => {
        const toolbar = qs('.main-calendar-form');
        if (!toolbar || qs(`#${ID_SEARCH_CONTAINER}`)) return;

        const container = document.createElement('div');
        container.id = ID_SEARCH_CONTAINER;
        container.innerHTML = `
            <span id="search-status" style="display: block;"></span>
            <div id="search-controls" style="display: none;">
                <button id="add-friends-to-search-btn" title="Добавить друзей в поиск общих пар">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8Zm-7.978-1A.261.261 0 0 1 7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 0 1-.014.002H7.022ZM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6.936 9.28a5.88 5.88 0 0 0-1.23-.247A7.35 7.35 0 0 0 5 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816ZM4.92 10A5.493 5.493 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/></svg>
                </button>
                <button id="refresh-data-btn" title="Обновить данные для поиска общих пар">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.9A5.002 5.002 0 0 0 8 3zM3.1 9a5.002 5.002 0 0 0 8.757 2.182.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.1z"/></svg>
                </button>
                <div id="selected-students-dropdown-wrapper" style="display: none; position: relative;">
                    <button id="selected-students-toggle">Выбрано: <span id="selected-count">0</span> <small style="margin-left:3px;">▼</small></button>
                    <div id="selected-students-container"></div>
                </div>
                <input type="text" id="student-search-input" placeholder="Найти общие пары...">
                <button id="search-clear-btn">✖</button>
            </div>
            <div id="search-suggestions"></div>`;
        toolbar.appendChild(container);

        qs('#add-friends-to-search-btn').addEventListener('click', () => {
            const friends = getFriends();
            friends.forEach(f => selectedStudents.add(f.fullName));
            qs('#student-search-input').value = '';
            qs('#search-suggestions').style.display = 'none';
            updateSelectedStudentsDisplay();
            highlightEventsForStudents();
        });

        qs('#selected-students-toggle').addEventListener('click', () => {
            const cont = qs('#selected-students-container');
            cont.style.display = cont.style.display === 'flex' ? 'none' : 'flex';
        });

        qs('#refresh-data-btn').addEventListener('click', loadAllData);
        qs('#student-search-input').addEventListener('input', updateSuggestions);
        qs('#search-clear-btn').addEventListener('click', clearSearch);
        qs('#search-suggestions').addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                selectedStudents.add(item.getAttribute('data-name'));
                qs('#student-search-input').value = '';
                qs('#search-suggestions').style.display = 'none';
                updateSelectedStudentsDisplay();
                highlightEventsForStudents();
            }
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) qs('#search-suggestions').style.display = 'none';
            if (!qs('#selected-students-dropdown-wrapper')?.contains(e.target)) {
                const cont = qs('#selected-students-container');
                if (cont) cont.style.display = 'none';
            }
        });

        loadAllData();
    };

    // 1. Сбор структуры предметов и скачивание массивов макс. баллов
    function processPrimaryGradesData(data) {
        if (!data || !data.courseUnitRealizations) return;

        const count = data.courseUnitRealizations.length;
        logger.network(`Успеваемость (/primary): перехвачена таблица результатов, предметов: ${count}`);

        const token = sessionStorage.getItem('id_token');
        const uniqueCourseUnits = new Set();

        data.courseUnitRealizations.forEach(cur => {
            if (!cur.name || !cur.lessons) return;

            const sortedLessons = [...cur.lessons].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const normName = normalizeName(cur.name);
            mseCourseRealizationsMap.set(normName, sortedLessons);

            if (cur.courseUnitId) uniqueCourseUnits.add(cur.courseUnitId);
        });

        uniqueCourseUnits.forEach(cuId => {
            if (mseLoadedCourseUnits.has(cuId)) return;
            mseLoadedCourseUnits.add(cuId);

            fetch(`${API_COURSES}/${cuId}/lessons-technology`, {
                headers: { "authorization": `Bearer ${token}` }
            })
                .then(r => r.json())
                .then(tech => {
                    if (tech.lessonTechnologies) {
                        tech.lessonTechnologies.forEach(lt => {
                            if (lt.controlObjects && lt.controlObjects.length > 0) {
                                // Сохраняем список максимумов по порядку точек (например: [10, 2])
                                const sortedCO = [...lt.controlObjects].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
                                const maxList = sortedCO
                                    .map(co => co.maxValue)
                                    .filter(v => typeof v === 'number' && v > 0);

                                if (maxList.length > 0) {
                                    mseLessonMaxGrades.set(lt.lessonId, maxList);
                                    if (lt.lessonName) {
                                        mseLessonNameToMaxGrade.set(normalizeName(lt.lessonName), maxList);
                                    }
                                }
                            }
                        });
                    }
                    enhanceGradesTable();
                })
                .catch(e => logger.warn('Ошибка загрузки техкарты:', e));
        });
    }

    function injectMaxGradeBadge(td, maxGrades) {
        if (!td || td.querySelector('.mse-max-grade') || td.querySelector('.mse-max-done')) return;
        const maxList = Array.isArray(maxGrades) ? maxGrades : [maxGrades];
        if (maxList.length === 0) return;

        // Создаем бейдж (стили придут из CSS класса .mse-max-grade)
        const createBadge = (max) => {
            const badge = document.createElement('span');
            badge.className = 'mse-max-grade';
            badge.textContent = ` /${max}`;
            return badge;
        };

        // Если оценок 3 или больше — суммируем их в один итог
        if (maxList.length >= 3) {
            const totalMax = maxList.reduce((acc, m) => acc + (typeof m === 'number' ? m : 0), 0);
            const numEls = qsa('.lesson-realization:not(.present):not(.absent)', td);

            // Вариант 1: если цифры в отдельных span
            if (numEls.length >= 3) {
                const totalEarned = Math.round(numEls.reduce((acc, el) => acc + parseFloat(el.textContent), 0) * 100) / 100;
                numEls[0].innerHTML = `${totalEarned}`;
                if (totalEarned >= totalMax) {
                    numEls[0].classList.add('mse-max-done');
                } else {
                    numEls[0].appendChild(createBadge(totalMax));
                }
                for (let i = 1; i < numEls.length; i++) numEls[i].remove();
                return;
            }

            // Вариант 2: если цифры в текстовом узле
            const matches = [...td.textContent.matchAll(/\b(\d+(\.\d+)?)\b/g)];
            if (matches.length >= 3) {
                const totalEarned = Math.round(matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) * 100) / 100;
                for (const node of Array.from(td.childNodes)) {
                    if (node.nodeType === Node.TEXT_NODE && /\b\d/.test(node.textContent)) {
                        const tail = node.textContent.replace(/^.*?(\s*[-–—]?\s*\|\s*[ПНH]|$)/, '$1');
                        const frag = document.createDocumentFragment();
                        if (totalEarned >= totalMax) {
                            const maxSpan = document.createElement('span');
                            maxSpan.className = 'mse-max-done';
                            maxSpan.textContent = totalEarned;
                            frag.appendChild(maxSpan);
                        } else {
                            frag.appendChild(document.createTextNode(totalEarned));
                            frag.appendChild(createBadge(totalMax));
                        }
                        frag.appendChild(document.createTextNode(tail));
                        node.replaceWith(frag);
                        return;
                    }
                }
            }
        }

        let gradeIndex = 0;

        // А. Если оценка лежит в отдельном элементе
        const leafElements = qsa('.lesson-realization:not(.present):not(.absent)', td);
        for (const el of leafElements) {
            const txt = el.textContent.trim();
            if (/^\d+(\.\d+)?$/.test(txt)) {
                if (gradeIndex < maxList.length) {
                    const max = maxList[gradeIndex++];
                    const val = parseFloat(txt);

                    if (val >= max) {
                        el.classList.add('mse-max-done');
                    } else {
                        el.appendChild(createBadge(max));
                    }
                }
            }
        }

        if (gradeIndex > 0) return;

        // Б. Если внутри текстовый узел
        for (const node of Array.from(td.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const val = node.textContent;
                const regex = /\b(\d+(\.\d+)?)\b/g;
                let match;
                const matches = [];

                while ((match = regex.exec(val)) !== null) {
                    matches.push({ num: match[1], index: match.index });
                }

                if (matches.length > 0) {
                    const fragment = document.createDocumentFragment();
                    let lastIdx = 0;

                    for (const m of matches) {
                        if (gradeIndex >= maxList.length) break;
                        const max = maxList[gradeIndex++];
                        const numVal = parseFloat(m.num);

                        fragment.appendChild(document.createTextNode(val.substring(lastIdx, m.index)));

                        if (numVal >= max) {
                            const maxSpan = document.createElement('span');
                            maxSpan.className = 'mse-max-done';
                            maxSpan.textContent = m.num;
                            fragment.appendChild(maxSpan);
                        } else {
                            const numSpan = document.createElement('span');
                            numSpan.className = 'lesson-realization';
                            numSpan.textContent = m.num;
                            numSpan.appendChild(createBadge(max));
                            fragment.appendChild(numSpan);
                        }

                        lastIdx = m.index + m.num.length;
                    }

                    if (lastIdx < val.length) {
                        let tail = val.substring(lastIdx).replace(/^(\s*[-–—])/, '\u00A0$1');
                        fragment.appendChild(document.createTextNode(tail));
                    }

                    node.replaceWith(fragment);
                    return;
                }
            }
        }
    }

    // 3. Обновление таблицы оценок
    function enhanceGradesTable() {
        if (!window.location.href.includes('/my-results')) return;
        if (mseCourseRealizationsMap.size === 0 || mseLessonMaxGrades.size === 0) return;

        const meetingColumns = [];
        let currentTotalColIndex = -1;
        const ths = qsa('table thead th, .p-datatable-thead th, .ui-table-thead th');
        ths.forEach((th, idx) => {
            const match = th.textContent.match(/Встреча\s*(\d+)/i);
            if (match) {
                meetingColumns.push({ colIndex: idx, meetingNumber: parseInt(match[1], 10) });
            }
            // Запоминаем индекс колонки "Текущий итог"
            if (th.textContent.includes('Текущий итог')) {
                currentTotalColIndex = idx;
            }
        });

        if (meetingColumns.length === 0) return;

        const rows = qsa('table tbody tr, .p-datatable-tbody > tr, .ui-table-tbody > tr');
        rows.forEach(row => {
            const rowText = normalizeName(row.textContent);
            let matchedLessons = null;

            for (const [courseName, lessons] of mseCourseRealizationsMap.entries()) {
                if (rowText.includes(courseName)) {
                    matchedLessons = lessons;
                    break;
                }
            }

            if (!matchedLessons) return;

            const tds = qsa('td', row);
            // Скрытая кнопка на "Текущий итог" (двойной клик)
            if (currentTotalColIndex !== -1 && tds[currentTotalColIndex]) {
                const totalTd = tds[currentTotalColIndex];
                const currentTotalNum = parseFloat(totalTd.textContent.trim());

                if (!isNaN(currentTotalNum) && !totalTd.dataset.mseDblclickAttached) {
                    totalTd.dataset.mseDblclickAttached = '1';

                    totalTd.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        const isLost = totalTd.dataset.mseLostMode === '1';

                        if (!isLost) {
                            // Считаем ТОЧНО в момент клика, когда все базы уже в памяти!
                            let totalLost = 0;

                            meetingColumns.forEach(({ colIndex, meetingNumber }) => {
                                const mLesson = matchedLessons[meetingNumber - 1];
                                const mTd = tds[colIndex];
                                if (!mLesson || !mTd) return;

                                const mMaxList = mseLessonMaxGrades.get(mLesson.id);
                                if (!mMaxList) return;
                                const maxArr = Array.isArray(mMaxList) ? mMaxList : [mMaxList];

                                // Клонируем ячейку и удаляем наши бейджи, чтобы посчитать чистые оценки студента
                                const clone = mTd.cloneNode(true);
                                clone.querySelectorAll('.mse-max-grade').forEach(b => b.remove());

                                const gradePart = clone.textContent.split('|')[0] || '';
                                const matches = [...gradePart.matchAll(/\b(\d+(\.\d+)?)\b/g)];

                                // Если пара была с 3+ оценками (суммированная)
                                if (maxArr.length >= 3 && matches.length === 1) {
                                    const sumMax = maxArr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                                    const earned = parseFloat(matches[0][1]);
                                    if (!isNaN(earned) && sumMax > earned) totalLost += (sumMax - earned);
                                    return;
                                }

                                // Для обычных пар: считаем недополученное только по реально сданным точкам
                                matches.forEach((m, idx) => {
                                    const num = parseFloat(m[1]);
                                    if (!isNaN(num) && idx < maxArr.length) {
                                        const maxVal = maxArr[idx];
                                        if (maxVal > num) totalLost += (maxVal - num);
                                    }
                                });
                            });

                            const lostPoints = Math.round(totalLost * 100) / 100;
                            totalTd.dataset.mseOrigText = totalTd.textContent.trim();
                            totalTd.dataset.mseLostMode = '1';

                            if (lostPoints > 0) {
                                totalTd.innerHTML = `<span style="color: #ff3b30; font-weight: 500;">-${lostPoints}</span>`;
                            } else {
                                totalTd.innerHTML = `<span style="color: #34c759; font-weight: 500;">0.00</span>`;
                            }
                        } else {
                            totalTd.innerHTML = totalTd.dataset.mseOrigText;
                            totalTd.dataset.mseLostMode = '0';
                        }
                    });
                }
            }
            meetingColumns.forEach(({ colIndex, meetingNumber }) => {
                const td = tds[colIndex];
                if (!td) return;

                const lesson = matchedLessons[meetingNumber - 1];
                if (!lesson) return;

                const maxVal = mseLessonMaxGrades.get(lesson.id);
                if (maxVal) {
                    injectMaxGradeBadge(td, maxVal);
                }
            });
        });
    }

    // 4. Обновление всплывающего тултипа
    function enhancePopovers() {
        qsa('ngb-popover-window, .popover, [role="tooltip"]').forEach(popover => {
            if (popover.hasAttribute('data-mse-enhanced')) return;

            const allEls = qsa('*', popover);
            let matchedMaxList = null;

            for (const el of allEls) {
                if (el.children.length === 0) {
                    const name = normalizeName(el.textContent);
                    if (mseLessonNameToMaxGrade.has(name)) {
                        matchedMaxList = mseLessonNameToMaxGrade.get(name);
                        break;
                    }
                }
            }

            if (matchedMaxList && matchedMaxList.length > 0) {
                let maxIdx = 0;
                for (const el of allEls) {
                    if (el.children.length === 0) {
                        const txt = el.textContent.trim();

                        // 1. Выставленная оценка
                        if (/^\d+(\.\d+)?$/.test(txt)) {
                            if (maxIdx < matchedMaxList.length) {
                                el.textContent = `${txt} / ${matchedMaxList[maxIdx++]}`;
                            }
                        }
                        // 2. Еще несданная пара (тире) -> показываем "— / макс"
                        else if (/^[-–—]$/.test(txt)) {
                            if (maxIdx < matchedMaxList.length) {
                                el.textContent = `— / ${matchedMaxList[maxIdx++]}`;
                                el.style.opacity = '0.6';
                            }
                        }
                    }
                }
                popover.setAttribute('data-mse-enhanced', 'true');
            }
        });
    }

    const debouncedMutationHandler = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (!window.studentEnhancer) return;

            linkDomEventsToCache();
            enhanceLists();
            enhanceBuildingNames();
            renderFooterFeedback();
            enhanceGradesTable();
            enhancePopovers();

            if (qs('.main-calendar-form') && !qs(`#${ID_SEARCH_CONTAINER}`)) setupUI();

            // Если выбран хоть один человек — всегда держим подсветку включенной (даже если кликнули на пару)
            if (selectedStudents.size > 0) {
                highlightEventsForStudents();
            }

            if (window.location.href.includes('/learning-path-selection/menus/')) {
                const mainHeader = Array.from(document.querySelectorAll('h2, h1')).find(el => el.textContent.includes('Физическая культура'));

                if (mainHeader && !document.getElementById(ID_OPEN_PE_BTN)) {
                    const peBtn = document.createElement('button');
                    peBtn.id = ID_OPEN_PE_BTN;
                    peBtn.innerHTML = '⚡ Умный подбор секций';
                    peBtn.style.cssText = 'margin-left: 15px; background: #2563eb; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); transition: background 0.15s; white-space: nowrap;';

                    peBtn.onmouseover = () => peBtn.style.background = '#1d4ed8';
                    peBtn.onmouseout = () => peBtn.style.background = '#2563eb';

                    peBtn.addEventListener('click', async () => {
                        const urlMatch = window.location.href.match(/menus\/([^\/]+)\/student\/([^\/]+)/);
                        if (!urlMatch) {
                            showToast('Зайдите внутрь кампании физкультуры, чтобы кнопка заработала.', 'warning');
                            return;
                        }
                        const campaignId = urlMatch[1];
                        const bookingStudentId = urlMatch[2]; // ID для API записи

                        peBtn.innerHTML = '⏳ Загрузка баз...';
                        peBtn.disabled = true;

                        try {
                            const token = sessionStorage.getItem('id_token');

                            console.log(
                                '%c[MSE PE]', 'color: #0284c7; font-weight: bold;',
                                'Загрузка меню кампании физкультуры...',
                                { campaignId, bookingStudentId }
                            );

                            // 1. Получаем меню кампании (узнаем ID модулей 1 и 2 семестра)
                            const menuRes = await fetch(`${API_BOOKING}/${bookingStudentId}/campaigns/${campaignId}/student-campaign-menu`, {
                                headers: { "authorization": `Bearer ${token}` }
                            });
                            if (!menuRes.ok) {
                                const raw = await menuRes.text();
                                console.error('[MSE PE] Ошибка загрузки меню кампании:', { status: menuRes.status, raw });
                                throw new Error(`Ошибка загрузки меню: HTTP ${menuRes.status}`);
                            }
                            const menuData = await menuRes.json();

                            if (!menuData.moduleElements || menuData.moduleElements.length === 0) {
                                throw new Error("Модули для выбора не найдены.");
                            }

                            // 2. Параллельно загружаем все команды для всех найденных модулей
                            const modulePromises = menuData.moduleElements.map(m =>
                                fetch(`${API_BOOKING}/${bookingStudentId}/campaigns/${campaignId}/student-campaign-menu/module-elements/${m.id}`, { headers: { "authorization": `Bearer ${token}` } })
                                    .then(async r => {
                                        if (!r.ok) {
                                            const raw = await r.text();
                                            console.error('[MSE PE] Ошибка загрузки команд модуля:', { moduleId: m.id, status: r.status, raw });
                                            throw new Error(`Ошибка модуля ${m.id}: HTTP ${r.status}`);
                                        }
                                        const data = await r.json();
                                        return {
                                            ...data,
                                            id: data.id || m.id,
                                            moduleElementId: data.moduleElementId || data.id || m.id,
                                            name: data.name || m.name
                                        };
                                    })
                            );
                            const allModulesData = await Promise.all(modulePromises);

                            console.log(
                                '%c[MSE PE]', 'color: #16a34a; font-weight: bold;',
                                `Успешно загружено модулей: ${allModulesData.length}`,
                                allModulesData.map(mod => ({
                                    moduleId: mod.moduleElementId,
                                    name: mod.name,
                                    selectedTeamIds: mod.selectedTeamIds || []
                                }))
                            );

                            // 3. Загружаем расписание (ВНИМАНИЕ: тут нужен personId из токена, а не bookingStudentId!)
                            const parseJwt = (t) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                            const personId = parseJwt(token).person_id || parseJwt(token).sub;

                            const now = new Date();
                            const future = new Date(now.getTime() + PE_SCHEDULE_DAYS * 24 * 60 * 60 * 1000);

                            const schedRes = await fetch(API_CALENDAR_SEARCH, {
                                method: "POST",
                                headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" },
                                body: JSON.stringify({ size: 500, timeMin: now.toISOString(), timeMax: future.toISOString(), attendeePersonId: [personId] })
                            });
                            const eventsData = await schedRes.json();
                            const events = eventsData._embedded?.events || [];

                            const blockedSlots = {};
                            const dayMap = { 1: 'ПН', 2: 'ВТ', 3: 'СР', 4: 'ЧТ', 5: 'ПТ', 6: 'СБ' };

                            events.forEach(ev => {
                                if (ev.name.toLowerCase().includes('физическая культура')) return;
                                const d = new Date(ev.startsAtLocal);
                                const day = dayMap[d.getDay()];
                                if (!day) return;

                                let time = ev.startsAtLocal.split('T')[1].substring(0, 5);
                                if (time.startsWith('0')) time = time.substring(1);

                                if (!blockedSlots[day]) blockedSlots[day] = {};
                                if (blockedSlots[day][time]) {
                                    if (!blockedSlots[day][time].includes(ev.name)) blockedSlots[day][time] += `<br>+ ${ev.name}`;
                                } else {
                                    blockedSlots[day][time] = ev.name;
                                }
                            });

                            // 4. Открываем наше окно с готовыми данными
                            if (window.MSE_PE) {
                                window.MSE_PE.openModal(allModulesData, blockedSlots, campaignId, bookingStudentId, teacherReviews);
                            } else {
                                showToast('Модуль pe-module.js не загружен.', 'error');
                            }
                        } catch (e) {
                            logger.error('Ошибка подготовки модального окна физкультуры:', e);
                            showToast('Ошибка загрузки: ' + e.message, 'error');
                        } finally {
                            peBtn.innerHTML = '⚡ Умный подбор секций';
                            peBtn.disabled = false;
                        }
                    });

                    mainHeader.style.display = 'inline-flex';
                    mainHeader.style.alignItems = 'center';
                    mainHeader.style.flexWrap = 'wrap';
                    mainHeader.appendChild(peBtn);
                }
            }

            if (window.location.href.includes('/schedule-calendar/')) {
                if (qs('modeus-main-menu') && !qs(`#${ID_FRIENDS_MENU}`)) renderFriendsMenu();
            } else {
                qs(`#${ID_FRIENDS_MENU}`)?.remove();
                qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();
            }

            const header = qs('.event-card-container__header');
            if (header && !qs(`#${ID_STOP_BUTTON}`)) {
                const stopButton = document.createElement('span');
                stopButton.id = ID_STOP_BUTTON;
                stopButton.innerHTML = `<i class="fa fa-ban" style="margin-right: 4px;"></i>Стоп-скрипт`;
                stopButton.addEventListener('click', stopAndCleanUp);
                header.insertBefore(stopButton, header.firstChild);
            }
        }, MUTATION_DEBOUNCE_DELAY_MS);
    };

    const observer = new MutationObserver(debouncedMutationHandler);
    observer.observe(document.body, { childList: true, subtree: true });

    history.pushState = function (...args) {
        nativePushState.apply(history, args);
        setTimeout(processUrlChange, 100);
    };
    window.addEventListener('popstate', processUrlChange);

    window.studentEnhancer = {
        observer,
        nativePushState,
        nativeFetch,
        nativeXhrOpen,
        nativeXhrSend,
        stop: stopAndCleanUp
    };

    checkReadyTimer = setInterval(() => {
        if (qs('.main-calendar-form') && qs('modeus-main-menu')) {
            clearInterval(checkReadyTimer);
            checkReadyTimer = null;
            setupUI();
            processUrlChange();
            if (window.location.href.includes('/schedule-calendar/')) {
                renderFriendsMenu();
            }
        }
    }, DOM_CHECK_READY_INTERVAL_MS);

    logger.debug('Скрипт запущен!');
})();