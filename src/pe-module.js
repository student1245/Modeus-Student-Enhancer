window.MSE_PE = (function () {
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

    const STORAGE_KEY_FRIENDS = 'mse_friends_list';
    const BOOKING_API_BASE = 'https://utmn.modeus.org/course-unit-booking/api/v1/students';
    const PEOPLE_SEARCH_API_URL = 'https://utmn.modeus.org/schedule-calendar-v2/api/people/persons/search';
    const SCROLLBAR_MIN_THUMB_PX = 28;
    const SCROLLBAR_INIT_DELAY_MS = 50;
    const FRIEND_FOCUS_DELAY_MS = 50;

    let courses = [];
    let sportsSet = new Set();
    let campusesSet = new Set();
    let collapsedRows = new Set();
    let selectedSports = new Set();
    let selectedCampuses = new Set();

    let currentSchedule = {};
    let friendSchedule = null;
    let friendNameForUI = null;

    let allModules = [];
    let enrolledTeamsMap = new Map();
    let teamToModulesMap = new Map(); // teamId -> Set идентификаторов модулей (moduleElementId)
    let apiStudentId = '';
    let apiCampaignId = '';
    let localTeacherReviews = new Map();

    const showToast = (message, type = 'info') => {
        if (sharedUtils && typeof sharedUtils.notifyUser === 'function') {
            sharedUtils.notifyUser(message, type);
            return;
        }
        if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        if (typeof console !== 'undefined') {
            const method = type === 'error' ? 'error' : 'warn';
            console[method]('[MSE PE]', message);
        }
    };

    const escapeHtml = (str) => {
        if (sharedUtils && typeof sharedUtils.escapeHtml === 'function') {
            return sharedUtils.escapeHtml(str);
        }
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const readStoredFriends = () => (
        sharedUtils && typeof sharedUtils.readFriendsList === 'function'
            ? sharedUtils.readFriendsList(STORAGE_KEY_FRIENDS)
            : []
    );

    function syncOverlayTrackPosition(track, scrollEl, isOverlay) {
        if (!isOverlay) return;
        const header = scrollEl.querySelector('.header-panel');
        const headerH = header ? header.offsetHeight : 0;
        track.style.setProperty('top', `${headerH + 4}px`, 'important');
    }

    function createSmoothScrollbarDom(scrollEl, container, isOverlay) {
        const track = document.createElement('div');
        track.className = 'mse-scroll-track' + (isOverlay ? ' mse-scroll-track-fixed' : '');
        syncOverlayTrackPosition(track, scrollEl, isOverlay);

        const thumb = document.createElement('div');
        thumb.className = 'mse-scroll-thumb';
        track.appendChild(thumb);
        if (container) {
            container.appendChild(track);
        }
        return { track, thumb };
    }

    function bindTrackClickScroll(scrollEl, track, thumb, update) {
        track.addEventListener('mousedown', (event) => {
            if (event.target === thumb) return;
            const trackRect = track.getBoundingClientRect();
            const clickY = event.clientY - trackRect.top;
            const thumbH = thumb.offsetHeight || SCROLLBAR_MIN_THUMB_PX;
            const targetThumbTop = clickY - thumbH / 2;
            const maxThumbTop = track.clientHeight - thumbH;
            const ratio = Math.max(0, Math.min(1, targetThumbTop / (maxThumbTop || 1)));
            const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
            scrollEl.scrollTop = ratio * maxScrollTop;
            update();
        });
    }

    function bindThumbDragScroll(scrollEl, track, thumb) {
        let activeMoveHandler = null;
        let activeUpHandler = null;

        const stopDrag = () => {
            track.classList.remove('dragging');
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.remove('mse-scrollbar-dragging');
            }
            if (activeMoveHandler && typeof window !== 'undefined') {
                window.removeEventListener('mousemove', activeMoveHandler);
            }
            if (activeUpHandler && typeof window !== 'undefined') {
                window.removeEventListener('mouseup', activeUpHandler);
            }
            activeMoveHandler = null;
            activeUpHandler = null;
        };

        thumb.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            track.classList.add('dragging');
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.add('mse-scrollbar-dragging');
            }

            const startY = event.clientY;
            const startTop = parseFloat(thumb.style.top) || 0;
            const maxThumbTop = track.clientHeight - (thumb.offsetHeight || SCROLLBAR_MIN_THUMB_PX);
            const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;

            activeMoveHandler = (moveEvent) => {
                const deltaY = moveEvent.clientY - startY;
                const newTop = Math.max(0, Math.min(maxThumbTop, startTop + deltaY));
                const ratio = maxThumbTop > 0 ? newTop / maxThumbTop : 0;
                scrollEl.scrollTop = ratio * maxScrollTop;
                thumb.style.top = `${newTop}px`;
            };
            activeUpHandler = stopDrag;

            window.addEventListener('mousemove', activeMoveHandler);
            window.addEventListener('mouseup', activeUpHandler);
        });

        return stopDrag;
    }

    function observeScrollContainerResize(scrollEl, isOverlay, update) {
        if (typeof ResizeObserver === 'undefined') return null;
        const resizeObserver = new ResizeObserver(() => update());
        resizeObserver.observe(scrollEl);
        if (scrollEl.firstElementChild) {
            resizeObserver.observe(scrollEl.firstElementChild);
        }
        if (isOverlay) {
            const header = scrollEl.querySelector('.header-panel');
            if (header) resizeObserver.observe(header);
        }
        return resizeObserver;
    }

    /**
     * Плавный GPU-скроллбар (Вариант S5) с масштабированием 2px -> 6px (scaleX)
     * @param {HTMLElement} scrollEl - Прокручиваемый элемент
     * @returns {{ update: Function, destroy: Function, track: HTMLElement, thumb: HTMLElement }|null}
     */
    function attachSmoothScrollbar(scrollEl) {
        if (!scrollEl || (typeof HTMLElement !== 'undefined' ? !(scrollEl instanceof HTMLElement) : (!scrollEl || scrollEl.nodeType !== 1))) return null;
        if (scrollEl._mseSmoothScrollbar) {
            scrollEl._mseSmoothScrollbar.update();
            return scrollEl._mseSmoothScrollbar;
        }

        scrollEl.classList.add('mse-has-smooth-scroll');

        const isOverlay = scrollEl.id === 'mse-pe-overlay' || (typeof document !== 'undefined' && scrollEl === document.body);
        const container = isOverlay ? scrollEl : (scrollEl.parentElement || scrollEl);

        if (!isOverlay && container && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            if (window.getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
        }

        const { track, thumb } = createSmoothScrollbarDom(scrollEl, container, isOverlay);

        function update() {
            if (!scrollEl.isConnected || !track.isConnected) return;
            syncOverlayTrackPosition(track, scrollEl, isOverlay);

            const scrollH = scrollEl.scrollHeight;
            const clientH = scrollEl.clientHeight;
            const trackH = track.clientHeight || (container ? container.clientHeight - 8 : 0);

            if (scrollH <= clientH + 1 || clientH <= 0 || trackH <= 0) {
                track.style.opacity = '0';
                track.style.pointerEvents = 'none';
                return;
            }

            track.style.opacity = '';
            track.style.pointerEvents = '';

            const thumbH = Math.max(SCROLLBAR_MIN_THUMB_PX, Math.round(trackH * (clientH / scrollH)));
            const maxScrollTop = scrollH - clientH;
            const maxThumbTop = trackH - thumbH;
            const thumbTop = maxScrollTop > 0 ? Math.round((scrollEl.scrollTop / maxScrollTop) * maxThumbTop) : 0;

            thumb.style.height = `${thumbH}px`;
            thumb.style.top = `${thumbTop}px`;
        }

        scrollEl.addEventListener('scroll', update, { passive: true });
        bindTrackClickScroll(scrollEl, track, thumb, update);
        const cleanupDrag = bindThumbDragScroll(scrollEl, track, thumb);
        const resizeObserver = observeScrollContainerResize(scrollEl, isOverlay, update);

        update();
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                update();
                requestAnimationFrame(update);
            });
        }
        const initTimerId = setTimeout(update, SCROLLBAR_INIT_DELAY_MS);

        const instance = {
            track,
            thumb,
            update,
            destroy: function () {
                clearTimeout(initTimerId);
                cleanupDrag();
                scrollEl.removeEventListener('scroll', update);
                if (resizeObserver) resizeObserver.disconnect();
                track.remove();
                scrollEl.classList.remove('mse-has-smooth-scroll');
                delete scrollEl._mseSmoothScrollbar;
            }
        };

        scrollEl._mseSmoothScrollbar = instance;
        return instance;
    }

    if (typeof window !== 'undefined') {
        window.MSE_attachSmoothScrollbar = attachSmoothScrollbar;
    }

    function updateTeamAvailable(teamId, delta) {
        allModules.forEach(mod => {
            if (mod.cycles && Array.isArray(mod.cycles)) {
                mod.cycles.forEach(cycle => {
                    if (cycle.teams && Array.isArray(cycle.teams)) {
                        cycle.teams.forEach(t => {
                            if (t.id === teamId && typeof t.available === 'number') {
                                t.available = Math.max(0, t.available + delta);
                            }
                        });
                    }
                });
            }
        });
    }

    let currentModalGroup = [];
    let currentModalItemIds = new Set();
    let currentModalTimeIdx = 0;
    let currentModalSport = '';
    let currentModalDay = '';
    let currentModalTime = '';

    const PE_TIME_SLOTS = [
        { label: '8:30', prefixes: ['8:30'], conflictKeys: ['8:30', '08:30'] },
        { label: '10:15', prefixes: ['10:15'], conflictKeys: ['10:15'] },
        { label: '12:00', prefixes: ['12:00', '12:05'], conflictKeys: ['12:00', '12:05'] },
        { label: '14:00', prefixes: ['14:00', '14:05'], conflictKeys: ['14:00', '14:05'] },
        { label: '15:45', prefixes: ['15:45', '15:55'], conflictKeys: ['15:45', '15:55'] },
        { label: '17:30', prefixes: ['17:30', '17:40'], conflictKeys: ['17:30', '17:40'] },
        { label: '19:15', prefixes: ['19:15', '19:20'], conflictKeys: ['19:15', '19:20'] }
    ];
    const days = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

    const dayFullNames = { 'ПН': 'Понедельник', 'ВТ': 'Вторник', 'СР': 'Среда', 'ЧТ': 'Четверг', 'ПТ': 'Пятница', 'СБ': 'Суббота' };

    const campusInfo = {
        "Эко-парк": {
            match: ["эко парк", "эко-парк", "цзвс", "улк-13", "улк 13", "корпус-13", "корпус 13", "13", "барнаульская"],
            address: "ул. Барнаульская, 41",
            link: "https://yandex.ru/maps/55/tyumen/house/barnaulskaya_ulitsa_41/YkwYcgJnSkIPQFttfX13d35iZw==/?ll=65.465932%2C57.165186&z=16.2"
        },
        "Олимпия": {
            match: ["олимпия", "ифк", "07 ск", "07-ск", "улк-07", "улк 07", "улк-08", "улк 08", "корпус-07", "корпус 07", "корпус-08", "корпус 08", "07", "08", "пржевальского"],
            address: "ул. Пржевальского, 37",
            link: "https://yandex.ru/maps/55/tyumen/house/ulitsa_przhevalskogo_37/YkwYcw9jTUQFQFttfX1yd3lnbA==/?ll=65.583591%2C57.136337&z=17.6"
        },
        "Матфак": {
            match: ["матфак", "корпус-05", "корпус 05", "улк-5", "улк-05", "улк 5", "улк 05", "05", "перекопская"],
            address: "ул. Перекопская, 15а",
            link: "https://yandex.ru/maps/55/tyumen/house/perekopskaya_ulitsa_15a/YkwYcwViS0QOQFttfX10eH9nYQ==/?ll=65.522219%2C57.159346&z=17"
        },
        "Биофак": {
            match: ["биофак", "корпус-06", "корпус 06", "улк-6", "улк-06", "улк 6", "улк 06", "06", "пирогова"],
            address: "ул. Пирогова, 3",
            link: "https://yandex.ru/maps/55/tyumen/house/ulitsa_pirogova_3/YkwYcwJgT00BQFttfX14eHlmYQ==/?ll=65.589955%2C57.199222&z=12.6"
        },
        "Аграрный уник": {
            match: ["аграрный", "рощинское"],
            address: "ул. Рощинское шоссе, 2 к3",
            link: "https://yandex.ru/maps/55/tyumen/house/roshchinskoye_shosse_2k3/YkwYcgRkT0UBQFttfX13cn9qZg==/?ll=65.434090%2C57.162956&z=17.05"
        },
        "Главный корпус": {
            match: ["главный", "республики", "01", "улк-01"],
            address: "ул. Республики, 9",
            link: "https://yandex.ru/maps/55/tyumen/house/ulitsa_respubliki_9/YkwYcQZlTUcOQFttfX1wd39jZg==/?ll=65.534328%2C57.155490&z=17"
        },
        "СОК": {
            match: ["сок", "ленина", "09", "улк-09"],
            address: "ул. Ленина, 6",
            link: "https://yandex.ru/maps/55/tyumen/house/ulitsa_lenina_6/YkwYcQZpT0wFQFttfX1yd3VqZA==/?ll=65.537233%2C57.156094&z=17"
        },
        "ШО": {
            match: ["16", "корпус-16", "9 мая", "улк-16"],
            address: "ул. Проезд 9 Мая, 5",
            link: "https://maps.yandex.ru/?z=18&l=map&text=%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F,%20%D0%B3.%20%D0%A2%D1%8E%D0%BC%D0%B5%D0%BD%D1%8C,%20%D1%83%D0%BB.%20%D0%9F%D1%80%D0%BE%D0%B5%D0%B7%D0%B4%209%20%D0%9C%D0%B0%D1%8F,%205"
        }
    };

    function getSlotIndex(timeStr) {
        if (!timeStr) return -1;
        const clean = timeStr.trim().replace(/^0/, '');
        return PE_TIME_SLOTS.findIndex(slot => slot.prefixes.some(prefix => clean.startsWith(prefix)));
    }

    function findScheduleConflict(scheduleMap, day, possibleKeys) {
        if (!scheduleMap || !scheduleMap[day]) return null;
        for (const timeKey of possibleKeys) {
            if (scheduleMap[day][timeKey]) {
                return scheduleMap[day][timeKey];
            }
        }
        return null;
    }

    function getConflict(day, slotIdx) {
        const possibleKeys = PE_TIME_SLOTS[slotIdx]?.conflictKeys || [];
        const userConflict = findScheduleConflict(currentSchedule, day, possibleKeys);
        const friendConflict = findScheduleConflict(friendSchedule, day, possibleKeys);

        if (userConflict || friendConflict) return { user: userConflict, friend: friendConflict };
        return null;
    }

    function resolveCampus(rawLoc) {
        const locLower = rawLoc.toLowerCase();
        for (const [campusName, info] of Object.entries(campusInfo)) {
            if (info.match.some(keyword => locLower.includes(keyword))) {
                return { name: campusName, address: info.address, link: info.link };
            }
        }
        return { name: "Другой корпус", address: rawLoc, link: `https://yandex.ru/maps/55/tyumen/search/${encodeURIComponent(rawLoc)}` };
    }

    function normalizeSportName(rawName) {
        const lower = rawName.toLowerCase();
        if (lower.includes('волей')) return 'Волейбол';
        if (lower.includes('баскет')) return 'Баскетбол';
        if (lower.includes('фут')) return 'Мини-футбол';
        if (lower.includes('теннис')) return 'Н/теннис';
        if (lower.includes('офп')) return lower.includes('единоборст') ? 'ОФП с элементами единоборств' : 'ОФП';
        if (lower.includes('плаван')) return 'Плавание';
        if (lower.includes('аэроб')) return 'Аэробика';
        if (lower.includes('фитнес')) return 'Фитнес';
        if (lower.includes('бокс')) return 'Бокс';
        if (lower.includes('стретч')) return 'Стретчинг';
        if (lower.includes('гимнаст')) return 'Гимнастика';
        if (lower.includes('атлетиз')) return 'Атлетизм';
        if (lower.includes('смг')) return 'СМГ';
        return rawName.trim();
    }

    function parseData() {
        courses = [];
        sportsSet.clear();
        campusesSet.clear();
        enrolledTeamsMap.clear();
        teamToModulesMap.clear();

        allModules.forEach(mod => {
            const mId = mod.moduleElementId || mod.id;
            if (mod.selectedTeamIds && mod.selectedTeamIds.length > 0) {
                mod.selectedTeamIds.forEach(tid => enrolledTeamsMap.set(tid, mId));
            }
        });

        const uniqueTeams = new Map();
        allModules.forEach(mod => {
            const mId = mod.moduleElementId || mod.id;
            if (mod.cycles && Array.isArray(mod.cycles)) {
                mod.cycles.forEach(cycle => {
                    if (cycle.teams && Array.isArray(cycle.teams)) {
                        cycle.teams.forEach(t => {
                            if (!teamToModulesMap.has(t.id)) {
                                teamToModulesMap.set(t.id, new Set());
                            }
                            teamToModulesMap.get(t.id).add(mId);

                            if (!uniqueTeams.has(t.id)) {
                                uniqueTeams.set(t.id, t);
                            }
                        });
                    }
                });
            }
        });

        Array.from(uniqueTeams.values()).forEach((t, idx) => {
            const cleanName = t.name || "";
            const match = cleanName.match(/ФК:\s+(.+?)\s+(ПН|ВТ|СР|ЧТ|ПТ|СБ)\s+(\d{1,2}:\d{2})\s+(.*)/);

            if (match) {
                let sport = normalizeSportName(match[1]);
                let rawLoc = match[4].trim();
                let campusObj = resolveCampus(rawLoc);

                sportsSet.add(sport);
                campusesSet.add(campusObj.name);

                courses.push({
                    id: t.id,
                    secNum: idx + 1,
                    sport: sport,
                    day: match[2],
                    time: match[3],
                    slotIdx: getSlotIndex(match[3]),
                    loc: rawLoc,
                    campus: campusObj.name,
                    address: campusObj.address,
                    mapLink: campusObj.link,
                    prof: t.teachers?.[0] || "Не указан",
                    avail: t.available ?? 0,
                    total: t.limit ?? 0,
                    enrolled: enrolledTeamsMap.has(t.id)
                });
            }
        });
    }

    function initMultiSelects() {
        selectedSports = new Set(sportsSet);
        selectedCampuses = new Set(campusesSet);
        buildOptionsList('sport', sportsSet, selectedSports);
        buildOptionsList('campus', campusesSet, selectedCampuses);
        updateButtonLabel('sport');
        updateButtonLabel('campus');
    }

    function buildOptionsList(type, allItems, selectedSet) {
        const container = document.getElementById(`pe-${type}OptionsList`);
        if (!container) return;
        container.innerHTML = '';

        [...allItems].sort().forEach(item => {
            const label = document.createElement('label');
            label.className = 'ms-item';
            label.innerHTML = `<input type="checkbox" value="${escapeHtml(item)}" ${selectedSet.has(item) ? 'checked' : ''}> <span>${escapeHtml(item)}</span>`;
            const inputEl = label.querySelector('input');
            if (inputEl) {
                inputEl.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        selectedSet.add(item);
                    } else {
                        selectedSet.delete(item);
                    }
                    updateButtonLabel(type);
                    renderGrid();
                });
            }
            container.appendChild(label);
        });
        attachSmoothScrollbar(container);
    }

    function updateButtonLabel(type) {
        const targetSet = type === 'sport' ? selectedSports : selectedCampuses;
        const total = type === 'sport' ? sportsSet.size : campusesSet.size;
        const labelEl = document.getElementById(`pe-${type}Label`);
        if (!labelEl) return;

        if (targetSet.size === total) {
            labelEl.innerText = type === 'sport' ? 'Все виды спорта' : 'Все корпуса';
        } else if (targetSet.size === 0) {
            labelEl.innerText = 'Не выбрано';
        } else if (targetSet.size <= 2) {
            labelEl.innerText = [...targetSet].join(', ');
        } else {
            labelEl.innerText = `Выбрано: ${targetSet.size} из ${total}`;
        }
    }

    function selectAllOptions(type, selectAll) {
        const targetSet = type === 'sport' ? selectedSports : selectedCampuses;
        const allSet = type === 'sport' ? sportsSet : campusesSet;
        targetSet.clear();
        if (selectAll) {
            allSet.forEach(v => targetSet.add(v));
        }
        document.querySelectorAll(`#pe-${type}OptionsList input[type="checkbox"]`).forEach(i => {
            i.checked = selectAll;
        });
        updateButtonLabel(type);
        renderGrid();
    }

    function isFilterActive(id) {
        const el = document.getElementById(id);
        return el ? el.classList.contains('active') : false;
    }

    function setFilterActive(id, isActive) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('active', Boolean(isActive));
        el.checked = Boolean(isActive);
    }

    window.togglePeMultiSelect = function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        const isOpen = el.classList.contains('open');
        document.querySelectorAll('.custom-multiselect').forEach(m => m.classList.remove('open'));
        if (!isOpen) {
            el.classList.add('open');
        }
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-multiselect')) {
            document.querySelectorAll('.custom-multiselect').forEach(m => m.classList.remove('open'));
        }
    });

    async function getPersonIdByName(name) {
        // 1. Сначала ищем в локальных друзьях (мгновенно)
        const friends = readStoredFriends();
        const lowerQuery = name.toLowerCase();
        const friend = friends.find(
            item => item && typeof item.fullName === 'string' && item.fullName.toLowerCase().includes(lowerQuery)
        );
        if (friend) return { id: friend.id, name: friend.fullName };

        // 2. Если нет в друзьях — ищем через актуальное POST API Модеуса
        const token = sessionStorage.getItem('id_token');
        try {
            const res = await fetch(PEOPLE_SEARCH_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    fullName: name,
                    sort: "+fullName",
                    size: 10,
                    page: 0
                })
            });

            if (res.ok) {
                const data = await res.json();
                const persons = data._embedded?.persons || data.items || (Array.isArray(data) ? data : []);
                if (persons.length > 0) {
                    return { id: persons[0].id, name: persons[0].fullName };
                }
            }
        } catch (err) {
            console.warn("Ошибка поиска через API:", err);
        }

        return null;
    }

    function formatFriendShortName(fullName) {
        const parts = String(fullName || '').trim().split(/\s+/);
        return parts[0] + ' ' + (parts[1]?.[0] || '') + '.';
    }

    function setFriendToggleButtonState(friendShortName) {
        const toggleBtn = document.getElementById('pe-friendToggleBtn');
        if (!toggleBtn) return;
        const isActive = Boolean(friendShortName);
        toggleBtn.classList.toggle('is-active', isActive);
        toggleBtn.title = isActive
            ? `Сравнить пары с: ${friendShortName} (нажмите для изменения/сброса)`
            : 'Сравнить пары с другом (поиск по ФИО)';
    }

    function setFriendSearchUiState({ wrapper, input, btn }, isLoading, shortName = null) {
        if (isLoading) {
            btn.innerHTML = getSvgIcon('refresh-ccw', {
                size: 14,
                className: 'mse-spinning-icon'
            });
            btn.disabled = true;
            input.disabled = true;
            return;
        }

        btn.disabled = false;
        input.disabled = false;
        if (shortName) {
            wrapper.classList.add('has-friend');
            input.value = `С вами: ${shortName}`;
            input.readOnly = true;
            btn.innerText = "Сброс";
        } else {
            btn.innerText = "Поиск";
        }
    }

    window.MSE_PE_loadFriend = async function () {
        const input = document.getElementById('pe-friendInput');
        const wrapper = document.getElementById('pe-friendWrapper');
        const btn = document.getElementById('pe-friendBtn');
        if (!input || !wrapper || !btn) return;

        const name = input.value.trim();
        if (!name) {
            window.MSE_PE_clearFriend();
            return;
        }

        setFriendSearchUiState({ wrapper, input, btn }, true);

        try {
            const person = await getPersonIdByName(name);
            if (!person) {
                showToast("Студент не найден. Проверьте ФИО или сначала добавьте его в друзья в главном календаре.", 'warning');
                setFriendSearchUiState({ wrapper, input, btn }, false);
                return;
            }

            friendNameForUI = formatFriendShortName(person.name);
            const token = sessionStorage.getItem('id_token');
            friendSchedule = sharedUtils?.fetchBlockedScheduleSlots
                ? await sharedUtils.fetchBlockedScheduleSlots({
                    token,
                    personId: person.id,
                    fetchFn: (typeof window !== 'undefined' && window.fetch) ? window.fetch.bind(window) : fetch
                })
                : {};

            setFriendSearchUiState({ wrapper, input, btn }, false, friendNameForUI);
            setFriendToggleButtonState(friendNameForUI);
            renderGrid();
        } catch (err) {
            showToast("Ошибка при загрузке расписания друга: " + err.message, 'error');
            setFriendSearchUiState({ wrapper, input, btn }, false);
        }
    };

    window.MSE_PE_clearFriend = function () {
        const input = document.getElementById('pe-friendInput');
        const wrapper = document.getElementById('pe-friendWrapper');
        const btn = document.getElementById('pe-friendBtn');

        if (input) {
            input.value = '';
            input.readOnly = false;
            input.disabled = false;
        }
        if (wrapper) wrapper.classList.remove('has-friend');
        if (btn) btn.innerText = 'Поиск';
        setFriendToggleButtonState(null);

        friendSchedule = null;
        friendNameForUI = null;
        renderGrid();
    };

    const BUSY_CALENDAR_SVG = getSvgIcon('calendar', { size: 11, strokeWidth: 2.2 });
    const BUSY_CHEVRON_SVG = getSvgIcon('chevron-down', { size: 12, strokeWidth: 2.2, className: 'busy-chevron' });

    function getSlotsStatusClass(available) {
        if (available >= 4) return 'slots-ok';
        if (available >= 1) return 'slots-low';
        return 'slots-zero';
    }

    function isBusyCardExpandable(disciplinesList) {
        if (!disciplinesList || disciplinesList.length === 0) return false;
        if (disciplinesList.length > 2) return true;
        if (disciplinesList.length === 2) {
            return disciplinesList.some(d => d.length > 26) || (disciplinesList[0].length + disciplinesList[1].length > 48);
        }
        return disciplinesList[0].length > 58;
    }

    function createBusyCardHtml(labelText, disciplinesList) {
        const safeTitle = disciplinesList.map(escapeHtml).join('<br>+ ');
        const isExpandable = isBusyCardExpandable(disciplinesList);
        const cardClass = isExpandable ? 'busy-card is-expandable' : 'busy-card';
        const chevronHtml = isExpandable ? BUSY_CHEVRON_SVG : '';

        return `
            <div class="${cardClass}">
                <div class="busy-header">
                    <span class="busy-header-left" title="${escapeHtml(labelText)}">
                        ${BUSY_CALENDAR_SVG}
                        <span>${escapeHtml(labelText)}</span>
                    </span>
                    ${chevronHtml}
                </div>
                <div class="busy-title">${safeTitle}</div>
            </div>
        `;
    }

    function normalizeConflictDisciplines(conflictEntry) {
        if (Array.isArray(conflictEntry)) {
            return [...new Set(conflictEntry.map(name => String(name || '').trim()).filter(Boolean))].sort();
        }
        if (typeof conflictEntry === 'string') {
            return [...new Set(conflictEntry.split('<br>+ ').map(str => str.trim()).filter(Boolean))].sort();
        }
        if (conflictEntry && typeof conflictEntry === 'object' && conflictEntry.title) {
            return [String(conflictEntry.title).trim()].filter(Boolean);
        }
        return [];
    }

    function renderBusySlotHtml(conflict, friendName) {
        const userList = normalizeConflictDisciplines(conflict.user);
        const friendList = normalizeConflictDisciplines(conflict.friend);

        const isSameDisciplines = userList.length > 0 &&
            userList.length === friendList.length &&
            userList.every((discipline, index) => discipline === friendList[index]);

        if (isSameDisciplines) {
            return createBusyCardHtml('У обоих пары', userList);
        }

        let cardsHtml = '';
        if (userList.length > 0) {
            cardsHtml += createBusyCardHtml('У вас пара', userList);
        }
        if (friendList.length > 0) {
            const friendLabel = `У друга (${escapeHtml(friendName || 'друг')})`;
            cardsHtml += createBusyCardHtml(friendLabel, friendList);
        }
        return cardsHtml;
    }

    function createSportCardElement(sportName, group, day, time, tIdx) {
        const totalAvail = group.reduce((sum, i) => sum + i.avail, 0);
        const totalSeats = group.reduce((sum, i) => sum + i.total, 0);
        const locs = [...new Set(group.map(i => escapeHtml(i.campus)))].join(', ');
        const safeSportName = escapeHtml(sportName);
        const isEnrolled = group.some(i => i.enrolled);
        const isFull = totalAvail <= 0;
        const slotsClass = getSlotsStatusClass(totalAvail);

        const card = document.createElement('div');
        const classNames = ['sport-card'];
        if (isFull) classNames.push('is-full');
        if (isEnrolled) classNames.push('is-enrolled');
        card.className = classNames.join(' ');

        const enrolledBadge = isEnrolled
            ? `<span class="enrolled-dot-badge">${getSvgIcon('check', { size: 11, strokeWidth: 2.5 })}</span>`
            : '';

        card.innerHTML = `
            <div class="sc-top">
                <div class="sc-name" title="${safeSportName}">
                    ${enrolledBadge}<span class="sc-title-text" title="${safeSportName}">${safeSportName}</span><span class="sc-count">· ${group.length}</span>
                </div>
            </div>
            <div class="sc-bottom">
                <div class="sc-loc" title="${locs}">${locs}</div>
                <span class="sc-slots ${slotsClass}">${totalAvail} <span class="sc-slots-total">/${totalSeats}</span></span>
            </div>
        `;
        card.addEventListener('click', () => openPeModal(sportName, day, time, group, tIdx));
        return card;
    }

    function renderGrid() {
        const tbody = document.getElementById('pe-tableBody');
        if (!tbody) return; tbody.innerHTML = '';
        const onlyAvail = isFilterActive('pe-onlyAvailable');
        const onlyMine = isFilterActive('pe-onlyMySections');
        const considerSchedule = isFilterActive('pe-considerSchedule');

        let filtered = courses.filter(c => {
            if (!selectedSports.has(c.sport)) return false; if (!selectedCampuses.has(c.campus)) return false;
            if (onlyAvail && c.avail <= 0) return false; if (onlyMine && !c.enrolled) return false;
            return true;
        });

        PE_TIME_SLOTS.forEach((slotConfig, slotIdx) => {
            const time = slotConfig.label;
            const tr = document.createElement('tr');
            const isCollapsed = collapsedRows.has(slotIdx);
            if (isCollapsed) tr.className = 'row-collapsed';
            const timeTd = document.createElement('td');
            timeTd.className = 'time-cell';
            timeTd.innerHTML = `${time}<span class="time-sub">${slotIdx + 1} пара</span>`;
            timeTd.addEventListener('click', () => {
                if (isCollapsed) {
                    collapsedRows.delete(slotIdx);
                } else {
                    collapsedRows.add(slotIdx);
                }
                renderGrid();
            });
            tr.appendChild(timeTd);

            days.forEach(day => {
                const td = document.createElement('td');
                td.className = 'slot-cell day-cell';

                if (isCollapsed) {
                    tr.appendChild(td);
                    return;
                }

                const conflict = getConflict(day, slotIdx);
                if (considerSchedule && conflict) {
                    td.innerHTML = renderBusySlotHtml(conflict, friendNameForUI);
                    tr.appendChild(td);
                    return;
                }

                const cellWrap = document.createElement('div');
                cellWrap.className = 'day-cell-wrap';

                const cellWrapper = document.createElement('div');
                cellWrapper.className = 'card-group day-cell';

                const slotItems = filtered.filter(courseItem => courseItem.day === day && courseItem.slotIdx === slotIdx);
                const clusters = {};
                slotItems.forEach(courseItem => {
                    if (!clusters[courseItem.sport]) clusters[courseItem.sport] = [];
                    clusters[courseItem.sport].push(courseItem);
                });

                Object.keys(clusters).sort().forEach(sportName => {
                    const card = createSportCardElement(sportName, clusters[sportName], day, time, slotIdx);
                    cellWrapper.appendChild(card);
                });
                cellWrap.appendChild(cellWrapper);
                td.appendChild(cellWrap);
                tr.appendChild(td);
                attachSmoothScrollbar(cellWrapper);
            });
            tbody.appendChild(tr);
        });
        updateBusyCardsExpandability();
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                const overlay = document.getElementById('mse-pe-overlay');
                if (overlay) {
                    overlay.querySelectorAll('.mse-has-smooth-scroll').forEach(el => {
                        if (el._mseSmoothScrollbar) el._mseSmoothScrollbar.update();
                    });
                    if (overlay._mseSmoothScrollbar) overlay._mseSmoothScrollbar.update();
                }
            });
        }
    }

    function updateBusyCardsExpandability() {
        const overlay = document.getElementById('mse-pe-overlay');
        if (!overlay) return;
        overlay.querySelectorAll('.busy-card').forEach(card => {
            const title = card.querySelector('.busy-title');
            if (!title) return;
            const isClamped = title.scrollHeight > title.clientHeight + 2;
            const hasChevron = !!card.querySelector('.busy-chevron');
            if (isClamped && !card.classList.contains('is-expandable')) {
                card.classList.add('is-expandable');
                const header = card.querySelector('.busy-header');
                if (header && !hasChevron) {
                    header.insertAdjacentHTML('beforeend', BUSY_CHEVRON_SVG);
                }
            }
        });
    }

    function formatSectionsCount(count) {
        const abs = Math.abs(count) % 100;
        const rem = abs % 10;
        if (abs > 10 && abs < 20) return `${count} секций`;
        if (rem > 1 && rem < 5) return `${count} секции`;
        if (rem === 1) return `${count} секция`;
        return `${count} секций`;
    }

    function openPeModal(sport, day, time, items, timeIdx) {
        currentModalGroup = items;
        currentModalItemIds = new Set(items.map(i => i.id));
        currentModalSport = sport;
        currentModalDay = day;
        currentModalTime = time;
        currentModalTimeIdx = timeIdx;
        const titleEl = document.getElementById('mse-pe-mTitle');
        if (titleEl) titleEl.textContent = sport;
        const subtitleEl = document.getElementById('mse-pe-mSubtitle');
        if (subtitleEl) {
            const dayName = dayFullNames[day] || day;
            subtitleEl.textContent = `${dayName}, ${time} · ${formatSectionsCount(items.length)}`;
        }
        renderModalBody();
        const overlay = document.getElementById('mse-pe-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
        }
    }

    window.openPeModal = openPeModal;

    window.closePeModal = function (e) {
        if (e && e.target !== e.currentTarget) return;
        const overlay = document.getElementById('mse-pe-modal-overlay');
        if (overlay) overlay.style.display = 'none';
    };

    function renderModalBody() {
        const body = document.getElementById('mse-pe-modal-body');
        if (!body) return;
        body.innerHTML = '';
        currentModalGroup.forEach(item => {
            body.appendChild(createSectionCardElement(item));
        });
        attachSmoothScrollbar(body);
    }

    function getSlotPillHtml(avail, total) {
        if (avail >= 4) {
            return `<span class="slot-pill slot-ok">${avail} из ${total} мест</span>`;
        }
        if (avail >= 1) {
            return `<span class="slot-pill slot-low">${avail} из ${total} мест</span>`;
        }
        return `<span class="slot-pill slot-zero">0 из ${total} мест</span>`;
    }

    function formatLocationRowHtml(campus, address, mapLink) {
        const safeCampus = escapeHtml(campus || '');
        const safeAddress = escapeHtml(address || '');
        const safeMapLink = escapeHtml(mapLink || '');
        const mapBtn = safeMapLink
            ? `<a href="${safeMapLink}" target="_blank" rel="noopener noreferrer" class="map-link" title="Открыть в Яндекс.Картах">${getSvgIcon('external-link', { size: 13, strokeWidth: 2 })}</a>`
            : '';
        const addressPart = safeAddress ? ` <span style="color:#64748b">· ${safeAddress}</span>` : '';
        return `
            <div class="info-row">
                <div class="info-left">
                    <span class="info-icon">${getSvgIcon('map-pin', { size: 15, strokeWidth: 2 })}</span>
                    <span><b>${safeCampus}</b>${addressPart}</span>
                </div>
                ${mapBtn}
            </div>
        `;
    }

    function getTeacherRatingBadgeHtml(prof) {
        const rev = localTeacherReviews.get(prof);
        if (!rev) {
            return '<span class="rating-none">Нет отзывов</span>';
        }
        const type = (rev.type || '').trim();
        if (type === 'Положительная') {
            return `<span class="rating-badge rating-pos">${getSvgIcon('thumbs-up', { size: 12, strokeWidth: 2.2 })} Положительная</span>`;
        }
        if (type === 'Отрицательная') {
            return `<span class="rating-badge rating-neg">${getSvgIcon('thumbs-down', { size: 12, strokeWidth: 2.2 })} Отрицательная</span>`;
        }
        const label = type || 'Нейтральная';
        return `<span class="rating-badge rating-neu">${getSvgIcon('circle-minus', { size: 12, strokeWidth: 2.2 })} ${escapeHtml(label)}</span>`;
    }

    function formatTeacherRowHtml(prof) {
        const safeProf = escapeHtml(prof || 'Не указан');
        const badgeHtml = getTeacherRatingBadgeHtml(prof);
        return `
            <div class="info-row">
                <div class="info-left">
                    <span class="info-icon">${getSvgIcon('user', { size: 15, strokeWidth: 2 })}</span>
                    <span style="font-weight: 600;">${safeProf}</span>
                </div>
                ${badgeHtml}
            </div>
        `;
    }

    function formatTeacherReviewBoxHtml(prof) {
        const rev = localTeacherReviews.get(prof);
        if (!rev || !rev.review) return '';
        const items = String(rev.review)
            .split(/<br\s*\/?>|\n|•/g)
            .map(s => s.trim().replace(/^[-–—*]\s*/, ''))
            .filter(Boolean);
        if (items.length === 0) return '';
        const listItems = items.map(text => `<li>${escapeHtml(text)}</li>`).join('');
        return `<div class="review-box"><ul class="review-list">${listItems}</ul></div>`;
    }

    function getOldTeamDisplayName(oldTeamId, occupiedModule) {
        const oldCourse = courses.find(c => c.id === oldTeamId);
        if (oldCourse) {
            return `${oldCourse.sport} (Секция №${oldCourse.secNum}, ${dayFullNames[oldCourse.day] || oldCourse.day} ${oldCourse.time})`;
        }
        if (occupiedModule && occupiedModule.cycles) {
            for (const cycle of occupiedModule.cycles) {
                const team = (cycle.teams || []).find(t => t.id === oldTeamId);
                if (team && team.name) return team.name;
            }
        }
        return 'текущая секция';
    }

    function getSectionActionBtnHtml(item) {
        if (item.enrolled) {
            return `<button id="btn-team-${item.id}" class="btn-unenroll" data-action="unenroll" data-team-id="${item.id}">${getSvgIcon('x', { size: 14, strokeWidth: 2 })} Отменить запись</button>`;
        }
        if (item.avail <= 0) {
            return `<button id="btn-team-${item.id}" class="btn-disabled" disabled title="В секции не осталось свободных мест">${getSvgIcon('lock', { size: 13, strokeWidth: 2 })} Нет свободных мест</button>`;
        }

        const validModuleIds = teamToModulesMap.get(item.id);
        const candidateModules = allModules.filter(mod => {
            const mId = mod.moduleElementId || mod.id;
            return validModuleIds && validModuleIds.has(mId);
        });
        const emptyModule = candidateModules.find(mod => !mod.selectedTeamIds || mod.selectedTeamIds.length === 0);

        if (emptyModule) {
            return `<button id="btn-team-${item.id}" class="btn-enroll" data-action="enroll" data-team-id="${item.id}">${getSvgIcon('check', { size: 14, strokeWidth: 2.2 })} Записаться в секцию</button>`;
        }

        const occupiedModule = candidateModules.find(mod => mod.selectedTeamIds && mod.selectedTeamIds.length > 0);
        const oldTeamId = occupiedModule ? occupiedModule.selectedTeamIds[0] : null;
        const targetModuleId = occupiedModule ? (occupiedModule.moduleElementId || occupiedModule.id) : null;

        if (occupiedModule && oldTeamId && targetModuleId) {
            const oldTeamName = getOldTeamDisplayName(oldTeamId, occupiedModule);
            return `
                <button id="btn-team-${item.id}" class="btn-reenroll" data-action="swap" data-team-id="${item.id}" data-old-team-id="${oldTeamId}" data-target-module-id="${targetModuleId}">${getSvgIcon('refresh-ccw', { size: 14, strokeWidth: 2 })} Перезаписаться в секцию</button>
                <div class="replace-hint">Заменит: <b>${escapeHtml(oldTeamName)}</b></div>
            `;
        }

        return `<button id="btn-team-${item.id}" class="btn-enroll" data-action="enroll" data-team-id="${item.id}">${getSvgIcon('check', { size: 14, strokeWidth: 2.2 })} Записаться в секцию</button>`;
    }

    function createSectionCardElement(item) {
        const card = document.createElement('div');
        const cardClasses = ['sec-card'];
        if (item.avail <= 0) cardClasses.push('is-full');
        if (item.enrolled) cardClasses.push('enrolled-card');
        card.className = cardClasses.join(' ');

        const enrolledBadge = item.enrolled
            ? `<span class="sec-enrolled-badge">${getSvgIcon('check', { size: 12, strokeWidth: 2.2 })} Вы записаны</span>`
            : '';

        const topHtml = `
            <div class="sec-top">
                <div class="sec-name">
                    <span>Секция №${item.secNum}</span>
                    ${enrolledBadge}
                </div>
                ${getSlotPillHtml(item.avail, item.total)}
            </div>
        `;

        const locationHtml = formatLocationRowHtml(item.campus, item.address, item.mapLink);
        const teacherHtml = formatTeacherRowHtml(item.prof);
        const reviewBoxHtml = formatTeacherReviewBoxHtml(item.prof);
        const actionBtnHtml = getSectionActionBtnHtml(item);

        card.innerHTML = `${topHtml}${locationHtml}${teacherHtml}${reviewBoxHtml}${actionBtnHtml}`;
        return card;
    }

    function syncAndRenderActiveViews() {
        parseData();
        currentModalGroup = courses.filter(c => currentModalItemIds.has(c.id));
        if (currentModalGroup.length === 0) {
            currentModalGroup = courses.filter(c => 
                c.sport === currentModalSport && 
                c.day === currentModalDay && 
                c.slotIdx === currentModalTimeIdx
            );
            currentModalItemIds = new Set(currentModalGroup.map(i => i.id));
        }
        renderModalBody();
        renderGrid();
    }

    function buildBookingSelectedTeamsUrl(targetModuleId) {
        return `${BOOKING_API_BASE}/${apiStudentId}/campaigns/${apiCampaignId}/student-campaign-menu/module-elements/${targetModuleId}/selected-teams`;
    }

    function setTeamActionButtonPending(teamId, label) {
        const btn = document.getElementById(`btn-team-${teamId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerText = label;
        }
    }

    function updateModuleSelectionState(targetModuleId, teamId, isEnroll) {
        const modToUpdate = allModules.find(mod => (mod.moduleElementId || mod.id) === targetModuleId);
        if (modToUpdate) {
            if (isEnroll) {
                modToUpdate.selectedTeamIds = [teamId];
            } else {
                modToUpdate.selectedTeamIds = modToUpdate.selectedTeamIds
                    ? modToUpdate.selectedTeamIds.filter(id => id !== teamId)
                    : [];
            }
        }
        updateTeamAvailable(teamId, isEnroll ? -1 : 1);
        if (isEnroll) {
            enrolledTeamsMap.set(teamId, targetModuleId);
        } else {
            enrolledTeamsMap.delete(teamId);
        }
    }

    async function sendBookingTeamRequest({ method, targetModuleId, teamId, startLogLabel, errorLogLabel, successLogLabel }) {
        const token = sessionStorage.getItem('id_token');
        const url = buildBookingSelectedTeamsUrl(targetModuleId);
        const bodyData = [teamId];

        console.log(
            '%c[MSE PE]', 'color: #0284c7; font-weight: bold;',
            startLogLabel,
            { method, url, moduleId: targetModuleId, teamId, body: bodyData }
        );

        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        if (!res.ok) {
            const rawResponse = await res.text();
            let errorMsg = `HTTP ${res.status}`;
            let errorJson = null;

            try {
                errorJson = JSON.parse(rawResponse);
                if (errorJson.message) errorMsg = errorJson.message;
            } catch {
                // сырой текст ответа сервера
            }

            console.error(errorLogLabel, {
                status: res.status,
                statusText: res.statusText,
                url,
                method,
                moduleId: targetModuleId,
                teamId,
                sentBody: bodyData,
                rawResponse,
                parsedError: errorJson
            });

            throw new Error(errorMsg);
        }

        console.log(
            '%c[MSE PE]', 'color: #16a34a; font-weight: bold;',
            `${successLogLabel} (HTTP ${res.status}):`,
            { moduleId: targetModuleId, teamId }
        );
    }

    function resolveToggleTargetModuleId(teamId, isEnroll) {
        if (!isEnroll) {
            const enrolledModule = allModules.find(mod => mod.selectedTeamIds && mod.selectedTeamIds.includes(teamId));
            const targetModuleId = enrolledModule
                ? (enrolledModule.moduleElementId || enrolledModule.id)
                : enrolledTeamsMap.get(teamId);
            if (!targetModuleId) {
                console.error('[MSE PE] Не удалось найти модуль для отмены записи:', {
                    teamId,
                    enrolledTeamsMap: Array.from(enrolledTeamsMap.entries())
                });
                showToast('Не удалось определить модуль для отмены записи.', 'error');
                return null;
            }
            return targetModuleId;
        }

        const validModuleIds = teamToModulesMap.get(teamId);
        if (!validModuleIds || validModuleIds.size === 0) {
            console.error('[MSE PE] Не удалось найти модуль для команды:', { teamId, allModules });
            showToast('Не удалось определить модуль для выбранной секции.', 'error');
            return null;
        }

        const candidateModules = allModules.filter(mod => validModuleIds.has(mod.moduleElementId || mod.id));
        const emptyModule = candidateModules.find(mod => !mod.selectedTeamIds || mod.selectedTeamIds.length === 0);
        if (!emptyModule) {
            console.warn('[MSE PE] Все доступные модули для этой секции уже заняты:', { teamId, candidateModules });
            showToast('В модуле для этой секции уже выбрана другая команда. Сначала отпишитесь от неё.', 'warning');
            return null;
        }

        return emptyModule.moduleElementId || emptyModule.id;
    }

    async function apiToggleAction(teamId, isEnroll) {
        const targetModuleId = resolveToggleTargetModuleId(teamId, isEnroll);
        if (!targetModuleId) return;

        setTeamActionButtonPending(teamId, 'Отправка запроса...');

        try {
            await sendBookingTeamRequest({
                method: isEnroll ? 'POST' : 'DELETE',
                targetModuleId,
                teamId,
                startLogLabel: `Запрос на ${isEnroll ? 'запись' : 'отписку'}:`,
                errorLogLabel: '[MSE PE] Ошибка ответа сервера при бронировании:',
                successLogLabel: `Успешный ответ для ${isEnroll ? 'записи' : 'отмены'}`
            });

            updateModuleSelectionState(targetModuleId, teamId, isEnroll);
            syncAndRenderActiveViews();
            showToast(isEnroll ? 'Вы успешно записались в секцию!' : 'Запись успешно отменена.', 'success');
        } catch (err) {
            showToast(`Ошибка ${isEnroll ? 'записи' : 'отмены'}: ${err.message}`, 'error');
            renderModalBody();
        }
    }

    async function apiSwapAction(newTeamId, oldTeamId, targetModuleId) {
        setTeamActionButtonPending(newTeamId, 'Перезапись (1/2: отписка)...');

        try {
            try {
                await sendBookingTeamRequest({
                    method: 'DELETE',
                    targetModuleId,
                    teamId: oldTeamId,
                    startLogLabel: 'Запрос на перезапись [1/2] - Отмена старой секции (DELETE):',
                    errorLogLabel: '[MSE PE] Ошибка ответа сервера при отмене старой секции (шаг 1 перезаписи):',
                    successLogLabel: 'Успешный ответ для отмены старой секции [1/2]'
                });
            } catch (stepOneErr) {
                throw new Error(`Не удалось отписаться от старой секции: ${stepOneErr.message}`);
            }

            updateModuleSelectionState(targetModuleId, oldTeamId, false);
            setTeamActionButtonPending(newTeamId, 'Перезапись (2/2: запись)...');

            try {
                await sendBookingTeamRequest({
                    method: 'POST',
                    targetModuleId,
                    teamId: newTeamId,
                    startLogLabel: 'Запрос на перезапись [2/2] - Запись в новую секцию (POST):',
                    errorLogLabel: '[MSE PE] Ошибка ответа сервера при записи в новую секцию (шаг 2 перезаписи):',
                    successLogLabel: 'Успешный ответ для записи в новую секцию [2/2]'
                });
            } catch (stepTwoErr) {
                syncAndRenderActiveViews();
                throw new Error(`Старая запись отменена, но записаться в новую секцию не удалось: ${stepTwoErr.message}`);
            }

            updateModuleSelectionState(targetModuleId, newTeamId, true);
            syncAndRenderActiveViews();
            showToast('Вы успешно перезаписались в секцию!', 'success');
        } catch (err) {
            showToast(`Ошибка перезаписи: ${err.message}`, 'error');
            renderModalBody();
        }
    }

    function buildPeMultiselectHtml(containerId, labelId, defaultLabel, listId, filterType) {
        return `<div class="select-wrap custom-multiselect" id="${containerId}"><button type="button" class="clean-select ms-btn" data-action="toggle-multiselect" data-target="${containerId}"><span class="ms-label" id="${labelId}">${defaultLabel}</span></button>${getSvgIcon('chevron-down', { size: 14, strokeWidth: 2.2, className: 'select-chevron' })}<div class="ms-dropdown"><div class="ms-actions"><span data-action="select-all" data-type="${filterType}" data-val="true">Выбрать все</span> <span data-action="select-all" data-type="${filterType}" data-val="false">Сбросить</span></div><div class="ms-list-wrap"><div class="ms-list" id="${listId}"></div></div></div></div>`;
    }

    function buildPeFilterPillHtml(id, labelText, isActiveByDefault) {
        const activeClass = isActiveByDefault ? ' active' : '';
        return `
            <button type="button" class="pill-check${activeClass}" id="${id}">
                <span class="check-box">
                    ${getSvgIcon('check', { size: 11, strokeWidth: 3 })}
                </span>
                <span>${labelText}</span>
            </button>`;
    }

    function buildPeOverlayHtml() {
        return `
            <div class="container">
                <div class="header-panel">
                    <h2>Умный подбор физкультуры</h2>
                    <button type="button" class="modal-close-btn" id="mse-pe-close" title="Закрыть страницу">
                        ${getSvgIcon('x', { size: 16, strokeWidth: 2 })}
                    </button>
                    <div class="filters-group">
                        ${buildPeMultiselectHtml('pe-sportMultiSelect', 'pe-sportLabel', 'Все виды спорта', 'pe-sportOptionsList', 'sport')}
                        ${buildPeMultiselectHtml('pe-campusMultiSelect', 'pe-campusLabel', 'Все корпуса', 'pe-campusOptionsList', 'campus')}
                        <div class="toolbar-divider"></div>
                        ${buildPeFilterPillHtml('pe-considerSchedule', 'Учитывать пары', true)}
                        ${buildPeFilterPillHtml('pe-onlyAvailable', 'Только где есть места', true)}
                        ${buildPeFilterPillHtml('pe-onlyMySections', 'Мои записи', false)}
                        <div class="toolbar-divider"></div>
                        <div class="pe-friend-container" id="pe-friendContainer">
                            <button type="button" class="pe-friend-toggle-btn" id="pe-friendToggleBtn" title="Сравнить пары с другом (поиск по ФИО)">
                                ${getSvgIcon('search', { size: 15, strokeWidth: 2 })}
                            </button>
                            <div class="pe-friend-popover" id="pe-friendPopover">
                                <div id="pe-friendWrapper" class="pe-friend-wrapper">
                                    <input type="text" id="pe-friendInput" placeholder="Сравнить пары с (ФИО)...">
                                    <button type="button" id="pe-friendBtn">Поиск</button>
                                </div>
                                <div id="pe-friendDropdown" class="pe-friend-dropdown" style="display: none;"></div>
                            </div>
                        </div>
                        <button type="button" class="reset-btn" id="pe-reset-filters-btn" title="Сбросить все фильтры">
                            ${getSvgIcon('rotate-ccw', { size: 14, strokeWidth: 2 })}
                            <span>Сбросить</span>
                        </button>
                    </div>
                </div>
                <table><thead><tr><th>Пара</th><th>ПН</th><th>ВТ</th><th>СР</th><th>ЧТ</th><th>ПТ</th><th>СБ</th></tr></thead><tbody id="pe-tableBody"></tbody></table>
            </div>
            <div id="mse-pe-modal-overlay"><div id="mse-pe-modal"><div id="mse-pe-modal-header" class="m-header"><div><div id="mse-pe-mTitle">Спорт</div><div id="mse-pe-mSubtitle"></div></div><button id="mse-pe-modal-close-btn" class="sec-modal-close-btn" aria-label="Закрыть">${getSvgIcon('x', { size: 16, strokeWidth: 2 })}</button></div><div id="mse-pe-modal-body"></div></div></div>`;
    }

    function renderPeFriendsDropdown(friendDropdown) {
        if (!friendDropdown) return;
        const friends = readStoredFriends();
        if (!friends.length) {
            friendDropdown.style.display = 'none';
            friendDropdown.innerHTML = '';
            return;
        }
        friendDropdown.innerHTML = `
            <div class="pe-friend-dropdown-title">Ваши друзья:</div>
            <div class="pe-friend-list-wrap">
                <div class="pe-friend-dropdown-list">
                    ${friends.map(friend => `
                        <div class="pe-friend-item" data-name="${escapeHtml(friend.fullName)}">
                            ${getSvgIcon('user', { size: 12, strokeWidth: 2 })}
                            <span class="pe-friend-item-name">${escapeHtml(friend.fullName)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        friendDropdown.style.display = 'block';
        const list = friendDropdown.querySelector('.pe-friend-dropdown-list');
        if (list) attachSmoothScrollbar(list);
    }

    function togglePeFriendPopover(forceOpen) {
        const friendContainer = document.getElementById('pe-friendContainer');
        if (!friendContainer) return;
        const shouldOpen = typeof forceOpen === 'boolean'
            ? forceOpen
            : !friendContainer.classList.contains('is-popover-open');
        friendContainer.classList.toggle('is-popover-open', shouldOpen);
        if (!shouldOpen) return;

        renderPeFriendsDropdown(document.getElementById('pe-friendDropdown'));
        const friendInput = document.getElementById('pe-friendInput');
        if (friendInput) {
            setTimeout(() => {
                friendInput.focus();
                if (!friendInput.readOnly && typeof friendInput.select === 'function') friendInput.select();
            }, FRIEND_FOCUS_DELAY_MS);
        }
    }

    function bindPeFriendSearchControls() {
        const friendContainer = document.getElementById('pe-friendContainer');
        const friendToggleBtn = document.getElementById('pe-friendToggleBtn');
        const friendInput = document.getElementById('pe-friendInput');
        const friendBtn = document.getElementById('pe-friendBtn');
        const friendDropdown = document.getElementById('pe-friendDropdown');

        friendToggleBtn?.addEventListener('click', (event) => {
            event.stopPropagation();
            togglePeFriendPopover();
        });

        friendDropdown?.addEventListener('click', (event) => {
            const item = event.target.closest('.pe-friend-item');
            if (!item || !friendInput) return;
            friendInput.value = item.dataset.name;
            window.MSE_PE_loadFriend();
            togglePeFriendPopover(false);
        });

        friendInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                window.MSE_PE_loadFriend();
                togglePeFriendPopover(false);
            }
        });

        friendBtn?.addEventListener('click', () => {
            if (friendSchedule) {
                window.MSE_PE_clearFriend();
            } else {
                window.MSE_PE_loadFriend();
                togglePeFriendPopover(false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && friendContainer?.classList.contains('is-popover-open')) {
                togglePeFriendPopover(false);
                if (friendToggleBtn) friendToggleBtn.focus();
            }
        });
    }

    function bindPeOverlayControls(overlay) {
        document.getElementById('mse-pe-close').addEventListener('click', () => {
            overlay.style.display = 'none';
        });
        document.getElementById('pe-reset-filters-btn').addEventListener('click', () => {
            MSE_PE.resetFilters();
        });
        ['pe-considerSchedule', 'pe-onlyAvailable', 'pe-onlyMySections'].forEach(id => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                setFilterActive(id, !btn.classList.contains('active'));
                renderGrid();
            });
        });

        bindPeFriendSearchControls();

        const friendContainer = document.getElementById('pe-friendContainer');
        overlay.addEventListener('click', (event) => {
            if (friendContainer?.classList.contains('is-popover-open') && !friendContainer.contains(event.target)) {
                togglePeFriendPopover(false);
            }
            const busyCard = event.target.closest('.busy-card.is-expandable');
            if (busyCard) {
                busyCard.classList.toggle('expanded');
                return;
            }
            const toggleBtn = event.target.closest('[data-action="toggle-multiselect"]');
            if (toggleBtn) {
                togglePeMultiSelect(toggleBtn.dataset.target);
                return;
            }
            const selectAllBtn = event.target.closest('[data-action="select-all"]');
            if (selectAllBtn) {
                const { type, val } = selectAllBtn.dataset;
                selectAllOptions(type, val === 'true');
            }
        });

        const modalOverlay = document.getElementById('mse-pe-modal-overlay');
        modalOverlay?.addEventListener('click', (event) => {
            if (event.target === modalOverlay) window.closePeModal(event);
        });
        document.getElementById('mse-pe-modal-close-btn')?.addEventListener('click', () => {
            window.closePeModal();
        });

        document.getElementById('mse-pe-modal-body')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn || btn.disabled) return;
            const { action, teamId, oldTeamId, targetModuleId } = btn.dataset;
            if (action === 'enroll') apiToggleAction(teamId, true);
            else if (action === 'unenroll') apiToggleAction(teamId, false);
            else if (action === 'swap') apiSwapAction(teamId, oldTeamId, targetModuleId);
        });
    }

    function applyDefaultFiltersState() {
        setFilterActive('pe-onlyAvailable', true);
        setFilterActive('pe-onlyMySections', false);
        setFilterActive('pe-considerSchedule', true);
    }

    return {
        apiToggle: apiToggleAction,
        apiSwap: apiSwapAction,
        openModal: function (modulesData, scheduleData, campaignId, studentId, teacherReviews) {
            allModules = modulesData;
            currentSchedule = scheduleData;
            apiCampaignId = campaignId;
            apiStudentId = studentId;
            localTeacherReviews = teacherReviews;
            parseData();

            if (!document.getElementById('mse-pe-overlay')) {
                const overlay = document.createElement('div');
                overlay.id = 'mse-pe-overlay';
                overlay.innerHTML = buildPeOverlayHtml();
                document.body.appendChild(overlay);
                bindPeOverlayControls(overlay);
            }

            applyDefaultFiltersState();
            window.MSE_PE_clearFriend();
            initMultiSelects();

            const overlay = document.getElementById('mse-pe-overlay');
            overlay.style.display = 'block';
            attachSmoothScrollbar(overlay);
            const modalBody = document.getElementById('mse-pe-modal-body');
            if (modalBody) attachSmoothScrollbar(modalBody);
            renderGrid();
        },
        attachSmoothScrollbar: attachSmoothScrollbar,
        selectAll: selectAllOptions,
        resetFilters: function () {
            selectAllOptions('sport', true);
            selectAllOptions('campus', true);
            applyDefaultFiltersState();
            collapsedRows.clear();
            window.MSE_PE_clearFriend();
            togglePeFriendPopover(false);
            renderGrid();
        }
    };
})();