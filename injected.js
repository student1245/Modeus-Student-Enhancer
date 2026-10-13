(() => {
    const META_VERSION = 'modeus-enhancer-version';
    const CURRENT_VERSION = document.querySelector(`meta[name="${META_VERSION}"]`)?.content || '0.0.0';
    const STORAGE_KEY_DEBUG = 'mse_debug'; // Флаг режима отладки (1 / true)
    const STORAGE_KEY_AUTH_BACKUP = 'mse_auth_backup';

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

    // Форматирование системного таймштампа выполнения с миллисекундами (ЧЧ:ММ:СС.ммм)
    const formatLogTimestamp = () => {
        const d = new Date();
        const pad = (n, len = 2) => String(n).padStart(len, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    };

    // Обход фильтра Verbose в DevTools: отладочные логи выводятся через console.log с цветовой контекстуализацией
    const logger = {
        isDebug,
        debug(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE]`, 'color: #2196F3; font-weight: bold;', ...args);
            }
        },
        info(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE]`, 'color: #2196F3; font-weight: bold;', ...args);
            }
        },
        session(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE Session]`, 'color: #0284c7; font-weight: bold;', ...args);
            }
        },
        network(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE Network]`, 'color: #8b5cf6; font-weight: bold;', ...args);
            }
        },
        calendar(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE Calendar]`, 'color: #10b981; font-weight: bold;', ...args);
            }
        },
        db(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE DB]`, 'color: #f59e0b; font-weight: bold;', ...args);
            }
        },
        update(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE Update]`, 'color: #ec4899; font-weight: bold;', ...args);
            }
        },
        survey(...args) {
            if (isDebug()) {
                console.log(`%c[${formatLogTimestamp()}] [MSE Survey]`, 'color: #06b6d4; font-weight: bold;', ...args);
            }
        },
        warn(...args) {
            console.warn(`[${formatLogTimestamp()}] [MSE]`, ...args);
        },
        error(...args) {
            console.error(`[${formatLogTimestamp()}] [MSE]`, ...args);
        }
    };

    // Безопасное декодирование Base64 в UTF-8 без устаревших escape/unescape
    const decodeBase64Utf8 = (base64) => {
        try {
            const binary = atob(base64);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch {
            try {
                const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
                const binary = atob(padded);
                const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            } catch {
                return '';
            }
        }
    };

    // Безопасный парсинг JWT-токена с поддержкой UTF-8 в payload
    const parseJwt = (token) => {
        try {
            if (!token || typeof token !== 'string') return {};
            const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
            if (!payload) return {};
            return JSON.parse(decodeBase64Utf8(payload));
        } catch (e) {
            logger.warn('Ошибка парсинга JWT:', e);
            return {};
        }
    };

    // Форматирование секунд в читаемый интервал (~X ч Y мин или ~X мин Y сек)
    const formatDuration = (totalSeconds) => {
        const absSec = Math.abs(Math.floor(totalSeconds || 0));
        if (absSec === 0) return '0 сек';
        const hours = Math.floor(absSec / 3600);
        const minutes = Math.floor((absSec % 3600) / 60);
        const seconds = absSec % 60;

        if (hours > 0) {
            return `~${hours} ч ${minutes} мин`;
        }
        if (minutes > 0) {
            return `~${minutes} мин ${seconds} сек`;
        }
        return `~${seconds} сек`;
    };

    // Компактное и единое представление статуса токена для логов: ~X мин Y сек (Z.ZZZ с)
    const formatTokenStatusSummary = (tokenStatus) => {
        if (!tokenStatus?.hasToken) {
            return 'отсутствует';
        }
        const duration = formatDuration(tokenStatus.secondsLeft);
        if (tokenStatus.secondsLeft <= 0) {
            const expiredSec = Math.abs(tokenStatus.secondsLeft || 0).toFixed(3);
            return `просрочен на ${duration} (${expiredSec} с)`;
        }
        return `${duration} (${tokenStatus.secondsLeftFormatted} с)`;
    };

    // Оценка статуса и времени жизни токена с точностью до миллисекунд
    const evaluateTokenLifetime = (token, expiresAt, tokenLabel = 'Токен') => {
        if (!token) {
            return {
                hasToken: false,
                secondsLeft: 0,
                secondsLeftFormatted: '0.000',
                millisecondsLeft: 0,
                statusText: `${tokenLabel} отсутствует в sessionStorage`,
                formattedTime: '0 сек'
            };
        }
        if (!expiresAt) {
            return {
                hasToken: true,
                secondsLeft: 0,
                secondsLeftFormatted: '0.000',
                millisecondsLeft: 0,
                statusText: `${tokenLabel} активен (expires_at не задан)`,
                formattedTime: 'не определено'
            };
        }

        const diffMs = expiresAt - Date.now();
        const secondsLeft = diffMs / 1000;
        const secondsLeftFormatted = secondsLeft.toFixed(3);

        if (diffMs <= 0) {
            const expiredSec = Math.abs(secondsLeft).toFixed(3);
            const expiredDuration = formatDuration(secondsLeft);
            const expiredText = `просрочен на ${expiredDuration} (${expiredSec} с)`;
            return {
                hasToken: true,
                secondsLeft,
                secondsLeftFormatted,
                millisecondsLeft: diffMs,
                statusText: `${tokenLabel} истек (${expiredText})`,
                formattedTime: expiredText
            };
        }

        const durationText = formatDuration(secondsLeft);
        return {
            hasToken: true,
            secondsLeft,
            secondsLeftFormatted,
            millisecondsLeft: diffMs,
            statusText: `Активен (${durationText}, ${secondsLeftFormatted} с)`,
            formattedTime: `${durationText} (${secondsLeftFormatted} с)`
        };
    };

    // Определение времени истечения суточного ID-токена (24 часа)
    // Строго математически опирается на фактические метаданные (клейм exp) самого токена
    const getMainTokenExpiresAt = (idToken) => {
        // 1. Приоритетный источник: клейм exp из метаданных самого id_token
        if (idToken) {
            const claims = parseJwt(idToken);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                const expiresAt = claims.exp * 1000;
                try {
                    sessionStorage.setItem('id_token_expires_at', String(expiresAt));
                } catch { }
                return expiresAt;
            }
        }

        // 2. Вторичный источник: кэшированные клеймы токена
        try {
            const claimsRaw = sessionStorage.getItem('id_token_claims_obj');
            if (claimsRaw) {
                const claims = JSON.parse(claimsRaw);
                if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                    const expiresAt = claims.exp * 1000;
                    sessionStorage.setItem('id_token_expires_at', String(expiresAt));
                    return expiresAt;
                }
            }
        } catch { }

        // 3. Fallback: сохраненное значение id_token_expires_at в sessionStorage
        const storedExpiresAt = Number(sessionStorage.getItem('id_token_expires_at') || 0);
        if (storedExpiresAt > 0 && !isNaN(storedExpiresAt)) return storedExpiresAt;

        // 4. Fallback: данные из локального бэкапа в localStorage
        try {
            const backupRaw = localStorage.getItem(STORAGE_KEY_AUTH_BACKUP);
            if (backupRaw) {
                const backup = JSON.parse(backupRaw);
                if (backup['id_token']) {
                    const backupClaims = parseJwt(backup['id_token']);
                    if (typeof backupClaims?.exp === 'number' && !isNaN(backupClaims.exp)) {
                        return backupClaims.exp * 1000;
                    }
                }
                const backupExpiresAt = Number(backup['id_token_expires_at'] || 0);
                if (backupExpiresAt > 0 && !isNaN(backupExpiresAt)) return backupExpiresAt;
            }
        } catch { }

        return 0;
    };

    // Статус краткосрочного access-токена (1 час, автопродление Session Keeper)
    const getAccessTokenStatus = () => {
        const accessToken = sessionStorage.getItem('access_token');
        let expiresAt = Number(sessionStorage.getItem('expires_at') || 0);
        if (accessToken) {
            const claims = parseJwt(accessToken);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                expiresAt = claims.exp * 1000;
            }
        }
        return evaluateTokenLifetime(accessToken, expiresAt, 'Токен');
    };

    // Статус основного суточного токена (24 часа, определяет необходимость логина)
    const getMainTokenStatus = () => {
        let idToken = sessionStorage.getItem('id_token');
        if (!idToken) {
            try {
                const backupRaw = localStorage.getItem(STORAGE_KEY_AUTH_BACKUP);
                if (backupRaw) {
                    const backup = JSON.parse(backupRaw);
                    if (backup['id_token']) idToken = backup['id_token'];
                }
            } catch { }
        }
        const expiresAt = getMainTokenExpiresAt(idToken);
        return evaluateTokenLifetime(idToken, expiresAt, 'Основной токен');
    };

    // Сводный статус сессионных токенов
    const getSessionStatus = () => {
        const access = getAccessTokenStatus();
        const main = getMainTokenStatus();
        return {
            access,
            main,
            hasToken: access.hasToken,
            secondsLeft: access.secondsLeft,
            statusText: access.statusText
        };
    };

    const printDebugStatus = () => {
        const session = getSessionStatus();
        const accessSummary = formatTokenStatusSummary(session.access);
        const mainSummary = formatTokenStatusSummary(session.main);
        const circuitBreakerText = typeof isCircuitBreakerOpen !== 'undefined' && isCircuitBreakerOpen
            ? ' | Circuit Breaker: АКТИВИРОВАН (сессия умерла, авторефреш остановлен)'
            : '';

        console.log(
            `%c[${formatLogTimestamp()}] [MSE Status] v${CURRENT_VERSION} | Токен: ${accessSummary} | Основной: ${mainSummary}${circuitBreakerText}`,
            'color: #0284c7; font-weight: bold;'
        );
        if (typeof printDatabaseStatus === 'function') printDatabaseStatus();
        if (typeof printUpdateStatus === 'function') printUpdateStatus();
    };

    window.MSE_logger = logger;
    window.MSE_status = printDebugStatus;
    window.MSE_enableDebug = () => {
        try {
            localStorage.setItem(STORAGE_KEY_DEBUG, '1');
        } catch {
            // Подавляем исключение: доступ к localStorage может быть заблокирован политиками безопасности или приватным режимом
        }
        window.__MSE_DEBUG__ = true;
        console.log('[MSE] Режим отладки ВКЛЮЧЕН (мгновенно, F5 не требуется)');
        printDebugStatus();
    };
    window.MSE_disableDebug = () => {
        try {
            localStorage.removeItem(STORAGE_KEY_DEBUG);
        } catch {
            // Подавляем исключение: доступ к localStorage может быть заблокирован политиками безопасности или приватным режимом
        }
        window.__MSE_DEBUG__ = false;
        console.log('[MSE] Режим отладки ВЫКЛЮЧЕН');
    };
    window.MSE_checkUpdates = (force = true) => {
        if (typeof checkExtensionUpdate === 'function') return checkExtensionUpdate({ force });
    };
    window.MSE_testUpdate = (mockVersion = '9.9.9') => {
        if (typeof simulateUpdate === 'function') return simulateUpdate(mockVersion);
    };
    window.MSE_simulateUpdate = (mockVersion = '9.9.9') => {
        if (typeof simulateUpdate === 'function') return simulateUpdate(mockVersion);
    };
    window.MSE_getEngagementStats = () => {
        if (typeof getEngagementStats === 'function') {
            const stats = getEngagementStats();
            if (typeof logger !== 'undefined' && logger.survey) {
                logger.survey('Статистика вовлеченности (Engagement Stats):', stats);
            }
            return stats;
        }
        return null;
    };
    window.MSE_checkSurvey = () => (typeof checkSurvey === 'function' ? checkSurvey() : false);
    window.MSE_simulateSurvey = (customConfig) => (typeof simulateSurvey === 'function' ? simulateSurvey(customConfig) : false);
    window.MSE_getSurveyConfig = () => (typeof getSurveyConfig === 'function' ? getSurveyConfig() : null);
    window.MSE_setSurveyConfig = (config) => {
        if (typeof setSurveyConfig === 'function') return setSurveyConfig(config);
        return false;
    };
    window.MSE_clearSurveyCache = () => {
        try {
            localStorage.removeItem('mse_survey_cache');
            localStorage.removeItem('mse_survey_snooze_until');
            localStorage.removeItem('mse_surveys_disabled_forever');
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('mse_survey_dismissed_')) {
                    localStorage.removeItem(key);
                }
            });
            logger.survey('Кэш опроса и флаги скрытия очищены.');
            return true;
        } catch {
            return false;
        }
    };

    if (window.studentEnhancer) {
        logger.warn('Скрипт уже запущен.');
        return;
    }

    // DOM-метатеги (мост данных Base64 из content.js, ADR-002)
    const META_BUILDINGS = 'modeus-buildings-map';
    const META_REVIEWS = 'modeus-teacher-reviews';
    const META_SURVEY = 'modeus-survey-config';

    // Внешние сервисы и репозиторий
    const GITHUB_USER = 'student1245';
    const GITHUB_REPO = 'Modeus-Student-Enhancer';
    const FEEDBACK_BOT_URL = 'https://t.me/Theguestroom_bot';
    const DEFAULT_SURVEY_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwUgqAKHztog8GakSgnepiYVcLGc5MkmX1OuHxlC4YtI79iMZiNvwRH9MKaRRvRNntBMg/exec';
    const SURVEY_SNOOZE_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня отсрочки («Позже»)

    // Ключи локальных хранилищ (localStorage / sessionStorage)
    const STORAGE_KEY_FRIENDS = 'mse_friends_list';
    const STORAGE_KEY_MY_SPECIALTY = 'mse_my_specialty';
    const STORAGE_KEY_MY_PROFILE = 'mse_my_profile';
    const STORAGE_KEY_MY_PERSON_ID = 'mse_my_person_id';
    const STORAGE_KEY_LAST_UPDATE_CHECK = 'mse_last_update_check';
    const STORAGE_KEY_LATEST_RELEASE = 'mse_latest_release';
    const STORAGE_KEY_DISMISSED_UPDATE_PREFIX = 'mse_dismissed_v';
    const STORAGE_KEY_INSTALL_DATE = 'mse_install_date';
    const STORAGE_KEY_TODAY_ACTIVE_SECONDS = 'mse_today_active_seconds';
    const STORAGE_KEY_TOTAL_ACTIVE_SECONDS = 'mse_total_active_seconds';
    const STORAGE_KEY_QUALIFIED_DAYS = 'mse_qualified_days';
    const STORAGE_KEY_LAST_ACTIVE_DATE = 'mse_last_active_date';
    const STORAGE_KEY_SURVEY_SNOOZE_UNTIL = 'mse_survey_snooze_until';
    const STORAGE_KEY_SURVEY_DISMISSED_PREFIX = 'mse_survey_dismissed_';
    const STORAGE_KEY_SURVEYS_DISABLED_FOREVER = 'mse_surveys_disabled_forever';

    const ENGAGEMENT_HEARTBEAT_INTERVAL_MS = 1000;
    const MAX_ALLOWED_HEARTBEAT_GAP_MS = 3000;
    const DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY = 120;

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
    const SESSION_IFRAME_TIMEOUT_MS = 20000;              // Таймаут ожидания фрейма обновления (20 сек для запаса сети и ADFS)
    const SESSION_MAX_REFRESH_ATTEMPTS = 5;               // Предохранитель (Circuit Breaker): макс. попыток тихого рефреша подряд
    const SESSION_STUCK_TIMEOUT_MS = 25000;               // Предохранитель от сна ПК: макс. время зависания одного рефреша (25 сек)
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
    const ID_SURVEY_POPUP = 'mse-survey-popup';
    const ID_FEEDBACK_FOOTER = 'mse-feedback-footer';
    const ID_OPEN_PE_BTN = 'mse-open-pe-btn';

    // Регулярные выражения
    const REGEX_BUILDING_CODE = /Корпус-(\d{2})/i;

    // Справочники корпусов, отзывы и конфигурация опроса
    let buildingMap = {};
    let teacherReviews = new Map();
    let surveyConfig = null;

    // Профиль пользователя
    let mySpecialty = localStorage.getItem(STORAGE_KEY_MY_SPECIALTY) || null;
    let myProfile = localStorage.getItem(STORAGE_KEY_MY_PROFILE) || null;
    let myPersonId = localStorage.getItem(STORAGE_KEY_MY_PERSON_ID) || null;

    // Календарь и поиск общих пар
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
    let engagementIntervalId = null;
    let handleEngagementVisibilityChange = null;

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
    let refreshStartedAt = 0;
    let refreshFailureCount = 0;
    let isCircuitBreakerOpen = false;
    let silentRefreshPollTimer = null;
    let silentRefreshTimeoutTimer = null;
    let smartWaitTimer = null;
    let lastHealthCheckTimestamp = Date.now();

    // Гарантированная очистка состояния и зависших элементов DOM
    function cleanupSilentRefresh() {
        if (silentRefreshPollTimer) {
            clearInterval(silentRefreshPollTimer);
            silentRefreshPollTimer = null;
        }
        if (silentRefreshTimeoutTimer) {
            clearTimeout(silentRefreshTimeoutTimer);
            silentRefreshTimeoutTimer = null;
        }
        isSilentRefreshing = false;
        refreshStartedAt = 0;

        try {
            const iframes = document.querySelectorAll(`#${ID_SILENT_REFRESHER}`);
            iframes.forEach(el => el.remove());
        } catch (e) {
            logger.warn('Ошибка при удалении iframe рефрешера:', e);
        }
    }

    // Срабатывание предохранителя: прекращение фоновых запросов и удаление невалидного бэкапа (Stealth Mode)
    function triggerCircuitBreaker(force = false) {
        // Логический предохранитель: сессия признается окончательно мертвой ТОЛЬКО если access_token реально просрочен (в минусе)
        // ИЛИ если основной суточный токен уже истек/принудительно передан флаг force
        const accessStatus = getAccessTokenStatus();
        const mainStatus = getMainTokenStatus();
        const isMainTokenDead = !mainStatus.hasToken || mainStatus.secondsLeft <= 0;

        if (!force && !isMainTokenDead && accessStatus.hasToken && accessStatus.secondsLeft > 0) {
            logger.session(
                `Circuit Breaker отложен: access_token все еще активен (осталось ${accessStatus.secondsLeftFormatted} с).`
            );
            return;
        }

        isCircuitBreakerOpen = true;
        cleanupSilentRefresh();

        // 1. Очищаем невалидный локальный бэкап сессии
        try {
            localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
            logger.session('Невалидный бэкап сессии удален из localStorage (Circuit Breaker)');
        } catch (e) {
            logger.warn('Ошибка удаления невалидного бэкапа сессии:', e);
        }

        // 2. Логируем срабатывание предохранителя
        logger.error(
            `[MSE Session] Предохранитель (Circuit Breaker) сработал: ${isMainTokenDead ? 'основной токен истек' : `исчерпан лимит попыток (${SESSION_MAX_REFRESH_ATTEMPTS}) и токен просрочен`
            }. Серверная сессия завершена. Фоновые запросы остановлены во избежание бесконечного спама.`
        );
    }

    // Сброс состояния предохранителя
    function resetCircuitBreaker() {
        if (isCircuitBreakerOpen || refreshFailureCount > 0) {
            logger.session('Состояние Circuit Breaker сброшено');
        }
        refreshFailureCount = 0;
        isCircuitBreakerOpen = false;
    }

    function saveAuthTokensBackup() {
        const token = sessionStorage.getItem('access_token');
        if (!token) return;

        // Не сохраняем бэкап, если предохранитель активен (сессия признана мертвой)
        if (isCircuitBreakerOpen) return;

        const backupData = {};
        AUTH_STORAGE_KEYS.forEach(key => {
            const val = sessionStorage.getItem(key);
            if (val !== null) backupData[key] = val;
        });

        // Синхронизируем id_token_expires_at строго с метаданными самого токена
        if (backupData['id_token']) {
            const claims = parseJwt(backupData['id_token']);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                const expMs = claims.exp * 1000;
                backupData['id_token_expires_at'] = String(expMs);

                // Если суточный токен уже истек, удаляем невалидный бэкап и не перезаписываем его
                if (expMs <= Date.now()) {
                    try {
                        localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
                    } catch { }
                    return;
                }
            }
        }

        try {
            localStorage.setItem(STORAGE_KEY_AUTH_BACKUP, JSON.stringify(backupData));
        } catch (e) {
            logger.warn('Не удалось сохранить бэкап сессии', e);
        }
    }

    function triggerSilentRefresh() {
        // 1. Предохранитель Circuit Breaker: если сессия окончательно мертва, прекращаем спамить сервер
        if (isCircuitBreakerOpen) {
            logger.session('Запрос на продление отклонен: сработал Circuit Breaker (серверная сессия завершена)');
            return;
        }

        // 2. Устойчивость к спящему режиму / зависанию: проверяем, не завис ли предыдущий рефреш
        if (isSilentRefreshing) {
            const elapsed = Date.now() - refreshStartedAt;
            if (elapsed > SESSION_STUCK_TIMEOUT_MS) {
                logger.warn(
                    `[MSE Session] Обнаружен зависший фоновый процесс (прошло ${(elapsed / 1000).toFixed(1)} сек., возможен сон ПК). Принудительный сброс.`
                );
                cleanupSilentRefresh();
                refreshFailureCount++;
                if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS) {
                    triggerCircuitBreaker();
                    return;
                }
            } else {
                logger.session('Запрос на продление отклонен: фоновый iframe уже запущен');
                return;
            }
        }

        // Гарантированно очищаем любые зависшие фреймы перед новым стартом
        cleanupSilentRefresh();

        isSilentRefreshing = true;
        refreshStartedAt = Date.now();

        logger.session('Сессия скоро истекает. Запуск скрытого iframe для фонового продления...');

        const redirectUri = encodeURIComponent(OAUTH_REDIRECT_URI);
        const nonce = Math.random().toString(36).substring(2);
        const state = Math.random().toString(36).substring(2);

        const authUrl = `${OAUTH_AUTH_URL}?response_type=id_token%20token&client_id=${OAUTH_CLIENT_ID}&state=${state}&redirect_uri=${redirectUri}&scope=openid&nonce=${nonce}`;

        let ifr;
        try {
            ifr = document.createElement('iframe');
            ifr.id = ID_SILENT_REFRESHER;
            ifr.style.cssText = 'position: absolute !important; width: 0 !important; height: 0 !important; border: none !important; display: none !important;';
            ifr.src = authUrl;
            document.body.appendChild(ifr);
        } catch (e) {
            logger.error('[MSE Session] Ошибка вставки iframe рефрешера:', e);
            cleanupSilentRefresh();
            refreshFailureCount++;
            if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS) {
                triggerCircuitBreaker();
            }
            return;
        }

        let resolved = false;

        const checkTokens = () => {
            if (resolved) return;
            try {
                const hash = ifr.contentWindow?.location?.hash;
                if (hash && hash.includes('access_token')) {
                    resolved = true;

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
                        if (idToken) {
                            sessionStorage.setItem('id_token', idToken);
                            const idClaims = parseJwt(idToken);
                            if (idClaims?.exp) {
                                sessionStorage.setItem('id_token_expires_at', String(idClaims.exp * 1000));
                                sessionStorage.setItem('id_token_claims_obj', JSON.stringify(idClaims));
                                sessionStorage.setItem('id_token_stored_at', String(now));
                            }
                        }
                        if (sessionState) sessionStorage.setItem('session_state', sessionState);

                        saveAuthTokensBackup();

                        // Успех: сбрасываем счетчик ошибок Circuit Breaker
                        refreshFailureCount = 0;
                        isCircuitBreakerOpen = false;

                        // 1. Если сервер все еще дожигает старый токен:
                        if (accessToken === oldToken && expiresIn <= SESSION_BURN_THRESHOLD_SEC) {
                            logger.session(`Ответ получен: сервер еще дожигает старый токен (осталось ${expiresIn} сек.). Ждем точного завершения...`);
                            clearTimeout(smartWaitTimer);
                            smartWaitTimer = setTimeout(() => {
                                smartWaitTimer = null;
                                triggerSilentRefresh();
                            }, (expiresIn + SESSION_SMART_WAIT_MARGIN_SEC) * 1000);
                        } else {
                            // 2. Полный успех: сбрасываем smartWaitTimer
                            clearTimeout(smartWaitTimer);
                            smartWaitTimer = null;

                            const totalMin = Math.round(expiresIn / 60);
                            const mainInfo = ` | Основной: ${formatTokenStatusSummary(getMainTokenStatus())}`;
                            logger.session(`Ответ получен! Токен успешно продлен в фоне. Новый срок жизни: ${expiresIn} с (~${totalMin} мин)${mainInfo}`);
                        }
                    }

                    cleanupSilentRefresh();
                }
            } catch (e) {
                // Штатная ошибка безопасности (CORS) пока во фрейме идет переадресация через Keycloak/ADFS
            }
        };

        silentRefreshPollTimer = setInterval(checkTokens, SESSION_POLL_INTERVAL_MS);
        ifr.onload = checkTokens;

        silentRefreshTimeoutTimer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                cleanupSilentRefresh();
                refreshFailureCount++;
                logger.warn(`[MSE Session] Тайм-аут фонового обновления токена (попытка ${refreshFailureCount}/${SESSION_MAX_REFRESH_ATTEMPTS})`);

                if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS) {
                    const accessStatus = getAccessTokenStatus();
                    // Предохранитель срабатывает ТОЛЬКО если токен уже реально просрочен (в минусе)
                    if (!accessStatus.hasToken || accessStatus.secondsLeft <= 0) {
                        triggerCircuitBreaker();
                    } else {
                        logger.session(
                            `Лимит попыток (${SESSION_MAX_REFRESH_ATTEMPTS}) исчерпан, но токен еще активен (${accessStatus.secondsLeftFormatted} с). Отсрочка срабатывания Circuit Breaker до фактического истечения.`
                        );
                    }
                }
            }
        }, SESSION_IFRAME_TIMEOUT_MS);
    }

    // Мониторим здоровье токена каждые 20 секунд
    function monitorSessionHealth() {
        const now = Date.now();
        const timeSinceLastCheck = now - lastHealthCheckTimestamp;
        lastHealthCheckTimestamp = now;

        // Обнаружение выхода из сна ПК или заморозки фоновой вкладки:
        // Если прошло существенно больше периода проверки (например, >45 сек при интервале 20 сек)
        if (timeSinceLastCheck > SESSION_CHECK_INTERVAL_MS * 2.25) {
            logger.session(
                `Обнаружен выход из спящего режима (простой ${(timeSinceLastCheck / 1000).toFixed(1)} сек.). Проверка и сброс состояния.`
            );
            if (isSilentRefreshing) {
                cleanupSilentRefresh();
            }
        }

        // Если предохранитель сработал — проверяем, не появился ли новый валидный токен (например, ручной логин в другой вкладке)
        if (isCircuitBreakerOpen) {
            const accessToken = sessionStorage.getItem('access_token');
            const expiresAt = Number(sessionStorage.getItem('expires_at') || 0);
            if (accessToken && expiresAt > now + SESSION_REFRESH_THRESHOLD_SEC * 1000) {
                logger.session('Обнаружен новый валидный токен. Восстановление работы после Circuit Breaker.');
                resetCircuitBreaker();
            } else {
                return;
            }
        }

        // Фатальный предохранитель: если основной суточный токен просрочен или отсутствует,
        // фоновое silent-продление невозможно (требуется интерактивный вход в систему).
        const mainStatus = getMainTokenStatus();
        if (!mainStatus.hasToken || mainStatus.secondsLeft <= 0) {
            logger.session(
                `Основной токен истек или отсутствует (${formatTokenStatusSummary(mainStatus)}). Аварийная остановка фонового обновления.`
            );
            triggerCircuitBreaker();
            return;
        }

        const accessStatus = getAccessTokenStatus();

        // Проверка логического предохранителя: если лимит попыток исчерпан И токен уже реально просрочен
        if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS && (!accessStatus.hasToken || accessStatus.secondsLeft <= 0)) {
            triggerCircuitBreaker();
            return;
        }

        saveAuthTokensBackup();

        // Если мы уже завели точный таймер ожидания дожигания токена — не лезем параллельно
        if (smartWaitTimer) return;

        if (!accessStatus.hasToken) {
            logger.session(`Мониторинг сессии: access_token не найден в sessionStorage | Основной: ${formatTokenStatusSummary(mainStatus)}`);
            return;
        }

        logger.session(
            `Токен: ${formatTokenStatusSummary(accessStatus)} [порог: ${SESSION_REFRESH_THRESHOLD_SEC} с] | Основной: ${formatTokenStatusSummary(mainStatus)}`
        );

        // Обновляем за 60 секунд до конца
        if (accessStatus.secondsLeft <= SESSION_REFRESH_THRESHOLD_SEC) {
            triggerSilentRefresh();
        }
    }

    saveAuthTokensBackup();
    sessionHealthInterval = setInterval(monitorSessionHealth, SESSION_CHECK_INTERVAL_MS);

    // Дополнительный предохранитель от сна ПК при возвращении пользователя на страницу
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            const now = Date.now();
            if (isSilentRefreshing && (now - refreshStartedAt > SESSION_STUCK_TIMEOUT_MS)) {
                logger.warn(
                    `[MSE Session] Вкладка активирована, фоновый рефреш завис (> ${(SESSION_STUCK_TIMEOUT_MS / 1000)} сек.). Сброс состояния.`
                );
                cleanupSilentRefresh();
                refreshFailureCount++;
                if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS) {
                    triggerCircuitBreaker();
                }
            }
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Удаляем бэкап при явном выходе (с возможностью снятия слушателя при очистке)
    const handleLogoutClick = (e) => {
        if (e.target.closest('a[href*="logout"], button[id*="logout"], .logout-btn')) {
            localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
        }
    };
    window.addEventListener('click', handleLogoutClick);

    const databaseState = {
        buildings: { loaded: false, count: 0, source: 'не загружено' },
        reviews: { loaded: false, count: 0, source: 'не загружено' },
        survey: { loaded: false, id: null, source: 'не загружено' }
    };

    /**
     * Безопасно загружает и декодирует JSON-данные из DOM-метатега (Base64 UTF-8).
     * @param {string} metaName - Имя DOM-метатега
     * @returns {{ data: any, source: string } | null}
     */
    const loadDataFromMeta = (metaName) => {
        try {
            const metaElement = qs(`meta[name="${metaName}"]`);
            if (!metaElement?.content) {
                return null;
            }
            const source = metaElement.getAttribute('data-source') || 'DOM-метатег';
            const decodedJson = decodeBase64Utf8(metaElement.content);
            const data = JSON.parse(decodedJson);
            return { data, source };
        } catch (error) {
            logger.warn(`Ошибка чтения метатега "${metaName}":`, error);
            return null;
        }
    };

    const loadBuildingsDatabase = () => {
        const result = loadDataFromMeta(META_BUILDINGS);
        if (result?.data) {
            buildingMap = result.data || {};
            const count = Object.keys(buildingMap).length;
            databaseState.buildings = { loaded: true, count, source: result.source };
            logger.db(`База корпусов: успешно инициализирована (${count} корпусов, источник: ${result.source})`);
        } else {
            logger.db('База корпусов: метатег не найден (мост данных ожидает инициализации)');
        }
    };

    const loadTeacherReviewsDatabase = () => {
        const result = loadDataFromMeta(META_REVIEWS);
        if (result?.data) {
            teacherReviews = new Map(Object.entries(result.data || {}));
            const count = teacherReviews.size;
            databaseState.reviews = { loaded: true, count, source: result.source };
            logger.db(`База отзывов: успешно инициализирована (${count} отзывов, источник: ${result.source})`);
        } else {
            logger.db('База отзывов: метатег не найден (мост данных ожидает инициализации)');
        }
    };

    const loadSurveyConfig = () => {
        const result = loadDataFromMeta(META_SURVEY);
        if (result?.data) {
            surveyConfig = result.data;
            const status = surveyConfig?.enabled ? 'включен' : 'отключен';
            databaseState.survey = { loaded: true, id: surveyConfig?.id || 'не указан', source: result.source };
            logger.db(`Конфиг опроса: успешно инициализирован (id: ${surveyConfig?.id || 'не указан'}, статус: ${status}, источник: ${result.source})`);
        } else {
            databaseState.survey = { loaded: false, id: null, source: 'не найден' };
            logger.db('Конфиг опроса: метатег не найден (мост данных ожидает инициализации)');
        }
    };

    const getSurveyConfig = () => surveyConfig;
    const setSurveyConfig = (config) => {
        if (!config || typeof config !== 'object') return false;
        surveyConfig = config;
        databaseState.survey = { loaded: true, id: surveyConfig?.id || 'пользовательский', source: 'ручная установка' };
        logger.db(`Конфиг опроса обновлен вручную (id: ${surveyConfig?.id || 'пользовательский'})`);
        return true;
    };

    const initDatabases = () => {
        loadBuildingsDatabase();
        loadTeacherReviewsDatabase();
        loadSurveyConfig();
    };

    const printDatabaseStatus = () => {
        if (!databaseState.buildings.loaded && !databaseState.reviews.loaded) {
            initDatabases();
        }
        const surveyStatus = databaseState.survey.loaded
            ? (surveyConfig?.enabled ? 'включен' : 'отключен')
            : 'не загружен';
        logger.db(
            `Корпуса: ${databaseState.buildings.count} шт. [${databaseState.buildings.source}] | ` +
            `Отзывы: ${databaseState.reviews.count} шт. [${databaseState.reviews.source}] | ` +
            `Опрос: ${surveyStatus} [${databaseState.survey.source}]`
        );
    };

    initDatabases();

    const getFriends = () => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_FRIENDS) || '[]');
        } catch (e) {
            logger.warn('Ошибка чтения списка друзей из localStorage', e);
            localStorage.removeItem(STORAGE_KEY_FRIENDS);
            return [];
        }
    };

    const saveFriends = (friends) => {
        localStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(friends));
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

        qsa('.fc-time small.text-muted:not([data-enhanced-building])').forEach(el => {
            const match = el.textContent.match(REGEX_BUILDING_CODE);
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
                const match = el.textContent.match(REGEX_BUILDING_CODE);
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
            const match = sidebarLocationHeader.textContent.match(REGEX_BUILDING_CODE);
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

    const handleOutsideSearchClick = (e) => {
        const container = qs(`#${ID_SEARCH_CONTAINER}`);
        if (container && !container.contains(e.target)) {
            const suggestions = qs('#search-suggestions', container);
            if (suggestions) suggestions.style.display = 'none';
        }
        const dropdown = qs('#selected-students-dropdown-wrapper');
        if (dropdown && !dropdown.contains(e.target)) {
            const cont = qs('#selected-students-container');
            if (cont) cont.style.display = 'none';
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
        if (engagementIntervalId) {
            clearInterval(engagementIntervalId);
            engagementIntervalId = null;
        }
        cleanupSilentRefresh();

        // 2. Полное восстановление нативных прототипов и методов браузера
        window.fetch = nativeFetch;
        XMLHttpRequest.prototype.open = nativeXhrOpen;
        XMLHttpRequest.prototype.send = nativeXhrSend;
        history.pushState = nativePushState;

        // 3. Снятие глобальных обработчиков событий
        window.removeEventListener('popstate', processUrlChange);
        window.removeEventListener('click', handleLogoutClick);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (handleEngagementVisibilityChange) {
            document.removeEventListener('visibilitychange', handleEngagementVisibilityChange);
        }
        document.removeEventListener('click', handleOutsideSearchClick);

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
        qs(`#${ID_SURVEY_POPUP}`)?.remove();
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
            const myJwtPersonId = parseJwt(token).person_id || parseJwt(token).sub;

            myPersonId = myJwtPersonId;
            localStorage.setItem(STORAGE_KEY_MY_PERSON_ID, myPersonId);

            const activePersonId = getActiveCalendarPersonId(myJwtPersonId);

            const dateHeaders = qsa('.fc-day-header[data-date]');
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
            const courseUnitMap = new Map(courseUnits.map(courseUnit => [courseUnit.id, courseUnit.nameShort]));
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
                attendees.forEach(attendee => {
                    if (attendee.roleId === 'STUDENT') {
                        const normalized = normalizeName(attendee.fullName);

                        if (attendee.personId === myJwtPersonId) {
                            if (attendee.specialtyName) {
                                mySpecialty = attendee.specialtyName.trim();
                                localStorage.setItem(STORAGE_KEY_MY_SPECIALTY, mySpecialty);
                            }
                            if (attendee.specialtyProfile) {
                                myProfile = attendee.specialtyProfile.trim();
                                localStorage.setItem(STORAGE_KEY_MY_PROFILE, myProfile);
                            }
                        }

                        if (!uniqueStudents.has(normalized)) {
                            let details = attendee.specialtyName || 'Специальность не указана';
                            if (attendee.specialtyProfile && attendee.specialtyProfile !== attendee.specialtyName) details += ` : ${attendee.specialtyProfile}`;

                            uniqueStudents.set(normalized, {
                                id: attendee.personId,
                                fullName: attendee.fullName,
                                details,
                                specialtyName: attendee.specialtyName ? attendee.specialtyName.trim() : null,
                                specialtyProfile: attendee.specialtyProfile ? attendee.specialtyProfile.trim() : null
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
            checkSurvey();
        } catch (err) {
            if (statusEl) { statusEl.textContent = `Ошибка: ${err.message}`; statusEl.style.color = 'red'; }
            if (controlsEl) controlsEl.style.display = 'flex';
            logger.error('Критическая ошибка загрузки данных расписания:', err);
        }
        checkExtensionUpdate();
    };

    // ----------------------------------------------------
    // УПРАВЛЕНИЕ И ПРОВЕРКА ОБНОВЛЕНИЙ РАСШИРЕНИЯ
    // ----------------------------------------------------

    const compareSemVer = (versionA, versionB) => {
        const partsA = String(versionA).split('.').map(Number);
        const partsB = String(versionB).split('.').map(Number);
        const maxLength = Math.max(partsA.length, partsB.length);
        for (let i = 0; i < maxLength; i++) {
            const numA = partsA[i] || 0;
            const numB = partsB[i] || 0;
            if (numA > numB) return 1;
            if (numA < numB) return -1;
        }
        return 0;
    };

    const isVersionGreater = (latest, current) => compareSemVer(latest, current) > 0;

    const getCachedReleaseInfo = () => {
        const lastCheck = localStorage.getItem(STORAGE_KEY_LAST_UPDATE_CHECK);
        const cachedRelease = localStorage.getItem(STORAGE_KEY_LATEST_RELEASE);
        if (!lastCheck || !cachedRelease) return { isFresh: false, release: null, ageMs: 0 };

        const ageMs = Date.now() - Number(lastCheck);
        const isFresh = ageMs < UPDATE_CHECK_INTERVAL_MS;
        try {
            return { isFresh, release: JSON.parse(cachedRelease), ageMs };
        } catch (e) {
            logger.warn('Не удалось распарсить кэш последнего релиза:', e);
            return { isFresh: false, release: null, ageMs };
        }
    };

    const fetchLatestReleaseFromGitHub = async () => {
        logger.update(`Запрос к GitHub Releases API (${API_GITHUB_LATEST})...`);
        try {
            const response = await fetch(API_GITHUB_LATEST);
            if (!response.ok) {
                logger.warn(`GitHub API вернул статус ${response.status} (${response.statusText})`);
                return null;
            }
            const release = await response.json();
            localStorage.setItem(STORAGE_KEY_LATEST_RELEASE, JSON.stringify(release));
            localStorage.setItem(STORAGE_KEY_LAST_UPDATE_CHECK, String(Date.now()));
            logger.update(`Получен ответ от GitHub: релиз ${release.tag_name} (${release.name || 'без названия'})`);
            return release;
        } catch (error) {
            logger.warn('Ошибка сети при запросе к GitHub Releases API:', error);
            return null;
        }
    };

    const resolveLatestRelease = async (forceNetwork = false) => {
        if (!forceNetwork) {
            const cached = getCachedReleaseInfo();
            if (cached.isFresh && cached.release) {
                const minutesAgo = Math.round(cached.ageMs / 60000);
                const minutesLeft = Math.round((UPDATE_CHECK_INTERVAL_MS - cached.ageMs) / 60000);
                const version = cached.release.tag_name || 'неизвестно';
                logger.update(
                    `Использован кэш недавней проверки (проверено ${minutesAgo} мин. назад, след. запрос через ${minutesLeft} мин.). Релиз на GitHub: ${version}`
                );
                return cached.release;
            }
        }
        return await fetchLatestReleaseFromGitHub();
    };

    const renderUpdateBadge = (latestVersion, releaseUrl) => {
        const controls = qs('#search-controls');
        if (!controls || qs(`#${ID_UPDATE_BADGE}`)) return;

        const badge = document.createElement('a');
        badge.id = ID_UPDATE_BADGE;
        badge.href = releaseUrl;
        badge.target = '_blank';
        badge.title = 'Доступна новая версия расширения!';
        badge.innerHTML = `<span>⚡ v${escapeHtml(latestVersion)}</span>`;
        controls.insertBefore(badge, controls.firstChild);
    };

    const renderUpdatePopup = (latestVersion, releaseUrl, { forceShow = false } = {}) => {
        const isDismissed = localStorage.getItem(STORAGE_KEY_DISMISSED_UPDATE_PREFIX + latestVersion) === '1';
        if ((isDismissed && !forceShow) || qs(`#${ID_UPDATE_POPUP}`)) return;

        const popup = document.createElement('div');
        popup.id = ID_UPDATE_POPUP;
        popup.innerHTML = `
            <div class="mse-update-title">🚀 Доступно обновление Enhancer!</div>
            <div class="mse-update-text">Вышла версия <b>v${escapeHtml(latestVersion)}</b> с новыми функциями и исправлениями. Перейдите по ссылке, чтобы узнать, что появилось нового!</div>
            <div class="mse-update-actions">
                <a href="${releaseUrl}" target="_blank" id="mse-update-btn">Посмотреть / Скачать</a>
                <button id="mse-dismiss-btn">Позже</button>
            </div>
        `;
        document.body.appendChild(popup);

        qs('#mse-dismiss-btn', popup)?.addEventListener('click', () => {
            localStorage.setItem(STORAGE_KEY_DISMISSED_UPDATE_PREFIX + latestVersion, '1');
            popup.remove();
        });
        qs('#mse-update-btn', popup)?.addEventListener('click', () => {
            popup.remove();
        });
    };

    const checkExtensionUpdate = async ({ force = false } = {}) => {
        logger.update(`Запуск проверки обновлений (текущая версия: v${CURRENT_VERSION}, force=${force})...`);
        const releaseData = await resolveLatestRelease(force);
        if (!releaseData) {
            logger.update('Проверка обновлений не выполнена (данные о релизе недоступны).');
            return;
        }

        const latestVersion = releaseData.tag_name?.replace(/[^0-9.]/g, '');
        if (!latestVersion) {
            logger.update(`Не удалось определить номер версии из тега: "${releaseData.tag_name}"`);
            return;
        }

        const safeReleaseUrl = /^https?:\/\//i.test(releaseData.html_url || '')
            ? escapeHtml(releaseData.html_url)
            : `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`;

        if (isVersionGreater(latestVersion, CURRENT_VERSION)) {
            logger.update(`🔥 Найдено обновление! Текущая: v${CURRENT_VERSION} -> Доступна: v${latestVersion}. Отображаем баннер.`);
            renderUpdateBadge(latestVersion, safeReleaseUrl);
            renderUpdatePopup(latestVersion, safeReleaseUrl);
        } else {
            logger.update(`✅ У вас установлена актуальная версия v${CURRENT_VERSION} (на GitHub: v${latestVersion}). Обновлений нет.`);
        }
    };

    const simulateUpdate = (mockVersion = '9.9.9') => {
        logger.update(`🧪 Симуляция обновления: запуск тестирования интерфейса для версии v${mockVersion} (текущая: v${CURRENT_VERSION})`);
        const fallbackUrl = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`;
        try {
            localStorage.removeItem(STORAGE_KEY_DISMISSED_UPDATE_PREFIX + mockVersion);
        } catch {
            // Подавляем исключение: доступ к localStorage может быть заблокирован политиками безопасности или приватным режимом
        }
        qs(`#${ID_UPDATE_BADGE}`)?.remove();
        qs(`#${ID_UPDATE_POPUP}`)?.remove();
        renderUpdateBadge(mockVersion, fallbackUrl);
        renderUpdatePopup(mockVersion, fallbackUrl, { forceShow: true });
        logger.update(`🧪 Элементы интерфейса обновления (бейдж и модальное окно) успешно отрисованы.`);
    };

    const printUpdateStatus = () => {
        const lastCheck = Number(localStorage.getItem(STORAGE_KEY_LAST_UPDATE_CHECK) || 0);
        const cachedRelease = localStorage.getItem(STORAGE_KEY_LATEST_RELEASE);
        let cachedVersion = 'нет данных';
        try {
            if (cachedRelease) cachedVersion = JSON.parse(cachedRelease).tag_name || 'нет данных';
        } catch {
            // Игнорируем ошибку парсинга поврежденного кэша релиза из localStorage
        }
        const minutesAgo = lastCheck ? Math.round((Date.now() - lastCheck) / 60000) : null;
        const timeText = minutesAgo !== null ? `${minutesAgo} мин. назад` : 'никогда';
        logger.update(`Текущая: v${CURRENT_VERSION} | На GitHub: ${cachedVersion} | Посл. проверка: ${timeText}`);
    };

    let lastHeartbeatTimestamp = Date.now();

    /**
     * Возвращает локальную дату в формате YYYY-MM-DD.
     * @param {Date} [date=new Date()]
     * @returns {string}
     */
    const getLocalDateString = (date = new Date()) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    /**
     * Инициализирует дату установки расширения (mse_install_date).
     * @returns {string}
     */
    const initInstallDate = () => {
        try {
            const existing = localStorage.getItem(STORAGE_KEY_INSTALL_DATE);
            if (!existing) {
                const todayStr = getLocalDateString();
                localStorage.setItem(STORAGE_KEY_INSTALL_DATE, todayStr);
                return todayStr;
            }
            return existing;
        } catch {
            return getLocalDateString();
        }
    };

    /**
     * Возвращает сохранённый массив квалифицированных дней из localStorage.
     * @returns {string[]}
     */
    const getStoredQualifiedDays = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_QUALIFIED_DAYS);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    /**
     * Сохраняет массив квалифицированных дней в localStorage.
     * @param {string[]} daysArray
     */
    const saveStoredQualifiedDays = (daysArray) => {
        try {
            const unique = Array.from(new Set(daysArray)).sort();
            localStorage.setItem(STORAGE_KEY_QUALIFIED_DAYS, JSON.stringify(unique));
        } catch (e) {
            logger.warn('Не удалось сохранить mse_qualified_days:', e);
        }
    };

    /**
     * Проверяет суточный ролловер активности при смене календарной даты.
     * Если за прошедший день студент преодолел порог minDailySecondsToQualify,
     * прошедшая дата фиксируется в mse_qualified_days.
     * @param {number} [minDailySecondsToQualify=DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY]
     */
    const checkDayRollover = (minDailySecondsToQualify = DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY) => {
        try {
            const todayStr = getLocalDateString();
            const lastActiveDate = localStorage.getItem(STORAGE_KEY_LAST_ACTIVE_DATE);

            if (!lastActiveDate) {
                localStorage.setItem(STORAGE_KEY_LAST_ACTIVE_DATE, todayStr);
                return;
            }

            if (lastActiveDate !== todayStr) {
                const pastDaySeconds = Number(localStorage.getItem(STORAGE_KEY_TODAY_ACTIVE_SECONDS) || 0);
                if (pastDaySeconds >= minDailySecondsToQualify) {
                    const days = getStoredQualifiedDays();
                    if (!days.includes(lastActiveDate)) {
                        days.push(lastActiveDate);
                        saveStoredQualifiedDays(days);
                        logger.survey(`День ${lastActiveDate} квалифицирован (${pastDaySeconds} с активности).`);
                    }
                }
                localStorage.setItem(STORAGE_KEY_TODAY_ACTIVE_SECONDS, '0');
                localStorage.setItem(STORAGE_KEY_LAST_ACTIVE_DATE, todayStr);
            }
        } catch (e) {
            logger.warn('Ошибка проверки ролловера активности:', e);
        }
    };

    /**
     * Выполняет учет чистого времени взаимодействия (heartbeat).
     * Секунды начисляются только при видимой вкладке и фильтрации сна ПК.
     */
    const recordActiveHeartbeat = () => {
        const now = Date.now();
        const deltaMs = now - lastHeartbeatTimestamp;
        lastHeartbeatTimestamp = now;

        // 1. Учет только при видимой вкладке
        if (document.visibilityState !== 'visible') {
            return;
        }

        // 2. Защита от сна ПК / зависания: если дельта больше 3 секунд, начисление игнорируется
        if (deltaMs <= 0 || deltaMs > MAX_ALLOWED_HEARTBEAT_GAP_MS) {
            return;
        }

        // 3. Суточный ролловер
        checkDayRollover();

        // 4. Начисление времени
        try {
            const secondsToAdd = Math.max(1, Math.round(deltaMs / 1000));
            const currentToday = Number(localStorage.getItem(STORAGE_KEY_TODAY_ACTIVE_SECONDS) || 0);
            const currentTotal = Number(localStorage.getItem(STORAGE_KEY_TOTAL_ACTIVE_SECONDS) || 0);

            localStorage.setItem(STORAGE_KEY_TODAY_ACTIVE_SECONDS, String(currentToday + secondsToAdd));
            localStorage.setItem(STORAGE_KEY_TOTAL_ACTIVE_SECONDS, String(currentTotal + secondsToAdd));
        } catch {
            // Игнорируем ошибки квоты localStorage
        }
    };

    /**
     * Обработчик возврата фокуса на вкладку (для трекера продуктовой активности).
     */
    handleEngagementVisibilityChange = () => {
        lastHeartbeatTimestamp = Date.now();
    };

    /**
     * Запускает таймер трекинга продуктовой активности.
     */
    const startEngagementTracker = () => {
        if (engagementIntervalId) return;
        initInstallDate();
        checkDayRollover();
        lastHeartbeatTimestamp = Date.now();
        document.addEventListener('visibilitychange', handleEngagementVisibilityChange);
        engagementIntervalId = setInterval(recordActiveHeartbeat, ENGAGEMENT_HEARTBEAT_INTERVAL_MS);
    };

    /**
     * Возвращает структурированную статистику продуктового удержания и активности.
     * @param {number} [minDailySecondsToQualify=DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY]
     * @returns {{
     *   installDate: string,
     *   daysSinceInstall: number,
     *   todayActiveSeconds: number,
     *   totalActiveSeconds: number,
     *   qualifiedDays: string[],
     *   qualifiedDaysCount: number,
     *   isTodayQualified: boolean
     * }}
     */
    const getEngagementStats = (minDailySecondsToQualify = DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY) => {
        try {
            checkDayRollover(minDailySecondsToQualify);
            const installDateStr = initInstallDate();
            const todayStr = getLocalDateString();
            const todaySeconds = Number(localStorage.getItem(STORAGE_KEY_TODAY_ACTIVE_SECONDS) || 0);
            const totalSeconds = Number(localStorage.getItem(STORAGE_KEY_TOTAL_ACTIVE_SECONDS) || 0);
            const storedQualifiedDays = getStoredQualifiedDays();

            const isTodayQualified = todaySeconds >= minDailySecondsToQualify;
            const allQualifiedDaysSet = new Set(storedQualifiedDays);
            if (isTodayQualified) {
                allQualifiedDaysSet.add(todayStr);
            }
            const qualifiedDays = Array.from(allQualifiedDaysSet).sort();

            let daysSinceInstall = 0;
            try {
                const installDateObj = new Date(installDateStr + 'T00:00:00');
                const todayDateObj = new Date(todayStr + 'T00:00:00');
                const diffMs = todayDateObj.getTime() - installDateObj.getTime();
                daysSinceInstall = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
            } catch {
                daysSinceInstall = 0;
            }

            return {
                installDate: installDateStr,
                daysSinceInstall,
                todayActiveSeconds: todaySeconds,
                totalActiveSeconds: totalSeconds,
                qualifiedDays,
                qualifiedDaysCount: qualifiedDays.length,
                isTodayQualified
            };
        } catch (e) {
            logger.warn('Ошибка вычисления engagement stats:', e);
            return {
                installDate: getLocalDateString(),
                daysSinceInstall: 0,
                todayActiveSeconds: 0,
                totalActiveSeconds: 0,
                qualifiedDays: [],
                qualifiedDaysCount: 0,
                isTodayQualified: false
            };
        }
    };

    /**
     * Проверяет выполнение guard-условий показа опроса:
     * 1. Опрос включён автором на GitHub (config.enabled === true)
     * 2. Пользователь не отключил все опросы навсегда
     * 3. Пользователь ещё не отклонял данный ID опроса
     * 4. Не активен таймер отсрочки «Позже»
     * 5. Удовлетворены условия продуктового таргетинга (Qualified Active Days / Retention)
     *
     * @param {Object|null} config - Объект конфигурации опроса
     * @returns {boolean}
     */
    const shouldShowSurvey = (config) => {
        if (!config || typeof config !== 'object') return false;
        if (config.enabled !== true || !config.id) return false;

        try {
            const isPermanentlyDisabled = localStorage.getItem(STORAGE_KEY_SURVEYS_DISABLED_FOREVER) === '1';
            if (isPermanentlyDisabled) return false;

            const isDismissed = localStorage.getItem(`${STORAGE_KEY_SURVEY_DISMISSED_PREFIX}${config.id}`) === '1';
            if (isDismissed) return false;

            const snoozeUntil = Number(localStorage.getItem(STORAGE_KEY_SURVEY_SNOOZE_UNTIL) || 0);
            if (Date.now() <= snoozeUntil) return false;

            // Таргетинг на основе продуктового удержания (Qualified Active Days)
            if (config.targeting && typeof config.targeting === 'object') {
                const {
                    minDaysSinceInstall = 0,
                    minQualifiedDays = 0,
                    minDailySecondsToQualify = DEFAULT_MIN_DAILY_SECONDS_TO_QUALIFY,
                    minTotalActiveSeconds = 0
                } = config.targeting;

                const stats = getEngagementStats(minDailySecondsToQualify);

                if (stats.daysSinceInstall < minDaysSinceInstall) return false;
                if (stats.qualifiedDaysCount < minQualifiedDays) return false;
                if (stats.totalActiveSeconds < minTotalActiveSeconds) return false;
            }

            return true;
        } catch (error) {
            logger.warn('Ошибка проверки условий показа опроса:', error);
            return false;
        }
    };

    /**
     * Отправляет анонимную метрику взаимодействия с опросом в Google Apps Script.
     * Флаг mode: 'no-cors' предотвращает блокировку браузером при HTTP 302 переадресации Google.
     *
     * @param {'completed' | 'declined' | 'disabled_forever'} action - Действие пользователя
     * @param {Object} [answers={}] - Варианты ответов (только при action === 'completed')
     * @returns {Promise<boolean>}
     */
    const sendSurveyMetric = async (action, answers = {}) => {
        const webhookUrl = surveyConfig?.webhookUrl || DEFAULT_SURVEY_WEBHOOK_URL;
        if (!webhookUrl) {
            logger.survey('URL вебхука не настроен, отправка метрики пропущена.');
            return false;
        }

        const safeAnswers = action === 'completed' && answers && typeof answers === 'object' ? answers : {};
        const payload = {
            timestamp: new Date().toISOString(),
            surveyId: surveyConfig?.id || 'unknown',
            version: CURRENT_VERSION,
            action,
            answers: safeAnswers
        };
        if (surveyConfig?.secret) {
            payload.secret = surveyConfig.secret;
        }

        try {
            await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify(payload)
            });
            logger.survey(`Метрика опроса отправлена: action="${action}"`);
            return true;
        } catch (error) {
            logger.warn('Ошибка при фоновой отправке метрики опроса:', error);
            return false;
        }
    };

    /**
     * Откладывает показ опросов на заданный интервал (по умолчанию 3 дня).
     * @param {number} [durationMs=SURVEY_SNOOZE_DURATION_MS]
     */
    const snoozeSurvey = (durationMs = SURVEY_SNOOZE_DURATION_MS) => {
        try {
            const snoozeUntil = Date.now() + durationMs;
            localStorage.setItem(STORAGE_KEY_SURVEY_SNOOZE_UNTIL, String(snoozeUntil));
            logger.survey(`Опрос отложен до ${new Date(snoozeUntil).toLocaleString()}`);
        } catch (error) {
            logger.warn('Ошибка записи mse_survey_snooze_until:', error);
        }
    };

    /**
     * Отклоняет опрос с указанным ID для текущего пользователя.
     * @param {string} surveyId
     */
    const dismissSurvey = (surveyId) => {
        if (!surveyId) return;
        try {
            localStorage.setItem(`${STORAGE_KEY_SURVEY_DISMISSED_PREFIX}${surveyId}`, '1');
            logger.survey(`Опрос "${surveyId}" скрыт.`);
        } catch (error) {
            logger.warn(`Ошибка записи mse_survey_dismissed_${surveyId}:`, error);
        }
    };

    /**
     * Отключает систему опросов навсегда.
     */
    const disableSurveysForever = () => {
        try {
            localStorage.setItem(STORAGE_KEY_SURVEYS_DISABLED_FOREVER, '1');
            logger.survey('Опросы навсегда отключены пользователем.');
        } catch (error) {
            logger.warn('Ошибка записи mse_surveys_disabled_forever:', error);
        }
    };

    /**
     * Закрывает попап опроса с плавной анимацией исчезновения.
     * @param {HTMLElement} container
     * @param {Function} [onClosed]
     */
    const closeSurveyPopup = (container, onClosed) => {
        if (!container) return;
        container.classList.add('mse-closing');
        setTimeout(() => {
            container.remove();
            if (typeof onClosed === 'function') onClosed();
        }, 300);
    };

    /**
     * Экран 1: Приглашение к опросу.
     */
    const renderSurveyInviteScreen = (container, config, state, onTransition, onClose) => {
        const titleText = escapeHtml(config.title || 'Помогите улучшить Modeus Enhancer');
        const descText = escapeHtml(config.description || 'Ответьте на пару коротких вопросов, чтобы следующие обновления были полезны именно вам.');

        container.innerHTML = `
            <div class="mse-survey-header">
                <div class="mse-survey-title">💬 ${titleText}</div>
                <button type="button" class="mse-survey-close-btn" title="Отложить опрос">×</button>
            </div>
            <div class="mse-survey-text">${descText}</div>
            <div class="mse-survey-actions">
                <button type="button" class="mse-survey-btn mse-survey-btn-primary" id="mse-survey-btn-start">Ответить</button>
                <button type="button" class="mse-survey-btn mse-survey-btn-secondary" id="mse-survey-btn-snooze">Позже</button>
                <button type="button" class="mse-survey-btn mse-survey-btn-secondary" id="mse-survey-btn-decline-menu">Нет ▾</button>
            </div>
        `;

        qs('.mse-survey-close-btn', container)?.addEventListener('click', () => {
            snoozeSurvey();
            onClose();
        });
        qs('#mse-survey-btn-snooze', container)?.addEventListener('click', () => {
            snoozeSurvey();
            onClose();
        });
        qs('#mse-survey-btn-start', container)?.addEventListener('click', () => {
            state.screen = 'question';
            state.questionIndex = 0;
            onTransition();
        });
        qs('#mse-survey-btn-decline-menu', container)?.addEventListener('click', () => {
            state.screen = 'decline';
            onTransition();
        });
    };

    /**
     * Экран 1.1: Подменю отказа.
     */
    const renderSurveyDeclineScreen = (container, config, state, onTransition, onClose) => {
        const titleText = escapeHtml(config.title || 'Помогите улучшить Modeus Enhancer');

        container.innerHTML = `
            <div class="mse-survey-header">
                <div class="mse-survey-title">💬 ${titleText}</div>
                <button type="button" class="mse-survey-close-btn" title="Отложить опрос">×</button>
            </div>
            <div class="mse-survey-text">Выберите вариант:</div>
            <div class="mse-survey-options">
                <button type="button" class="mse-survey-btn mse-survey-btn-secondary" id="mse-survey-btn-dismiss-one" style="text-align: left; padding: 8px 10px;">
                    • <b>Не этот опрос</b> — пропустить текущий опрос
                </button>
                <button type="button" class="mse-survey-btn mse-survey-btn-danger" id="mse-survey-btn-disable-all" style="text-align: left; padding: 8px 10px;">
                    • <b>Никогда не спрашивать</b> — отключить навсегда опросы
                </button>
            </div>
            <div class="mse-survey-actions">
                <button type="button" class="mse-survey-btn mse-survey-btn-secondary" id="mse-survey-btn-back">◂ Назад</button>
            </div>
        `;

        qs('.mse-survey-close-btn', container)?.addEventListener('click', () => {
            snoozeSurvey();
            onClose();
        });
        qs('#mse-survey-btn-back', container)?.addEventListener('click', () => {
            state.screen = 'invite';
            onTransition();
        });
        qs('#mse-survey-btn-dismiss-one', container)?.addEventListener('click', () => {
            dismissSurvey(config.id);
            sendSurveyMetric('declined');
            onClose();
        });
        qs('#mse-survey-btn-disable-all', container)?.addEventListener('click', () => {
            disableSurveysForever();
            sendSurveyMetric('disabled_forever');
            onClose();
        });
    };

    const CUSTOM_OPTION_VALUE = '__custom__';

    /**
     * Восстанавливает ранее выбранные опции и текст кастомного ответа.
     * @param {string|string[]|null} existingAnswer
     * @returns {{ selectedOptions: Set<string>, customText: string }}
     */
    const parseInitialQuestionAnswer = (existingAnswer) => {
        const selectedOptions = new Set();
        let customText = '';

        const parseSingleItem = (item) => {
            if (typeof item !== 'string') return;
            if (item.startsWith('Свой вариант:')) {
                selectedOptions.add(CUSTOM_OPTION_VALUE);
                customText = item.replace(/^Свой вариант:\s*/, '');
            } else {
                selectedOptions.add(item);
            }
        };

        if (Array.isArray(existingAnswer)) {
            existingAnswer.forEach(parseSingleItem);
        } else if (typeof existingAnswer === 'string') {
            parseSingleItem(existingAnswer);
        }

        return { selectedOptions, customText };
    };

    /**
     * Формирует HTML-разметку вариантов ответов (радиокнопки/чекбоксы и поле «Свой вариант»).
     * @param {Object} question
     * @param {Set<string>} selectedOptions
     * @param {string} customText
     * @returns {string}
     */
    const buildQuestionOptionsHtml = (question, selectedOptions, customText) => {
        const isMultiple = question.type === 'multiple';
        const inputType = isMultiple ? 'checkbox' : 'radio';
        const options = question.options || [];

        const optionsHtml = options.map((optionText) => {
            const isChecked = selectedOptions.has(optionText);
            const safeText = escapeHtml(optionText);
            const selectedClass = isChecked ? ' selected' : '';
            return `
                <label class="mse-survey-option${selectedClass}">
                    <input type="${inputType}" name="mse_survey_choice" value="${safeText}" ${isChecked ? 'checked' : ''} />
                    <span>${safeText}</span>
                </label>
            `;
        }).join('');

        if (!question.allowCustom) {
            return optionsHtml;
        }

        const isCustomChecked = selectedOptions.has(CUSTOM_OPTION_VALUE);
        const customSelectedClass = isCustomChecked ? ' selected' : '';
        const safeCustomText = escapeHtml(customText);
        const customDisplay = isCustomChecked ? 'block' : 'none';

        const customOptionHtml = `
            <label class="mse-survey-option${customSelectedClass}">
                <input type="${inputType}" name="mse_survey_choice" value="${CUSTOM_OPTION_VALUE}" ${isCustomChecked ? 'checked' : ''} />
                <span>Свой вариант</span>
            </label>
            <div class="mse-survey-custom-wrap" id="mse-survey-custom-container" style="display: ${customDisplay};">
                <input type="text" class="mse-survey-custom-input" id="mse-survey-custom-input" placeholder="Напишите свой вариант..." value="${safeCustomText}" />
            </div>
        `;

        return optionsHtml + customOptionHtml;
    };

    /**
     * Формирует итоговый санитизированный ответ для сохранения и отправки.
     * @param {boolean} isMultiple
     * @param {Set<string>} selectedOptions
     * @param {string} customText
     * @returns {string|string[]|null}
     */
    const buildFinalQuestionAnswer = (isMultiple, selectedOptions, customText) => {
        const trimmedCustom = customText.trim();
        const safeCustomText = escapeHtml(trimmedCustom);
        const customAnswerString = safeCustomText ? `Свой вариант: ${safeCustomText}` : null;

        if (isMultiple) {
            const result = [];
            selectedOptions.forEach((opt) => {
                if (opt !== CUSTOM_OPTION_VALUE) {
                    result.push(opt);
                }
            });
            if (selectedOptions.has(CUSTOM_OPTION_VALUE) && customAnswerString) {
                result.push(customAnswerString);
            }
            return result.length > 0 ? result : null;
        }

        if (selectedOptions.has(CUSTOM_OPTION_VALUE)) {
            return customAnswerString;
        }

        const [first] = selectedOptions;
        return first || null;
    };

    /**
     * Экран 2: Интерактивный опрос с радиокнопками, чекбоксами и кастомным ответом.
     */
    const renderSurveyQuestionScreen = (container, config, state, onTransition, onClose) => {
        const questions = config.questions || [];
        const question = questions[state.questionIndex];
        if (!question) {
            onClose();
            return;
        }

        const isMultiple = question.type === 'multiple';
        const totalQuestions = questions.length;
        const currentNumber = state.questionIndex + 1;
        const isLastQuestion = currentNumber === totalQuestions;

        const { selectedOptions, customText: initialCustomText } = parseInitialQuestionAnswer(state.answers[question.id]);
        let customText = initialCustomText;

        const optionsHtml = buildQuestionOptionsHtml(question, selectedOptions, customText);
        const backButtonHtml = state.questionIndex > 0
            ? '<button type="button" class="mse-survey-btn mse-survey-btn-secondary" id="mse-survey-btn-prev">◂ Назад</button>'
            : '';
        const nextButtonText = isLastQuestion ? 'Отправить ✓' : 'Далее ➔';

        container.innerHTML = `
            <div class="mse-survey-header">
                <div class="mse-survey-title">
                    <span>💬 Вопрос ${currentNumber} из ${totalQuestions}</span>
                    <span class="mse-survey-badge">${Math.round((currentNumber / totalQuestions) * 100)}%</span>
                </div>
                <button type="button" class="mse-survey-close-btn" title="Отложить опрос">×</button>
            </div>
            <div class="mse-survey-text"><b>${escapeHtml(question.text)}</b></div>
            <div class="mse-survey-options">${optionsHtml}</div>
            <div class="mse-survey-actions mse-survey-actions-between">
                <div>${backButtonHtml}</div>
                <button type="button" class="mse-survey-btn mse-survey-btn-primary" id="mse-survey-btn-next" disabled>
                    ${nextButtonText}
                </button>
            </div>
        `;

        const nextBtn = qs('#mse-survey-btn-next', container);
        const customContainer = qs('#mse-survey-custom-container', container);
        const customInput = qs('#mse-survey-custom-input', container);
        const optionsContainer = qs('.mse-survey-options', container);

        const updateValidation = () => {
            const hasStandard = Array.from(selectedOptions).some(opt => opt !== CUSTOM_OPTION_VALUE);
            const isCustomSelected = selectedOptions.has(CUSTOM_OPTION_VALUE);
            const hasCustomText = isCustomSelected && customText.trim().length > 0;
            const isValid = isMultiple
                ? (hasStandard || hasCustomText)
                : (isCustomSelected ? hasCustomText : hasStandard);

            if (nextBtn) {
                nextBtn.disabled = !isValid;
            }
        };

        updateValidation();

        qs('.mse-survey-close-btn', container)?.addEventListener('click', () => {
            snoozeSurvey();
            onClose();
        });

        qs('#mse-survey-btn-prev', container)?.addEventListener('click', () => {
            if (state.questionIndex > 0) {
                state.questionIndex--;
                onTransition();
            }
        });

        optionsContainer?.addEventListener('change', (e) => {
            const target = e.target;
            if (target.name !== 'mse_survey_choice') return;

            const val = target.value;
            if (isMultiple) {
                if (target.checked) {
                    selectedOptions.add(val);
                } else {
                    selectedOptions.delete(val);
                }
            } else {
                selectedOptions.clear();
                if (target.checked) {
                    selectedOptions.add(val);
                }
            }

            qsa('.mse-survey-option', container).forEach(lbl => {
                const inp = qs('input', lbl);
                lbl.classList.toggle('selected', inp?.checked || false);
            });

            if (customContainer) {
                const showCustom = selectedOptions.has(CUSTOM_OPTION_VALUE);
                customContainer.style.display = showCustom ? 'block' : 'none';
                if (showCustom && customInput) {
                    customInput.focus();
                }
            }

            updateValidation();
        });

        customInput?.addEventListener('input', (e) => {
            customText = e.target.value;
            updateValidation();
        });

        customInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && nextBtn && !nextBtn.disabled) {
                e.preventDefault();
                nextBtn.click();
            }
        });

        nextBtn?.addEventListener('click', () => {
            const finalAnswer = buildFinalQuestionAnswer(isMultiple, selectedOptions, customText);
            if (!finalAnswer) return;

            state.answers[question.id] = finalAnswer;

            if (isLastQuestion) {
                dismissSurvey(config.id);
                sendSurveyMetric('completed', state.answers);
                state.screen = 'completed';
                onTransition();
            } else {
                state.questionIndex++;
                onTransition();
            }
        });
    };

    /**
     * Экран 3: Финал и благодарность с автозакрытием.
     */
    const renderSurveyCompletedScreen = (container, config, state, onClose) => {
        container.innerHTML = `
            <div class="mse-survey-header">
                <div class="mse-survey-title" style="color: #16a34a;">✓ Спасибо за участие!</div>
                <button type="button" class="mse-survey-close-btn" title="Закрыть">×</button>
            </div>
            <div class="mse-survey-text">
                Ваши ответы сохранены и помогут сделать расширение лучше.
            </div>
        `;

        qs('.mse-survey-close-btn', container)?.addEventListener('click', () => {
            onClose();
        });

        state.autoCloseTimer = setTimeout(() => {
            onClose();
        }, 3000);
    };

    /**
     * Рендерит интерактивный попап опроса (#mse-survey-popup).
     * @param {Object} config - Конфигурация опроса
     */
    const renderSurveyPopup = (config) => {
        if (!config || !config.questions || !Array.isArray(config.questions) || config.questions.length === 0) {
            return;
        }

        let container = qs(`#${ID_SURVEY_POPUP}`);
        if (!container) {
            container = document.createElement('div');
            container.id = ID_SURVEY_POPUP;
            document.body.appendChild(container);
        }

        const state = {
            screen: 'invite', // 'invite' | 'decline' | 'question' | 'completed'
            questionIndex: 0,
            answers: {},
            autoCloseTimer: null
        };

        const onClose = () => {
            if (state.autoCloseTimer) clearTimeout(state.autoCloseTimer);
            closeSurveyPopup(container);
        };

        const onTransition = () => {
            if (state.autoCloseTimer) clearTimeout(state.autoCloseTimer);
            switch (state.screen) {
                case 'invite':
                    renderSurveyInviteScreen(container, config, state, onTransition, onClose);
                    break;
                case 'decline':
                    renderSurveyDeclineScreen(container, config, state, onTransition, onClose);
                    break;
                case 'question':
                    renderSurveyQuestionScreen(container, config, state, onTransition, onClose);
                    break;
                case 'completed':
                    renderSurveyCompletedScreen(container, config, state, onClose);
                    break;
            }
        };

        onTransition();
    };

    /**
     * Симуляция опроса для тестирования интерфейса.
     * @param {Object} [customConfig]
     * @returns {boolean}
     */
    const simulateSurvey = (customConfig) => {
        if (!customConfig && databaseState.survey.source !== 'ручная установка') {
            loadSurveyConfig();
        }

        const configToRun = (customConfig && typeof customConfig === 'object')
            ? customConfig
            : surveyConfig;

        if (!configToRun || !Array.isArray(configToRun.questions) || configToRun.questions.length === 0) {
            logger.warn('Опрос не может быть запущен: конфигурация не найдена (проверьте data/survey.json или передайте конфиг в MSE_simulateSurvey).');
            return false;
        }

        qs(`#${ID_SURVEY_POPUP}`)?.remove();
        renderSurveyPopup(configToRun);
        logger.survey(`Симуляция опроса: попап успешно отрисован (id: "${configToRun.id || 'survey'}").`);
        return true;
    };

    /**
     * Проверяет доступность опроса и инициирует его отображение.
     * @returns {boolean}
     */
    const checkSurvey = () => {
        if (!shouldShowSurvey(surveyConfig)) {
            logger.survey('Опрос не будет показан (условия guard не удовлетворены).');
            return false;
        }
        logger.survey(`Условия guard выполнены для опроса "${surveyConfig?.id}".`);
        if (typeof renderSurveyPopup === 'function') {
            renderSurveyPopup(surveyConfig);
        }
        return true;
    };

    let lastCalendarParam = null;
    let lastFilterParam = null;
    const processUrlChange = () => {
        const currentUrl = window.location.href;
        const urlObj = new URL(currentUrl);

        // 1. Открытие карточки пары (боковая панель)
        let newEventId = null;
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

        document.removeEventListener('click', handleOutsideSearchClick);
        document.addEventListener('click', handleOutsideSearchClick);

        loadAllData();
    };

    // 1. Сбор структуры предметов и скачивание массивов макс. баллов
    function processPrimaryGradesData(data) {
        if (!data || !data.courseUnitRealizations) return;

        const count = data.courseUnitRealizations.length;
        logger.network(`Успеваемость (/primary): перехвачена таблица результатов, предметов: ${count}`);

        const token = sessionStorage.getItem('id_token');
        const uniqueCourseUnits = new Set();

        data.courseUnitRealizations.forEach(courseUnitRealization => {
            if (!courseUnitRealization.name || !courseUnitRealization.lessons) return;

            const sortedLessons = [...courseUnitRealization.lessons].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            const normName = normalizeName(courseUnitRealization.name);
            mseCourseRealizationsMap.set(normName, sortedLessons);

            if (courseUnitRealization.courseUnitId) uniqueCourseUnits.add(courseUnitRealization.courseUnitId);
        });

        uniqueCourseUnits.forEach(courseUnitId => {
            if (mseLoadedCourseUnits.has(courseUnitId)) return;
            mseLoadedCourseUnits.add(courseUnitId);

            fetch(`${API_COURSES}/${courseUnitId}/lessons-technology`, {
                headers: { "authorization": `Bearer ${token}` }
            })
                .then(response => response.json())
                .then(technologyData => {
                    if (technologyData.lessonTechnologies) {
                        technologyData.lessonTechnologies.forEach(lessonTech => {
                            if (lessonTech.controlObjects && lessonTech.controlObjects.length > 0) {
                                // Сохраняем список максимумов по порядку точек (например: [10, 2])
                                const sortedControlObjects = [...lessonTech.controlObjects].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
                                const maxGradeList = sortedControlObjects
                                    .map(controlObj => controlObj.maxValue)
                                    .filter(v => typeof v === 'number' && v > 0);

                                if (maxGradeList.length > 0) {
                                    mseLessonMaxGrades.set(lessonTech.lessonId, maxGradeList);
                                    if (lessonTech.lessonName) {
                                        mseLessonNameToMaxGrade.set(normalizeName(lessonTech.lessonName), maxGradeList);
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

    function createGradeBadge(maxGrade) {
        const badge = document.createElement('span');
        badge.className = 'mse-max-grade';
        badge.textContent = ` /${maxGrade}`;
        return badge;
    }

    function createMaxDoneSpan(text) {
        const span = document.createElement('span');
        span.className = 'mse-max-done';
        span.textContent = text;
        return span;
    }

    function aggregateMultiPointGrades(meetingCell, maxGradeList) {
        const totalMax = maxGradeList.reduce((acc, m) => acc + (typeof m === 'number' ? m : 0), 0);
        const numberElements = qsa('.lesson-realization:not(.present):not(.absent)', meetingCell);

        // Вариант 1: если цифры оценок находятся в отдельных элементах .lesson-realization
        if (numberElements.length >= 3) {
            const totalEarned = Math.round(numberElements.reduce((acc, el) => acc + parseFloat(el.textContent), 0) * 100) / 100;
            numberElements[0].innerHTML = `${totalEarned}`;
            if (totalEarned >= totalMax) {
                numberElements[0].classList.add('mse-max-done');
            } else {
                numberElements[0].appendChild(createGradeBadge(totalMax));
            }
            for (let i = 1; i < numberElements.length; i++) {
                numberElements[i].remove();
            }
            return true;
        }

        // Вариант 2: если цифры оценок находятся в текстовом узле ячейки
        const matches = [...meetingCell.textContent.matchAll(/\b(\d+(\.\d+)?)\b/g)];
        if (matches.length >= 3) {
            const totalEarned = Math.round(matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) * 100) / 100;
            for (const node of Array.from(meetingCell.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE && /\b\d/.test(node.textContent)) {
                    const tail = node.textContent.replace(/^.*?(\s*[-–—]?\s*\|\s*[ПНH]|$)/, '$1');
                    const fragment = document.createDocumentFragment();
                    if (totalEarned >= totalMax) {
                        fragment.appendChild(createMaxDoneSpan(totalEarned));
                    } else {
                        fragment.appendChild(document.createTextNode(totalEarned));
                        fragment.appendChild(createGradeBadge(totalMax));
                    }
                    fragment.appendChild(document.createTextNode(tail));
                    node.replaceWith(fragment);
                    return true;
                }
            }
        }

        return false;
    }

    function injectIndividualGradeBadges(meetingCell, maxGradeList) {
        let gradeIndex = 0;

        // А. Если оценка лежит в отдельном элементе .lesson-realization
        const leafElements = qsa('.lesson-realization:not(.present):not(.absent)', meetingCell);
        for (const el of leafElements) {
            const txt = el.textContent.trim();
            if (/^\d+(\.\d+)?$/.test(txt)) {
                if (gradeIndex < maxGradeList.length) {
                    const max = maxGradeList[gradeIndex++];
                    const val = parseFloat(txt);

                    if (val >= max) {
                        el.classList.add('mse-max-done');
                    } else {
                        el.appendChild(createGradeBadge(max));
                    }
                }
            }
        }

        if (gradeIndex > 0) return;

        // Б. Если внутри ячейки текстовый узел
        for (const node of Array.from(meetingCell.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                const textContent = node.textContent;
                const regex = /\b(\d+(\.\d+)?)\b/g;
                let match;
                const matches = [];

                while ((match = regex.exec(textContent)) !== null) {
                    matches.push({ num: match[1], index: match.index });
                }

                if (matches.length > 0) {
                    const fragment = document.createDocumentFragment();
                    let lastIdx = 0;

                    for (const m of matches) {
                        if (gradeIndex >= maxGradeList.length) break;
                        const max = maxGradeList[gradeIndex++];
                        const numVal = parseFloat(m.num);

                        fragment.appendChild(document.createTextNode(textContent.substring(lastIdx, m.index)));

                        if (numVal >= max) {
                            fragment.appendChild(createMaxDoneSpan(m.num));
                        } else {
                            const numSpan = document.createElement('span');
                            numSpan.className = 'lesson-realization';
                            numSpan.textContent = m.num;
                            numSpan.appendChild(createGradeBadge(max));
                            fragment.appendChild(numSpan);
                        }

                        lastIdx = m.index + m.num.length;
                    }

                    if (lastIdx < textContent.length) {
                        const tail = textContent.substring(lastIdx).replace(/^(\s*[-–—])/, '\u00A0$1');
                        fragment.appendChild(document.createTextNode(tail));
                    }

                    node.replaceWith(fragment);
                    return;
                }
            }
        }
    }

    function injectMaxGradeBadge(meetingCell, maxGrades) {
        if (!meetingCell || meetingCell.querySelector('.mse-max-grade') || meetingCell.querySelector('.mse-max-done')) return;
        const maxGradeList = Array.isArray(maxGrades) ? maxGrades : [maxGrades];
        if (maxGradeList.length === 0) return;

        // Если контрольных точек 3 или больше — суммируем их в один итог
        if (maxGradeList.length >= 3 && aggregateMultiPointGrades(meetingCell, maxGradeList)) {
            return;
        }

        // Для 1-2 контрольных точек отображаем индивидуальные бейджи
        injectIndividualGradeBadges(meetingCell, maxGradeList);
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
                                const matchedLesson = matchedLessons[meetingNumber - 1];
                                const meetingCell = tds[colIndex];
                                if (!matchedLesson || !meetingCell) return;

                                const maxGradeList = mseLessonMaxGrades.get(matchedLesson.id);
                                if (!maxGradeList) return;
                                const maxGradeArray = Array.isArray(maxGradeList) ? maxGradeList : [maxGradeList];

                                // Клонируем ячейку и удаляем наши бейджи, чтобы посчитать чистые оценки студента
                                const clone = meetingCell.cloneNode(true);
                                clone.querySelectorAll('.mse-max-grade').forEach(b => b.remove());

                                const gradePart = clone.textContent.split('|')[0] || '';
                                const matches = [...gradePart.matchAll(/\b(\d+(\.\d+)?)\b/g)];

                                // Если пара была с 3+ оценками (суммированная)
                                if (maxGradeArray.length >= 3 && matches.length === 1) {
                                    const sumMax = maxGradeArray.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                                    const earned = parseFloat(matches[0][1]);
                                    if (!isNaN(earned) && sumMax > earned) totalLost += (sumMax - earned);
                                    return;
                                }

                                // Для обычных пар: считаем недополученное только по реально сданным точкам
                                matches.forEach((m, idx) => {
                                    const num = parseFloat(m[1]);
                                    if (!isNaN(num) && idx < maxGradeArray.length) {
                                        const maxVal = maxGradeArray[idx];
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
                const meetingCell = tds[colIndex];
                if (!meetingCell) return;

                const lesson = matchedLessons[meetingNumber - 1];
                if (!lesson) return;

                const maxGrades = mseLessonMaxGrades.get(lesson.id);
                if (maxGrades) {
                    injectMaxGradeBadge(meetingCell, maxGrades);
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

    // Фоновая проверка обновлений при старте приложения
    setTimeout(() => {
        checkExtensionUpdate({ force: false });
    }, 1500);

    // Запуск фонового учета продуктовой активности (Engagement-Based Retention)
    startEngagementTracker();

    logger.debug('Скрипт запущен!');
    if (isDebug()) {
        printDebugStatus();
    }
})();