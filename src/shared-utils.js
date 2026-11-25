// Общие утилиты уровня Main World и изолированных контент-скриптов (без зависимостей сборки)
(function (global) {
    'use strict';

    const PE_SCHEDULE_DAYS = 21;
    const API_CALENDAR_SEARCH_URL = 'https://utmn.modeus.org/schedule-calendar-v2/api/calendar/events/search?tz=Asia/Tyumen';
    const WEEKDAY_RU_BY_JS_DAY = { 1: 'ПН', 2: 'ВТ', 3: 'СР', 4: 'ЧТ', 5: 'ПТ', 6: 'СБ' };

    /**
     * Экранирует HTML-спецсимволы для защиты от XSS при вставке строк в шаблоны.
     * @param {*} str
     * @returns {string}
     */
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Безопасно декодирует строку Base64 в UTF-8 без устаревших escape/unescape.
     * @param {string} base64
     * @returns {string}
     */
    function decodeBase64Utf8(base64) {
        try {
            const binary = atob(base64);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch {
            try {
                const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
                const binary = atob(padded);
                const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
                return new TextDecoder('utf-8').decode(bytes);
            } catch {
                return '';
            }
        }
    }

    /**
     * Безопасно декодирует payload JWT-токена.
     * @param {string} token
     * @param {Function} [onWarn]
     * @returns {Object}
     */
    function parseJwt(token, onWarn) {
        try {
            if (!token || typeof token !== 'string') return {};
            let payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
            if (!payload) return {};
            while (payload.length % 4) payload += '=';
            return JSON.parse(decodeBase64Utf8(payload));
        } catch (err) {
            if (typeof onWarn === 'function') {
                onWarn('Ошибка парсинга JWT:', err);
            }
            return {};
        }
    }

    /**
     * Проверяет включен ли runtime-режим отладки MSE.
     * @returns {boolean}
     */
    function isDebug() {
        try {
            return localStorage.getItem('mse_debug') === 'true' ||
                localStorage.getItem('mse_debug') === '1' ||
                (typeof window !== 'undefined' && window.__MSE_DEBUG__ === true);
        } catch {
            return typeof window !== 'undefined' && window.__MSE_DEBUG__ === true;
        }
    }

    /**
     * Безопасно считывает список друзей из localStorage без падения при поврежденном JSON.
     * @param {string} [storageKey='mse_friends_list']
     * @param {Function} [onError]
     * @returns {Array<{id: string, fullName: string}>}
     */
    function readFriendsList(storageKey = 'mse_friends_list', onError) {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            if (typeof onError === 'function') {
                onError(err);
            }
            return [];
        }
    }

    /**
     * Неблокирующий вывод пользовательского уведомления (без fallback на alert()).
     * @param {string} message
     * @param {string} [type='info']
     */
    function notifyUser(message, type = 'info') {
        const toastFn = (typeof window !== 'undefined')
            ? (typeof window.MSE_showToast === 'function'
                ? window.MSE_showToast
                : (typeof window.showToast === 'function' ? window.showToast : null))
            : null;
        if (toastFn) {
            toastFn(message, type);
            return;
        }
        const logMethod = type === 'error' ? 'error' : 'warn';
        if (typeof console !== 'undefined' && typeof console[logMethod] === 'function') {
            console[logMethod](`[MSE ${type}]`, message);
        }
    }

    /**
     * Группирует события расписания (кроме физкультуры) в структуру слотов { [день]: { [время]: string[] } }.
     * Возвращает чистые массивы названий дисциплин без HTML-разметки.
     * @param {Array<Object>} events
     * @returns {Object}
     */
    function buildBlockedScheduleSlots(events) {
        const blockedSlots = {};
        if (!Array.isArray(events)) return blockedSlots;

        events.forEach(calendarEvent => {
            if (!calendarEvent?.name || !calendarEvent?.startsAtLocal) return;
            if (calendarEvent.name.toLowerCase().includes('физическая культура')) return;

            const eventDate = new Date(calendarEvent.startsAtLocal);
            const day = WEEKDAY_RU_BY_JS_DAY[eventDate.getDay()];
            if (!day) return;

            const timePart = calendarEvent.startsAtLocal.split('T')[1];
            if (!timePart) return;
            let time = timePart.substring(0, 5);
            if (time.startsWith('0')) time = time.substring(1);

            if (!blockedSlots[day]) blockedSlots[day] = {};
            if (!blockedSlots[day][time]) blockedSlots[day][time] = [];
            if (!blockedSlots[day][time].includes(calendarEvent.name)) {
                blockedSlots[day][time].push(calendarEvent.name);
            }
        });

        return blockedSlots;
    }

    /**
     * Загружает занятые слоты расписания студента за ближайшие daysAhead дней.
     * @param {Object} params
     * @returns {Promise<Object>}
     */
    async function fetchBlockedScheduleSlots({
        token,
        personId,
        apiUrl = API_CALENDAR_SEARCH_URL,
        daysAhead = PE_SCHEDULE_DAYS,
        fetchFn = null
    }) {
        const activeFetch = fetchFn || (typeof window !== 'undefined' && window.fetch ? window.fetch.bind(window) : fetch);
        const now = new Date();
        const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

        const res = await activeFetch(apiUrl, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${token}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                size: 500,
                timeMin: now.toISOString(),
                timeMax: future.toISOString(),
                attendeePersonId: [personId]
            })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const eventsData = await res.json();
        const events = eventsData._embedded?.events || [];
        return buildBlockedScheduleSlots(events);
    }

    const MSE_SHARED = {
        PE_SCHEDULE_DAYS,
        API_CALENDAR_SEARCH_URL,
        WEEKDAY_RU_BY_JS_DAY,
        escapeHtml,
        decodeBase64Utf8,
        parseJwt,
        isDebug,
        readFriendsList,
        notifyUser,
        buildBlockedScheduleSlots,
        fetchBlockedScheduleSlots
    };

    global.MSE_SHARED = MSE_SHARED;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MSE_SHARED;
    }
})(typeof window !== 'undefined' ? window : globalThis);
