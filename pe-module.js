window.MSE_PE = (function () {
    let courses = [];
    let sportsSet = new Set();
    let campusesSet = new Set();
    let collapsedRows = new Set();
    let selectedSports = new Set();
    let selectedCampuses = new Set();

    let currentSchedule = {};
    let allModules = [];
    let enrolledTeamsMap = new Map();
    let apiStudentId = '';
    let apiCampaignId = '';
    let localTeacherReviews = new Map();

    let currentModalGroup = [];
    let currentModalTimeIdx = 0;
    let currentModalSport = '';
    let currentModalDay = '';
    let currentModalTime = '';

    const timeSlots = ['8:30', '10:15', '12:00', '14:00', '15:45', '17:30', '19:15'];
    const days = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

    const dayFullNames = { 'ПН': 'Понедельник', 'ВТ': 'Вторник', 'СР': 'Среда', 'ЧТ': 'Четверг', 'ПТ': 'Пятница', 'СБ': 'Суббота' };
    const sportEmojis = { 'Волейбол': '🏐', 'Баскетбол': '🏀', 'Мини-футбол': '⚽', 'Футбол': '⚽', 'Плавание': '🏊', 'Бокс': '🥊', 'Атлетизм': '🏋️', 'Фитнес': '🧘', 'Стретчинг': '🤸', 'Лыжные гонки': '⛷️', 'Н/теннис': '🏓', 'ОФП': '🏃', 'Гимнастика': '🤸', 'Аэробика': '🤸‍♀️', 'СМГ': '🫀' };

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
        }
    };

    function getSlotIndex(timeStr) {
        if (!timeStr) return -1;
        const clean = timeStr.trim().replace(/^0/, '');
        if (clean.startsWith('8:30')) return 0;
        if (clean.startsWith('10:15')) return 1;
        if (clean.startsWith('12:00') || clean.startsWith('12:05')) return 2;
        if (clean.startsWith('14:00') || clean.startsWith('14:05')) return 3;
        if (clean.startsWith('15:45') || clean.startsWith('15:55')) return 4;
        if (clean.startsWith('17:30') || clean.startsWith('17:40')) return 5;
        if (clean.startsWith('19:15') || clean.startsWith('19:20')) return 6;
        return -1;
    }

    function getConflict(day, slotIdx) {
        if (!currentSchedule || !currentSchedule[day]) return null;
        const slotTimes = [
            ['8:30', '08:30'], ['10:15'], ['12:00', '12:05'],
            ['14:00', '14:05'], ['15:45', '15:55'], ['17:30', '17:40'], ['19:15', '19:20']
        ];
        const possible = slotTimes[slotIdx] || [];
        for (const t of possible) {
            if (currentSchedule[day][t]) return currentSchedule[day][t];
        }
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

    // НОРМАЛИЗАТОР СПОРТА (Очищает мусор из названий)
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
        courses = []; sportsSet.clear(); campusesSet.clear();
        enrolledTeamsMap.clear();

        allModules.forEach(mod => {
            if (mod.selectedTeamIds && mod.selectedTeamIds.length > 0) {
                mod.selectedTeamIds.forEach(tid => enrolledTeamsMap.set(tid, mod.moduleElementId));
            }
        });

        const uniqueTeams = new Map();
        allModules.forEach(mod => {
            if (mod.cycles && mod.cycles.length > 0 && mod.cycles[0].teams) {
                mod.cycles[0].teams.forEach(t => uniqueTeams.set(t.id, t));
            }
        });

        Array.from(uniqueTeams.values()).forEach((t, idx) => {
            const cleanName = t.name || "";
            const match = cleanName.match(/ФК:\s+(.+?)\s+(ПН|ВТ|СР|ЧТ|ПТ|СБ)\s+(\d{1,2}:\d{2})\s+(.*)/);

            if (match) {
                let sport = normalizeSportName(match[1]); // <-- ИСПОЛЬЗУЕМ НОРМАЛИЗАТОР!
                let rawLoc = match[4].trim();
                let campusObj = resolveCampus(rawLoc);

                sportsSet.add(sport);
                campusesSet.add(campusObj.name);

                courses.push({
                    id: t.id, secNum: idx + 1,
                    sport: sport, day: match[2], time: match[3],
                    slotIdx: getSlotIndex(match[3]),
                    loc: rawLoc,
                    campus: campusObj.name, address: campusObj.address, mapLink: campusObj.link,
                    prof: t.teachers?.[0] || "Не указан",
                    avail: t.available ?? 0, total: t.limit ?? 0,
                    enrolled: enrolledTeamsMap.has(t.id)
                });
            }
        });
    }

    function initMultiSelects() {
        selectedSports = new Set(sportsSet); selectedCampuses = new Set(campusesSet);
        buildOptionsList('sport', sportsSet, selectedSports);
        buildOptionsList('campus', campusesSet, selectedCampuses);
        updateButtonLabel('sport'); updateButtonLabel('campus');
    }

    function buildOptionsList(type, allItems, selectedSet) {
        const container = document.getElementById(`pe-${type}OptionsList`);
        if (!container) return;
        container.innerHTML = '';
        [...allItems].sort().forEach(item => {
            const label = document.createElement('label'); label.className = 'ms-item';
            label.innerHTML = `<input type="checkbox" value="${item}" ${selectedSet.has(item) ? 'checked' : ''}> <span>${item}</span>`;
            label.querySelector('input').onchange = (e) => { e.target.checked ? selectedSet.add(item) : selectedSet.delete(item); updateButtonLabel(type); renderGrid(); };
            container.appendChild(label);
        });
    }

    function updateButtonLabel(type) {
        const targetSet = type === 'sport' ? selectedSports : selectedCampuses;
        const total = type === 'sport' ? sportsSet.size : campusesSet.size;
        const labelEl = document.getElementById(`pe-${type}Label`);
        if (!labelEl) return;

        if (targetSet.size === total) labelEl.innerText = type === 'sport' ? 'Все виды спорта' : 'Все корпуса';
        else if (targetSet.size === 0) labelEl.innerText = 'Не выбрано';
        else if (targetSet.size <= 2) labelEl.innerText = [...targetSet].join(', ');
        else labelEl.innerText = `Выбрано: ${targetSet.size} из ${total}`;
    }

    function selectAllOptions(type, selectAll) {
        const targetSet = type === 'sport' ? selectedSports : selectedCampuses;
        const allSet = type === 'sport' ? sportsSet : campusesSet;
        targetSet.clear(); if (selectAll) allSet.forEach(v => targetSet.add(v));
        document.querySelectorAll(`#pe-${type}OptionsList input[type="checkbox"]`).forEach(i => i.checked = selectAll);
        updateButtonLabel(type); renderGrid();
    }

    window.togglePeMultiSelect = function (id) {
        const el = document.getElementById(id); const isOpen = el.classList.contains('open');
        document.querySelectorAll('.custom-multiselect').forEach(m => m.classList.remove('open'));
        if (!isOpen) el.classList.add('open');
    }
    document.addEventListener('click', (e) => { if (!e.target.closest('.custom-multiselect')) document.querySelectorAll('.custom-multiselect').forEach(m => m.classList.remove('open')); });

    function renderGrid() {
        const tbody = document.getElementById('pe-tableBody');
        if (!tbody) return; tbody.innerHTML = '';
        const onlyAvail = document.getElementById('pe-onlyAvailable').checked;
        const onlyMine = document.getElementById('pe-onlyMySections').checked;
        const considerSchedule = document.getElementById('pe-considerSchedule').checked;

        let filtered = courses.filter(c => {
            if (!selectedSports.has(c.sport)) return false; if (!selectedCampuses.has(c.campus)) return false;
            if (onlyAvail && c.avail <= 0) return false; if (onlyMine && !c.enrolled) return false;
            return true;
        });

        timeSlots.forEach((time, tIdx) => {
            const tr = document.createElement('tr'); const isCollapsed = collapsedRows.has(tIdx);
            if (isCollapsed) tr.className = 'row-collapsed';
            const timeTd = document.createElement('td'); timeTd.className = 'time-cell';
            timeTd.innerHTML = `${time} <span class="time-sub">${tIdx + 1} пара ${isCollapsed ? '▼' : '▲'}</span>`;
            timeTd.onclick = () => { isCollapsed ? collapsedRows.delete(tIdx) : collapsedRows.add(tIdx); renderGrid(); };
            tr.appendChild(timeTd);

            days.forEach(day => {
                const td = document.createElement('td');
                td.className = 'slot-cell';

                if (isCollapsed) {
                    tr.appendChild(td);
                    return;
                }

                // 1. Проверяем конфликт через getConflict по номеру пары (tIdx), а не по минутам
                const conflict = getConflict(day, tIdx);
                if (considerSchedule && conflict) {
                    td.innerHTML = `<div class="pe-conflict-slot">🎓 У вас пара:<br><b>${conflict}</b></div>`;
                    tr.appendChild(td);
                    return;
                }

                const cellWrapper = document.createElement('div');
                cellWrapper.className = 'card-group';

                // 2. Секции фильтруем по номеру слота (c.slotIdx === tIdx), а не c.time === time
                const slotItems = filtered.filter(c => c.day === day && c.slotIdx === tIdx);
                const clusters = {};
                slotItems.forEach(i => { if (!clusters[i.sport]) clusters[i.sport] = []; clusters[i.sport].push(i); });

                Object.keys(clusters).sort().forEach(sportName => {
                    const group = clusters[sportName];
                    const totalAvail = group.reduce((sum, i) => sum + i.avail, 0);
                    const totalSeats = group.reduce((sum, i) => sum + i.total, 0);
                    const locs = [...new Set(group.map(i => i.campus))].join(', ');
                    const card = document.createElement('div');
                    card.className = `s-card ${group.some(i => i.enrolled) ? 'is-enrolled' : ''}`;
                    card.innerHTML = `
                        <div class="card-row-1">
                            <span class="sport-title">${group.some(i => i.enrolled) ? '⭐ ' : ''}${sportName} <span style="font-weight:normal; font-size:10px;">(${group.length})</span></span>
                            <span class="seats-badge ${totalAvail > 0 ? 'has-seats' : ''}">${totalAvail}/${totalSeats}</span>
                        </div><div class="card-row-2">📍 ${locs}</div>`;
                    card.onclick = () => openPeModal(sportName, day, time, group, tIdx);
                    cellWrapper.appendChild(card);
                });
                td.appendChild(cellWrapper);
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    function openPeModal(sport, day, time, items, timeIdx) {
        currentModalGroup = items; currentModalSport = sport; currentModalDay = day; currentModalTime = time; currentModalTimeIdx = timeIdx;
        const emoji = sportEmojis[sport] || '🏅';
        document.getElementById('mse-pe-mTitle').innerText = `${emoji} ${sport}`; document.getElementById('mse-pe-mSubtitle').innerText = `${dayFullNames[day] || day} • ${time} • ${items.length} секций`;
        renderModalBody(); document.getElementById('mse-pe-modal-overlay').style.display = 'flex';
    }

    window.closePeModal = function (e) { if (e && e.target !== e.currentTarget) return; document.getElementById('mse-pe-modal-overlay').style.display = 'none'; }

    function renderModalBody() {
        const body = document.getElementById('mse-pe-modal-body'); body.innerHTML = ''; const emoji = sportEmojis[currentModalSport] || '🏅';
        currentModalGroup.forEach((item, index) => {
            const card = document.createElement('div'); card.className = `section-card ${item.enrolled ? 'enrolled-card' : ''}`;
            let commuteStatus = '🟢 Успеваешь (перемена 20 мин)';
            if (item.campus === "Эко-парк" && (currentModalTimeIdx === 1 || currentModalTimeIdx === 2)) commuteStatus = '🔴 Не успеваешь (нужно 35+ мин)';
            if (item.campus === "Олимпия" && currentModalTimeIdx === 1) commuteStatus = '🟡 Впритык (перемена 15 мин)';
            if (item.campus === "Аграрный уник" && (currentModalTimeIdx === 1 || currentModalTimeIdx === 2)) commuteStatus = '🔴 Не успеваешь (очень далеко)';

            const rev = localTeacherReviews.get(item.prof);
            const reviewHtml = rev ? `<div style="margin-left:22px; margin-top:2px; font-size:12px; color:#1e293b;"><b>Рейтинг:</b> ${rev.emoji} ${rev.type}</div><div class="review-box"><b>Отзывы:</b> ${rev.review.replace(/<br>/g, ' ')}</div>` : `<div style="margin-left:22px; margin-top:2px; font-size:12px; color:var(--muted);">🤔 Нет отзывов о преподавателе</div>`;

            card.innerHTML = `
                <div class="sec-header"><div>${emoji} ${item.sport} (Секция №${item.secNum})</div>${item.enrolled ? '<span style="color:#d97706; font-size:12px; font-weight:700;">⭐ Вы записаны</span>' : ''}</div>
                <div class="info-block"><div class="info-title">📍 Локация: <span>${item.campus}</span></div>
                    <div class="info-sub">Адрес: ${item.address} <a href="${item.mapLink}" target="_blank" class="map-link">[Яндекс Карты ↗]</a></div>
                    <div class="info-sub" style="color: #94a3b8; font-size: 11px;">(В Модеусе: ${item.loc})</div></div>
                <div class="info-block"><div class="info-title">⏰ Время: <span>${dayFullNames[item.day]}, ${item.time}</span></div><div class="info-sub">Дорога от пред. пары: <b>${commuteStatus}</b></div></div>
                <div class="info-block"><div class="info-title">👤 Преподаватель: <span>${item.prof}</span></div>${reviewHtml}</div>
                <div class="info-block"><div class="info-title">👥 Места: <span style="color:${item.avail > 0 ? '#16a34a' : '#dc2626'}">Осталось ${item.avail} из ${item.total}</span></div></div>
                ${item.enrolled ? `<button id="btn-team-${item.id}" class="btn-action btn-unenroll-lg" onclick="MSE_PE.apiToggle('${item.id}', false)">🔴 ОТПИСАТЬСЯ</button>` : `<button id="btn-team-${item.id}" class="btn-action btn-enroll-lg" onclick="MSE_PE.apiToggle('${item.id}', true)">🟢 ЗАПИСАТЬСЯ В ЭТУ СЕКЦИЮ</button>`}
            `;
            body.appendChild(card);
        });
    }

    async function apiToggleAction(teamId, isEnroll) {
        let targetModuleId = null;
        if (isEnroll) {
            const emptyModule = allModules.find(mod => !mod.selectedTeamIds || mod.selectedTeamIds.length === 0);
            if (!emptyModule) { alert('Вы уже выбрали максимальное количество секций.\nСначала отпишитесь от одной из них.'); return; }
            targetModuleId = emptyModule.moduleElementId;
        } else {
            targetModuleId = enrolledTeamsMap.get(teamId);
            if (!targetModuleId) { alert('Не удалось определить, в каком модуле находится эта секция.'); return; }
        }

        const btn = document.getElementById(`btn-team-${teamId}`);
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Отправка запроса..."; }
        const token = sessionStorage.getItem('id_token');
        const url = `https://utmn.modeus.org/course-unit-booking/api/v1/students/${apiStudentId}/campaigns/${apiCampaignId}/student-campaign-menu/module-elements/${targetModuleId}/selected-teams`;

        try {
            const res = await fetch(url, { method: isEnroll ? 'POST' : 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify([teamId]) });
            if (!res.ok) { let errorMsg = `HTTP ${res.status}`; try { const errorJson = await res.json(); if (errorJson.message) errorMsg = errorJson.message; } catch (e) { } throw new Error(errorMsg); }

            const modToUpdate = allModules.find(m => m.moduleElementId === targetModuleId);
            if (isEnroll) {
                modToUpdate.selectedTeamIds = [teamId]; const course = courses.find(c => c.id === teamId);
                if (course) course.avail = Math.max(0, course.avail - 1);
            } else {
                modToUpdate.selectedTeamIds = []; const course = courses.find(c => c.id === teamId);
                if (course) course.avail = Math.min(course.total, course.avail + 1);
            }

            parseData(); currentModalGroup = courses.filter(c => c.sport === currentModalSport && c.day === currentModalDay && c.time === currentModalTime);
            renderModalBody(); renderGrid();
        } catch (err) { alert(`Ошибка ${isEnroll ? 'записи' : 'отмены'}:\n${err.message}`); renderModalBody(); }
    }

    return {
        apiToggle: apiToggleAction,
        openModal: function (modulesData, scheduleData, campaignId, studentId, teacherReviews) {
            allModules = modulesData; currentSchedule = scheduleData; apiCampaignId = campaignId; apiStudentId = studentId; localTeacherReviews = teacherReviews;
            parseData();
            if (!document.getElementById('mse-pe-overlay')) {
                const overlay = document.createElement('div'); overlay.id = 'mse-pe-overlay';
                overlay.innerHTML = `<button id="mse-pe-close" title="Закрыть">✕</button>
                    <div class="container">
                        <div class="header-panel"><h2>⚡ Умный подбор физкультуры</h2>
                            <div class="filters-group"><button class="reset-filters-btn" onclick="MSE_PE.resetFilters()">↺ Сбросить фильтры</button>
                                <div class="custom-multiselect" id="pe-sportMultiSelect"><button class="ms-btn" onclick="togglePeMultiSelect('pe-sportMultiSelect')"><span class="ms-label" id="pe-sportLabel">Все виды спорта</span> ▼</button><div class="ms-dropdown"><div class="ms-actions"><span onclick="MSE_PE.selectAll('sport', true)">Выбрать все</span> <span onclick="MSE_PE.selectAll('sport', false)">Сбросить</span></div><div class="ms-list" id="pe-sportOptionsList"></div></div></div>
                                <div class="custom-multiselect" id="pe-campusMultiSelect"><button class="ms-btn" onclick="togglePeMultiSelect('pe-campusMultiSelect')"><span class="ms-label" id="pe-campusLabel">Все корпуса</span> ▼</button><div class="ms-dropdown"><div class="ms-actions"><span onclick="MSE_PE.selectAll('campus', true)">Выбрать все</span> <span onclick="MSE_PE.selectAll('campus', false)">Сбросить</span></div><div class="ms-list" id="pe-campusOptionsList"></div></div></div>
                                <label class="filter-checkbox" style="color: #2563eb; background: #eff6ff; padding: 4px 8px; border-radius: 6px;"><input type="checkbox" id="pe-considerSchedule" checked> 🕒 Скрыть конфликты с вашими парами</label>
                                <label class="filter-checkbox"><input type="checkbox" id="pe-onlyAvailable"> Только где есть места</label>
                                <label class="filter-checkbox"><input type="checkbox" id="pe-onlyMySections"> ⭐ Мои записи</label>
                            </div></div>
                        <table><thead><tr><th>Пара</th><th>ПН</th><th>ВТ</th><th>СР</th><th>ЧТ</th><th>ПТ</th><th>СБ</th></tr></thead><tbody id="pe-tableBody"></tbody></table>
                    </div>
                    <div id="mse-pe-modal-overlay" onclick="closePeModal(event)"><div id="mse-pe-modal" onclick="event.stopPropagation()"><div id="mse-pe-modal-header"><div><div id="mse-pe-mTitle" style="font-weight:700; font-size:16px;">Спорт</div><div id="mse-pe-mSubtitle" style="font-size:11px; color:#64748b;"></div></div><button onclick="closePeModal()" style="border:none; background:none; font-size:22px; cursor:pointer; color:#64748b;">✕</button></div><div id="mse-pe-modal-body"></div></div></div>`;
                document.body.appendChild(overlay);
                document.getElementById('mse-pe-close').onclick = () => { overlay.style.display = 'none'; };
                document.getElementById('pe-considerSchedule').onchange = renderGrid; document.getElementById('pe-onlyAvailable').onchange = renderGrid; document.getElementById('pe-onlyMySections').onchange = renderGrid;
            }
            document.getElementById('pe-onlyAvailable').checked = false; document.getElementById('pe-onlyMySections').checked = false; document.getElementById('pe-considerSchedule').checked = true;
            initMultiSelects(); document.getElementById('mse-pe-overlay').style.display = 'block'; renderGrid();
        },
        selectAll: selectAllOptions,
        resetFilters: function () { selectAllOptions('sport', true); selectAllOptions('campus', true); document.getElementById('pe-onlyAvailable').checked = false; document.getElementById('pe-onlyMySections').checked = false; collapsedRows.clear(); renderGrid(); }
    };
})();