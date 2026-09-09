(() => {
    console.log(
        `%c Modeus Enhancer %c v2.2.1 `,
        'background: #2196F3; color: #fff; padding: 3px 5px; border-radius: 3px 0 0 3px; font-weight: bold;',
        'background: #333; color: #fff; padding: 3px 5px; border-radius: 0 3px 3px 0;'
    );
    console.log('%cby @JasonVurhyz', 'font-style: italic; color: #555; margin-bottom: 5px;');
    console.log('%cMade with ❤️ for UTMN students', 'font-style: italic; color: #555; margin-bottom: 5px;');
    console.log('%cБаги и отзывы: @Theguestroom_bot', 'color: #2196F3; margin-bottom: 5px;');
    console.log('Расширение для улучшения интерфейса Modeus. Добавляет отзывы о преподавателях, список друзей, поиск общих пар и улучшает отображение названий корпусов.');
    console.log('----------------------------------------');

    if (window.studentEnhancer) {
        console.log('%c[MSE] Скрипт уже запущен.', 'color: orange;');
        return;
    }

    let buildingMap = {};
    let teacherReviews = new Map();
    let eventCache = new Map();
    let uniqueStudents = new Map();
    let lastSearchResults = new Map();
    let currentEventId = null;
    let selectedStudents = new Set();
    let debounceTimer;
    const FRIENDS_STORAGE_KEY = 'mse_friends_list';
    let mySpecialty = localStorage.getItem('mse_my_specialty') || null;
    let myPersonId = localStorage.getItem('mse_my_person_id') || null;
    let currentWeekStart = null;

    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const normalizeName = name => name ? name.trim().replace(/\s+/g, ' ').replace(/ё/g, 'е').replace(/Ё/g, 'Е').normalize() : '';

    const processPersonSearchResponse = (responseText) => {
        try {
            const data = JSON.parse(responseText);
            const persons = data?._embedded?.persons || [];
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
            console.warn('[MSE] Не удалось обработать ответ от /persons/search', e);
        }
    };

    function interceptNetworkRequests() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            const response = await originalFetch(...args);

            if (url.includes('/api/people/persons/search')) {
                const responseText = await response.clone().text();
                processPersonSearchResponse(responseText);
            }

            // --- НОВЫЙ БЛОК ДЛЯ ФИЗРЫ ---
            if (url.includes('/module-elements/')) {
                try {
                    const data = await response.clone().json();
                    if (data.cycles && data.cycles.length > 0 && data.cycles[0].teams) {
                        lastPeData = data; // Сохраняем JSON с секциями
                        console.log('[MSE] Данные секций перехвачены!');
                    }
                } catch (e) { console.warn('[MSE] Ошибка парсинга физры', e); }
            }
            return response;
        };
        const originalXhrSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('load', () => {
                if (this.responseURL && this.responseURL.includes('/api/people/persons/search')) {
                    processPersonSearchResponse(this.responseText);
                }
            });
            originalXhrSend.apply(this, arguments);
        };
    }
    interceptNetworkRequests();

    (function loadDataFromMeta() {
        try {
            const buildingsMeta = qs('meta[name="modeus-buildings-map"]');
            if (buildingsMeta?.content) {
                const json = decodeURIComponent(escape(atob(buildingsMeta.content)));
                buildingMap = JSON.parse(json) || {};
                console.log('[MSE] Загружено корпусов:', Object.keys(buildingMap).length);
            }
        } catch (e) { console.warn('[MSE] Ошибка загрузки buildings.json', e); }
        try {
            const reviewsMeta = qs('meta[name="modeus-teacher-reviews"]');
            if (reviewsMeta?.content) {
                const json = decodeURIComponent(escape(atob(reviewsMeta.content)));
                teacherReviews = new Map(Object.entries(JSON.parse(json) || {}));
                console.log('[MSE] Загружено отзывов о преподавателях:', teacherReviews.size);
            }
        } catch (e) { console.warn('[MSE] Ошибка загрузки teacher_reviews.json', e); }
    })();

    const getFriends = () => {
        try {
            return JSON.parse(localStorage.getItem(FRIENDS_STORAGE_KEY) || '[]');
        } catch (e) {
            console.warn('[MSE] Ошибка чтения списка друзей из localStorage.', e);
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
        qs('#mse-friends-menu')?.remove();
        qs('#mse-return-to-me-menu')?.remove();

        const friends = getFriends();
        const friendListHTML = friends.length > 0
            ? friends.map(friend => `
                <li class="p-menuitem ng-star-inserted" style="position: relative;">
                    <a role="treeitem" class="p-menuitem-link ng-star-inserted" href="${generateFriendUrl(friend.id)}" title="${friend.fullName}">
                        <span class="p-menuitem-text ng-star-inserted">${friend.fullName}</span>
                    </a>
                    <span class="mse-remove-friend-btn" data-id="${friend.id}" title="Удалить из друзей">×</span>
                </li>
            `).join('')
            : '<li class="p-menuitem ng-star-inserted"><a class="p-menuitem-link" style="opacity: 0.6; cursor: default;"><span class="p-menuitem-text">Нет друзей</span></a></li>';

        // 1. Панель «Друзья» (цельная, нормальный выпадающий список)
        const friendsMenuPanel = document.createElement('div');
        friendsMenuPanel.id = 'mse-friends-menu';
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
            returnMenuPanel.id = 'mse-return-to-me-menu';
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
        if (!aside || qs('#mse-feedback-footer')) return;

        // Находим строку с почтой техподдержки Modeus
        const mailEl = qsa('modeus-aside-panel *').find(el =>
            el.children.length === 0 && el.textContent.includes('help@modeus.org')
        );

        if (mailEl) {
            const feedbackDiv = document.createElement('div');
            feedbackDiv.id = 'mse-feedback-footer';
            feedbackDiv.style.cssText = 'margin-top: 10px; margin-bottom: 10px; font-size: 12px; line-height: 1.4;';
            feedbackDiv.innerHTML = `
                <div style="opacity: 0.85;">Баги и отзывы (Enhancer):</div>
                <a href="https://t.me/Theguestroom_bot" target="_blank" style="color: #f0f4f7; text-decoration: underline;">
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
        if (window.studentEnhancer?.observer) window.studentEnhancer.observer.disconnect();
        if (window.studentEnhancer.originalFetch) window.fetch = window.studentEnhancer.originalFetch;
        if (window.studentEnhancer.originalXhrSend) XMLHttpRequest.prototype.send = window.studentEnhancer.originalXhrSend;
        if (window.studentEnhancer.originalPushState) history.pushState = window.studentEnhancer.originalPushState;
        window.removeEventListener('popstate', processUrlChange);
        qs('#enhancer-search-container')?.remove();
        qs('#teacher-tooltip')?.remove();
        qs('#enhancer-stop-button')?.remove();
        qs('#enhancer-styles')?.remove();
        qs('#mse-friends-menu')?.remove();
        clearSearch();
        delete window.studentEnhancer;
        console.log('%c[MSE] Скрипт остановлен.', 'color: red; font-weight: bold;');
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
                if (mySpecialty && studentInfo.details.includes(mySpecialty)) {
                    badges += '<span title="Обучается на вашем направлении" style="cursor:help; margin-right:4px;">🎓</span>';
                }

                // Убрал inline-block, теперь фон будет облегать текст без разрыва
                if (normalizedSelected.has(nameOnPage)) {
                    customStyle = 'background: rgba(40, 167, 69, 0.3); border-radius: 3px; padding: 0 3px; font-weight: bold; color: #000;';
                }

                // Сборка: Иконки -> Имя -> Специальность
                p.innerHTML = `${badges}<span style="${customStyle}">${studentInfo.fullName}</span><span class="student-details">${studentInfo.details}</span>`;
                p.setAttribute('data-enhanced', 'true');
            }
        });

        qsa('.teachers-list li > div:not(.title) div:not([data-enhanced-teacher])').forEach(div => {
            const teacherName = normalizeName(div.textContent);
            div.addEventListener('mouseenter', (e) => {
                let tooltip = qs('#teacher-tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = 'teacher-tooltip';
                    document.body.appendChild(tooltip);
                }
                const review = teacherReviews.get(teacherName);
                tooltip.innerHTML = review ? `<div class="tooltip-header">${review.emoji} ${review.type}</div><div class="tooltip-body">${review.review}</div>` : `<div class="tooltip-header">🤔</div><div class="tooltip-body">Нет информации об этом преподавателе.</div>`;
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = `${window.scrollX + rect.left}px`;
                tooltip.style.top = `${window.scrollY + rect.bottom + 5}px`;
                tooltip.style.display = 'block';
            });
            div.addEventListener('mouseleave', () => qs('#teacher-tooltip')?.remove());
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
                    matchText.innerHTML = `<strong>С вами:</strong> ${shortNames}`;

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
                `<div class="selected-student-tag">${name}<button class="remove-student-btn" data-name="${name}">×</button></div>`
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
            suggestionsBox.innerHTML = matches.slice(0, 7).map(s =>
                `<div class="suggestion-item" data-name="${s.fullName}">
                    <div class="suggestion-name">${s.fullName}</div>
                    <div class="suggestion-details">${s.details}</div>
                </div>`
            ).join('');
            suggestionsBox.style.display = 'block';
        } else {
            suggestionsBox.style.display = 'none';
        }
    };

    const linkDomEventsToCache = () => {
        if (eventCache.size === 0) return;
        qsa('.fc-time-grid-event:not([data-event-id])').forEach(el => {
            const title = normalizeName(qs('.fc-title', el)?.textContent);
            const time = qs('.fc-time', el)?.getAttribute('data-full').split(' - ')[0];
            for (const [id, data] of eventCache.entries()) {
                if (normalizeName(data.fullDisplayName) === title && data.startsAtLocal.includes(time)) {
                    el.setAttribute('data-event-id', id);
                    break;
                }
            }
        });
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
            const personId = parseJwt(token).person_id || parseJwt(token).sub;

            const dateHeaders = qsa('.fc-day-header[data-date]');

            myPersonId = personId;
            localStorage.setItem('mse_my_person_id', myPersonId);
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
            const eventsResponse = await fetch("https://utmn.modeus.org/schedule-calendar-v2/api/calendar/events/search?tz=Asia/Tyumen", { method: "POST", headers: { "authorization": `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ size: 500, timeMin, timeMax, attendeePersonId: [personId] }) });
            if (!eventsResponse.ok) throw new Error(`Ошибка API (события): ${eventsResponse.status}`);
            const eventsData = await eventsResponse.json();
            const events = eventsData._embedded?.events || [];
            if (events.length === 0) {
                if (statusEl) statusEl.textContent = 'Событий на неделе нет.';
                if (controlsEl) controlsEl.style.display = 'flex';
                return;
            }

            const courseUnits = eventsData._embedded?.['course-unit-realizations'] || [];
            const courseUnitMap = new Map(courseUnits.map(cu => [cu.id, cu.nameShort]));
            if (statusEl) statusEl.textContent = `2/2: Загрузка студентов (0/${events.length})`;
            let loadedCount = 0;
            eventCache.clear();
            uniqueStudents.clear();

            const attendeePromises = events.map(event =>
                fetch(`https://utmn.modeus.org/schedule-calendar-v2/api/calendar/events/${event.id}/attendees`, { headers: { "authorization": `Bearer ${token}` } })
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

                        if (s.personId === personId && s.specialtyName) {
                            mySpecialty = s.specialtyName;
                            localStorage.setItem('mse_my_specialty', mySpecialty);
                        }

                        if (!uniqueStudents.has(normalized)) {
                            let details = s.specialtyName || 'Специальность не указана';
                            if (s.specialtyProfile && s.specialtyProfile !== s.specialtyName) details += ` : ${s.specialtyProfile}`;
                            uniqueStudents.set(normalized, { id: s.personId, fullName: s.fullName, details });
                        }
                        studentList.add(normalized);
                    }
                });
                const courseUnitId = event._links['course-unit-realization'].href.split('/').pop();
                const moduleShortName = courseUnitMap.get(courseUnitId) || '';
                eventCache.set(event.id, { name: event.name, fullDisplayName: `${moduleShortName} / ${event.name}`, startsAtLocal: event.startsAtLocal, attendees: studentList });
            });

            linkDomEventsToCache();
            if (statusEl) statusEl.style.display = 'none';
            if (controlsEl) controlsEl.style.display = 'flex';
            if (selectedStudents.size > 0) highlightEventsForStudents();
        } catch (err) {
            if (statusEl) { statusEl.textContent = `Ошибка: ${err.message}`; statusEl.style.color = 'red'; }
            if (controlsEl) controlsEl.style.display = 'flex';
            console.error('[MSE]', err);
        }
        checkExtensionUpdate()
    };

    // ПРОВЕРКА ОБНОВЛЕНИЯ КОДА РАСШИРЕНИЯ
    const checkExtensionUpdate = async () => {
        const GITHUB_USER = 'student1245';
        const GITHUB_REPO = 'Modeus-Student-Enhancer';
        const CURRENT_VERSION = '2.2.0';

        // Чтобы не спамить запросами к GitHub, проверяем не чаще одного раза в 2 часа
        const lastCheck = localStorage.getItem('mse_last_update_check');
        const cachedRelease = localStorage.getItem('mse_latest_release');
        let releaseData = null;

        if (lastCheck && (Date.now() - Number(lastCheck) < 2 * 60 * 60 * 1000) && cachedRelease) {
            try { releaseData = JSON.parse(cachedRelease); } catch (e) { }
        } else {
            try {
                const res = await fetch(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/releases/latest`);
                if (res.ok) {
                    releaseData = await res.json();
                    localStorage.setItem('mse_latest_release', JSON.stringify(releaseData));
                    localStorage.setItem('mse_last_update_check', String(Date.now()));
                }
            } catch (e) { }
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

        // Проверяем: строго если на GitHub версия ВЫШЕ текущей
        if (latestVersion && isNewerVersion(latestVersion, CURRENT_VERSION)) {
            // 1. Маленький бейдж возле поиска
            const controls = qs('#search-controls');
            if (controls && !qs('#mse-update-badge')) {
                const badge = document.createElement('a');
                badge.id = 'mse-update-badge';
                badge.href = releaseData.html_url;
                badge.target = '_blank';
                badge.title = 'Доступна новая версия расширения!';
                badge.innerHTML = `<span>⚡ v${latestVersion}</span>`;
                controls.insertBefore(badge, controls.firstChild);
            }

            // 2. Всплывающее предложение (если пользователь не нажимал "Позже" в этой сессии)
            if (localStorage.getItem('mse_dismissed_v' + latestVersion) !== '1' && !qs('#mse-update-popup')) {
                const popup = document.createElement('div');
                popup.id = 'mse-update-popup';
                popup.innerHTML = `
                    <div class="mse-update-title">🚀 Доступно обновление Enhancer!</div>
                    <div class="mse-update-text">Вышла версия <b>v${latestVersion}</b> с новыми функциями и исправлениями. Перейдите по ссылке, чтобы узнать, что появилось нового!</div>
                    <div class="mse-update-actions">
                        <a href="${releaseData.html_url}" target="_blank" id="mse-update-btn">Посмотреть / Скачать</a>
                        <button id="mse-dismiss-btn">Позже</button>
                    </div>
                `;
                document.body.appendChild(popup);

                qs('#mse-dismiss-btn', popup).addEventListener('click', () => {
                    localStorage.setItem('mse_dismissed_v' + latestVersion, '1');
                    popup.remove();
                });
                qs('#mse-update-btn', popup).addEventListener('click', () => {
                    popup.remove();
                });
            }
        }
    };

    let lastCalendarParam = null;
    const processUrlChange = () => {
        const currentUrl = window.location.href;
        const urlObj = new URL(currentUrl);

        // 1. Открытие карточки пары (боковая панель)
        const param = urlObj.searchParams.get('selectedEvent');
        let newEventId = null;
        try { if (param && param !== '""') newEventId = JSON.parse(param).eventId; } catch (e) { }
        if (newEventId !== currentEventId) {
            currentEventId = newEventId;
            setTimeout(() => { enhanceLists(); }, 250);
        } else if (!newEventId) {
            currentEventId = null;
        }

        // 2. Отслеживание изменения недели в URL и автоматический клик по обновлению
        if (currentUrl.includes('/schedule-calendar/')) {
            const calendarParam = urlObj.searchParams.get('calendar');
            if (calendarParam) {
                // Если ссылка недели изменилась — даем сайту отрисовать сетку и САМИ жмем кнопку
                if (lastCalendarParam && lastCalendarParam !== calendarParam) {
                    lastCalendarParam = calendarParam;
                    setTimeout(() => {
                        const refreshBtn = qs('#refresh-data-btn');
                        if (refreshBtn) refreshBtn.click();
                    }, 400); // 400мс задержка, чтобы сайт успел загрузить новую неделю
                } else if (!lastCalendarParam) {
                    lastCalendarParam = calendarParam;
                }
            }
        }
    };

    const setupUI = () => {
        const toolbar = qs('.main-calendar-form');
        if (!toolbar || qs('#enhancer-search-container')) return;

        const container = document.createElement('div');
        container.id = 'enhancer-search-container';
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

    const debouncedMutationHandler = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (!window.studentEnhancer) return;

            linkDomEventsToCache();
            enhanceLists();
            enhanceBuildingNames();
            renderFooterFeedback();

            if (qs('.main-calendar-form') && !qs('#enhancer-search-container')) setupUI();

            // Если выбран хоть один человек — всегда держим подсветку включенной (даже если кликнули на пару)
            if (selectedStudents.size > 0) {
                highlightEventsForStudents();
            }

            if (window.location.href.includes('/learning-path-selection/menus/')) {
                const mainHeader = Array.from(document.querySelectorAll('h2, h1')).find(el => el.textContent.includes('Физическая культура'));

                if (mainHeader && !document.getElementById('mse-open-pe-btn')) {
                    const peBtn = document.createElement('button');
                    peBtn.id = 'mse-open-pe-btn';
                    peBtn.innerHTML = '⚡ Умный подбор секций';
                    peBtn.style.cssText = 'margin-left: 15px; background: #2563eb; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); transition: background 0.15s; white-space: nowrap;';

                    peBtn.onmouseover = () => peBtn.style.background = '#1d4ed8';
                    peBtn.onmouseout = () => peBtn.style.background = '#2563eb';

                    peBtn.addEventListener('click', async () => {
                        const urlMatch = window.location.href.match(/menus\/([^\/]+)\/student\/([^\/]+)/);
                        if (!urlMatch) {
                            alert('Зайдите внутрь кампании физкультуры, чтобы кнопка заработала.');
                            return;
                        }
                        const campaignId = urlMatch[1];
                        const bookingStudentId = urlMatch[2]; // ID для API записи

                        peBtn.innerHTML = '⏳ Загрузка баз...';
                        peBtn.disabled = true;

                        try {
                            const token = sessionStorage.getItem('id_token');

                            // 1. Получаем меню кампании (узнаем ID модулей 1 и 2 семестра)
                            const menuRes = await fetch(`https://utmn.modeus.org/course-unit-booking/api/v1/students/${bookingStudentId}/campaigns/${campaignId}/student-campaign-menu`, {
                                headers: { "authorization": `Bearer ${token}` }
                            });
                            const menuData = await menuRes.json();

                            if (!menuData.moduleElements || menuData.moduleElements.length === 0) {
                                throw new Error("Модули для выбора не найдены.");
                            }

                            // 2. Параллельно загружаем все команды для всех найденных модулей
                            const modulePromises = menuData.moduleElements.map(m =>
                                fetch(`https://utmn.modeus.org/course-unit-booking/api/v1/students/${bookingStudentId}/campaigns/${campaignId}/student-campaign-menu/module-elements/${m.id}`, { headers: { "authorization": `Bearer ${token}` } })
                                    .then(r => r.json())
                            );
                            const allModulesData = await Promise.all(modulePromises);

                            // 3. Загружаем расписание (ВНИМАНИЕ: тут нужен personId из токена, а не bookingStudentId!)
                            const parseJwt = (t) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                            const personId = parseJwt(token).person_id || parseJwt(token).sub;

                            const now = new Date();
                            const future = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

                            const schedRes = await fetch("https://utmn.modeus.org/schedule-calendar-v2/api/calendar/events/search?tz=Asia/Tyumen", {
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
                                alert('Модуль pe-module.js не загружен.');
                            }
                        } catch (e) {
                            alert('Ошибка загрузки: ' + e.message);
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
                if (qs('modeus-main-menu') && !qs('#mse-friends-menu')) renderFriendsMenu();
            } else {
                qs('#mse-friends-menu')?.remove();
                qs('#mse-return-to-me-menu')?.remove();
            }

            const header = qs('.event-card-container__header');
            if (header && !qs('#enhancer-stop-button')) {
                const stopButton = document.createElement('span');
                stopButton.id = 'enhancer-stop-button';
                stopButton.innerHTML = `<i class="fa fa-ban" style="margin-right: 4px;"></i>Стоп-скрипт`;
                stopButton.addEventListener('click', stopAndCleanUp);
                header.insertBefore(stopButton, header.firstChild);
            }
        }, 250);
    };

    const style = document.createElement('style');
    style.id = 'enhancer-styles';
    style.innerHTML = `
        /* Кнопка Стоп-скрипт */
        #enhancer-stop-button { cursor: pointer; color: #dc3545; opacity: 0.8; } 
        #enhancer-stop-button:hover { opacity: 1; }

        /* 1. БЛОК ПОИСКА И КНОПОК РАСШИРЕНИЯ (по скриншотам F12) */
        #enhancer-search-container { 
            margin-left: auto !important; 
            position: relative !important; 
            display: flex !important; 
            flex-direction: column !important; 
            align-items: flex-end !important; 
        }

        #search-controls { 
            display: flex; 
            align-items: center; 
            gap: 5px; 
        }

        /* Кнопки обновления и добавления друзей */
        #refresh-data-btn, #add-friends-to-search-btn { 
            background: #fff; color: #495057; border: 1px solid #ced4da; 
            border-radius: 4px; width: 30px; height: 30px; cursor: pointer; 
            display: flex; align-items: center; justify-content: center; padding: 0; 
        }
        #refresh-data-btn:hover, #add-friends-to-search-btn:hover { background: #e9ecef; } 
        #refresh-data-btn:active, #add-friends-to-search-btn:active { background: #dee2e6; }

        /* Поле ввода поиска */
        #student-search-input { 
            height: 30px !important; 
            border: 1px solid #ced4da !important; 
            border-radius: 4px !important; 
            padding: 0 10px !important; 
            min-width: 170px !important; 
        }

        /* Кнопка сброса поиска */
        #search-clear-btn { 
            background: #6c757d; color: white; border: none; border-radius: 4px; 
            width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; 
        } 
        #search-clear-btn:hover { background: #5a6268; }

        /* Выпадающий список найденных людей (320px с привязкой вправо) */
        #search-suggestions { 
            display: none; 
            position: absolute !important; 
            top: 100% !important; 
            left: auto !important; 
            right: 0 !important; 
            width: 320px !important; 
            background: white !important; 
            border: 1px solid #ddd !important; 
            z-index: 1000 !important; 
            max-height: 300px !important; 
            overflow-y: auto !important; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important; 
            margin-top: 2px !important; 
            text-align: left !important; 
            border-radius: 4px;
        }
        .suggestion-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; } 
        .suggestion-item:hover { background-color: #f5f5f5; }
        .suggestion-name { font-weight: 500; } 
        .suggestion-details { font-size: 0.8em; color: #6c757d; }

        /* Кнопка и выпадающий список выбранных студентов (Выбрано: N) */
        #selected-students-toggle { 
            background: #fff; border: 1px solid #ced4da; padding: 0 8px; height: 30px; 
            border-radius: 4px; cursor: pointer; display: flex; align-items: center; 
            font-size: 12px; color: #495057; white-space: nowrap; 
        }
        #selected-students-toggle:hover { background: #f8f9fa; }
        #selected-students-container { 
            display: none; position: absolute; top: 100%; left: 0; background: white; border: 1px solid #ddd; 
            z-index: 1000; max-height: 250px; overflow-y: auto; width: 260px; 
            box-shadow: 0 4px 8px rgba(0,0,0,0.1); margin-top: 2px; padding: 6px; 
            flex-direction: column; gap: 5px; border-radius: 4px; 
        }
        .selected-student-tag { 
            background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; 
            font-size: 12px; display: flex; align-items: center; justify-content: space-between; gap: 5px; 
        }
        .remove-student-btn { 
            background: rgba(255,255,255,0.3); border: none; color: white; border-radius: 50%; 
            width: 16px; height: 16px; cursor: pointer; font-size: 12px; line-height: 1; 
            padding: 0; display: flex; align-items: center; justify-content: center; 
        }
        .remove-student-btn:hover { background: rgba(255,255,255,0.6); }

        /* 2. СЕТКА КАЛЕНДАРЯ И ПОДСВЕТКА ПАР */
        .fc-time-grid-event { transition: opacity 0.3s ease, border 0.3s ease; } 
        .search-highlight { border: 3px solid #28a745 !important; z-index: 2 !important; } 
        .search-fade { opacity: 0.25 !important; }
        
        .mse-event-match-tooltip { 
            font-size: 10px; color: #000; background: rgba(40,167,69,0.35); 
            padding: 2px 4px; border-radius: 3px; margin-top: 3px; 
            line-height: 1.2; display: block; 
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
            border-left: 2px solid #28a745; cursor: help;
        }

        /* 3. ТУЛТИПЫ ПРЕПОДАВАТЕЛЕЙ */
        #teacher-tooltip { 
            position: fixed; display: none; background: #333; color: white; 
            border-radius: 5px; padding: 10px; z-index: 1001; max-width: 300px; 
            font-size: 14px; line-height: 1.4; pointer-events: none; 
        }
        .tooltip-header { font-weight: bold; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px solid #555; }
        .student-details { color: #9e9e9e; font-size: 0.85em; display: block; line-height: 1.2; margin-top: 2px; }

        /* 4. БОКОВОЕ МЕНЮ ДРУЗЕЙ */
        #mse-friends-menu .p-panelmenu-header a { 
            position: relative !important; display: flex !important; align-items: center !important; cursor: pointer !important;
        }
        #mse-friends-menu .p-panelmenu-header .p-menuitem-icon { 
            margin-right: 14px !important; flex-shrink: 0 !important;
        }
        #mse-friends-menu .p-panelmenu-header .p-menuitem-text { flex-grow: 1 !important; }
        #mse-friends-menu .p-panelmenu-header .p-panelmenu-icon { margin-left: auto !important; display: inline-block !important; }

        #mse-friends-menu li { position: relative !important; }
        #mse-friends-menu li a { padding-right: 32px !important; }
        .mse-remove-friend-btn { 
            position: absolute !important; right: 10px !important; top: 50% !important; 
            transform: translateY(-50%) !important; cursor: pointer !important; color: #ffffff !important; 
            opacity: 0.6; font-size: 18px !important; line-height: 1 !important; display: none !important; 
            padding: 4px !important; z-index: 10 !important;
        }
        #mse-friends-menu li:hover .mse-remove-friend-btn { display: block !important; }
        .mse-remove-friend-btn:hover { opacity: 1 !important; color: #ff5252 !important; }

        /* Кнопка добавления в друзья в штатном мультиселекте */
        .p-multiselect-item { display: flex !important; align-items: center; }
        .p-multiselect-item .item { display: flex !important; align-items: center; width: 100%; }
        .mse-add-friend-btn { cursor: pointer; font-size: 18px; margin-left: auto; padding: 5px 10px; z-index: 5; line-height: 1; -webkit-user-select: none; user-select: none; }

        /* 5. БОКОВАЯ КАРТОЧКА ПАРЫ (ФИКС ШИРИНЫ 325px) */
        .location-info__header-text { 
            white-space: normal !important; word-wrap: break-word !important; line-height: 1.2; display: block; margin-top: 4px; 
        }
        .calendar-container .event-card-block {
            flex-shrink: 0 !important; margin-left: 10px !important; width: 325px !important;
        }

        /* Кнопка обновления в строке поиска */
        #mse-update-badge {
            background: #ff9800; color: #fff; font-size: 11px; font-weight: bold;
            padding: 4px 8px; border-radius: 4px; text-decoration: none;
            display: flex; align-items: center; cursor: pointer; transition: background 0.2s;
        }
        #mse-update-badge:hover { background: #f57c00; }

        /* Всплывающее предложение обновиться в правом нижнем углу */
        #mse-update-popup {
            position: fixed; bottom: 25px; right: 25px; z-index: 10000;
            background: #ffffff; border: 1px solid #ced4da; border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); padding: 15px; width: 290px;
            font-family: Roboto, sans-serif; animation: mseSlideUp 0.3s ease-out;
        }
        .mse-update-title { font-weight: bold; font-size: 14px; color: #212529; margin-bottom: 6px; }
        .mse-update-text { font-size: 12px; color: #495057; line-height: 1.4; margin-bottom: 12px; }
        .mse-update-actions { display: flex; gap: 8px; justify-content: flex-end; }
        #mse-update-btn {
            background: #28a745; color: white; text-decoration: none; font-size: 12px;
            padding: 5px 12px; border-radius: 4px; font-weight: 500;
        }
        #mse-update-btn:hover { background: #218838; }
        #mse-dismiss-btn {
            background: #e9ecef; border: none; color: #495057; font-size: 12px;
            padding: 5px 10px; border-radius: 4px; cursor: pointer;
        }
        #mse-dismiss-btn:hover { background: #dee2e6; }
        @keyframes mseSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    `;
    document.head.appendChild(style);

    const observer = new MutationObserver(debouncedMutationHandler);
    observer.observe(document.body, { childList: true, subtree: true });

    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        originalPushState.apply(history, args);
        setTimeout(processUrlChange, 100);
    };
    window.addEventListener('popstate', processUrlChange);

    window.studentEnhancer = {
        observer,
        originalPushState,
        originalFetch: window.fetch,
        originalXhrSend: XMLHttpRequest.prototype.send
    };

    const checkReady = setInterval(() => {
        if (qs('.main-calendar-form') && qs('modeus-main-menu')) {
            clearInterval(checkReady);
            setupUI();
            processUrlChange();
            if (window.location.href.includes('/schedule-calendar/')) {
                renderFriendsMenu();
            }
        }
    }, 200);

    console.log('%c[MSE] Скрипт запущен!', 'color: #2196F3; font-size: 16px; font-weight: bold;');
})();