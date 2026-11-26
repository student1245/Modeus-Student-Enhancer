(() => {
    const getSvgIcon = (typeof window !== 'undefined' && window.getSvgIcon)
        ? window.getSvgIcon
        : (typeof require !== 'undefined' ? (function () {
            try { return require('./icons.js').getSvgIcon; } catch (_) {
                try { return require(require('path').resolve(process.cwd(), 'src/icons.js')).getSvgIcon; } catch (__) { return () => ''; }
            }
        })() : () => '');

    const sharedUtils = (typeof window !== 'undefined' && window.MSE_SHARED)
        ? window.MSE_SHARED
        : (typeof require !== 'undefined' ? (function () {
            try { return require('./shared-utils.js'); } catch (_) {
                try { return require(require('path').resolve(process.cwd(), 'src/shared-utils.js')); } catch (__) { return null; }
            }
        })() : null);

    const META_VERSION = 'modeus-enhancer-version';
    const CURRENT_VERSION = document.querySelector(`meta[name="${META_VERSION}"]`)?.content || '0.0.0';
    const STORAGE_KEY_DEBUG = 'mse_debug'; // Флаг режима отладки (1 / true)
    const STORAGE_KEY_AUTH_BACKUP = 'mse_auth_backup';

    // Стартовая визитка расширения (выводится всегда при запуске)
    console.log(
        `%c Modeus Enhancer %c v${CURRENT_VERSION} %c by @JasonVurhyz & student1245\n` +
        '%cБаги и отзывы: %c@Theguestroom_bot%c  •  Отладка: %cMSE_enableDebug()',
        'background: #007bff; color: #fff; font-weight: bold; padding: 3px 7px; border-radius: 4px 0 0 4px;',
        'background: #1e293b; color: #e2e8f0; font-weight: bold; padding: 3px 7px; border-radius: 0 4px 4px 0;',
        'color: #94a3b8; font-size: 11px;',
        'color: #64748b; font-size: 11px; line-height: 2;', 'color: #38bdf8; font-size: 11px;',
        'color: #64748b; font-size: 11px;', 'color: #a78bfa; font-family: monospace; font-size: 11px;'
    );

    // Динамическая проверка флага отладки (runtime без перезагрузки)
    const isDebug = () => (sharedUtils?.isDebug ? sharedUtils.isDebug() : false);

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
    const decodeBase64Utf8 = (base64) => (
        sharedUtils?.decodeBase64Utf8 ? sharedUtils.decodeBase64Utf8(base64) : ''
    );

    // Безопасный парсинг JWT-токена с поддержкой UTF-8 в payload
    const parseJwt = (token) => (
        sharedUtils?.parseJwt ? sharedUtils.parseJwt(token, logger.warn) : {}
    );

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

    // Определение времени истечения суточного ID-токена (24 часа) без скрытых мутаций хранилища
    const getMainTokenExpiresAt = (idToken) => {
        // 1. Приоритетный источник: клейм exp из метаданных самого id_token
        if (idToken) {
            const claims = parseJwt(idToken);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                return claims.exp * 1000;
            }
        }

        // 2. Вторичный источник: кэшированные клеймы токена
        try {
            const claimsRaw = sessionStorage.getItem('id_token_claims_obj');
            if (claimsRaw) {
                const claims = JSON.parse(claimsRaw);
                if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                    return claims.exp * 1000;
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
        const isAutologinActive = document.querySelector('meta[name="modeus-sso-autologin"]')?.content === '1';
        const autologinText = ` | Автовход 24ч+: ${isAutologinActive ? 'АКТИВЕН' : 'не настроен'}`;

        console.log(
            `%c[${formatLogTimestamp()}] [MSE Status] v${CURRENT_VERSION} | Токен: ${accessSummary} | Основной: ${mainSummary}${autologinText}${circuitBreakerText}`,
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
        if (typeof checkExtensionUpdate === 'function') return checkExtensionUpdate({ force, manual: true });
    };
    window.MSE_testUpdate = (mockVersion = '9.9.9') => {
        if (typeof simulateUpdate === 'function') return simulateUpdate(mockVersion);
    };
    window.MSE_simulateUpdate = (mockVersion = '9.9.9') => {
        if (typeof simulateUpdate === 'function') return simulateUpdate(mockVersion);
    };
    window.MSE_clearUpdateCache = () => {
        if (typeof clearUpdateCache === 'function') return clearUpdateCache();
    };
    window.MSE_resetUpdates = () => {
        if (typeof clearUpdateCache === 'function') return clearUpdateCache();
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
    window.MSE_checkSurvey = () => (typeof showSurveyIfEligible === 'function' ? showSurveyIfEligible() : false);
    window.MSE_simulateSurvey = (customConfig = null) => (typeof simulateSurvey === 'function' ? simulateSurvey(customConfig) : false);
    // Предотвращает ReferenceError при буквальном копировании сигнатуры "window.MSE_simulateSurvey(customConfig)" в консоль
    if (typeof window.customConfig === 'undefined') {
        window.customConfig = undefined;
    }
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
            document.dispatchEvent(new CustomEvent('mse:clear-survey-cache'));
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
    const STORAGE_KEY_GRADES_PRIMARY = 'mse_grades_primary_cache';
    const STORAGE_KEY_LAST_UPDATE_CHECK = 'mse_last_update_check';
    const STORAGE_KEY_LATEST_RELEASE = 'mse_latest_release';
    const STORAGE_KEY_UPDATE_NOTICE = 'mse_update_notice';
    const SESSION_KEY_UPDATE_AUTO_OPENED = 'mse_update_auto_opened';
    const UPDATE_SNOOZE_DURATION_MS = 72 * 60 * 60 * 1000; // Порог напоминания об обновлении (72 часа / 3 суток)
    const UPDATE_OUTSIDE_SNOOZE_DURATION_MS = 12 * 60 * 60 * 1000; // Пауза автопоказа при клике вне окна (12 часов)
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
    const LOCK_NAME_SILENT_REFRESH = 'mse_silent_refresh_lock';
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
    const SESSION_IFRAME_TIMEOUT_MS = 15000;              // Таймаут ожидания фрейма обновления (15 сек, гарантированно меньше интервала проверки 20 сек)
    const SESSION_MAX_REFRESH_ATTEMPTS = 5;               // Предохранитель (Circuit Breaker): макс. попыток тихого рефреша подряд
    const SESSION_STUCK_TIMEOUT_MS = 25000;               // Предохранитель от сна ПК: макс. время зависания одного рефреша (25 сек)
    const DOM_CHECK_READY_INTERVAL_MS = 200;              // Опрос готовности календаря при старте
    const MUTATION_DEBOUNCE_DELAY_MS = 250;               // Дебаунс реакции на мутации DOM
    const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;  // Кэш проверки релизов GitHub (2 часа)
    const SEARCH_SUGGESTIONS_LIMIT = 7;                   // Максимум подсказок студентов в поиске
    const PE_SCHEDULE_DAYS = 21;                          // Горизонт дней для расписания физкультуры
    const CALENDAR_ATTENDEES_CONCURRENCY = 5;             // Максимум параллельных запросов участников занятий
    const CALENDAR_CACHE_TTL_MS = 20 * 60 * 1000;         // TTL кэша расписания недели (20 минут)
    const CALENDAR_CACHE_MAX_ENTRIES = 100;               // Лимит записей кэша расписания (защита от утечек в Session Keeper)

    // Классы и идентификаторы элементов DOM
    const CLASS_MSE_ACTIVE = 'mse-active';
    const CLASS_MSE_SEARCH_FILTERING_ACTIVE = 'mse-search-filtering-active';
    const CLASS_SHORT_CARD = 'mse-short-card';
    const CLASS_TITLE_CLIPPED = 'mse-title-clipped';
    const CLASS_IN_CALENDAR_TOOLBAR = 'in-calendar-toolbar';
    const CLASS_IS_COMPACT = 'is-compact';
    const CLASS_IS_ULTRA_COMPACT = 'is-ultra-compact';
    const CLASS_NATIVE_POPOVER_SHARED = 'mse-native-popover-shared';
    const SHORT_CARD_MAX_HEIGHT_PX = 54;
    const BANNER_HEIGHT_PX = 19;
    const BANNER_SAFETY_MARGIN_PX = 2;
    const COMPACT_CHIP_MAX_WIDTH_PX = 110;
    const ID_SILENT_REFRESHER = 'mse-silent-refresher';
    const ID_SEARCH_CONTAINER = 'enhancer-search-container';
    const ID_SEARCH_TOGGLE_BTN = 'search-toggle-btn';
    const ID_SEARCH_POPOVER = 'mse-search-popover';
    const ID_SEARCH_INPUT = 'student-search-input';
    const ID_STOP_BUTTON = 'enhancer-stop-button';
    const ID_TEACHER_TOOLTIP = 'teacher-tooltip';
    const ID_TOAST_CONTAINER = 'mse-toast-container';
    const ID_FRIENDS_MENU = 'mse-friends-menu';
    const ID_RETURN_TO_ME_MENU = 'mse-return-to-me-menu';
    const ID_UPDATE_ANCHOR = 'mse-update-anchor';
    const ID_UPDATE_BADGE = 'mse-update-badge';
    const ID_UPDATE_POPUP = 'mse-update-popup';
    const ID_SURVEY_POPUP = 'mse-survey-popup';
    const ID_FEEDBACK_FOOTER = 'mse-feedback-footer';
    const ID_OPEN_PE_BTN = 'mse-open-pe-btn';
    const ID_SMART_PICKER_BANNER = 'mse-smart-picker-banner';
    const ID_SPOTLIGHT_OVERLAY = 'mse-spotlight-overlay';
    const ID_SPOTLIGHT_CARD = 'mse-spotlight-card';
    const ID_OPEN_ADD_FRIEND_BTN = 'mse-open-add-friend-guide-btn';
    const PARTICIPANT_SEARCH_HINT = 'Поиск по имени или фамилии...';
    const DROPDOWN_EXPAND_DELAY_MS = 350;

    // Векторные SVG-иконки Lucide для интерфейса.
    // Иконки бейджей (12–13px) — для квадратиков рядом с именем студента.
    // Иконки шапки (13px) — для кнопок заголовка боковой карточки.
    const SVG_HEART = getSvgIcon('heart', { size: 12, fill: 'currentColor', strokeWidth: 1.5, className: 'mse-badge-icon mse-badge-friend-icon' });
    const SVG_HEART_OUTLINE = getSvgIcon('heart', { size: 14, strokeWidth: 1.8, className: 'mse-badge-icon mse-badge-friend-outline' });
    const SVG_GRADUATION_CAP = getSvgIcon('graduation-cap', { size: 13, strokeWidth: 1.8, className: 'mse-badge-icon mse-badge-direction-icon' });
    const SVG_USER_ME = getSvgIcon('user', { size: 12, strokeWidth: 2, className: 'mse-badge-icon mse-badge-me-icon' });
    const SVG_BAN = getSvgIcon('ban', { size: 13, strokeWidth: 2, className: 'mse-badge-icon mse-header-action-icon' });
    const SVG_EXTERNAL_LINK = getSvgIcon('external-link', { size: 13, strokeWidth: 2, className: 'mse-badge-icon mse-header-action-icon' });
    const SVG_X_DRAWER = getSvgIcon('x', { size: 13, strokeWidth: 2, className: 'mse-badge-icon mse-header-action-icon' });
    const SVG_USER_GROUP = getSvgIcon('user-group', { size: 16, fill: 'currentColor', strokeWidth: 1.2, className: 'mse-menu-icon-svg' });
    const SVG_USER_MENU = getSvgIcon('user', { size: 16, fill: 'currentColor', strokeWidth: 1.2, className: 'mse-menu-icon-svg' });
    const SVG_USER_PLUS = getSvgIcon('user-plus', { size: 16, strokeWidth: 2.2 });
    const SVG_CALENDAR_SEARCH = getSvgIcon('calendar-search', { size: 18, strokeWidth: 1.8 });
    const SVG_MOVE_RIGHT = getSvgIcon('move-right', { size: 14, strokeWidth: 2.2 });

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
    let activeSuggestionIndex = -1;
    const attendeesMemoryCache = new Map();
    const weekEventsCache = new Map();
    let lastActiveCalendarPersonId = null;
    let latestKnownUpdate = null;
    let nativePopoverObserver = null;
    let hoveredHighlightedEventId = null;
    let calendarResizeObserver = null;
    let calendarResizeDebounceTimer = null;
    let observedCalendarTarget = null;
    let cachedSearchContainer = null;

    // Успеваемость и технологические карты
    const GRADES_MAX_UNKNOWN_THRESHOLD = 0.3; // Порог неизвестных макс. баллов (30%) для вывода Н/Д*
    let mseCourseRealizationsMap = new Map();
    let mseLessonMaxGrades = new Map();
    let mseLessonNameToMaxGrade = new Map();
    let mseLoadedCourseUnits = new Set();

    // Служебные переменные и таймеры
    let debounceTimer = null;
    let isRestoringHighlights = false;
    let checkReadyTimer = null;
    let sessionHealthInterval = null;
    let updateCheckInterval = null;
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

    // Безопасное экранирование HTML для защиты от XSS (с полноценным fallback без sharedUtils)
    const escapeHtml = (str) => {
        if (sharedUtils?.escapeHtml) return sharedUtils.escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const getToastIconHtml = (type) => {
        if (type === 'success') {
            return getSvgIcon('check', { size: 14, strokeWidth: 2.2 });
        }
        if (type === 'error') {
            return getSvgIcon('ban', { size: 14, strokeWidth: 2.2 });
        }
        if (type === 'warning') {
            return getSvgIcon('ban', { size: 14, strokeWidth: 2 });
        }
        return getSvgIcon('circle-minus', { size: 14, strokeWidth: 2 });
    };

    // Неблокирующие всплывающие уведомления (Toast) вместо alert()
    const showToast = (message, type = 'info', durationMs = 4000) => {
        let container = qs(`#${ID_TOAST_CONTAINER}`);
        if (!container) {
            container = document.createElement('div');
            container.id = ID_TOAST_CONTAINER;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `mse-toast mse-toast-${type}`;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'mse-toast-icon';
        iconSpan.innerHTML = getToastIconHtml(type);

        const textSpan = document.createElement('span');
        textSpan.className = 'mse-toast-message';
        textSpan.textContent = message;

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mse-toast-close';
        closeBtn.innerHTML = getSvgIcon('x', { size: 14, strokeWidth: 2 });
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
            const urlStr = typeof url === 'string' ? url : (url?.url || url?.toString?.() || '');
            const response = await nativeFetch(...args);

            if (urlStr.includes('/api/people/persons/search')) {
                const responseText = await response.clone().text();
                processPersonSearchResponse(responseText);
            }

            if (urlStr.includes('/academic-period-results-table/primary')) {
                try {
                    const data = await response.clone().json();
                    processPrimaryGradesData(data);
                } catch (e) {
                    logger.warn('Ошибка чтения primary из fetch:', e);
                }
            }

            if (urlStr.includes('/module-elements/')) {
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
    let silentRefreshResolver = null;
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
        if (silentRefreshResolver) {
            const resolve = silentRefreshResolver;
            silentRefreshResolver = null;
            resolve();
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

    function generateCryptoToken(byteLength = 16) {
        const cryptoApi = (typeof window !== 'undefined' && window.crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto);
        if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
            throw new Error('Web Crypto API (getRandomValues) недоступен');
        }
        const bytes = new Uint8Array(byteLength);
        cryptoApi.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    function createSilentOAuthRequest() {
        const redirectUri = encodeURIComponent(OAUTH_REDIRECT_URI);
        const nonce = generateCryptoToken(16);
        const state = generateCryptoToken(16);
        const url = `${OAUTH_AUTH_URL}?response_type=id_token%20token&client_id=${OAUTH_CLIENT_ID}&state=${encodeURIComponent(state)}&redirect_uri=${redirectUri}&scope=openid&nonce=${encodeURIComponent(nonce)}`;
        return { url, state, nonce };
    }

    function createSilentRefresherIframe(url) {
        const ifr = document.createElement('iframe');
        ifr.id = ID_SILENT_REFRESHER;
        ifr.style.cssText = 'position: absolute !important; width: 0 !important; height: 0 !important; border: none !important; display: none !important;';
        ifr.src = url;
        document.body.appendChild(ifr);
        return ifr;
    }

    function extractHashParamsFromIframe(ifr) {
        try {
            const hash = ifr?.contentWindow?.location?.hash;
            if (hash && hash.includes('access_token')) {
                return new URLSearchParams(hash.replace(/^#/, ''));
            }
        } catch {
            // Штатная ошибка безопасности (CORS) пока во фрейме идет переадресация через Keycloak/ADFS
        }
        return null;
    }

    function validateOAuthCallbackParams(params, { expectedState, expectedNonce } = {}) {
        if (!params || typeof params.get !== 'function') {
            return { valid: false, reason: 'отсутствуют параметры OAuth-ответа' };
        }
        if (!expectedState || !expectedNonce) {
            return { valid: false, reason: 'отсутствуют ожидаемые state/nonce для проверки' };
        }

        const returnedState = params.get('state');
        if (!returnedState || returnedState !== expectedState) {
            return { valid: false, reason: 'несовпадение параметра state (возможна CSRF-подмена)' };
        }

        const accessToken = params.get('access_token');
        if (!accessToken) {
            return { valid: false, reason: 'отсутствует access_token' };
        }

        const idToken = params.get('id_token');
        if (!idToken) {
            return { valid: false, reason: 'отсутствует id_token для проверки nonce' };
        }

        const idClaims = parseJwt(idToken);
        if (!idClaims?.nonce || idClaims.nonce !== expectedNonce) {
            return { valid: false, reason: 'несовпадение nonce в id_token' };
        }

        return { valid: true, accessToken, idToken, idClaims };
    }

    function applyRefreshedTokens(params, expected = {}) {
        const validation = validateOAuthCallbackParams(params, expected);
        if (!validation.valid) {
            logger.warn(`[MSE Session] Отклонены OAuth-токены: ${validation.reason}`);
            return null;
        }

        const { accessToken, idToken, idClaims } = validation;
        const rawExpiresIn = params.get('expires_in');
        const expiresIn = (rawExpiresIn === null || rawExpiresIn === '') ? 3600 : Number(rawExpiresIn);
        if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
            logger.warn('[MSE Session] Отклонены OAuth-токены: некорректный expires_in');
            return null;
        }
        const sessionState = params.get('session_state');
        const oldToken = sessionStorage.getItem('access_token');
        const now = Date.now();
        const expiresAt = now + expiresIn * 1000;

        sessionStorage.setItem('access_token', accessToken);
        sessionStorage.setItem('access_token_stored_at', String(now));
        sessionStorage.setItem('expires_at', String(expiresAt));
        sessionStorage.setItem('id_token', idToken);
        if (idClaims?.exp) {
            sessionStorage.setItem('id_token_expires_at', String(idClaims.exp * 1000));
            sessionStorage.setItem('id_token_claims_obj', JSON.stringify(idClaims));
            sessionStorage.setItem('id_token_stored_at', String(now));
        }
        sessionStorage.setItem('nonce', expected.expectedNonce);
        if (sessionState) sessionStorage.setItem('session_state', sessionState);

        saveAuthTokensBackup();
        const refreshedPersonId = idClaims?.person_id || idClaims?.sub;
        if (refreshedPersonId) {
            syncMyPersonIdCache(refreshedPersonId);
        }
        try {
            document.dispatchEvent(new CustomEvent('mse:auth-success'));
        } catch { }
        refreshFailureCount = 0;
        isCircuitBreakerOpen = false;

        return { accessToken, oldToken, expiresIn };
    }

    function handleRefreshedSessionSuccess(tokenResult) {
        const { accessToken, oldToken, expiresIn } = tokenResult;
        if (accessToken === oldToken && expiresIn <= SESSION_BURN_THRESHOLD_SEC) {
            logger.session(`Ответ получен: сервер еще дожигает старый токен (осталось ${expiresIn} сек.). Ждем точного завершения...`);
            clearTimeout(smartWaitTimer);
            smartWaitTimer = setTimeout(() => {
                smartWaitTimer = null;
                triggerSilentRefresh();
            }, (expiresIn + SESSION_SMART_WAIT_MARGIN_SEC) * 1000);
        } else {
            clearTimeout(smartWaitTimer);
            smartWaitTimer = null;
            const totalMin = Math.round(expiresIn / 60);
            const mainInfo = ` | Основной: ${formatTokenStatusSummary(getMainTokenStatus())}`;
            logger.session(`Ответ получен! Токен успешно продлен в фоне. Новый срок жизни: ${expiresIn} с (~${totalMin} мин)${mainInfo}`);
        }
    }

    function recordRefreshFailure(warnMessage, { checkTokenBeforeBreaker = false } = {}) {
        refreshFailureCount++;
        if (warnMessage) {
            logger.warn(warnMessage);
        }
        if (refreshFailureCount < SESSION_MAX_REFRESH_ATTEMPTS) return false;

        if (checkTokenBeforeBreaker) {
            const accessStatus = getAccessTokenStatus();
            if (accessStatus.hasToken && accessStatus.secondsLeft > 0) {
                logger.session(
                    `Лимит попыток (${SESSION_MAX_REFRESH_ATTEMPTS}) исчерпан, но токен еще активен (${accessStatus.secondsLeftFormatted} с). Отсрочка срабатывания Circuit Breaker до фактического истечения.`
                );
                return false;
            }
        }

        triggerCircuitBreaker();
        return true;
    }

    function handleRefreshTimeout() {
        cleanupSilentRefresh();
        recordRefreshFailure(
            `[MSE Session] Тайм-аут фонового обновления токена (попытка ${refreshFailureCount + 1}/${SESSION_MAX_REFRESH_ATTEMPTS})`,
            { checkTokenBeforeBreaker: true }
        );
    }

    function executeSilentRefresh() {
        return new Promise((resolve) => {
            cleanupSilentRefresh();
            silentRefreshResolver = resolve;
            isSilentRefreshing = true;
            refreshStartedAt = Date.now();

            logger.session('Сессия скоро истекает. Запуск скрытого iframe для фонового продления...');

            let iframeEl;
            let expectedState;
            let expectedNonce;
            try {
                const oauthReq = createSilentOAuthRequest();
                expectedState = oauthReq.state;
                expectedNonce = oauthReq.nonce;
                iframeEl = createSilentRefresherIframe(oauthReq.url);
            } catch (err) {
                logger.error('[MSE Session] Ошибка вставки iframe рефрешера:', err);
                cleanupSilentRefresh();
                recordRefreshFailure();
                return;
            }

            let resolved = false;
            const checkTokens = () => {
                if (resolved) return;
                const params = extractHashParamsFromIframe(iframeEl);
                if (params) {
                    resolved = true;
                    const tokenResult = applyRefreshedTokens(params, { expectedState, expectedNonce });
                    if (tokenResult) {
                        handleRefreshedSessionSuccess(tokenResult);
                    } else {
                        recordRefreshFailure('[MSE Session] Отклонен ответ фонового рефреша: невалидные state/nonce');
                    }
                    cleanupSilentRefresh();
                }
            };

            silentRefreshPollTimer = setInterval(checkTokens, SESSION_POLL_INTERVAL_MS);
            iframeEl.onload = checkTokens;

            silentRefreshTimeoutTimer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    handleRefreshTimeout();
                }
            }, SESSION_IFRAME_TIMEOUT_MS);
        });
    }

    function triggerSilentRefresh() {
        if (isCircuitBreakerOpen) {
            logger.session('Запрос на продление отклонен: сработал Circuit Breaker (серверная сессия завершена)');
            return;
        }

        if (isSilentRefreshing) {
            const elapsed = Date.now() - refreshStartedAt;
            if (elapsed > SESSION_STUCK_TIMEOUT_MS) {
                cleanupSilentRefresh();
                const breakerTriggered = recordRefreshFailure(
                    `[MSE Session] Обнаружен зависший фоновый процесс (прошло ${(elapsed / 1000).toFixed(1)} сек., возможен сон ПК). Принудительный сброс.`
                );
                if (breakerTriggered) return;
            } else {
                logger.session('Запрос на продление отклонен: фоновый iframe уже запущен');
                return;
            }
        }

        if (navigator?.locks?.request) {
            navigator.locks.request(LOCK_NAME_SILENT_REFRESH, { ifAvailable: true }, async (lock) => {
                if (!lock) {
                    logger.session(
                        `Фоновое продление пропущено: другая вкладка уже выполняет обновление (lock: ${LOCK_NAME_SILENT_REFRESH})`
                    );
                    return;
                }
                await executeSilentRefresh();
            }).catch(err => {
                logger.warn('Ошибка Web Locks при тихом рефреше:', err);
            });
        } else {
            executeSilentRefresh();
        }
    }

    function handleSleepWakeupReset(timeSinceLastCheck) {
        if (timeSinceLastCheck <= SESSION_CHECK_INTERVAL_MS * 2.25) return;
        logger.session(
            `Обнаружен выход из спящего режима (простой ${(timeSinceLastCheck / 1000).toFixed(1)} сек.). Проверка и сброс состояния.`
        );
        if (isSilentRefreshing) {
            cleanupSilentRefresh();
        }
    }

    function tryRecoverFromCircuitBreaker(now) {
        if (!isCircuitBreakerOpen) return true;
        const accessToken = sessionStorage.getItem('access_token');
        const expiresAt = Number(sessionStorage.getItem('expires_at') || 0);
        if (accessToken && expiresAt > now + SESSION_REFRESH_THRESHOLD_SEC * 1000) {
            logger.session('Обнаружен новый валидный токен. Восстановление работы после Circuit Breaker.');
            resetCircuitBreaker();
            return true;
        }
        return false;
    }

    function handleMainTokenLifetimeGuard(isAutologinActive, mainStatus) {
        if (!mainStatus.hasToken || mainStatus.secondsLeft <= 0) {
            if (isAutologinActive) {
                logger.session(
                    `Основной токен истек (${formatTokenStatusSummary(mainStatus)}). Автовход активен (ADR-005): запуск фонового обновления 24ч+...`
                );
                triggerSilentRefresh();
            } else {
                logger.session(
                    `Основной токен истек или отсутствует (${formatTokenStatusSummary(mainStatus)}). Аварийная остановка фонового обновления.`
                );
                triggerCircuitBreaker();
            }
            return true;
        }

        if (isAutologinActive && mainStatus.secondsLeft <= SESSION_REFRESH_THRESHOLD_SEC) {
            logger.session(
                `Основной суточный токен скоро истекает (${mainStatus.secondsLeftFormatted} с). Автовход активен (ADR-005): запуск фонового обновления 24ч+...`
            );
            triggerSilentRefresh();
            return true;
        }

        return false;
    }

    // Мониторим здоровье токена каждые 20 секунд
    function monitorSessionHealth() {
        const now = Date.now();
        const timeSinceLastCheck = now - lastHealthCheckTimestamp;
        lastHealthCheckTimestamp = now;

        handleSleepWakeupReset(timeSinceLastCheck);
        if (!tryRecoverFromCircuitBreaker(now)) return;

        const isAutologinActive = document.querySelector('meta[name="modeus-sso-autologin"]')?.content === '1';
        const mainStatus = getMainTokenStatus();
        if (handleMainTokenLifetimeGuard(isAutologinActive, mainStatus)) return;

        const accessStatus = getAccessTokenStatus();
        if (refreshFailureCount >= SESSION_MAX_REFRESH_ATTEMPTS && (!accessStatus.hasToken || accessStatus.secondsLeft <= 0)) {
            triggerCircuitBreaker();
            return;
        }

        saveAuthTokensBackup();
        if (smartWaitTimer) return;

        if (!accessStatus.hasToken) {
            logger.session(`Мониторинг сессии: access_token не найден в sessionStorage | Основной: ${formatTokenStatusSummary(mainStatus)}`);
            return;
        }

        logger.session(
            `Токен: ${formatTokenStatusSummary(accessStatus)} [порог: ${SESSION_REFRESH_THRESHOLD_SEC} с] | Основной: ${formatTokenStatusSummary(mainStatus)}`
        );

        if (accessStatus.secondsLeft <= SESSION_REFRESH_THRESHOLD_SEC) {
            triggerSilentRefresh();
        }
    }

    saveAuthTokensBackup();
    sessionHealthInterval = setInterval(monitorSessionHealth, SESSION_CHECK_INTERVAL_MS);

    // Дополнительный предохранитель от сна ПК при возвращении пользователя на страницу
    const handleVisibilityChange = () => {
        if (document.visibilityState !== 'visible') return;
        const elapsed = Date.now() - refreshStartedAt;
        if (isSilentRefreshing && elapsed > SESSION_STUCK_TIMEOUT_MS) {
            cleanupSilentRefresh();
            recordRefreshFailure(
                `[MSE Session] Вкладка активирована, фоновый рефреш завис (> ${(SESSION_STUCK_TIMEOUT_MS / 1000)} сек.). Сброс состояния.`
            );
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Точная детекция кнопки выхода Modeus (<p-button icon="fa fa-sign-out" class="p-element logout-button">)
    const isLogoutElement = (target) => {
        if (!target || !(target instanceof Element)) return false;
        return Boolean(target.closest('p-button.logout-button, .logout-button, .fa-sign-out, [icon*="fa-sign-out"]'));
    };

    // Сброс постоянного бэкапа и уведомление о явном выходе пользователя («Выйти»)
    const handleLogoutClick = (e) => {
        if (isLogoutElement(e.target)) {
            try {
                localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
                document.dispatchEvent(new CustomEvent('mse:manual-logout'));
            } catch { }
        }
    };
    window.addEventListener('click', handleLogoutClick, true);

    // Логирование динамического изменения статуса автовхода из content.js
    const handleAutologinUpdated = (e) => {
        const isEnabled = Boolean(e?.detail?.isEnabled);
        logger.session(`Статус автовхода 24ч+ обновлен: ${isEnabled ? 'АКТИВЕН (1)' : 'отключен (0)'}`);
    };
    document.addEventListener('mse:autologin-updated', handleAutologinUpdated);

    // Межвкладочная синхронизация токенов сессии через Storage Event
    const handleAuthStorageSync = (e) => {
        if (e.key !== STORAGE_KEY_AUTH_BACKUP || !e.newValue) return;

        try {
            const backupData = JSON.parse(e.newValue);
            if (!backupData || typeof backupData !== 'object') return;

            AUTH_STORAGE_KEYS.forEach(key => {
                if (backupData[key] !== undefined && backupData[key] !== null) {
                    sessionStorage.setItem(key, String(backupData[key]));
                }
            });

            if (isSilentRefreshing) {
                cleanupSilentRefresh();
            }
            refreshFailureCount = 0;
            isCircuitBreakerOpen = false;
            if (smartWaitTimer) {
                clearTimeout(smartWaitTimer);
                smartWaitTimer = null;
            }

            logger.session('Сессионные токены синхронизированы из другой вкладки через storage event');
        } catch (err) {
            logger.warn('Ошибка синхронизации сессии из storage event:', err);
        }
    };
    window.addEventListener('storage', handleAuthStorageSync);

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

    const handleDatabasesUpdated = () => {
        initDatabases();
        logger.db('Базы данных переинициализированы после фонового обновления');
    };
    document.addEventListener('mse:databases-updated', handleDatabasesUpdated);

    const printDatabaseStatus = () => {
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
        if (sharedUtils?.readFriendsList) {
            return sharedUtils.readFriendsList(STORAGE_KEY_FRIENDS, (err) => {
                logger.warn('Ошибка чтения списка друзей из localStorage', err);
                try { localStorage.removeItem(STORAGE_KEY_FRIENDS); } catch { }
            });
        }
        return [];
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

    const syncMyPersonIdCache = (personId) => {
        if (!personId) return;
        let previousPersonId = myPersonId;
        try {
            previousPersonId = previousPersonId || localStorage.getItem(STORAGE_KEY_MY_PERSON_ID);
        } catch { }
        if (previousPersonId && String(previousPersonId).toLowerCase() !== String(personId).toLowerCase()) {
            mySpecialty = null;
            myProfile = null;
            try {
                localStorage.removeItem(STORAGE_KEY_MY_SPECIALTY);
                localStorage.removeItem(STORAGE_KEY_MY_PROFILE);
            } catch { }
        }
        myPersonId = personId;
        try {
            localStorage.setItem(STORAGE_KEY_MY_PERSON_ID, personId);
        } catch { }
    };

    try {
        const initialIdToken = sessionStorage.getItem('id_token');
        if (initialIdToken) {
            const initialClaims = parseJwt(initialIdToken);
            const initialJwtPersonId = initialClaims?.person_id || initialClaims?.sub;
            if (initialJwtPersonId) {
                syncMyPersonIdCache(initialJwtPersonId);
            }
        }
    } catch { }

    const getMyPersonId = () => {
        if (myPersonId) return myPersonId;
        try {
            const token = sessionStorage.getItem('id_token');
            if (token) {
                const claims = parseJwt(token);
                const resolvedId = claims.person_id || claims.sub || null;
                if (resolvedId) return resolvedId;
            }
        } catch { }
        return localStorage.getItem(STORAGE_KEY_MY_PERSON_ID) || null;
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

    const isViewingOwnSchedule = () => {
        const currentUserId = getMyPersonId();
        if (!currentUserId) return true;
        const activePersonId = getActiveCalendarPersonId(currentUserId);
        if (!activePersonId) return true;
        return String(activePersonId).toLowerCase() === String(currentUserId).toLowerCase();
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

    const dismissAddFriendGuide = () => {
        qs(`#${ID_SPOTLIGHT_OVERLAY}`)?.remove();
        qs(`#${ID_SPOTLIGHT_CARD}`)?.remove();
        qsa('.mse-spotlight-elevated').forEach(el => el.classList.remove('mse-spotlight-elevated'));
        document.removeEventListener('keydown', handleSpotlightKeydown);
    };

    const handleSpotlightKeydown = (event) => {
        if (event.key === 'Escape') {
            dismissAddFriendGuide();
        }
    };

    const isParticipantFilterPanel = (panel) => {
        if (!panel) return false;
        const participantMs = findParticipantMultiselect();
        if (participantMs) {
            const isParticipantOpen = participantMs.classList.contains('p-multiselect-open') ||
                !!participantMs.querySelector('.p-multiselect-open, input[aria-expanded="true"]');
            if (isParticipantOpen) return true;
        }
        return !!panel.querySelector('.mse-add-friend-btn');
    };

    const enhanceParticipantSearchPlaceholder = (targetPanel) => {
        const panel = targetPanel || qs('.p-multiselect-panel');
        if (!isParticipantFilterPanel(panel)) return;

        const input = qs('.search-field, .p-multiselect-filter, .p-multiselect-header input', panel);
        if (input && input.placeholder !== PARTICIPANT_SEARCH_HINT) {
            input.placeholder = PARTICIPANT_SEARCH_HINT;
        }
    };

    const calculateSpotlightCardPosition = (targetPanel, cardWidth = 310) => {
        const rect = targetPanel.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const offset = 14;

        let left = rect.right + offset;
        if (left + cardWidth > viewportWidth - 10) {
            left = Math.max(10, rect.left - cardWidth - offset);
        }

        let top = Math.max(12, rect.top);
        const estimatedCardHeight = 180;
        if (top + estimatedCardHeight > viewportHeight) {
            top = Math.max(12, viewportHeight - estimatedCardHeight - 10);
        }

        return { left: Math.round(left), top: Math.round(top) };
    };

    const createSpotlightCardElement = () => {
        const card = document.createElement('div');
        card.id = ID_SPOTLIGHT_CARD;
        card.className = 'mse-spotlight-card';
        card.innerHTML = `
            <div class="mse-spotlight-header">
                <div class="mse-spotlight-title">
                    <span class="mse-spotlight-title-icon">${SVG_HEART}</span>
                    <span>Как добавить друга</span>
                </div>
                <button id="mse-spotlight-close-btn" class="mse-spotlight-close-btn" title="Закрыть подсказку">×</button>
            </div>
            <div class="mse-spotlight-body">
                Введите имя или фамилию в поиске и нажмите <span class="mse-spotlight-inline-heart">${SVG_HEART}</span> напротив нужного человека. Он появится в списке ваших друзей!
            </div>
            <div class="mse-spotlight-footer">
                <button id="mse-spotlight-confirm-btn" class="mse-spotlight-confirm-btn">Понятно</button>
            </div>
        `;
        return card;
    };

    const showSpotlightGuidance = (targetPanel) => {
        dismissAddFriendGuide();

        const overlay = document.createElement('div');
        overlay.id = ID_SPOTLIGHT_OVERLAY;
        overlay.className = 'is-active';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dismissAddFriendGuide();
        });
        document.body.appendChild(overlay);

        targetPanel.classList.add('mse-spotlight-elevated');
        const overlayContainer = targetPanel.closest('.p-overlay') || targetPanel.parentElement;
        if (overlayContainer) {
            overlayContainer.classList.add('mse-spotlight-elevated');
        }

        const card = createSpotlightCardElement();
        document.body.appendChild(card);

        const pos = calculateSpotlightCardPosition(targetPanel);
        card.style.left = `${pos.left}px`;
        card.style.top = `${pos.top}px`;

        qs('#mse-spotlight-close-btn', card)?.addEventListener('click', dismissAddFriendGuide);
        qs('#mse-spotlight-confirm-btn', card)?.addEventListener('click', dismissAddFriendGuide);
        document.addEventListener('keydown', handleSpotlightKeydown);
    };

    const ensureCalendarFiltersOpen = async () => {
        const filterContainer = qs('mds-schedule-calendar-filter');
        const isFilterOpen = filterContainer && window.getComputedStyle(filterContainer).display !== 'none' && filterContainer.offsetHeight > 0;
        if (!isFilterOpen) {
            const filterBtn = qs('button.btn-filter');
            if (filterBtn) {
                filterBtn.click();
                await new Promise(resolve => setTimeout(resolve, DROPDOWN_EXPAND_DELAY_MS));
            }
        }
    };

    const findParticipantMultiselect = () => {
        const elements = qsa('mds-schedule-calendar-filter p-multiselect, form p-multiselect, p-multiselect');
        return elements.find(ms => {
            const text = (ms.textContent || '').toLowerCase();
            const placeholder = (ms.querySelector('.p-placeholder')?.textContent || '').toLowerCase();
            return text.includes('участник') || placeholder.includes('участник');
        }) || null;
    };

    const openParticipantDropdown = async (participantMs) => {
        const isOpen = !!participantMs.querySelector('.p-multiselect-open, input[aria-expanded="true"]');
        if (!isOpen) {
            const trigger = participantMs.querySelector('.p-multiselect-trigger') || participantMs.querySelector('.p-multiselect') || participantMs;
            trigger.click();
            await new Promise(resolve => setTimeout(resolve, DROPDOWN_EXPAND_DELAY_MS));
        }

        const panels = qsa('.p-multiselect-panel');
        return panels.find(p => p.offsetHeight > 0) || panels[0] || null;
    };

    const startAddFriendGuide = async () => {
        try {
            if (!window.location.href.includes('/schedule-calendar/')) {
                showToast('Перейдите в раздел «Мое расписание», чтобы добавить друга', 'info');
                return;
            }

            await ensureCalendarFiltersOpen();

            const participantMs = findParticipantMultiselect();
            if (!participantMs) {
                showToast('Фильтр участников не найден на странице', 'warning');
                return;
            }

            participantMs.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

            const panel = await openParticipantDropdown(participantMs);
            if (!panel) {
                showToast('Не удалось открыть список участников', 'warning');
                return;
            }

            enhanceParticipantSearchPlaceholder(panel);
            const searchInput = qs('.p-multiselect-panel .search-field') || qs('.p-multiselect-filter', panel);
            searchInput?.focus();

            showSpotlightGuidance(panel);
        } catch (err) {
            console.error('[MSE] Ошибка при запуске подсказки поиска друзей:', err);
            dismissAddFriendGuide();
        }
    };

    const updateReturnToMeButton = () => {
        const mainMenuContainer = qs('modeus-main-menu p-panelmenu > .p-panelmenu.p-component');
        if (!mainMenuContainer) return;

        const currentUserId = getMyPersonId();
        const shouldShow = Boolean(currentUserId && !isViewingOwnSchedule());
        const existingButton = qs(`#${ID_RETURN_TO_ME_MENU}`, mainMenuContainer);

        if (!shouldShow) {
            existingButton?.remove();
            return;
        }

        if (!existingButton) {
            const returnMenuPanel = document.createElement('div');
            returnMenuPanel.id = ID_RETURN_TO_ME_MENU;
            returnMenuPanel.className = 'p-panelmenu-panel ng-star-inserted';
            returnMenuPanel.innerHTML = `
                <div class="p-component p-panelmenu-header">
                    <a class="p-panelmenu-header-link ng-star-inserted" href="${generateFriendUrl(currentUserId)}" title="Вернуться к своему расписанию">
                        <span class="p-menuitem-icon mse-menu-icon ng-star-inserted">${SVG_USER_MENU}</span>
                        <span class="p-menuitem-text ng-star-inserted">Вернуться к себе</span>
                    </a>
                </div>`;

            const friendsMenuPanel = qs(`#${ID_FRIENDS_MENU}`, mainMenuContainer);
            if (friendsMenuPanel && friendsMenuPanel.nextElementSibling) {
                mainMenuContainer.insertBefore(returnMenuPanel, friendsMenuPanel.nextElementSibling);
            } else {
                mainMenuContainer.appendChild(returnMenuPanel);
            }
        }
    };

    const buildFriendsMenuHtml = (friends) => {
        const addFriendBtnHtml = `
            <li class="p-menuitem mse-add-friend-menuitem ng-star-inserted">
                <a role="button" class="p-menuitem-link mse-add-friend-action" id="${ID_OPEN_ADD_FRIEND_BTN}" title="Добавить друга">
                    <span class="mse-add-friend-icon">${SVG_USER_PLUS}</span>
                    <span class="p-menuitem-text">Добавить друга</span>
                </a>
            </li>`;

        const friendListHtml = friends.length > 0
            ? friends.map(friend => `
                <li class="p-menuitem ng-star-inserted" style="position: relative;">
                    <a role="treeitem" class="p-menuitem-link ng-star-inserted" href="${generateFriendUrl(friend.id)}" title="${escapeHtml(friend.fullName)}">
                        <span class="p-menuitem-text ng-star-inserted">${escapeHtml(friend.fullName)}</span>
                    </a>
                    <span class="mse-remove-friend-btn" data-id="${escapeHtml(friend.id)}" title="Удалить из друзей">×</span>
                </li>
            `).join('')
            : '<li class="p-menuitem ng-star-inserted"><a class="p-menuitem-link" style="opacity: 0.6; cursor: default;"><span class="p-menuitem-text">Нет друзей</span></a></li>';

        return `
            <div class="p-component p-panelmenu-header">
                <a class="p-panelmenu-header-link ng-star-inserted" tabindex="0">
                    <span class="p-menuitem-icon mse-menu-icon ng-star-inserted">${SVG_USER_GROUP}</span>
                    <span class="p-menuitem-text ng-star-inserted">Друзья</span>
                    <span class="p-panelmenu-icon pi pi-chevron-right ng-star-inserted"></span>
                </a>
            </div>
            <div class="p-toggleable-content" style="display: none; overflow: hidden;">
                <div class="p-panelmenu-content">
                    <ul class="p-submenu-list p-panelmenu-root-submenu">${addFriendBtnHtml}${friendListHtml}</ul>
                </div>
            </div>`;
    };

    const bindFriendsMenuEvents = (friendsMenuPanel) => {
        const header = qs('.p-panelmenu-header a', friendsMenuPanel);
        const content = qs('.p-toggleable-content', friendsMenuPanel);
        if (header && content) {
            header.addEventListener('click', (event) => {
                event.preventDefault();
                const isOpened = content.style.display !== 'none';
                content.style.display = isOpened ? 'none' : 'block';
                header.parentElement.classList.toggle('p-highlight', !isOpened);
                qs('.p-panelmenu-icon', header).classList.toggle('pi-chevron-down', !isOpened);
                qs('.p-panelmenu-icon', header).classList.toggle('pi-chevron-right', isOpened);
            });
        }

        qsa('.mse-remove-friend-btn', friendsMenuPanel).forEach(btn => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                removeFriend(btn.dataset.id);
            });
        });

        qs(`#${ID_OPEN_ADD_FRIEND_BTN}`, friendsMenuPanel)?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            startAddFriendGuide();
        });
    };

    const renderFriendsMenu = () => {
        const mainMenuContainer = qs('modeus-main-menu p-panelmenu > .p-panelmenu.p-component');
        if (!mainMenuContainer) return;

        qs(`#${ID_FRIENDS_MENU}`)?.remove();
        qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();

        const friendsMenuPanel = document.createElement('div');
        friendsMenuPanel.id = ID_FRIENDS_MENU;
        friendsMenuPanel.className = 'p-panelmenu-panel ng-star-inserted';
        friendsMenuPanel.innerHTML = buildFriendsMenuHtml(getFriends());
        mainMenuContainer.appendChild(friendsMenuPanel);

        updateReturnToMeButton();
        bindFriendsMenuEvents(friendsMenuPanel);
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
            feedbackDiv.innerHTML = `
                <div class="mse-feedback-title">Баги и отзывы (Enhancer):</div>
                <a class="mse-feedback-link" href="${FEEDBACK_BOT_URL}" target="_blank" rel="noopener noreferrer">
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

        let hasParticipantItems = false;
        for (const item of items) {
            const label = item.getAttribute('aria-label');
            if (!label) continue;

            const normalizedLabel = normalizeName(label);
            const person = lastSearchResults.get(normalizedLabel);

            if (!person || !person.id) { continue; }
            hasParticipantItems = true;

            const personId = person.id;
            const isFriend = friendIds.has(personId);

            let btn = item.querySelector('.mse-add-friend-btn');

            if (!btn) {
                const itemContent = item.querySelector('.item');
                if (!itemContent) continue;

                btn = document.createElement('span');
                btn.className = 'mse-add-friend-btn';
                itemContent.style.position = 'relative';
                itemContent.appendChild(btn);

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    const currentFriends = getFriends();
                    const isCurrentlyFriend = currentFriends.some(f => f.id === personId);

                    if (isCurrentlyFriend) {
                        removeFriend(personId);
                        btn.classList.remove('is-friend');
                        btn.innerHTML = SVG_HEART_OUTLINE;
                        btn.title = 'Добавить в друзья';
                    } else {
                        addFriend(personId, label);
                        btn.classList.add('is-friend');
                        btn.innerHTML = SVG_HEART;
                        btn.title = 'Удалить из друзей';
                    }
                });
            }

            btn.classList.toggle('is-friend', isFriend);
            btn.innerHTML = isFriend ? SVG_HEART : SVG_HEART_OUTLINE;
            btn.title = isFriend ? 'Удалить из друзей' : 'Добавить в друзья';
        }

        if (hasParticipantItems) {
            const panel = filterList.closest('.p-multiselect-panel');
            if (panel) enhanceParticipantSearchPlaceholder(panel);
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

        // Помечаем обработанные карточки расписания, чтобы не выполнять повторные проверки
        qsa('.fc-time-grid-event:not([data-mse-buildings-enhanced="1"])').forEach(card => {
            card.setAttribute('data-mse-buildings-enhanced', '1');
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

    const closeSelectedStudentsDropdown = () => {
        const cont = qs('#selected-students-container');
        if (cont) cont.style.display = 'none';
        const toggle = qs('#selected-students-toggle');
        if (toggle) toggle.classList.remove('is-open');
        const pill = qs('#selected-students-pill');
        if (pill) pill.classList.remove('is-open');
    };

    const handleOutsideSearchClick = (e) => {
        const container = qs(`#${ID_SEARCH_CONTAINER}`);
        if (container && !container.contains(e.target)) {
            const suggestions = qs('#search-suggestions', container);
            if (suggestions) suggestions.style.display = 'none';
            activeSuggestionIndex = -1;
        }

        const popoverWrapper = qs('#search-popover-wrapper');
        if (popoverWrapper && !popoverWrapper.contains(e.target)) {
            toggleSearchPopover(false);
        }

        const path = e.composedPath ? e.composedPath() : [];
        const isInsideDropdown = path.some(el => el && el.id === 'selected-students-dropdown-wrapper');
        const dropdown = qs('#selected-students-dropdown-wrapper');
        if (dropdown && !dropdown.contains(e.target) && !isInsideDropdown) {
            closeSelectedStudentsDropdown();
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
        isRestoringHighlights = false;
        if (engagementIntervalId) {
            clearInterval(engagementIntervalId);
            engagementIntervalId = null;
        }
        if (updateCheckInterval) {
            clearInterval(updateCheckInterval);
            updateCheckInterval = null;
        }
        cleanupSilentRefresh();

        // 2. Полное восстановление нативных прототипов и методов браузера
        window.fetch = nativeFetch;
        XMLHttpRequest.prototype.open = nativeXhrOpen;
        XMLHttpRequest.prototype.send = nativeXhrSend;
        history.pushState = nativePushState;

        try {
            localStorage.removeItem(STORAGE_KEY_AUTH_BACKUP);
        } catch { }

        // 3. Снятие глобальных обработчиков событий
        window.removeEventListener('popstate', processUrlChange);
        window.removeEventListener('click', handleLogoutClick, true);
        window.removeEventListener('storage', handleAuthStorageSync);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (handleEngagementVisibilityChange) {
            document.removeEventListener('visibilitychange', handleEngagementVisibilityChange);
        }
        cleanupNativePopoverObserver();
        cleanupCalendarResizeObserver();
        document.removeEventListener('click', handleOutsideSearchClick);
        document.removeEventListener('click', handleOutsideUpdateClick);
        document.removeEventListener('mse:databases-updated', handleDatabasesUpdated);
        document.removeEventListener('mse:autologin-updated', handleAutologinUpdated);

        // 4. Очистка внедрённых DOM-элементов и деактивация стилей
        dismissAddFriendGuide();
        document.body.classList.remove(CLASS_MSE_ACTIVE);
        document.body.classList.remove(CLASS_MSE_SEARCH_FILTERING_ACTIVE);
        qs(`#${ID_SEARCH_CONTAINER}`)?.remove();
        cachedSearchContainer = null;
        qs(`#${ID_TEACHER_TOOLTIP}`)?.remove();
        qs(`#${ID_STOP_BUTTON}`)?.remove();
        qs(`#${ID_TOAST_CONTAINER}`)?.remove();
        qs(`#${ID_FRIENDS_MENU}`)?.remove();
        qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();
        qs(`#${ID_SILENT_REFRESHER}`)?.remove();
        qs(`#${ID_UPDATE_ANCHOR}`)?.remove();
        qs(`#${ID_UPDATE_BADGE}`)?.remove();
        qs(`#${ID_UPDATE_POPUP}`)?.remove();
        qs(`#${ID_SURVEY_POPUP}`)?.remove();
        qs(`#${ID_FEEDBACK_FOOTER}`)?.remove();
        qs(`#${ID_OPEN_PE_BTN}`)?.remove();
        qs(`#${ID_SMART_PICKER_BANNER}`)?.remove();

        attendeesMemoryCache.clear();
        weekEventsCache.clear();
        eventCache.clear();
        uniqueStudents.clear();
        lastSearchResults.clear();
        lastActiveCalendarPersonId = null;
        lastCalendarParam = null;
        latestKnownUpdate = null;
        clearSearch();
        delete window.studentEnhancer;
        logger.debug('Скрипт полностью остановлен, нативные прототипы и таймеры очищены.');
    };

    const isSameStudyDirection = (studentInfo) => {
        if (!mySpecialty || !studentInfo?.specialtyName) return false;
        if (studentInfo.specialtyName !== mySpecialty) return false;
        return myProfile ? studentInfo.specialtyProfile === myProfile : true;
    };

    const renderAttendeeBadges = (studentInfo, isFriend, isCurrentUser) => {
        if (isCurrentUser) {
            return `<span title="Это вы" class="mse-attendee-badge mse-badge-me">${SVG_USER_ME}</span>`;
        }

        let badges = '';
        if (isFriend) {
            badges += `<span title="Ваш друг" class="mse-attendee-badge mse-badge-friend">${SVG_HEART}</span>`;
        }
        if (isSameStudyDirection(studentInfo)) {
            const tooltipText = myProfile
                ? `Обучается на вашем направлении и профиле (${myProfile})`
                : 'Обучается на вашем направлении';
            badges += `<span title="${escapeHtml(tooltipText)}" class="mse-attendee-badge mse-badge-direction">${SVG_GRADUATION_CAP}</span>`;
        }
        return badges;
    };

    const updateAttendeeSelectionHighlights = () => {
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));
        qsa('p[data-student-name]').forEach(p => {
            const studentName = p.getAttribute('data-student-name');
            const nameSpan = p.querySelector('.mse-student-name');
            if (nameSpan && studentName) {
                nameSpan.classList.toggle('mse-student-selected', normalizedSelected.has(studentName));
            }
        });
    };

    const enhanceStudentRows = () => {
        const friends = getFriends();
        const friendNames = new Set(friends.map(f => normalizeName(f.fullName)));
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));
        const myPersonId = getMyPersonId();

        qsa('p:not([data-enhanced])').forEach(p => {
            const nameOnPage = normalizeName(p.textContent);
            const studentInfo = uniqueStudents.get(nameOnPage);
            if (!studentInfo) return;

            const isFriend = friendNames.has(nameOnPage);
            const isCurrentUser = Boolean(studentInfo.id && studentInfo.id === myPersonId);
            const badges = renderAttendeeBadges(studentInfo, isFriend, isCurrentUser);
            const selectedClass = normalizedSelected.has(nameOnPage) ? ' mse-student-selected' : '';

            p.innerHTML = `${badges}<span class="mse-student-name${selectedClass}">${escapeHtml(studentInfo.fullName)}</span><span class="student-details">${escapeHtml(studentInfo.details)}</span>`;
            p.setAttribute('data-enhanced', 'true');
            p.setAttribute('data-student-name', nameOnPage);
        });
    };

    const enhanceTeacherTooltips = () => {
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
                    tooltip.innerHTML = `<div class="tooltip-empty">${getSvgIcon('circle-minus', { size: 14 })}<span>Отзывы об этом преподавателе отсутствуют</span></div>`;
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

    const enhanceLists = () => {
        enhanceStudentRows();
        enhanceTeacherTooltips();
    };

    const getMatchedStudentNames = (matchedKeys, uniqueStudentsMap) => {
        return matchedKeys.map(key => uniqueStudentsMap.get(key)?.fullName || key);
    };

    const getMatchedStudentsForEvent = (eventId, normalizedSelected = null) => {
        if (!eventId || !eventCache.has(eventId)) return [];
        const eventAttendees = eventCache.get(eventId).attendees;
        const selected = normalizedSelected || new Set([...selectedStudents].map(normalizeName));
        const matchedKeys = [...selected].filter(name => eventAttendees.has(name));
        return getMatchedStudentNames(matchedKeys, uniqueStudents);
    };

    const isShortCard = (cardElement) => {
        return cardElement.clientHeight <= SHORT_CARD_MAX_HEIGHT_PX ||
            cardElement.offsetHeight <= SHORT_CARD_MAX_HEIGHT_PX;
    };

    const doesExpandedBannerFit = (cardElement) => {
        if (!cardElement) return false;
        if (isShortCard(cardElement)) return false;

        const title = cardElement.querySelector('.fc-title');
        if (!title) return true;

        const titleRect = title.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        const estimatedBannerTop = cardRect.bottom - BANNER_HEIGHT_PX - BANNER_SAFETY_MARGIN_PX;

        return estimatedBannerTop >= titleRect.bottom + BANNER_SAFETY_MARGIN_PX;
    };

    const isTitleOverlappingWithBanner = (cardElement, isCompact, isShort) => {
        if (!isCompact || !cardElement) return false;
        const title = cardElement.querySelector('.fc-title');
        if (!title) return false;

        const titleRect = title.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();
        const safetyMargin = isShort ? 1 : BANNER_SAFETY_MARGIN_PX;
        const estimatedBannerTop = cardRect.bottom - BANNER_HEIGHT_PX - safetyMargin;

        return titleRect.bottom > estimatedBannerTop - 2;
    };

    const SVG_USERS_BADGE = getSvgIcon('users', { size: 11, strokeWidth: 2, style: 'flex-shrink: 0;' });

    const extractSurname = (fullName) => {
        if (!fullName) return '';
        const parts = fullName.trim().split(/\s+/);
        return parts[0] || fullName;
    };

    const formatShortBadgeHtml = (matchedStudents) => {
        return `${SVG_USERS_BADGE}<span>${matchedStudents.length}</span>`;
    };

    const formatExpandedBadgeHtml = (matchedStudents) => {
        const count = matchedStudents.length;
        const surnames = matchedStudents.map(extractSurname).join(', ');
        const text = count === 1 ? surnames : `${count} · ${surnames}`;
        return `${SVG_USERS_BADGE}<span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(text)}</span>`;
    };

    const updateCardLayout = (cardElement, matchedStudents) => {
        const banner = cardElement.querySelector('.mse-event-match-tooltip');
        if (!banner) return;

        banner.removeAttribute('title');

        const short = isShortCard(cardElement);
        if (short) {
            cardElement.classList.add(CLASS_SHORT_CARD);
        } else {
            cardElement.classList.remove(CLASS_SHORT_CARD);
        }

        // Если заголовок ранее был обрезан, временно снимаем CLASS_TITLE_CLIPPED,
        // чтобы объективно замерить естественную геометрию полного заголовка
        const hadTitleClipped = cardElement.classList.contains(CLASS_TITLE_CLIPPED);
        if (hadTitleClipped) {
            cardElement.classList.remove(CLASS_TITLE_CLIPPED);
        }

        const isCompact = short || !doesExpandedBannerFit(cardElement);
        const isTitleOverlapping = isTitleOverlappingWithBanner(cardElement, isCompact, short);

        // Синхронно восстанавливаем или выставляем итоговое состояние обрезания
        cardElement.classList.toggle(CLASS_TITLE_CLIPPED, isTitleOverlapping);

        const renderKey = `${isCompact ? (isTitleOverlapping ? 'c:o' : 'c') : 'e'}:${matchedStudents.join('|')}`;
        const currentRenderKey = banner.dataset?.mseRenderKey || banner.getAttribute('data-mse-render-key');

        if (currentRenderKey === renderKey) {
            return;
        }

        if (banner.dataset) {
            banner.dataset.mseRenderKey = renderKey;
        }
        banner.setAttribute('data-mse-render-key', renderKey);

        if (isCompact) {
            banner.className = 'mse-event-match-tooltip mse-compact-capsule';
            banner.innerHTML = formatShortBadgeHtml(matchedStudents);
        } else {
            banner.className = 'mse-event-match-tooltip friends-line-badge';
            banner.innerHTML = formatExpandedBadgeHtml(matchedStudents);
        }
    };

    const renderSharedAttendeeItem = (fullName) => {
        return `<div class="mse-shared-item">• ${escapeHtml(fullName)}</div>`;
    };

    const createSharedAttendeesSection = (matchedStudents) => {
        const count = matchedStudents.length;
        const headerTitle = count === 1
            ? 'С вами на паре:'
            : `С вами на паре (${count}):`;

        const section = document.createElement('div');
        section.className = CLASS_NATIVE_POPOVER_SHARED;
        section.innerHTML = `
            <div class="mse-shared-header">${SVG_USERS_BADGE} ${escapeHtml(headerTitle)}</div>
            <div class="mse-shared-list">${matchedStudents.map(renderSharedAttendeeItem).join('')}</div>
        `;
        return section;
    };

    const findTriggeringCard = (popoverWindow) => {
        if (popoverWindow.id) {
            const cardByAria = document.querySelector(`[aria-describedby="${popoverWindow.id}"]`);
            if (cardByAria) return cardByAria.closest('.fc-time-grid-event') || cardByAria;
        }
        if (hoveredHighlightedEventId) {
            return document.querySelector(`.fc-time-grid-event.search-highlight[data-event-id="${hoveredHighlightedEventId}"]`);
        }
        return null;
    };

    const enrichNativePopover = (popoverWindow) => {
        if (!popoverWindow || popoverWindow.hasAttribute('data-mse-popover-enriched')) return;

        const tryEnrich = () => {
            const container = popoverWindow.querySelector('.popover-event');
            if (!container) return false;
            if (container.querySelector(`.${CLASS_NATIVE_POPOVER_SHARED}`)) return true;

            const card = findTriggeringCard(popoverWindow);
            if (!card || !card.classList.contains('search-highlight')) return true;

            const eventId = card.getAttribute('data-event-id');
            const matchedStudents = getMatchedStudentsForEvent(eventId);
            if (matchedStudents.length === 0) return true;

            const sharedSection = createSharedAttendeesSection(matchedStudents);
            container.appendChild(sharedSection);
            popoverWindow.setAttribute('data-mse-popover-enriched', 'true');
            return true;
        };

        if (!tryEnrich()) {
            setTimeout(tryEnrich, 20);
        }
    };

    const handleCardMouseOver = (e) => {
        const card = e.target.closest('.fc-time-grid-event');
        hoveredHighlightedEventId = (card && card.classList.contains('search-highlight'))
            ? card.getAttribute('data-event-id')
            : null;
    };

    const handleBodyMutations = (mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.tagName === 'NGB-POPOVER-WINDOW') {
                    enrichNativePopover(node);
                } else if (node.querySelector) {
                    const nestedPopover = node.querySelector('ngb-popover-window');
                    if (nestedPopover) enrichNativePopover(nestedPopover);
                }
            }
        }
    };

    const setupNativePopoverObserver = () => {
        if (nativePopoverObserver) return;
        document.addEventListener('mouseover', handleCardMouseOver, true);
        nativePopoverObserver = new MutationObserver(handleBodyMutations);
        nativePopoverObserver.observe(document.body, { childList: true, subtree: true });
    };

    const cleanupNativePopoverObserver = () => {
        if (nativePopoverObserver) {
            nativePopoverObserver.disconnect();
            nativePopoverObserver = null;
        }
        document.removeEventListener('mouseover', handleCardMouseOver, true);
        hoveredHighlightedEventId = null;
    };

    const clearCardHighlight = (card) => {
        card.classList.remove('search-highlight', 'search-fade', CLASS_SHORT_CARD, CLASS_TITLE_CLIPPED);
        card.removeAttribute('title');
        card.querySelectorAll('.mse-event-match-tooltip').forEach(el => el.remove());
    };

    const highlightSingleCard = (card, normalizedSelected) => {
        const eventId = card.getAttribute('data-event-id');
        const matchedStudents = getMatchedStudentsForEvent(eventId, normalizedSelected);

        if (matchedStudents.length === 0) {
            const isAlreadyFaded = card.classList.contains('search-fade') &&
                !card.classList.contains('search-highlight') &&
                !card.querySelector('.mse-event-match-tooltip');
            if (isAlreadyFaded) return;

            clearCardHighlight(card);
            card.classList.add('search-fade');
            return;
        }

        card.classList.remove('search-fade');
        card.classList.add('search-highlight');

        let banner = card.querySelector('.mse-event-match-tooltip');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'mse-event-match-tooltip';
            const container = card.querySelector('.fc-content') || card;
            container.appendChild(banner);
        }

        // Всегда вызываем updateCardLayout для адаптации геометрии (например, при сужении сетки)
        updateCardLayout(card, matchedStudents);
    };

    const refreshCardCompression = () => {
        if (selectedStudents.size === 0) return;
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));
        qsa('.fc-time-grid-event.search-highlight').forEach(card => {
            const eventId = card.getAttribute('data-event-id');
            const matchedStudents = getMatchedStudentsForEvent(eventId, normalizedSelected);
            if (matchedStudents.length > 0) {
                updateCardLayout(card, matchedStudents);
            }
        });
    };

    const toggleSearchPopover = (forceState) => {
        const popover = qs(`#${ID_SEARCH_POPOVER}`);
        const toggleBtn = qs(`#${ID_SEARCH_TOGGLE_BTN}`);
        if (!popover || !toggleBtn) return;
        const container = qs(`#${ID_SEARCH_CONTAINER}`);
        if (!container || !container.classList.contains('is-compact')) return;

        const isOpen = forceState !== undefined ? Boolean(forceState) : !popover.classList.contains('is-open');
        popover.classList.toggle('is-open', isOpen);
        toggleBtn.classList.toggle('is-active', isOpen);
        if (isOpen) {
            closeSelectedStudentsDropdown();
            const input = qs(`#${ID_SEARCH_INPUT}`);
            if (input && typeof input.focus === 'function') input.focus();
        } else {
            const suggestions = qs('#search-suggestions');
            if (suggestions) suggestions.style.display = 'none';
        }
    };

    const calculateAvailableToolbarSpace = (toolbar) => {
        const target = toolbar || qs('.fc-toolbar') || qs('.fc-header-toolbar') || qs('.main-calendar-form');
        if (!target) return 1000;

        const fcLeft = qs('.fc-left', target) || qs('.fc-left');
        const filterBtn = qs('.btn-filter', target) || qs('.btn-filter');
        const fcRight = qs('.fc-right', target) || qs('.fc-right');

        const targetRect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        const targetRight = (targetRect && targetRect.right) || (target.clientWidth || 1200);

        const leftRect = fcLeft && fcLeft.getBoundingClientRect ? fcLeft.getBoundingClientRect() : null;
        let leftBoundary = (leftRect && leftRect.right > 0) ? leftRect.right : (targetRect ? targetRect.left + 270 : 270);

        let rightBoundary = targetRight;
        if (filterBtn && filterBtn.getBoundingClientRect) {
            const fRect = filterBtn.getBoundingClientRect();
            if (fRect.left > 0) rightBoundary = fRect.left;
        } else if (fcRight && fcRight.getBoundingClientRect) {
            const rRect = fcRight.getBoundingClientRect();
            if (rRect.left > 0) rightBoundary = rRect.left;
        } else {
            rightBoundary = targetRight - 215;
        }

        return Math.max(0, rightBoundary - leftBoundary - 16);
    };

    const calculateAvailableFormSpace = calculateAvailableToolbarSpace;

    const updateSearchCompactState = () => {
        const container = qs(`#${ID_SEARCH_CONTAINER}`);
        const fcToolbar = qs('.fc-toolbar') || qs('.fc-header-toolbar');
        const form = qs('.main-calendar-form');
        if (!container) return;

        const toolbar = fcToolbar || form;
        if (fcToolbar && container.parentElement !== fcToolbar) {
            if (window.getComputedStyle && window.getComputedStyle(fcToolbar).position === 'static') {
                fcToolbar.style.position = 'relative';
            }
            fcToolbar.appendChild(container);
        }

        container.classList.add(CLASS_IN_CALENDAR_TOOLBAR);

        const freeSpace = calculateAvailableToolbarSpace(toolbar);
        const hasSelected = selectedStudents.size > 0;

        // Пороги переключения:
        // Полный вид: полный инпут + полный лейбл Выбрано: N
        const fullRequired = hasSelected ? 440 : 270;
        // Ступень А: кнопка-лупа [🔍] + полный лейбл Выбрано: N
        const compactWithLabelRequired = hasSelected ? 300 : 125;

        if (freeSpace >= fullRequired) {
            const wasCompact = container.classList.contains(CLASS_IS_COMPACT);
            container.classList.remove(CLASS_IS_COMPACT);
            container.classList.remove(CLASS_IS_ULTRA_COMPACT);
            if (wasCompact) {
                toggleSearchPopover(false);
            }
        } else if (freeSpace >= compactWithLabelRequired) {
            container.classList.add(CLASS_IS_COMPACT);
            container.classList.remove(CLASS_IS_ULTRA_COMPACT);
        } else {
            // Ступень Б: лупа [🔍] + скрытый лейбл N ▾ | ×
            container.classList.add(CLASS_IS_COMPACT);
            container.classList.add(CLASS_IS_ULTRA_COMPACT);
        }

        // Выравнивание перед кнопкой Фильтры / Неделя
        if (fcToolbar) {
            const filterBtn = qs('.btn-filter', fcToolbar) || qs('.btn-filter');
            const fcRight = qs('.fc-right', fcToolbar) || qs('.fc-right');
            let rightOffset = 220;
            if (filterBtn && (filterBtn.offsetParent || filterBtn.getBoundingClientRect)) {
                const tRect = fcToolbar.getBoundingClientRect ? fcToolbar.getBoundingClientRect() : null;
                const fRect = filterBtn.getBoundingClientRect ? filterBtn.getBoundingClientRect() : null;
                if (tRect && fRect && tRect.right > 0 && fRect.left > 0) {
                    rightOffset = Math.max(12, Math.round(tRect.right - fRect.left) + 12);
                }
            } else if (fcRight) {
                const w = fcRight.offsetWidth || (fcRight.getBoundingClientRect ? fcRight.getBoundingClientRect().width : 106);
                rightOffset = Math.max(12, Math.round(w) + 16);
            }
            container.style.right = `${rightOffset}px`;
        }
    };

    const handleCalendarResize = () => {
        updateSearchCompactState();
        clearTimeout(calendarResizeDebounceTimer);
        calendarResizeDebounceTimer = setTimeout(refreshCardCompression, 100);
    };

    const setupCalendarResizeObserver = () => {
        const formTarget = qs('.main-calendar-form');
        const viewTarget = qs('.fc-view-container') || qs('.fc-time-grid');
        const toolbarTarget = qs('.fc-toolbar') || qs('.fc-header-toolbar');

        if (!formTarget && !viewTarget && !toolbarTarget) return;

        const target = viewTarget || formTarget;
        if (calendarResizeObserver && observedCalendarTarget === target && target.isConnected) return;

        cleanupCalendarResizeObserver();
        observedCalendarTarget = target;
        calendarResizeObserver = new ResizeObserver(handleCalendarResize);
        if (viewTarget && viewTarget.isConnected) calendarResizeObserver.observe(viewTarget);
        if (toolbarTarget && toolbarTarget.isConnected) calendarResizeObserver.observe(toolbarTarget);

        window.removeEventListener('resize', handleCalendarResize);
        window.addEventListener('resize', handleCalendarResize);
        updateSearchCompactState();
    };

    const cleanupCalendarResizeObserver = () => {
        if (calendarResizeObserver) {
            calendarResizeObserver.disconnect();
            calendarResizeObserver = null;
        }
        window.removeEventListener('resize', handleCalendarResize);
        clearTimeout(calendarResizeDebounceTimer);
        calendarResizeDebounceTimer = null;
        observedCalendarTarget = null;
    };

    const highlightEventsForStudents = () => {
        const isFilteringActive = selectedStudents.size > 0;
        document.body.classList.toggle(CLASS_MSE_SEARCH_FILTERING_ACTIVE, isFilteringActive);
        updateAttendeeSelectionHighlights();
        if (!isFilteringActive) {
            clearHighlight();
            return;
        }
        const normalizedSelected = new Set([...selectedStudents].map(normalizeName));
        qsa('.fc-time-grid-event').forEach(card => highlightSingleCard(card, normalizedSelected));
    };

    const clearHighlight = () => {
        document.body.classList.remove(CLASS_MSE_SEARCH_FILTERING_ACTIVE);
        qsa('.fc-time-grid-event').forEach(clearCardHighlight);
        updateAttendeeSelectionHighlights();
    };

    const clearSearch = () => {
        const searchInput = qs(`#${ID_SEARCH_INPUT}`);
        if (searchInput) searchInput.value = '';
        const suggestions = qs('#search-suggestions');
        if (suggestions) suggestions.style.display = 'none';
        selectedStudents.clear();
        document.body.classList.remove(CLASS_MSE_SEARCH_FILTERING_ACTIVE);
        toggleSearchPopover(false);
        updateSelectedStudentsDisplay();
        clearHighlight();
        updateAttendeeSelectionHighlights();
    };

    const formatStudentDisplayNameHtml = (fullName) => {
        return escapeHtml(fullName || '');
    };

    const updateSelectedStudentsDisplay = () => {
        const wrapper = qs('#selected-students-dropdown-wrapper');
        const container = qs('#selected-students-container');
        const countSpan = qs('#selected-count');
        if (!container || !wrapper) return;

        if (selectedStudents.size > 0) {
            wrapper.style.display = 'block';
            if (countSpan) countSpan.textContent = selectedStudents.size;
            container.innerHTML = [...selectedStudents].map(name =>
                `<div class="selected-item selected-student-tag">` +
                `<span class="selected-student-name" title="${escapeHtml(name)}">${formatStudentDisplayNameHtml(name)}</span>` +
                `<button class="selected-item-remove remove-student-btn" data-name="${escapeHtml(name)}" title="Убрать из поиска">` +
                getSvgIcon('x', { size: 14, strokeWidth: 2.2 }) +
                `</button>` +
                `</div>`
            ).join('');
        } else {
            wrapper.style.display = 'none';
            container.innerHTML = '';
            closeSelectedStudentsDropdown();
        }
        updateSearchCompactState();
    };

    const selectStudentSuggestion = (studentName) => {
        if (!studentName) return;
        selectedStudents.add(studentName);
        const searchInput = qs(`#${ID_SEARCH_INPUT}`);
        if (searchInput) searchInput.value = '';
        const suggestionsBox = qs('#search-suggestions');
        if (suggestionsBox) {
            suggestionsBox.style.display = 'none';
            suggestionsBox.innerHTML = '';
        }
        activeSuggestionIndex = -1;
        toggleSearchPopover(false);
        updateSelectedStudentsDisplay();
        highlightEventsForStudents();
    };

    const updateActiveSuggestion = (items, index) => {
        items.forEach((item, i) => {
            const isActive = i === index;
            item.classList.toggle('is-active', isActive);
            if (isActive) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    const handleSearchKeydown = (e) => {
        if (e.key === 'Escape') {
            const suggestionsBox = qs('#search-suggestions');
            if (suggestionsBox) suggestionsBox.style.display = 'none';
            activeSuggestionIndex = -1;
            toggleSearchPopover(false);
            return;
        }

        const suggestionsBox = qs('#search-suggestions');
        if (!suggestionsBox || suggestionsBox.style.display === 'none') return;

        const items = qsa('.suggestion-item', suggestionsBox);
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
            updateActiveSuggestion(items, activeSuggestionIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = activeSuggestionIndex <= 0 ? items.length - 1 : activeSuggestionIndex - 1;
            updateActiveSuggestion(items, activeSuggestionIndex);
        } else if (e.key === 'Enter') {
            const targetIndex = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
            if (items[targetIndex]) {
                e.preventDefault();
                selectStudentSuggestion(items[targetIndex].getAttribute('data-name'));
            }
        }
    };

    const updateSuggestions = (e) => {
        activeSuggestionIndex = -1;
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

    async function runWithConcurrency(taskFns, limit = 5) {
        if (!taskFns || taskFns.length === 0) return [];
        const results = new Array(taskFns.length);
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < taskFns.length) {
                const currentIndex = nextIndex++;
                results[currentIndex] = await taskFns[currentIndex]();
            }
        };
        const workerCount = Math.min(limit, taskFns.length);
        await Promise.all(Array.from({ length: workerCount }, worker));
        return results;
    }

    async function fetchEventAttendees(eventId, token) {
        try {
            const res = await fetch(`${API_CALENDAR_EVENTS}/${eventId}/attendees`, {
                headers: { authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                return Array.isArray(data) ? data : [];
            }
        } catch (e) {
            logger.warn(`Ошибка загрузки участников события ${eventId}:`, e);
        }
        return null;
    }

    const saveWeekEventsToCache = (cacheKey, eventsData) => {
        if (!cacheKey || !eventsData) return;
        if (weekEventsCache.has(cacheKey)) {
            weekEventsCache.delete(cacheKey);
        } else if (weekEventsCache.size >= CALENDAR_CACHE_MAX_ENTRIES) {
            const oldestKey = weekEventsCache.keys().next().value;
            weekEventsCache.delete(oldestKey);
        }
        weekEventsCache.set(cacheKey, { eventsData, timestamp: Date.now() });
    };

    const getWeekEventsFromCache = (cacheKey) => {
        if (!cacheKey) return null;
        const entry = weekEventsCache.get(cacheKey);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CALENDAR_CACHE_TTL_MS) {
            weekEventsCache.delete(cacheKey);
            return null;
        }
        weekEventsCache.delete(cacheKey);
        weekEventsCache.set(cacheKey, entry);
        return entry.eventsData;
    };

    const parseWeekRangeFromDateString = (dateStr) => {
        if (typeof dateStr !== 'string') return null;
        const parts = dateStr.trim().split('-');
        if (parts.length !== 3) return null;
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;

        const targetDate = new Date(Date.UTC(year, month - 1, day));
        if (isNaN(targetDate.getTime())) return null;

        const dayOfWeek = targetDate.getUTCDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

        const mondayDate = new Date(targetDate);
        mondayDate.setUTCDate(targetDate.getUTCDate() + diffToMonday);

        const sundayDate = new Date(mondayDate);
        sundayDate.setUTCDate(mondayDate.getUTCDate() + 6);

        const formatUtcYmd = (d) => {
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dayNum = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${dayNum}`;
        };

        const mondayYmd = formatUtcYmd(mondayDate);
        const sundayYmd = formatUtcYmd(sundayDate);

        return {
            timeMin: `${mondayYmd}T00:00:00Z`,
            timeMax: `${sundayYmd}T23:59:59Z`,
            mondayYmd,
            sundayYmd
        };
    };

    const getWeekTimeRange = (calendarParam) => {
        if (calendarParam) {
            try {
                const parsed = JSON.parse(calendarParam);
                if (parsed && typeof parsed.date === 'string') {
                    const range = parseWeekRangeFromDateString(parsed.date);
                    if (range) return range;
                }
            } catch (e) {
                // Игнорируем ошибку парсинга, используем фолбэк на DOM
            }
        }

        const dateHeaders = qsa('.fc-day-header[data-date]');
        if (dateHeaders.length >= 1) {
            const mondayYmd = dateHeaders[0].getAttribute('data-date');
            const sundayYmd = dateHeaders[dateHeaders.length - 1].getAttribute('data-date');
            return {
                timeMin: `${mondayYmd}T00:00:00Z`,
                timeMax: `${sundayYmd}T23:59:59Z`,
                mondayYmd,
                sundayYmd
            };
        }

        return null;
    };

    const fetchOrGetCachedWeekEvents = async ({ token, activePersonId, weekRange, statusEl }) => {
        const { timeMin, timeMax, mondayYmd } = weekRange;
        const weekCacheKey = `${activePersonId}_${mondayYmd}`;
        const cachedData = getWeekEventsFromCache(weekCacheKey);
        if (cachedData) {
            return { eventsData: cachedData, fromWeekCache: true };
        }

        if (statusEl) statusEl.textContent = '1/2: Загрузка событий...';
        const eventsResponse = await fetch(API_CALENDAR_SEARCH, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ size: 500, timeMin, timeMax, attendeePersonId: [activePersonId] })
        });
        if (!eventsResponse.ok) {
            throw new Error(`Ошибка API (события): ${eventsResponse.status}`);
        }
        const eventsData = await eventsResponse.json();
        saveWeekEventsToCache(weekCacheKey, eventsData);
        return { eventsData, fromWeekCache: false };
    };

    const recordStudentProfileFromAttendee = (attendee, myJwtPersonId) => {
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
            if (attendee.specialtyProfile && attendee.specialtyProfile !== attendee.specialtyName) {
                details += ` : ${attendee.specialtyProfile}`;
            }

            uniqueStudents.set(normalized, {
                id: attendee.personId,
                fullName: attendee.fullName,
                details,
                specialtyName: attendee.specialtyName ? attendee.specialtyName.trim() : null,
                specialtyProfile: attendee.specialtyProfile ? attendee.specialtyProfile.trim() : null
            });
        }
        return normalized;
    };

    const collectWeekEventAttendees = async ({ events, token, myJwtPersonId, courseUnitMap, statusEl, fromWeekCache }) => {
        if (statusEl && !fromWeekCache) statusEl.textContent = `2/2: Загрузка студентов (0/${events.length})`;

        eventCache.clear();
        uniqueStudents.clear();

        const cachedResults = [];
        const fetchTasks = [];
        let loadedCount = 0;

        events.forEach(calendarEvent => {
            if (attendeesMemoryCache.has(calendarEvent.id)) {
                cachedResults.push({ calendarEvent, attendees: attendeesMemoryCache.get(calendarEvent.id) });
                loadedCount++;
                return;
            }
            fetchTasks.push(async () => {
                const attendees = await fetchEventAttendees(calendarEvent.id, token);
                if (attendees !== null) {
                    attendeesMemoryCache.set(calendarEvent.id, attendees);
                }
                loadedCount++;
                if (statusEl) statusEl.textContent = `2/2: Загрузка студентов (${loadedCount}/${events.length})`;
                return { calendarEvent, attendees: attendees || [] };
            });
        });

        if (statusEl && loadedCount > 0 && !fromWeekCache) {
            statusEl.textContent = `2/2: Загрузка студентов (${loadedCount}/${events.length})`;
        }

        const fetchedResults = await runWithConcurrency(fetchTasks, CALENDAR_ATTENDEES_CONCURRENCY);
        const allResults = [...cachedResults, ...fetchedResults];

        allResults.forEach(({ calendarEvent, attendees }) => {
            const studentList = new Set();
            attendees.forEach(attendee => {
                if (attendee.roleId === 'STUDENT') {
                    studentList.add(recordStudentProfileFromAttendee(attendee, myJwtPersonId));
                }
            });
            const courseUnitId = calendarEvent._links['course-unit-realization'].href.split('/').pop();
            const moduleShortName = courseUnitMap.get(courseUnitId) || '';
            eventCache.set(calendarEvent.id, {
                name: calendarEvent.name,
                fullDisplayName: `${moduleShortName} / ${calendarEvent.name}`,
                startsAtLocal: calendarEvent.startsAtLocal,
                attendees: studentList
            });
        });

        logger.calendar(
            `Этап 2: участники загружены (из памяти: ${cachedResults.length}, по сети: ${fetchedResults.length}, уникальных студентов: ${uniqueStudents.size})`
        );
    };

    const loadAllData = async () => {
        const statusEl = qs('#search-status');
        const controlsEl = qs('#search-controls');
        const refreshBtn = qs('#refresh-data-btn');
        const refreshIcon = refreshBtn ? refreshBtn.querySelector('svg') : null;
        try {
            if (refreshIcon) refreshIcon.classList.add('mse-spinning-icon');
            if (refreshBtn) refreshBtn.classList.add('is-loading');
            if (controlsEl && controlsEl.style.display === 'none') controlsEl.style.display = 'flex';

            const token = sessionStorage.getItem('id_token');
            if (!token) throw new Error('Токен не найден.');
            const myJwtPersonId = parseJwt(token).person_id || parseJwt(token).sub;
            syncMyPersonIdCache(myJwtPersonId);

            const activePersonId = getActiveCalendarPersonId(myJwtPersonId);
            if (activePersonId !== lastActiveCalendarPersonId) {
                attendeesMemoryCache.clear();
                weekEventsCache.clear();
                lastActiveCalendarPersonId = activePersonId;
            }

            const calendarParam = new URL(window.location.href).searchParams.get('calendar');
            const weekRange = getWeekTimeRange(calendarParam);
            if (!weekRange) {
                if (statusEl) statusEl.textContent = 'Календарь не загружен.';
                if (controlsEl) controlsEl.style.display = 'flex';
                return;
            }

            const { eventsData, fromWeekCache } = await fetchOrGetCachedWeekEvents({ token, activePersonId, weekRange, statusEl });
            const events = eventsData._embedded?.events || [];
            logger.calendar(
                `Этап 1: загружено ${events.length} событий на неделю (${weekRange.timeMin.slice(0, 10)} — ${weekRange.timeMax.slice(0, 10)})${fromWeekCache ? ' (из памяти)' : ''}`
            );

            if (events.length === 0) {
                if (statusEl) statusEl.textContent = 'Событий на неделе нет.';
                if (controlsEl) controlsEl.style.display = 'flex';
                eventCache.clear();
                uniqueStudents.clear();
                return;
            }

            const courseUnits = eventsData._embedded?.['course-unit-realizations'] || [];
            const courseUnitMap = new Map(courseUnits.map(courseUnit => [courseUnit.id, courseUnit.nameShort]));

            await collectWeekEventAttendees({ events, token, myJwtPersonId, courseUnitMap, statusEl, fromWeekCache });

            const linkedCount = linkDomEventsToCache();
            logger.calendar(`Этап 3: завершена привязка к DOM (привязано ${linkedCount} карточек событий)`);

            if (statusEl) {
                statusEl.style.display = 'none';
                statusEl.classList.remove('is-error');
            }
            if (controlsEl) controlsEl.style.display = 'flex';
            if (selectedStudents.size > 0) {
                updateSelectedStudentsDisplay();
                highlightEventsForStudents();
            } else {
                updateSearchCompactState();
            }
            showSurveyIfEligible();
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = `Ошибка: ${err.message}`;
                statusEl.classList.add('is-error');
            }
            if (controlsEl) controlsEl.style.display = 'flex';
            logger.error('Критическая ошибка загрузки данных расписания:', err);
        } finally {
            if (refreshIcon) refreshIcon.classList.remove('mse-spinning-icon');
            if (refreshBtn) refreshBtn.classList.remove('is-loading');
        }
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

    const resolveLatestRelease = async (forceNetwork = false, { isManual = false } = {}) => {
        if (!forceNetwork) {
            const cached = getCachedReleaseInfo();
            if (cached.isFresh && cached.release) {
                if (isManual) {
                    const minutesAgo = Math.round(cached.ageMs / 60000);
                    const minutesLeft = Math.round((UPDATE_CHECK_INTERVAL_MS - cached.ageMs) / 60000);
                    const version = cached.release.tag_name || 'неизвестно';
                    logger.update(
                        `Использован кэш недавней проверки (проверено ${minutesAgo} мин. назад, след. запрос через ${minutesLeft} мин.). Релиз на GitHub: ${version}`
                    );
                }
                return { release: cached.release, fromCache: true };
            }
        }
        const release = await fetchLatestReleaseFromGitHub();
        return { release, fromCache: false };
    };

    const cleanMarkdownText = (raw) => {
        return raw
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .trim();
    };

    const extractHighlightsSection = (body) => {
        const pairedMatch = /<!--\s*highlights\b[^>]*-->([\s\S]*?)<!--\s*\/highlights\s*-->/i.exec(body);
        if (pairedMatch) {
            return { text: pairedMatch[1], isExplicit: true };
        }
        const commentMatch = /<!--\s*highlights\b([\s\S]*?)-->/i.exec(body);
        if (commentMatch) {
            return { text: commentMatch[1], isExplicit: true };
        }
        return { text: body, isExplicit: false };
    };

    const extractReleaseHighlights = (body) => {
        if (!body || typeof body !== 'string') return [];

        const { text, isExplicit } = extractHighlightsSection(body);
        const lines = text.split(/\r?\n/);
        const maxItems = isExplicit ? 4 : 3;
        const items = [];

        for (const line of lines) {
            const bulletMatch = line.trim().match(/^[-*•]\s+(.+)$/);
            if (bulletMatch) {
                const cleaned = cleanMarkdownText(bulletMatch[1]);
                if (cleaned) {
                    items.push(cleaned);
                    if (items.length >= maxItems) break;
                }
            }
        }

        return items;
    };

    const getUpdateNoticeState = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_UPDATE_NOTICE);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null) {
                return {
                    version: String(parsed.version || ''),
                    dismissedAt: Number(parsed.dismissedAt || 0),
                    dismissCount: Number(parsed.dismissCount || 0),
                    snoozedUntil: Number(parsed.snoozedUntil || 0)
                };
            }
        } catch {
            // Подавление ошибок парсинга данных обновления
        }
        return null;
    };

    const saveUpdateNoticeState = (state) => {
        try {
            localStorage.setItem(STORAGE_KEY_UPDATE_NOTICE, JSON.stringify(state));
        } catch {
            // Подавление ошибок квоты или приватного режима
        }
    };

    const recordUpdateDismiss = (version) => {
        const current = getUpdateNoticeState();
        const isSame = current && current.version === version;
        const dismissCount = isSame ? current.dismissCount + 1 : 1;
        const state = {
            version,
            dismissedAt: Date.now(),
            dismissCount,
            snoozedUntil: 0 // Сбрасываем 12-часовую паузу при явном действии на 72ч
        };
        saveUpdateNoticeState(state);
        return state;
    };

    const recordUpdateOutsideClick = (version) => {
        const current = getUpdateNoticeState();
        const isSame = current && current.version === version;
        const state = {
            version,
            dismissedAt: isSame ? current.dismissedAt : 0,
            dismissCount: isSame ? current.dismissCount : 0,
            snoozedUntil: Date.now() + UPDATE_OUTSIDE_SNOOZE_DURATION_MS
        };
        saveUpdateNoticeState(state);
        return state;
    };

    const formatReminderDateTime = (timestamp) => {
        const d = new Date(timestamp);
        const pad = (n) => String(n).padStart(2, '0');
        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        return `${day}.${month}.${year} в ${hours}:${minutes}`;
    };

    const logUpdateSnooze = (state) => {
        const snoozeHours = Math.round(UPDATE_SNOOZE_DURATION_MS / (60 * 60 * 1000));
        const nextReminderTimestamp = state.dismissedAt + UPDATE_SNOOZE_DURATION_MS;
        const nextDateStr = formatReminderDateTime(nextReminderTimestamp);

        const message = state.dismissCount === 1
            ? `Показ обновления v${state.version} отложен на ${snoozeHours} ч. (3 суток). Следующее напоминание: ${nextDateStr}.`
            : `Показ обновления v${state.version} отложен повторно (нажатий «Позже»: ${state.dismissCount}). Автоматический показ отключен. Обновление доступно по кнопке в шапке.`;

        logger.update(message);
        if (!isDebug()) {
            console.log(`[MSE Update] ${message}`);
        }
    };

    const logUpdateOutsideClick = (state) => {
        const nextDateStr = formatReminderDateTime(state.snoozedUntil);
        const message = `Поповер обновления закрыт кликом вне окна. Автопоказ приостановлен на 12 часов (до ${nextDateStr}, без переноса на 72 ч).`;
        logger.update(message);
        if (!isDebug()) {
            console.log(`[MSE Update] ${message}`);
        }
    };

    const markUpdateAutoOpened = () => {
        try {
            sessionStorage.setItem(SESSION_KEY_UPDATE_AUTO_OPENED, '1');
        } catch {
            // Подавление ошибок sessionStorage
        }
    };

    const hasSessionAutoOpened = () => {
        try {
            return Boolean(sessionStorage.getItem(SESSION_KEY_UPDATE_AUTO_OPENED));
        } catch {
            return false;
        }
    };

    const shouldAutoOpenUpdatePopover = (version) => {
        if (hasSessionAutoOpened()) {
            return false;
        }

        const state = getUpdateNoticeState();
        if (!state || state.version !== version) {
            return true;
        }
        if (state.snoozedUntil && Date.now() < state.snoozedUntil) {
            return false;
        }
        if (state.dismissCount === 0) {
            return true;
        }
        if (state.dismissCount === 1) {
            return Date.now() - state.dismissedAt > UPDATE_SNOOZE_DURATION_MS;
        }
        return false;
    };

    const formatVersionTag = (version) => {
        const clean = String(version || '').trim();
        return clean.startsWith('v') ? clean : `v${clean}`;
    };

    const buildUpdateHighlightsHtml = (releaseBody) => {
        const highlights = extractReleaseHighlights(releaseBody);
        if (highlights.length === 0) {
            return '<div class="vp-fallback">Вышла новая версия с улучшениями стабильности и интерфейса.</div>';
        }
        const itemsHtml = highlights.map(item => `<li>${escapeHtml(item)}</li>`).join('');
        return `<ul class="vp-list">${itemsHtml}</ul>`;
    };

    const SAFE_RELEASES_PREFIX = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`;
    const DEFAULT_RELEASE_URL = `${SAFE_RELEASES_PREFIX}/latest`;

    const resolveSafeReleaseUrl = (candidateUrl) => {
        if (typeof candidateUrl === 'string') {
            const trimmed = candidateUrl.trim();
            if (trimmed.startsWith(SAFE_RELEASES_PREFIX)) {
                try {
                    const parsed = new URL(trimmed);
                    if (
                        parsed.protocol === 'https:' &&
                        parsed.hostname === 'github.com' &&
                        parsed.pathname.startsWith(`/${GITHUB_USER}/${GITHUB_REPO}/releases`)
                    ) {
                        return parsed.href;
                    }
                } catch {
                    // Невалидный URL отклоняется
                }
            }
        }
        return DEFAULT_RELEASE_URL;
    };

    const buildUpdateAnchorHtml = (versionTag, releaseUrl, releaseBody) => {
        const highlightsHtml = buildUpdateHighlightsHtml(releaseBody);
        const externalIcon = getSvgIcon('external-link', { size: 12, strokeWidth: 2 });
        const safeHref = escapeHtml(resolveSafeReleaseUrl(releaseUrl));
        return `
            <button type="button" class="ver-pill-btn" title="Доступно обновление расширения">
                <span class="amber-dot"></span>
                <span class="ver-pill-text">${escapeHtml(versionTag)}</span>
            </button>
            <div class="ver-popover hidden">
                <div class="vp-head">
                    <span class="vp-title">Доступно обновление</span>
                    <span class="vp-badge">${escapeHtml(versionTag)}</span>
                </div>
                ${highlightsHtml}
                <div class="vp-actions">
                    <a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="vp-btn-download">
                        <span>Скачать обновление</span>
                        ${externalIcon}
                    </a>
                    <button type="button" class="vp-btn-later">Позже</button>
                </div>
            </div>
        `;
    };

    const handleOutsideUpdateClick = (event) => {
        const anchor = qs(`#${ID_UPDATE_ANCHOR}`);
        if (!anchor || anchor.contains(event.target)) return;

        const popover = qs('.ver-popover', anchor);
        if (popover && !popover.classList.contains('hidden')) {
            popover.classList.add('hidden');
            markUpdateAutoOpened();
            const currentVersion = latestKnownUpdate?.version || CURRENT_VERSION;
            const state = recordUpdateOutsideClick(currentVersion);
            logUpdateOutsideClick(state);
        }
    };

    const bindUpdateAnchorEvents = (anchor, latestVersion) => {
        const pillBtn = qs('.ver-pill-btn', anchor);
        const popover = qs('.ver-popover', anchor);
        const laterBtn = qs('.vp-btn-later', anchor);
        const downloadBtn = qs('.vp-btn-download', anchor);

        pillBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            popover?.classList.toggle('hidden');
        });

        laterBtn?.addEventListener('click', () => {
            popover?.classList.add('hidden');
            const state = recordUpdateDismiss(latestVersion);
            markUpdateAutoOpened();
            logUpdateSnooze(state);
        });

        downloadBtn?.addEventListener('click', () => {
            popover?.classList.add('hidden');
            recordUpdateDismiss(latestVersion);
            markUpdateAutoOpened();
            const message = `Переход к загрузке обновления v${latestVersion}. Поповер скрыт.`;
            logger.update(message);
            if (!isDebug()) {
                console.log(`[MSE Update] ${message}`);
            }
        });

        document.removeEventListener('click', handleOutsideUpdateClick);
        document.addEventListener('click', handleOutsideUpdateClick);
    };

    const renderUpdateUI = (latestVersion, releaseUrl, releaseBody = '', { forceShow = false } = {}) => {
        const form = qs('.main-calendar-form') || qs('#search-controls');
        if (!form) return;

        qs(`#${ID_UPDATE_ANCHOR}`)?.remove();
        qs(`#${ID_UPDATE_BADGE}`)?.remove();
        qs(`#${ID_UPDATE_POPUP}`)?.remove();

        const versionTag = formatVersionTag(latestVersion);
        const anchor = document.createElement('div');
        anchor.id = ID_UPDATE_ANCHOR;
        anchor.className = 'ver-anchor';
        anchor.innerHTML = buildUpdateAnchorHtml(versionTag, releaseUrl, releaseBody);

        form.appendChild(anchor);

        bindUpdateAnchorEvents(anchor, latestVersion);

        const popover = qs('.ver-popover', anchor);
        if (popover && (forceShow || shouldAutoOpenUpdatePopover(latestVersion))) {
            popover.classList.remove('hidden');
            markUpdateAutoOpened();
        }
    };

    const checkExtensionUpdate = async ({ force = false, manual = false } = {}) => {
        const isManual = Boolean(force || manual);
        if (isManual) {
            logger.update(`Запуск проверки обновлений (текущая версия: v${CURRENT_VERSION}, force=${force})...`);
        }

        const { release: releaseData, fromCache } = await resolveLatestRelease(force, { isManual });
        if (!releaseData) {
            if (isManual) {
                logger.update('Проверка обновлений не выполнена (данные о релизе недоступны).');
            }
            return;
        }

        const latestVersion = releaseData.tag_name?.replace(/[^0-9.]/g, '');
        if (!latestVersion) {
            if (isManual) {
                logger.update(`Не удалось определить номер версии из тега: "${releaseData.tag_name}"`);
            }
            return;
        }

        const safeReleaseUrl = resolveSafeReleaseUrl(releaseData.html_url);

        if (isVersionGreater(latestVersion, CURRENT_VERSION)) {
            logger.update(`Найдено обновление: текущая v${CURRENT_VERSION} -> доступна v${latestVersion}. Отображаем баннер.`);
            latestKnownUpdate = {
                version: latestVersion,
                url: safeReleaseUrl,
                body: releaseData.body || ''
            };
            renderUpdateUI(latestVersion, safeReleaseUrl, releaseData.body || '');
        } else if (isManual || !fromCache) {
            logger.update(`У вас установлена актуальная версия v${CURRENT_VERSION} (на GitHub: v${latestVersion}). Обновлений нет.`);
        }
    };

    const simulateUpdate = (mockVersion = '9.9.9', mockBody = null) => {
        logger.update(`Симуляция обновления: запуск тестирования интерфейса для версии v${mockVersion} (текущая: v${CURRENT_VERSION})`);
        if (!isDebug()) {
            console.log(`[MSE Update] Симуляция обновления: запуск тестирования интерфейса для версии v${mockVersion} (текущая: v${CURRENT_VERSION})`);
        }
        const fallbackUrl = `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/releases`;
        const body = mockBody || `<!-- highlights\r\n- Умный подбор физкультуры с фильтрами\r\n- Компактный интерфейс расписания\r\n- Улучшенная синхронизация с календарём\r\n-->\r\n### Технические изменения\r\n- Рефакторинг сетевых запросов`;

        try {
            localStorage.removeItem(STORAGE_KEY_UPDATE_NOTICE);
            sessionStorage.removeItem(SESSION_KEY_UPDATE_AUTO_OPENED);
        } catch {
            // Подавление ошибок хранилища браузера
        }

        const controls = qs('#search-controls');
        if (controls && controls.style.display === 'none') {
            controls.style.display = 'flex';
        }

        latestKnownUpdate = {
            version: mockVersion,
            url: fallbackUrl,
            body
        };
        renderUpdateUI(mockVersion, fallbackUrl, body, { forceShow: true });
        logger.update('Элементы интерфейса обновления (.ver-anchor и .ver-popover) успешно отрисованы.');
        if (!isDebug()) {
            console.log('[MSE Update] Элементы интерфейса обновления (.ver-anchor и .ver-popover) успешно отрисованы.');
        }
    };

    const clearUpdateCache = () => {
        try {
            localStorage.removeItem(STORAGE_KEY_UPDATE_NOTICE);
            localStorage.removeItem(STORAGE_KEY_LAST_UPDATE_CHECK);
            localStorage.removeItem(STORAGE_KEY_LATEST_RELEASE);
            sessionStorage.removeItem(SESSION_KEY_UPDATE_AUTO_OPENED);
        } catch {
            // Подавление ошибок хранилища браузера
        }
        latestKnownUpdate = null;
        qs(`#${ID_UPDATE_ANCHOR}`)?.remove();
        qs(`#${ID_UPDATE_BADGE}`)?.remove();
        qs(`#${ID_UPDATE_POPUP}`)?.remove();

        const message = 'Кэш проверок обновлений и история откладываний («Позже») полностью очищены. Состояние сброшено к первичному запуску.';
        logger.update(message);
        if (!isDebug()) {
            console.log(`[MSE Update] ${message}`);
        }
        return true;
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
     * Всегда возвращает доверенный фиксированный URL вебхука опроса.
     * Переопределение webhookUrl из удалённого survey.json запрещено.
     * @param {*} candidateUrl
     * @returns {string}
     */
    const resolveSafeSurveyWebhookUrl = (candidateUrl) => {
        if (candidateUrl && candidateUrl !== DEFAULT_SURVEY_WEBHOOK_URL) {
            logger.warn('Отклонён сторонний webhookUrl из конфигурации опроса, используется DEFAULT_SURVEY_WEBHOOK_URL.');
        }
        return DEFAULT_SURVEY_WEBHOOK_URL;
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
        const webhookUrl = resolveSafeSurveyWebhookUrl(surveyConfig?.webhookUrl);
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
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
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
     * Создаёт заголовок опросника с векторной иконкой, текстом и кнопкой закрытия.
     * @param {string} titleText
     * @param {Object} [options]
     * @param {string} [options.badgeHtml]
     * @param {string} [options.closeTitle]
     * @param {string} [options.iconName]
     * @returns {string}
     */
    const buildSurveyHeaderHtml = (titleText, { badgeHtml = '', closeTitle = 'Отложить опрос', iconName = 'message-square' } = {}) => `
        <div class="sc-head">
            <div class="sc-head-left">
                <div class="sc-icon">${getSvgIcon(iconName, { size: 14 })}</div>
                <span class="sc-h-text">${escapeHtml(titleText)}</span>
                ${badgeHtml}
            </div>
            <button type="button" class="sc-close" title="${escapeHtml(closeTitle)}">
                ${getSvgIcon('x', { size: 14 })}
            </button>
        </div>
    `;

    const SURVEY_AUTOCLOSE_DELAY_MS = 3000;
    const URL_LIST_ENHANCE_DELAY_MS = 250;
    const URL_CALENDAR_RELOAD_DELAY_MS = 300;
    const GRADES_INITIAL_ENHANCE_DELAY_MS = 300;
    const GRADES_SETTLE_ENHANCE_DELAY_MS = 800;

    /**
     * Экран 1: Приглашение к опросу.
     */
    const renderSurveyInviteScreen = ({ container, config, state, onTransition, onClose }) => {
        const titleText = config.title || 'Помогите улучшить Modeus Enhancer';
        const descText = escapeHtml(config.description || 'Ответьте на пару коротких вопросов, чтобы следующие обновления были полезны именно вам.');

        container.innerHTML = `
            ${buildSurveyHeaderHtml(titleText)}
            <div class="sc-desc">${descText}</div>
            <div class="sc-actions">
                <button type="button" class="btn-main" id="mse-survey-btn-start">Ответить</button>
                <button type="button" class="btn-secondary" id="mse-survey-btn-snooze">Позже</button>
                <button type="button" class="btn-secondary" id="mse-survey-btn-decline-menu">
                    <span>Нет</span>
                    ${getSvgIcon('chevron-down', { size: 12 })}
                </button>
            </div>
        `;

        qs('.sc-close', container)?.addEventListener('click', () => {
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
    const renderSurveyDeclineScreen = ({ container, config, state, onTransition, onClose }) => {
        const titleText = config.title || 'Помогите улучшить Modeus Enhancer';

        container.innerHTML = `
            ${buildSurveyHeaderHtml(titleText)}
            <div class="sc-desc">Выберите вариант:</div>
            <div class="opt-reject-list">
                <button type="button" class="reject-item" id="mse-survey-btn-dismiss-one">
                    <b>Не этот опрос</b> — пропустить текущий опрос
                </button>
                <button type="button" class="reject-item danger" id="mse-survey-btn-disable-all">
                    <b>Никогда не спрашивать</b> — отключить навсегда опросы
                </button>
            </div>
            <div class="sc-actions">
                <button type="button" class="btn-secondary" id="mse-survey-btn-back">Назад</button>
            </div>
        `;

        qs('.sc-close', container)?.addEventListener('click', () => {
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
     * Рендерит один пункт варианта ответа с кастомным чекбоксом .q-box.
     */
    const buildQuestionOptionItemHtml = (optionText, inputType, isChecked) => {
        const safeText = escapeHtml(optionText);
        const selectedClass = isChecked ? ' selected' : '';
        const checkedAttr = isChecked ? ' checked' : '';
        return `
            <label class="q-opt${selectedClass}">
                <input type="${inputType}" name="mse_survey_choice" value="${safeText}" ${checkedAttr} class="q-input-hidden" />
                <span class="q-box">${getSvgIcon('check', { size: 11, strokeWidth: 2.5 })}</span>
                <span>${safeText}</span>
            </label>
        `;
    };

    /**
     * Рендерит пункт «Свой вариант» с текстовым полем ввода.
     */
    const buildQuestionCustomOptionHtml = (inputType, isCustomChecked, customText) => {
        const customSelectedClass = isCustomChecked ? ' selected' : '';
        const checkedAttr = isCustomChecked ? ' checked' : '';
        const safeCustomText = escapeHtml(customText);
        const customDisplay = isCustomChecked ? 'block' : 'none';
        return `
            <label class="q-opt${customSelectedClass}">
                <input type="${inputType}" name="mse_survey_choice" value="${CUSTOM_OPTION_VALUE}" ${checkedAttr} class="q-input-hidden" />
                <span class="q-box">${getSvgIcon('check', { size: 11, strokeWidth: 2.5 })}</span>
                <span>Свой вариант</span>
            </label>
            <div class="mse-survey-custom-wrap" id="mse-survey-custom-container" style="display: ${customDisplay};">
                <input type="text" class="mse-survey-custom-input" id="mse-survey-custom-input" placeholder="Напишите свой вариант..." value="${safeCustomText}" />
            </div>
        `;
    };

    /**
     * Формирует HTML-разметку всех вариантов ответов на вопрос.
     */
    const buildQuestionOptionsHtml = (question, selectedOptions, customText) => {
        const isMultiple = question.type === 'multiple';
        const inputType = isMultiple ? 'checkbox' : 'radio';
        const options = question.options || [];

        const optionsHtml = options.map(opt =>
            buildQuestionOptionItemHtml(opt, inputType, selectedOptions.has(opt))
        ).join('');

        if (!question.allowCustom) {
            return optionsHtml;
        }

        const isCustomChecked = selectedOptions.has(CUSTOM_OPTION_VALUE);
        return optionsHtml + buildQuestionCustomOptionHtml(inputType, isCustomChecked, customText);
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
     * Проверяет валидность ответа на текущий вопрос.
     */
    const isQuestionAnswerValid = (isMultiple, selectedOptions, customText) => {
        const hasStandard = Array.from(selectedOptions).some(opt => opt !== CUSTOM_OPTION_VALUE);
        const isCustomSelected = selectedOptions.has(CUSTOM_OPTION_VALUE);
        const hasCustomText = isCustomSelected && customText.trim().length > 0;
        return isMultiple
            ? (hasStandard || hasCustomText)
            : (isCustomSelected ? hasCustomText : hasStandard);
    };

    /**
     * Обрабатывает изменение выбора опции ответа.
     */
    const handleQuestionOptionChange = ({
        event,
        isMultiple,
        selectedOptions,
        container,
        customContainer,
        customInput,
        onValidate
    }) => {
        const target = event.target;
        if (target.name !== 'mse_survey_choice') return;

        const val = target.value;
        if (isMultiple) {
            if (target.checked) selectedOptions.add(val);
            else selectedOptions.delete(val);
        } else {
            selectedOptions.clear();
            if (target.checked) selectedOptions.add(val);
        }

        qsa('.q-opt', container).forEach(labelEl => {
            const inputEl = qs('input', labelEl);
            labelEl.classList.toggle('selected', inputEl?.checked || false);
        });

        if (customContainer) {
            const showCustom = selectedOptions.has(CUSTOM_OPTION_VALUE);
            customContainer.style.display = showCustom ? 'block' : 'none';
            if (showCustom && customInput) customInput.focus();
        }

        onValidate();
    };

    /**
     * Обрабатывает переход к следующему вопросу или отправку опроса.
     */
    const handleQuestionNextSubmit = ({
        config,
        state,
        question,
        isLastQuestion,
        isMultiple,
        selectedOptions,
        customText,
        onTransition
    }) => {
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
    };

    /**
     * Привязывает события к элементам экрана вопроса.
     */
    const bindQuestionScreenEvents = ({
        container,
        config,
        state,
        question,
        isLastQuestion,
        isMultiple,
        selectedOptions,
        getCustomText,
        setCustomText,
        onClose,
        onTransition
    }) => {
        const nextBtn = qs('#mse-survey-btn-next', container);
        const customContainer = qs('#mse-survey-custom-container', container);
        const customInput = qs('#mse-survey-custom-input', container);
        const optionsContainer = qs('.q-options', container);

        const updateValidation = () => {
            if (nextBtn) {
                nextBtn.disabled = !isQuestionAnswerValid(isMultiple, selectedOptions, getCustomText());
            }
        };

        updateValidation();

        qs('.sc-close', container)?.addEventListener('click', () => {
            snoozeSurvey();
            onClose();
        });

        qs('#mse-survey-btn-prev', container)?.addEventListener('click', () => {
            if (state.questionIndex > 0) {
                state.questionIndex--;
                onTransition();
            }
        });

        optionsContainer?.addEventListener('change', (event) => {
            handleQuestionOptionChange({
                event,
                isMultiple,
                selectedOptions,
                container,
                customContainer,
                customInput,
                onValidate: updateValidation
            });
        });

        customInput?.addEventListener('input', (event) => {
            setCustomText(event.target.value);
            updateValidation();
        });

        customInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && nextBtn && !nextBtn.disabled) {
                event.preventDefault();
                nextBtn.click();
            }
        });

        nextBtn?.addEventListener('click', () => {
            handleQuestionNextSubmit({
                config,
                state,
                question,
                isLastQuestion,
                isMultiple,
                selectedOptions,
                customText: getCustomText(),
                onTransition
            });
        });
    };

    /**
     * Экран 2: Интерактивный опрос с радиокнопками, чекбоксами и кастомным ответом.
     */
    const renderSurveyQuestionScreen = ({ container, config, state, onTransition, onClose }) => {
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
            ? '<button type="button" class="btn-secondary" id="mse-survey-btn-prev">Назад</button>'
            : '';
        const nextButtonLabel = isLastQuestion ? 'Отправить' : 'Далее';
        const progressPercent = Math.round((currentNumber / totalQuestions) * 100);
        const badgeHtml = `<span class="step-pill">${progressPercent}%</span>`;

        container.innerHTML = `
            ${buildSurveyHeaderHtml(`Вопрос ${currentNumber} из ${totalQuestions}`, { badgeHtml })}
            <div class="sc-q-title">${escapeHtml(question.text)}</div>
            <div class="q-options">${optionsHtml}</div>
            <div class="sc-actions between">
                <div>${backButtonHtml}</div>
                <button type="button" class="btn-main" id="mse-survey-btn-next" disabled>
                    <span>${nextButtonLabel}</span>
                    ${getSvgIcon('move-right', { size: 13 })}
                </button>
            </div>
        `;

        bindQuestionScreenEvents({
            container,
            config,
            state,
            question,
            isLastQuestion,
            isMultiple,
            selectedOptions,
            getCustomText: () => customText,
            setCustomText: (value) => { customText = value; },
            onClose,
            onTransition
        });
    };

    /**
     * Экран 3: Финал и благодарность с автозакрытием.
     */
    const renderSurveyCompletedScreen = ({ container, state, onClose }) => {
        container.innerHTML = `
            ${buildSurveyHeaderHtml('Спасибо за участие!', { closeTitle: 'Закрыть' })}
            <div class="sc-desc">
                Ваши ответы сохранены и помогут сделать расширение лучше.
            </div>
        `;

        qs('.sc-close', container)?.addEventListener('click', () => {
            onClose();
        });

        state.autoCloseTimer = setTimeout(() => {
            onClose();
        }, SURVEY_AUTOCLOSE_DELAY_MS);
    };

    const SURVEY_SCREEN_RENDERERS = {
        invite: renderSurveyInviteScreen,
        decline: renderSurveyDeclineScreen,
        question: renderSurveyQuestionScreen,
        completed: renderSurveyCompletedScreen
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
        container.className = 'survey-card';

        const state = {
            screen: 'invite', // Состояния экрана: 'invite' | 'decline' | 'question' | 'completed'
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
            const renderScreen = SURVEY_SCREEN_RENDERERS[state.screen];
            if (renderScreen) {
                renderScreen({ container, config, state, onTransition, onClose });
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
     * Проверяет доступность опроса и при выполнении условий отображает попап.
     * @returns {boolean}
     */
    const showSurveyIfEligible = () => {
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
    const processUrlChange = () => {
        const currentUrl = window.location.href;
        const urlObj = new URL(currentUrl);

        // 1. Открытие карточки пары (боковая панель)
        let newEventId = null;
        const param = urlObj.searchParams.get('selectedEvent');
        try {
            if (param && param !== '""') newEventId = JSON.parse(param).eventId;
        } catch (err) {
            logger.warn('Не удалось распарсить selectedEvent из URL:', err);
        }
        if (newEventId !== currentEventId) {
            currentEventId = newEventId;
            setTimeout(() => { enhanceLists(); }, URL_LIST_ENHANCE_DELAY_MS);
        } else if (!newEventId) {
            currentEventId = null;
        }

        // 2. Отслеживание смены пользователя или недели в URL
        if (currentUrl.includes('/schedule-calendar/')) {
            const calendarParam = urlObj.searchParams.get('calendar');
            const activePersonId = getActiveCalendarPersonId(getMyPersonId());

            if (lastActiveCalendarPersonId !== null && activePersonId && lastActiveCalendarPersonId !== activePersonId) {
                lastActiveCalendarPersonId = activePersonId;
                clearSearch();
                updateReturnToMeButton();
                setTimeout(() => { loadAllData(); }, URL_CALENDAR_RELOAD_DELAY_MS);
            } else if (lastCalendarParam && lastCalendarParam !== calendarParam) {
                lastCalendarParam = calendarParam;
                loadAllData();
            } else {
                if (activePersonId && lastActiveCalendarPersonId === null) {
                    lastActiveCalendarPersonId = activePersonId;
                }
                if (!lastCalendarParam) {
                    lastCalendarParam = calendarParam;
                }
            }
        }

        // 3. Отслеживание перехода на страницу успеваемости / карточки студента
        if (currentUrl.includes('/my-results') || currentUrl.includes('/student-card')) {
            if (mseCourseRealizationsMap.size === 0) {
                restorePrimaryGradesFromCache();
            }
            enhanceGradesTable();
            setTimeout(enhanceGradesTable, GRADES_INITIAL_ENHANCE_DELAY_MS);
            setTimeout(enhanceGradesTable, GRADES_SETTLE_ENHANCE_DELAY_MS);
        }
    };

    const buildSearchToolbarHtml = () => `
        <span id="search-status" style="display: none;"></span>
        <div id="search-controls" class="toolbar">
            <button id="add-friends-to-search-btn" class="icon-btn" title="Добавить друзей в поиск общих пар" type="button">
                ${getSvgIcon('users', { size: 16, strokeWidth: 2 })}
            </button>
            <button id="refresh-data-btn" class="icon-btn" title="Обновить данные для поиска общих пар" type="button">
                ${getSvgIcon('refresh-ccw', { size: 16, strokeWidth: 2 })}
            </button>
            <div id="selected-students-dropdown-wrapper" style="display: none; position: relative;">
                <div id="selected-students-pill" class="split-btn">
                    <button id="selected-students-toggle" class="split-main" title="Показать список выбранных" type="button">
                        <span class="selected-students-label">Выбрано:&nbsp;</span><span id="selected-count">0</span>
                        ${getSvgIcon('chevron-down', { size: 14, strokeWidth: 2.2, className: 'selected-dropdown-arrow' })}
                    </button>
                    <button id="selected-students-reset-btn" class="split-clear" title="Сбросить всех выбранных студентов" type="button">
                        ${getSvgIcon('x', { size: 14, strokeWidth: 2.2 })}
                    </button>
                </div>
                <div id="selected-students-container" class="selected-dropdown"></div>
            </div>
            <div id="search-popover-wrapper">
                <button id="${ID_SEARCH_TOGGLE_BTN}" class="icon-btn" title="Найти общие пары" type="button">
                    ${getSvgIcon('search', { size: 16, strokeWidth: 2 })}
                </button>
                <div id="${ID_SEARCH_POPOVER}">
                    <input type="text" id="${ID_SEARCH_INPUT}" placeholder="Найти общие пары...">
                    <div id="search-suggestions"></div>
                </div>
            </div>
        </div>`;

    const bindSearchToolbarEvents = () => {
        qs('#add-friends-to-search-btn').addEventListener('click', () => {
            getFriends().forEach(friend => selectedStudents.add(friend.fullName));
            const searchInput = qs(`#${ID_SEARCH_INPUT}`);
            if (searchInput) searchInput.value = '';
            const suggestions = qs('#search-suggestions');
            if (suggestions) suggestions.style.display = 'none';
            toggleSearchPopover(false);
            updateSelectedStudentsDisplay();
            highlightEventsForStudents();
        });

        qs('#selected-students-toggle').addEventListener('click', () => {
            toggleSearchPopover(false);
            const dropdownContainer = qs('#selected-students-container');
            const toggleButton = qs('#selected-students-toggle');
            const pill = qs('#selected-students-pill');
            const isOpening = dropdownContainer.style.display !== 'flex';
            dropdownContainer.style.display = isOpening ? 'flex' : 'none';
            if (toggleButton) toggleButton.classList.toggle('is-open', isOpening);
            if (pill) pill.classList.toggle('is-open', isOpening);
        });

        qs('#selected-students-container').addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.remove-student-btn, .selected-item-remove');
            if (!removeBtn) return;
            event.stopPropagation();
            const name = removeBtn.getAttribute('data-name');
            if (name) {
                selectedStudents.delete(name);
                updateSelectedStudentsDisplay();
                highlightEventsForStudents();
            }
        });

        qs('#refresh-data-btn').addEventListener('click', () => {
            attendeesMemoryCache.clear();
            weekEventsCache.clear();
            loadAllData();
        });

        qs(`#${ID_SEARCH_TOGGLE_BTN}`)?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleSearchPopover();
        });

        qs(`#${ID_SEARCH_INPUT}`).addEventListener('input', updateSuggestions);
        qs(`#${ID_SEARCH_INPUT}`).addEventListener('keydown', handleSearchKeydown);
        qs('#selected-students-reset-btn').addEventListener('click', clearSearch);

        const suggestionsContainer = qs('#search-suggestions');
        suggestionsContainer.addEventListener('click', (event) => {
            const item = event.target.closest('.suggestion-item');
            if (item) {
                selectStudentSuggestion(item.getAttribute('data-name'));
            }
        });
        suggestionsContainer.addEventListener('mousemove', (event) => {
            const item = event.target.closest('.suggestion-item');
            if (!item) return;
            const items = qsa('.suggestion-item', suggestionsContainer);
            const idx = items.indexOf(item);
            if (idx !== -1 && idx !== activeSuggestionIndex) {
                activeSuggestionIndex = idx;
                updateActiveSuggestion(items, activeSuggestionIndex);
            }
        });

        document.removeEventListener('click', handleOutsideSearchClick);
        document.addEventListener('click', handleOutsideSearchClick);
    };

    const setupUI = () => {
        const fcToolbar = qs('.fc-toolbar') || qs('.fc-header-toolbar');
        const targetToolbar = fcToolbar || qs('.main-calendar-form');
        if (!targetToolbar) return;

        if (cachedSearchContainer) {
            if (!cachedSearchContainer.isConnected || cachedSearchContainer.parentElement !== targetToolbar) {
                targetToolbar.appendChild(cachedSearchContainer);
            }
            updateSelectedStudentsDisplay();
            updateSearchCompactState();
            return;
        }

        if (qs(`#${ID_SEARCH_CONTAINER}`)) return;

        const container = document.createElement('div');
        container.id = ID_SEARCH_CONTAINER;
        container.className = CLASS_IN_CALENDAR_TOOLBAR;
        container.innerHTML = buildSearchToolbarHtml();
        if (fcToolbar && window.getComputedStyle && window.getComputedStyle(fcToolbar).position === 'static') {
            fcToolbar.style.position = 'relative';
        }
        cachedSearchContainer = container;
        targetToolbar.appendChild(container);

        bindSearchToolbarEvents();
        setupNativePopoverObserver();
        setupCalendarResizeObserver();
        updateSelectedStudentsDisplay();

        if (latestKnownUpdate) {
            renderUpdateUI(latestKnownUpdate.version, latestKnownUpdate.url, latestKnownUpdate.body);
        }

        loadAllData();
    };

    function indexCourseUnitRealizations(courseUnitRealizations) {
        const uniqueCourseUnits = new Set();
        courseUnitRealizations.forEach(courseUnitRealization => {
            if (!courseUnitRealization.name || !courseUnitRealization.lessons) return;

            const sortedLessons = [...courseUnitRealization.lessons].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
            sortedLessons.courseUnitId = courseUnitRealization.courseUnitId;
            sortedLessons.forEach(lesson => {
                lesson.courseUnitId = courseUnitRealization.courseUnitId;
            });
            mseCourseRealizationsMap.set(normalizeName(courseUnitRealization.name), sortedLessons);

            if (courseUnitRealization.courseUnitId) uniqueCourseUnits.add(courseUnitRealization.courseUnitId);
        });
        return uniqueCourseUnits;
    }

    function storeCourseLessonTechnologies(courseUnitId, technologyData) {
        if (!technologyData?.lessonTechnologies) return;
        technologyData.lessonTechnologies.forEach(lessonTech => {
            if (!lessonTech.lessonId) return;

            let maxGradeList = null;
            if (lessonTech.controlObjects?.length > 0) {
                const sortedControlObjects = [...lessonTech.controlObjects].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
                const positiveGrades = sortedControlObjects
                    .map(controlObj => controlObj.maxValue)
                    .filter(value => typeof value === 'number' && value > 0);
                if (positiveGrades.length > 0) {
                    maxGradeList = positiveGrades;
                }
            }

            if (maxGradeList) {
                mseLessonMaxGrades.set(lessonTech.lessonId, maxGradeList);
                if (lessonTech.lessonName) {
                    mseLessonNameToMaxGrade.set(`${courseUnitId}:${normalizeName(lessonTech.lessonName)}`, maxGradeList);
                }
            } else {
                // Явно сохраняем null для неоцениваемых занятий, чтобы не сработал fallback по имени
                mseLessonMaxGrades.set(lessonTech.lessonId, null);
            }
        });
    }

    function fetchCourseLessonTechnology(courseUnitId, token) {
        if (mseLoadedCourseUnits.has(courseUnitId)) return;
        mseLoadedCourseUnits.add(courseUnitId);

        fetch(`${API_COURSES}/${courseUnitId}/lessons-technology`, {
            headers: { authorization: `Bearer ${token}` }
        })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(technologyData => {
                storeCourseLessonTechnologies(courseUnitId, technologyData);
                enhanceGradesTable();
            })
            .catch(err => logger.warn('Ошибка загрузки техкарты:', err));
    }

    // 1. Сбор структуры предметов и скачивание массивов макс. баллов
    function processPrimaryGradesData(data, fromCache = false) {
        if (!data || !data.courseUnitRealizations) return;

        const count = data.courseUnitRealizations.length;
        if (!fromCache) {
            logger.network(`Успеваемость (/primary): перехвачена таблица результатов, предметов: ${count}`);
            try {
                sessionStorage.setItem(STORAGE_KEY_GRADES_PRIMARY, JSON.stringify(data));
            } catch {
                // Игнорируем переполнение sessionStorage
            }
        } else {
            logger.network(`Успеваемость: восстановлены данные из sessionStorage, предметов: ${count}`);
        }

        const token = sessionStorage.getItem('id_token');
        const uniqueCourseUnits = indexCourseUnitRealizations(data.courseUnitRealizations);
        uniqueCourseUnits.forEach(courseUnitId => fetchCourseLessonTechnology(courseUnitId, token));
        enhanceGradesTable();
    }

    function restorePrimaryGradesFromCache() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY_GRADES_PRIMARY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data && data.courseUnitRealizations) {
                processPrimaryGradesData(data, true);
            }
        } catch (e) {
            logger.warn('Ошибка восстановления успеваемости из кэша:', e);
        }
    }

    function parseNumericGrade(str) {
        if (str === null || str === undefined) return null;
        const clean = String(str).trim().replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(clean)) return null;
        const num = parseFloat(clean);
        return (!isNaN(num) && isFinite(num)) ? num : null;
    }

    function createGradeBadge(maxGrade) {
        if (typeof maxGrade !== 'number' || isNaN(maxGrade) || !isFinite(maxGrade) || maxGrade <= 0) {
            return document.createDocumentFragment();
        }
        const badge = document.createElement('span');
        badge.className = 'mse-max-grade';
        badge.textContent = ` /${maxGrade}`;
        return badge;
    }

    function createUnknownGradeBadge() {
        const badge = document.createElement('span');
        badge.className = 'mse-max-grade mse-max-unknown';
        badge.textContent = ' / ?';
        badge.title = 'Преподаватель не указал максимальный балл за это занятие в техкарте Модеуса';
        return badge;
    }

    function createMaxDoneSpan(text) {
        const span = document.createElement('span');
        span.className = 'mse-max-done';
        span.textContent = text;
        return span;
    }

    function calculateMultiPointScore(gradeStrings, maxGradeList) {
        let totalEarned = 0;
        let numericCount = 0;
        let evaluatedMax = 0;

        gradeStrings.forEach((str, index) => {
            const grade = parseNumericGrade(str);
            if (grade !== null) {
                totalEarned += grade;
                numericCount++;
                if (index < maxGradeList.length && typeof maxGradeList[index] === 'number') {
                    evaluatedMax += maxGradeList[index];
                }
            }
        });

        if (numericCount === 0) return null;

        totalEarned = Math.round(totalEarned * 100) / 100;
        if (isNaN(totalEarned) || !isFinite(totalEarned)) return null;

        return { totalEarned, evaluatedMax };
    }

    function aggregateElementGrades(elements, score, totalMax, meetingCell) {
        meetingCell.dataset.mseAggregated = '1';
        meetingCell.dataset.mseEvaluatedMax = String(score.evaluatedMax > 0 ? score.evaluatedMax : totalMax);

        elements[0].innerHTML = `${score.totalEarned}`;
        if (score.totalEarned >= totalMax) {
            elements[0].classList.add('mse-max-done');
        } else {
            elements[0].appendChild(createGradeBadge(totalMax));
        }

        for (let i = 1; i < elements.length; i++) {
            elements[i].remove();
        }
        return true;
    }

    function aggregateTextNodeGrades(meetingCell, score, totalMax) {
        for (const node of Array.from(meetingCell.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE && /\b\d/.test(node.textContent)) {
                meetingCell.dataset.mseAggregated = '1';
                meetingCell.dataset.mseEvaluatedMax = String(score.evaluatedMax > 0 ? score.evaluatedMax : totalMax);

                const tail = node.textContent.replace(/^.*?(\s*[-–—]?\s*\|\s*[ПНH]|$)/, '$1');
                const fragment = document.createDocumentFragment();

                if (score.totalEarned >= totalMax) {
                    fragment.appendChild(createMaxDoneSpan(score.totalEarned));
                } else {
                    fragment.appendChild(document.createTextNode(score.totalEarned));
                    fragment.appendChild(createGradeBadge(totalMax));
                }
                fragment.appendChild(document.createTextNode(tail));
                node.replaceWith(fragment);
                return true;
            }
        }
        return false;
    }

    function aggregateMultiPointGrades(meetingCell, maxGradeList) {
        const totalMax = maxGradeList.reduce((acc, m) => acc + (typeof m === 'number' ? m : 0), 0);
        if (totalMax <= 0 || isNaN(totalMax) || !isFinite(totalMax)) return false;

        const numberElements = qsa('.lesson-realization:not(.present):not(.absent)', meetingCell);
        if (numberElements.length >= 3) {
            const score = calculateMultiPointScore(numberElements.map(el => el.textContent), maxGradeList);
            if (!score) return false;
            return aggregateElementGrades(numberElements, score, totalMax, meetingCell);
        }

        const matches = [...meetingCell.textContent.matchAll(/\b(\d+([.,]\d+)?)\b/g)];
        if (matches.length > 0) {
            const score = calculateMultiPointScore(matches.map(m => m[1]), maxGradeList);
            if (!score) return false;
            return aggregateTextNodeGrades(meetingCell, score, totalMax);
        }

        return false;
    }

    function replaceTextNodeGrades(meetingCell, createGradeNode) {
        for (const node of Array.from(meetingCell.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const textContent = node.textContent;
            const matches = [...textContent.matchAll(/\b(\d+([.,]\d+)?)\b/g)].map(match => ({
                num: match[1],
                index: match.index
            }));
            if (matches.length === 0) continue;

            const fragment = document.createDocumentFragment();
            let lastIdx = 0;

            for (const matchItem of matches) {
                const grade = parseNumericGrade(matchItem.num);
                if (grade === null) continue;
                const gradeNode = createGradeNode(matchItem.num, grade);
                if (!gradeNode) {
                    if (gradeNode === null) break;
                    continue;
                }

                fragment.appendChild(document.createTextNode(textContent.substring(lastIdx, matchItem.index)));
                fragment.appendChild(gradeNode);
                lastIdx = matchItem.index + matchItem.num.length;
            }

            if (lastIdx < textContent.length) {
                const tail = textContent.substring(lastIdx).replace(/^(\s*[-–—])/, '\u00A0$1');
                fragment.appendChild(document.createTextNode(tail));
            }

            node.replaceWith(fragment);
            return;
        }
    }

    function injectIndividualGradeBadges(meetingCell, maxGradeList) {
        let gradeIndex = 0;

        // А. Если оценка лежит в отдельном элементе .lesson-realization
        const leafElements = qsa('.lesson-realization:not(.present):not(.absent)', meetingCell);
        for (let i = 0; i < leafElements.length; i++) {
            const element = leafElements[i];
            const grade = parseNumericGrade(element.textContent);
            if (grade === null) continue;
            const targetIdx = leafElements.length === maxGradeList.length ? i : gradeIndex;
            if (targetIdx >= maxGradeList.length) continue;

            const maxGrade = maxGradeList[targetIdx];
            gradeIndex++;
            if (typeof maxGrade === 'number' && maxGrade > 0) {
                if (grade >= maxGrade) {
                    element.classList.add('mse-max-done');
                } else {
                    element.appendChild(createGradeBadge(maxGrade));
                }
            }
        }

        if (gradeIndex > 0) return;

        // Б. Если внутри ячейки текстовый узел
        replaceTextNodeGrades(meetingCell, (numText, grade) => {
            if (gradeIndex >= maxGradeList.length) return null;
            const maxGrade = maxGradeList[gradeIndex++];
            if (typeof maxGrade !== 'number' || maxGrade <= 0) return undefined;
            if (grade >= maxGrade) return createMaxDoneSpan(numText);

            const numSpan = document.createElement('span');
            numSpan.className = 'lesson-realization';
            numSpan.textContent = numText;
            numSpan.appendChild(createGradeBadge(maxGrade));
            return numSpan;
        });
    }

    function injectMaxGradeBadge(meetingCell, maxGrades) {
        if (!meetingCell) return;
        const unknownBadge = meetingCell.querySelector('.mse-max-unknown');
        if (unknownBadge) unknownBadge.remove();

        if (meetingCell.querySelector('.mse-max-grade') || meetingCell.querySelector('.mse-max-done')) return;
        const maxGradeList = Array.isArray(maxGrades) ? maxGrades : [maxGrades];
        if (maxGradeList.length === 0) return;

        // Если контрольных точек 3 или больше — суммируем их в один итог
        if (maxGradeList.length >= 3 && aggregateMultiPointGrades(meetingCell, maxGradeList)) {
            return;
        }

        // Для 1-2 контрольных точек отображаем индивидуальные бейджи
        injectIndividualGradeBadges(meetingCell, maxGradeList);
    }

    /**
     * Отображение приглушенного бейджа / ? для ячейки с числовой оценкой,
     * у которой в техкарте Модеуса не указан максимальный балл.
     */
    function injectUnknownMaxGradeBadge(meetingCell) {
        if (!meetingCell || meetingCell.querySelector('.mse-max-grade') || meetingCell.querySelector('.mse-max-done')) return;

        // А. Если оценка лежит в отдельном элементе .lesson-realization
        const leafElements = qsa('.lesson-realization:not(.present):not(.absent)', meetingCell);
        let injected = false;
        for (const element of leafElements) {
            if (parseNumericGrade(element.textContent) !== null) {
                element.appendChild(createUnknownGradeBadge());
                injected = true;
            }
        }
        if (injected) return;

        // Б. Если внутри ячейки текстовый узел
        replaceTextNodeGrades(meetingCell, (numText) => {
            const numSpan = document.createElement('span');
            numSpan.className = 'lesson-realization';
            numSpan.textContent = numText;
            numSpan.appendChild(createUnknownGradeBadge());
            return numSpan;
        });
    }

    /**
     * Получение максимальных баллов занятия с защитой от ложного срабатывания
     * fallback-поиска для неоцениваемых занятий (лекций/консультаций).
     */
    function resolveLessonMaxGrades(lesson, courseUnitId) {
        if (!lesson) return null;

        // 1. Прямой поиск по ID занятия в техкарте
        if (mseLessonMaxGrades.has(lesson.id)) {
            // Если ID известен, возвращаем массив баллов либо null (для неоцениваемых лекций/консультаций)
            return mseLessonMaxGrades.get(lesson.id);
        }

        // 2. Изолированный fallback по названию занятия в рамках конкретного предмета
        // Срабатывает ТОЛЬКО если lesson.id вообще не был найден в техкарте
        if (lesson.name) {
            const normLessonName = normalizeName(lesson.name);
            const scopedKey = courseUnitId ? `${courseUnitId}:${normLessonName}` : normLessonName;
            return mseLessonNameToMaxGrade.get(scopedKey) || null;
        }

        return null;
    }

    const BASE_MEETING_COLUMN_WIDTH = 105;
    const CELL_HORIZONTAL_PADDING = 20;
    const REALIZATION_BADGE_GAP = 4;

    const calculateCellContentWidth = (cell) => {
        const wrap = cell?.querySelector('.lesson-realization-wrap');
        if (!wrap) return 0;

        let contentWidth = 0;
        const items = wrap.querySelectorAll('.lesson-realization');
        items.forEach((item, index) => {
            contentWidth += item.offsetWidth;
            if (index > 0) contentWidth += REALIZATION_BADGE_GAP;
        });
        return contentWidth;
    };

    const calculateColumnRequiredWidth = (colIndex, rows) => {
        let maxContentWidth = 0;
        rows.forEach(row => {
            const cell = row.querySelectorAll('td')[colIndex];
            if (cell) {
                const width = calculateCellContentWidth(cell);
                if (width > maxContentWidth) maxContentWidth = width;
            }
        });
        const neededWidth = maxContentWidth + CELL_HORIZONTAL_PADDING;
        return Math.max(BASE_MEETING_COLUMN_WIDTH, Math.ceil(neededWidth));
    };

    const applyColumnWidth = (meetingColumn, width, rows) => {
        const { colIndex, th } = meetingColumn;
        const widthPx = `${width}px`;
        th.style.setProperty('width', widthPx, 'important');
        th.style.setProperty('min-width', widthPx, 'important');

        rows.forEach(row => {
            const cell = row.querySelectorAll('td')[colIndex];
            if (cell) {
                cell.style.setProperty('width', widthPx, 'important');
                cell.style.setProperty('min-width', widthPx, 'important');
            }
        });
    };

    const adjustMeetingColumnWidths = (meetingColumns, rows) => {
        meetingColumns.forEach(column => {
            const requiredWidth = calculateColumnRequiredWidth(column.colIndex, rows);
            if (requiredWidth > BASE_MEETING_COLUMN_WIDTH) {
                applyColumnWidth(column, requiredWidth, rows);
            }
        });
    };

    function extractGradesTableColumns() {
        const meetingColumns = [];
        let currentTotalColIndex = -1;
        const headers = qsa('table thead th, .p-datatable-thead th, .ui-table-thead th');
        headers.forEach((th, idx) => {
            const match = th.textContent.match(/Встреча\s*(\d+)/i);
            if (match) {
                meetingColumns.push({ colIndex: idx, meetingNumber: parseInt(match[1], 10), th });
            }
            if (th.textContent.includes('Текущий итог')) {
                currentTotalColIndex = idx;
            }
        });
        return { meetingColumns, currentTotalColIndex };
    }

    function findMatchedLessonsForRow(row) {
        const rowText = normalizeName(row.textContent).toLowerCase();
        for (const [courseName, lessons] of mseCourseRealizationsMap.entries()) {
            if (rowText.includes(courseName.toLowerCase())) {
                return lessons;
            }
        }
        return null;
    }

    function computeMeetingCellLostPoints(meetingCell, matchedLesson, courseUnitId) {
        const clone = meetingCell.cloneNode(true);
        clone.querySelectorAll('.mse-max-grade').forEach(badge => badge.remove());

        const gradePart = clone.textContent.split('|')[0] || '';
        const matches = [...gradePart.matchAll(/\b(\d+([.,]\d+)?)\b/g)];
        if (matches.length === 0) return null;

        const maxGradeList = resolveLessonMaxGrades(matchedLesson, courseUnitId);
        if (!maxGradeList || maxGradeList.length === 0) {
            return { missingMax: true, lost: 0 };
        }

        const maxGradeArray = Array.isArray(maxGradeList) ? maxGradeList : [maxGradeList];
        if (meetingCell.dataset.mseAggregated === '1' && matches.length === 1) {
            const sumMax = maxGradeArray.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
            const evaluatedMax = parseFloat(meetingCell.dataset.mseEvaluatedMax) || sumMax;
            const earned = parseNumericGrade(matches[0][1]);
            const lost = (earned !== null && evaluatedMax > earned) ? (evaluatedMax - earned) : 0;
            return { missingMax: false, lost };
        }

        let lost = 0;
        matches.forEach((matchItem, idx) => {
            const num = parseNumericGrade(matchItem[1]);
            if (num !== null && idx < maxGradeArray.length && maxGradeArray[idx] > num) {
                lost += (maxGradeArray[idx] - num);
            }
        });
        return { missingMax: false, lost };
    }

    function computeRowLostPointsSummary(tds, meetingColumns, matchedLessons, courseUnitId) {
        let totalLost = 0;
        let evaluatedWithMaxCount = 0;
        let missingMaxCount = 0;

        meetingColumns.forEach(({ colIndex, meetingNumber }) => {
            const meetingCell = tds[colIndex];
            if (!meetingCell) return;
            const matchedLesson = matchedLessons ? matchedLessons[meetingNumber - 1] : null;
            const result = computeMeetingCellLostPoints(meetingCell, matchedLesson, courseUnitId);
            if (!result) return;
            if (result.missingMax) {
                missingMaxCount++;
            } else {
                evaluatedWithMaxCount++;
                totalLost += result.lost;
            }
        });

        return { totalLost, evaluatedWithMaxCount, missingMaxCount };
    }

    function formatLostPointsCellHtml({ totalLost, evaluatedWithMaxCount, missingMaxCount }) {
        const totalGradedCount = evaluatedWithMaxCount + missingMaxCount;
        const unknownRatio = totalGradedCount > 0 ? (missingMaxCount / totalGradedCount) : 0;

        if (totalGradedCount > 0 && (unknownRatio > GRADES_MAX_UNKNOWN_THRESHOLD || evaluatedWithMaxCount === 0)) {
            const percent = Math.round(unknownRatio * 100);
            return `<span class="mse-lost-na mse-lost-help" title="Невозможно рассчитать потери: у ${missingMaxCount} из ${totalGradedCount} оценок (${percent}%) в техкарте Модеуса не указан макс. балл.">Н/Д*</span>`;
        }

        const lostPoints = Math.round(totalLost * 100) / 100;
        if (missingMaxCount > 0) {
            const percent = Math.round(unknownRatio * 100);
            const titleAttr = ` title="Неполный расчет: у ${missingMaxCount} из ${totalGradedCount} оценок (${percent}%) в техкарте Модеуса не указан макс. балл."`;
            return lostPoints > 0
                ? `<span class="mse-lost-negative mse-lost-help"${titleAttr}>-${totalLost.toFixed(2)}*</span>`
                : `<span class="mse-lost-zero mse-lost-help"${titleAttr}>0.00*</span>`;
        }

        return lostPoints > 0
            ? `<span class="mse-lost-negative">-${lostPoints}</span>`
            : '<span class="mse-lost-zero">0.00</span>';
    }

    function attachLostPointsToggleHandler(totalTd, tds, meetingColumns, matchedLessons, courseUnitId) {
        if (!totalTd) return;
        const currentTotalNum = parseNumericGrade(totalTd.textContent.trim());
        if (currentTotalNum === null || totalTd.dataset.mseDblclickAttached) return;

        totalTd.dataset.mseDblclickAttached = '1';
        totalTd.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            if (totalTd.dataset.mseLostMode === '1') {
                totalTd.textContent = totalTd.dataset.mseOrigText;
                totalTd.dataset.mseLostMode = '0';
                return;
            }
            const summary = computeRowLostPointsSummary(tds, meetingColumns, matchedLessons, courseUnitId);
            totalTd.dataset.mseOrigText = totalTd.textContent.trim();
            totalTd.dataset.mseLostMode = '1';
            totalTd.innerHTML = formatLostPointsCellHtml(summary);
        });
    }

    // 3. Обновление таблицы оценок
    function enhanceGradesTable() {
        const isGradesUrl = window.location.href.includes('/my-results') || window.location.href.includes('/student-card');
        const hasGradesTable = Boolean(qs('table thead th, .p-datatable-thead th, .ui-table-thead th'));
        if (!isGradesUrl && !hasGradesTable) return;
        if (mseCourseRealizationsMap.size === 0 || mseLessonMaxGrades.size === 0) return;

        const { meetingColumns, currentTotalColIndex } = extractGradesTableColumns();
        if (meetingColumns.length === 0) return;

        const rows = qsa('table tbody tr, .p-datatable-tbody > tr, .ui-table-tbody > tr');
        rows.forEach(row => {
            const matchedLessons = findMatchedLessonsForRow(row);
            if (!matchedLessons) return;

            const courseUnitId = matchedLessons.courseUnitId;
            const tds = qsa('td', row);
            if (currentTotalColIndex !== -1 && tds[currentTotalColIndex]) {
                attachLostPointsToggleHandler(tds[currentTotalColIndex], tds, meetingColumns, matchedLessons, courseUnitId);
            }

            meetingColumns.forEach(({ colIndex, meetingNumber }) => {
                const meetingCell = tds[colIndex];
                if (!meetingCell) return;

                const lesson = matchedLessons ? matchedLessons[meetingNumber - 1] : null;
                const maxGrades = resolveLessonMaxGrades(lesson, courseUnitId);
                if (maxGrades && maxGrades.length > 0) {
                    injectMaxGradeBadge(meetingCell, maxGrades);
                } else {
                    injectUnknownMaxGradeBadge(meetingCell);
                }
            });
        });

        adjustMeetingColumnWidths(meetingColumns, rows);
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
                    for (const [key, val] of mseLessonNameToMaxGrade.entries()) {
                        if (key.endsWith(`:${name}`)) {
                            matchedMaxList = val;
                            break;
                        }
                    }
                    if (matchedMaxList) break;
                }
            }

            if (matchedMaxList && matchedMaxList.length > 0) {
                let maxIdx = 0;
                for (const el of allEls) {
                    if (el.children.length === 0) {
                        const txt = el.textContent.trim();

                        // 1. Выставленная оценка
                        if (/^\d+([.,]\d+)?$/.test(txt)) {
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

    let isSmartPickerLoading = false;

    const createSmartPickerBannerElement = () => {
        const banner = document.createElement('div');
        banner.id = ID_SMART_PICKER_BANNER;
        banner.className = 'smart-picker-banner';
        banner.innerHTML = `
            <div class="spb-left">
                <div class="spb-icon">
                    ${SVG_CALENDAR_SEARCH}
                </div>
                <div class="spb-text">
                    <div class="spb-title">Умный подбор секций</div>
                    <div class="spb-sub">Найдите секции без окон в расписании, в удобные дни или вместе с друзьями</div>
                </div>
            </div>
            <button type="button" class="spb-action-btn">
                <span>Открыть подбор</span>
                ${SVG_MOVE_RIGHT}
            </button>
        `;
        return banner;
    };

    const insertSmartPickerBanner = (banner) => {
        // Стратегия 1: Поиск карточки меню выбора через поисковый инпут таблицы
        const searchInput = qs('input[placeholder*="Наименование"], input[placeholder*="элемент"]');
        if (searchInput) {
            let el = searchInput;
            while (el && el.parentElement && el.parentElement !== document.body) {
                const prev = el.previousElementSibling;
                if (prev && (prev.textContent.includes('Выбирать можно') || prev.textContent.includes('Выбор сделан'))) {
                    el.insertAdjacentElement('beforebegin', banner);
                    return true;
                }
                if (el.classList.contains('card') || el.classList.contains('p-card') || el.tagName.toLowerCase() === 'p-card') {
                    el.insertAdjacentElement('beforebegin', banner);
                    return true;
                }
                el = el.parentElement;
            }
        }

        // Стратегия 2: Поиск по заголовку «Меню выбора» (вне навигационных хлебных крошек)
        const candidateHeaders = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span, p')).filter(el =>
            el.children.length === 0 &&
            el.textContent.trim() === 'Меню выбора' &&
            !el.closest('nav, .breadcrumb, p-breadcrumb, a')
        );
        for (const menuTitle of candidateHeaders) {
            const tableCard = menuTitle.closest('.card, p-card, .p-card, p-table, .p-table') || menuTitle.parentElement?.parentElement;
            if (tableCard && tableCard.parentElement) {
                tableCard.insertAdjacentElement('beforebegin', banner);
                return true;
            }
        }

        // Стратегия 3: Поиск контейнера строки статуса кампании
        const statusTextNode = Array.from(document.querySelectorAll('h1, h2, h3, h4, div, span, p')).find(el =>
            el.children.length === 0 &&
            (el.textContent.includes('Выбирать можно') || el.textContent.includes('Выбор сделан')) &&
            !el.closest('button, .smart-picker-banner')
        );
        if (statusTextNode) {
            let statusContainer = statusTextNode;
            while (statusContainer && statusContainer.parentElement && statusContainer.parentElement.children.length === 1) {
                statusContainer = statusContainer.parentElement;
            }
            if (statusContainer && statusContainer.parentElement) {
                statusContainer.insertAdjacentElement('afterend', banner);
                return true;
            }
        }

        return false;
    };

    const isValidModeusPathId = (value) => {
        if (typeof value !== 'string' || !value || value === '.' || value === '..') return false;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ||
            /^[a-zA-Z0-9_-]+$/.test(value);
    };

    const parsePeCampaignPathParams = (urlString) => {
        try {
            const { pathname } = new URL(urlString, window.location?.origin || 'https://utmn.modeus.org');
            const match = pathname.match(/\/menus\/([^/]+)\/student\/([^/]+)/);
            if (!match) return null;
            const campaignId = match[1];
            const bookingStudentId = match[2];
            if (!isValidModeusPathId(campaignId) || !isValidModeusPathId(bookingStudentId)) {
                return null;
            }
            return { campaignId, bookingStudentId };
        } catch {
            return null;
        }
    };

    const fetchPeCampaignModules = async (token, bookingStudentId, campaignId) => {
        if (!isValidModeusPathId(bookingStudentId) || !isValidModeusPathId(campaignId)) {
            throw new Error('Некорректный идентификатор кампании или студента.');
        }
        const safeStudentId = encodeURIComponent(bookingStudentId);
        const safeCampaignId = encodeURIComponent(campaignId);
        const menuRes = await fetch(`${API_BOOKING}/${safeStudentId}/campaigns/${safeCampaignId}/student-campaign-menu`, {
            headers: { 'authorization': `Bearer ${token}` }
        });
        if (!menuRes.ok) {
            const raw = await menuRes.text();
            logger.error(`[MSE PE] Ошибка загрузки меню кампании: HTTP ${menuRes.status}`);
            if (isDebug()) {
                logger.network('[MSE PE] Детали ошибки меню кампании:', { status: menuRes.status, raw });
            }
            throw new Error(`Ошибка загрузки меню: HTTP ${menuRes.status}`);
        }
        const menuData = await menuRes.json();
        if (!menuData.moduleElements || menuData.moduleElements.length === 0) {
            throw new Error('Модули для выбора не найдены.');
        }

        const modulePromises = menuData.moduleElements.map(m => {
            if (!isValidModeusPathId(m.id)) {
                return Promise.reject(new Error('Некорректный идентификатор модуля.'));
            }
            const safeModuleId = encodeURIComponent(m.id);
            return fetch(`${API_BOOKING}/${safeStudentId}/campaigns/${safeCampaignId}/student-campaign-menu/module-elements/${safeModuleId}`, {
                headers: { 'authorization': `Bearer ${token}` }
            }).then(async r => {
                if (!r.ok) {
                    const raw = await r.text();
                    logger.error(`[MSE PE] Ошибка загрузки команд модуля: HTTP ${r.status}`);
                    if (isDebug()) {
                        logger.network('[MSE PE] Детали ошибки модуля:', { moduleId: m.id, status: r.status, raw });
                    }
                    throw new Error(`Ошибка модуля: HTTP ${r.status}`);
                }
                const data = await r.json();
                return {
                    ...data,
                    id: data.id || m.id,
                    moduleElementId: data.moduleElementId || data.id || m.id,
                    name: data.name || m.name
                };
            });
        });
        return Promise.all(modulePromises);
    };

    const fetchPeBlockedScheduleSlots = async (token) => {
        const claims = parseJwt(token);
        const personId = claims.person_id || claims.sub;
        return sharedUtils.fetchBlockedScheduleSlots({
            token,
            personId,
            apiUrl: API_CALENDAR_SEARCH,
            daysAhead: PE_SCHEDULE_DAYS,
            fetchFn: (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : fetch
        });
    };

    const handleSmartPickerClick = async (banner) => {
        if (isSmartPickerLoading) return;

        const pathParams = parsePeCampaignPathParams(window.location.href);
        if (!pathParams) {
            showToast('Зайдите внутрь кампании физкультуры, чтобы подбор заработал.', 'warning');
            return;
        }
        const { campaignId, bookingStudentId } = pathParams;

        isSmartPickerLoading = true;
        const btnSpan = qs('.spb-action-btn span', banner);
        const actionBtn = qs('.spb-action-btn', banner);

        if (btnSpan) btnSpan.textContent = 'Загрузка баз...';
        if (actionBtn) actionBtn.disabled = true;

        try {
            const token = sessionStorage.getItem('id_token');

            // Параллельно загружаем модули кампании и слоты расписания
            const [allModulesData, blockedSlots] = await Promise.all([
                fetchPeCampaignModules(token, bookingStudentId, campaignId),
                fetchPeBlockedScheduleSlots(token)
            ]);

            logger.network(
                `[MSE PE] Успешно загружено модулей: ${allModulesData.length}`,
                allModulesData.map(mod => ({
                    moduleId: mod.moduleElementId,
                    name: mod.name,
                    selectedTeamIds: mod.selectedTeamIds || []
                }))
            );

            if (window.MSE_PE) {
                window.MSE_PE.openModal(allModulesData, blockedSlots, campaignId, bookingStudentId, teacherReviews);
            } else {
                showToast('Модуль pe-module.js не загружен.', 'error');
            }
        } catch (e) {
            logger.error('Ошибка подготовки модального окна физкультуры:', e);
            showToast('Ошибка загрузки: ' + e.message, 'error');
        } finally {
            isSmartPickerLoading = false;
            if (btnSpan) btnSpan.textContent = 'Открыть подбор';
            if (actionBtn) actionBtn.disabled = false;
        }
    };

    const enhanceSmartPickerBanner = () => {
        const peHeader = Array.from(document.querySelectorAll('h1, h2')).find(el =>
            el.textContent.includes('Физическая культура')
        );

        // Если это не кампания физкультуры, удаляем баннер (если он остался после SPA-перехода)
        if (!peHeader) {
            qs(`#${ID_SMART_PICKER_BANNER}`)?.remove();
            return;
        }

        // Очищаем старую кнопку из h1/h2 и восстанавливаем чистый заголовок
        qs(`#${ID_OPEN_PE_BTN}`, peHeader)?.remove();
        if (peHeader.style.display === 'inline-flex') {
            peHeader.style.display = '';
            peHeader.style.alignItems = '';
            peHeader.style.flexWrap = '';
        }

        if (qs(`#${ID_SMART_PICKER_BANNER}`)) return;

        const banner = createSmartPickerBannerElement();
        const inserted = insertSmartPickerBanner(banner);
        if (inserted) {
            banner.addEventListener('click', () => handleSmartPickerClick(banner));
        }
    };

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
            updateAddFriendButtons();

            if (qs('.main-calendar-form') && (!cachedSearchContainer || !cachedSearchContainer.isConnected)) setupUI();
            if (qs('.main-calendar-form') && (!observedCalendarTarget || !observedCalendarTarget.isConnected)) {
                setupCalendarResizeObserver();
            }
            if (qs('.main-calendar-form')) updateSearchCompactState();

            // Если выбран хоть один человек — всегда держим подсветку включенной (даже если кликнули на пару)
            if (selectedStudents.size > 0) {
                const wrapper = qs('#selected-students-dropdown-wrapper');
                if (wrapper && wrapper.style.display === 'none') {
                    updateSelectedStudentsDisplay();
                }
                highlightEventsForStudents();
            }

            if (window.location.href.includes('/learning-path-selection/menus/')) {
                enhanceSmartPickerBanner();
            } else {
                qs(`#${ID_SMART_PICKER_BANNER}`)?.remove();
                qs(`#${ID_OPEN_PE_BTN}`)?.remove();
            }

            if (window.location.href.includes('/schedule-calendar/')) {
                if (qs('modeus-main-menu') && !qs(`#${ID_FRIENDS_MENU}`)) {
                    renderFriendsMenu();
                } else if (qs('modeus-main-menu')) {
                    updateReturnToMeButton();
                }
            } else {
                qs(`#${ID_FRIENDS_MENU}`)?.remove();
                qs(`#${ID_RETURN_TO_ME_MENU}`)?.remove();
            }

            enhanceDrawerHeader();
        }, MUTATION_DEBOUNCE_DELAY_MS);
    };

    const enhanceDrawerHeader = () => {
        const header = qs('.event-card-container__header');
        if (!header) return;

        if (!qs(`#${ID_STOP_BUTTON}`)) {
            const stopButton = document.createElement('span');
            stopButton.id = ID_STOP_BUTTON;
            stopButton.innerHTML = `${SVG_BAN}Стоп-скрипт`;
            stopButton.addEventListener('click', stopAndCleanUp);
            header.insertBefore(stopButton, header.firstChild);
        }

        const exportIcon = header.querySelector('.mod-ico__export');
        if (exportIcon && !exportIcon.hasAttribute('data-mse-enhanced')) {
            exportIcon.setAttribute('data-mse-enhanced', 'true');
            exportIcon.className = 'mse-header-icon';
            exportIcon.innerHTML = SVG_EXTERNAL_LINK;
        }

        const crossIcon = header.querySelector('.mod-ico__cross');
        if (crossIcon && !crossIcon.hasAttribute('data-mse-enhanced')) {
            crossIcon.setAttribute('data-mse-enhanced', 'true');
            crossIcon.className = 'mse-header-icon';
            crossIcon.innerHTML = SVG_X_DRAWER;
        }
    };

    const hasAddedEventMatching = (mutations, eventElementPredicate, nestedSelector) => {
        if (!mutations) return false;
        for (const mutation of mutations) {
            const addedNodes = mutation.addedNodes;
            if (!addedNodes || addedNodes.length === 0) continue;
            for (const node of addedNodes) {
                if (!node || node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.classList?.contains('fc-time-grid-event')) {
                    if (eventElementPredicate(node)) return true;
                } else if (typeof node.querySelector === 'function' && node.querySelector(nestedSelector)) {
                    return true;
                }
            }
        }
        return false;
    };

    const handleMainDomMutations = (mutations) => {
        // Синхронный возврат панели поиска в .fc-toolbar до фазы Paint браузера
        if (cachedSearchContainer && !cachedSearchContainer.isConnected) {
            const targetToolbar = qs('.fc-toolbar') || qs('.fc-header-toolbar') || qs('.main-calendar-form');
            if (targetToolbar) {
                targetToolbar.appendChild(cachedSearchContainer);
                updateSearchCompactState();
            }
        }

        // Синхронная подмена названий корпусов и восстановление подсветки пар строго до Paint-фазы браузера
        if (!isRestoringHighlights) {
            const hasNewBuildings = hasAddedEventMatching(
                mutations,
                node => node.getAttribute('data-mse-buildings-enhanced') !== '1',
                '.fc-time-grid-event:not([data-mse-buildings-enhanced="1"])'
            );
            const hasNewSearch = selectedStudents.size > 0 && eventCache.size > 0 && hasAddedEventMatching(
                mutations,
                node => !node.classList.contains('search-highlight') && !node.classList.contains('search-fade'),
                '.fc-time-grid-event:not(.search-highlight):not(.search-fade)'
            );

            if (hasNewBuildings || hasNewSearch) {
                try {
                    isRestoringHighlights = true;
                    enhanceBuildingNames();
                    if (selectedStudents.size > 0 && eventCache.size > 0) {
                        linkDomEventsToCache();
                        highlightEventsForStudents();
                    }
                } finally {
                    isRestoringHighlights = false;
                }
            }
        }

        debouncedMutationHandler();
    };

    const observer = new MutationObserver(handleMainDomMutations);
    observer.observe(document.body, { childList: true, subtree: true });

    history.pushState = function (...args) {
        nativePushState.apply(history, args);
        processUrlChange();
    };
    window.addEventListener('popstate', processUrlChange);
    processUrlChange();

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

    // Фоновая проверка обновлений при старте приложения (тихая при попадании в кэш)
    setTimeout(() => {
        checkExtensionUpdate({ force: false, manual: false });
    }, 1500);

    // Периодическая проверка обновлений по истечении интервала кэша (каждые 2 часа)
    updateCheckInterval = setInterval(() => {
        checkExtensionUpdate({ force: false, manual: false });
    }, UPDATE_CHECK_INTERVAL_MS);

    // Запуск фонового учета продуктовой активности (Engagement-Based Retention)
    startEngagementTracker();

    logger.debug('Скрипт запущен!');
    if (isDebug()) {
        printDebugStatus();
    }
})();