# Политика конфиденциальности / Privacy Policy — Modeus Student Enhancer (MSE)

**Последнее обновление / Last Updated:** Октябрь 2026 / October 2026

[🇷🇺 Перейти к русской версии](#-русская-версия-russian-version) | [🇬🇧 Jump to English version](#-english-version-for-store-reviewers)

---

## 🇷🇺 Русская версия (Russian Version)

### 1. Общие положения
Расширение для браузера **Modeus Student Enhancer (MSE)** — это некоммерческий инструмент с открытым исходным кодом, созданный для улучшения пользовательского опыта студентов при работе с образовательной платформой расписания Modeus. Мы придерживаемся принципа минимизации данных и локальной обработки (**Local-First Processing**). Modeus Student Enhancer (MSE) является независимым неофициальным проектом с открытым исходным кодом (MIT License) и не аффилирован с разработчиками платформы Modeus или администрацией университета.

### 2. Какие данные обрабатывает расширение и где они хранятся

#### 2.1. Токены сессии и данные для автоматического входа (Authentication Data)
* **Фоновое поддержание сессии (Session Keeper):** Для предотвращения внезапного завершения сессии расширение считывает текущие авторизационные токены платформы (`access_token`, `id_token`) из `sessionStorage` и сохраняет их резервную копию в `localStorage` вашего браузера (`mse_auth_backup`), а также обновляет их через скрытый фрейм (`sub_frame`) на официальном сервере авторизации университета. Резервная копия (`mse_auth_backup`) используется также для синхронизации активной сессии между открытыми вкладками браузера (через механизм событий `window.storage` и Web Locks API).
* **Опциональный автовход (Auto-Login 24h+):** Только если вы **явно включите** функцию автоматического входа (чекбокс «Запомнить меня» на форме авторизации для личных ПК), ваши логин и пароль шифруются непосредственно в браузере с использованием криптографического стандарта **Web Crypto API (AES-GCM 256-bit)** и сохраняются исключительно локально на вашем устройстве в изолированном хранилище `chrome.storage.local` (недоступном скриптам веб-страниц из Main World).
* **Гарантия безопасности:** Ваши пароли и авторизационные токены **никогда не покидают ваше устройство**, не синхронизируются через облако и не передаются разработчикам или третьим лицам. При первой же ошибке авторизации (например, после смены пароля в университете) срабатывает Single-Attempt Circuit Breaker: сохраненные учетные данные немедленно удаляются из `chrome.storage.local` для защиты вашей учетной записи от блокировки в Active Directory.

#### 2.2. Академические данные и расписание
* Данные о вашем расписании, баллах успеваемости, учебных модулях физкультуры и составе учебных групп запрашиваются вашим браузером напрямую с официальных API-серверов платформы Modeus, **либо считываются из штатных сетевых ответов самого портала** (расширение перехватывает ответы Angular через `window.fetch` и `XMLHttpRequest.prototype.send` для эндпоинтов `/academic-period-results-table/primary`, `/persons/search`, `/module-elements/`).
* Вся обработка и визуализация этих данных происходят исключительно в оперативной памяти и локальном хранилище вашего браузера. Расширение не выгружает ваше расписание, ФИО, оценки или список друзей на внешние серверы.

#### 2.3. Справочные базы, проверка обновлений и анонимная обратная связь
* **Справочники и проверка обновлений (GitHub):** При запуске и периодически расширение обращается к публичному репозиторию на GitHub для чтения актуальных справочников адресов учебных корпусов (`buildings.json`), отзывов (`teacher_reviews.json`) и конфигурации опросов (`data/survey.json`), а также проверяет наличие новых версий расширения через публичный GitHub Releases API (`api.github.com`).
* **Добровольные опросы и телеметрия:** Для понимания того, какие функции наиболее полезны активным пользователям, расширение ведет локальный подсчет времени активности вкладки в `localStorage` и может предложить пройти короткий встроенный опрос. При отправке ответа или отказе от опроса на вебхук Google Apps Script передается **строго анонимный пакет данных**, содержащий: отметку времени отправки (`timestamp`), идентификатор опроса (`surveyId`), версию расширения (`version`), статус действия (`action`) и выбранные варианты ответов (`answers`), включая опциональный пользовательский текст из поля «Свой вариант». Пакет не содержит вашего имени, email, токенов или идентификатора студента (`person_id`). Вы можете навсегда отключить опросы кнопкой «Больше никогда не показывать».

### 3. Использование разрешений браузера (Permissions Justification)
* `chrome.storage.local` (никогда не синхронизируется с облаком) — хранит зашифрованный сейф учетных данных автовхода (`mse_sso_vault`) и одноразовый флаг ручного выхода (`mse_manual_logout_once`). Недоступно скриптам веб-страниц.
* `chrome.storage.sync` — хранение единственного булева флага глобального переключателя расширения (`enabled: true/false`). Персональные данные не передаются и не синхронизируются.
* `declarativeNetRequest` (`data/rules.json`) — модификация сетевых заголовков `X-Frame-Options` и `Content-Security-Policy` строго для вложенных фреймов (`sub_frame`) на доменах авторизации университета (`fs.utmn.ru`, `auth.modeus.org`), что технически необходимо для бесшовного фонового продления сессии в скрытом `iframe`.
* `host_permissions` — встраивание пользовательского интерфейса в портал расписания, выполнение локального автовхода на домене SSO университета, загрузка статических JSON-справочников из репозитория GitHub и отправка анонимных ответов на опросы.

### 4. Управление данными и их удаление
Вы имеете полный контроль над своими данными:
* Вы можете мгновенно остановить работу скрипта кнопкой аварийной остановки (`#enhancer-stop-button`) в интерфейсе портала или выключить расширение через всплывающее меню (`popup/popup.html`).
* Вы можете в любой момент сбросить сохраненные данные автовхода во всплывающем окне расширения (кнопка «Сбросить»).
* При нажатии кнопки «Выйти» в интерфейсе Modeus резервная копия токенов (`mse_auth_backup`) немедленно удаляется из `localStorage`.
* При удалении расширения из браузера все данные в `chrome.storage.local` и `chrome.storage.sync` удаляются автоматически.

### 5. Соответствие политике ограниченного использования (Limited Use)
Использование информации, полученной из API браузера, полностью соответствует требованиям **Chrome Web Store User Data Policy**, включая требования **Limited Use**: мы не продаем данные третьим лицам, не используем их для показа рекламы и не передаем брокерам данных.

---

## 🇬🇧 English Version (For Store Reviewers)

### 1. Overview
**Modeus Student Enhancer (MSE)** is an open-source, non-commercial browser extension designed to improve the user experience for university students using the Modeus educational platform. We strictly follow a **Local-First Processing** and data minimization architecture. Modeus Student Enhancer (MSE) is an independent, unofficial open-source project (MIT License) and is not affiliated with the developers of the Modeus platform or the university administration.

### 2. Data Collection, Storage, and Processing

#### 2.1. Authentication Information (Session Keeper & Optional Auto-Login)
* **Session Keeper:** To prevent unexpected logouts and data loss, the extension reads active OAuth/JWT tokens (`access_token`, `id_token`) from `sessionStorage`, backs them up locally in the browser's `localStorage` (`mse_auth_backup`), and silently refreshes them via a hidden `sub_frame` pointing to the official university SSO endpoint. The backup (`mse_auth_backup`) is also used to synchronize the active session across open browser tabs (via native `storage` events and the Web Locks API).
* **Optional Auto-Login (Strict Opt-In):** Only if the user **explicitly enables** the Auto-Login feature ("Remember me" checkbox on the university SSO form on personal PCs), the extension encrypts the user's credentials locally using the browser's native **Web Crypto API (AES-GCM 256-bit)** and stores the encrypted vault exclusively on the user's device in isolated `chrome.storage.local` (inaccessible to web page scripts in the Main World).
* **Zero External Transfer & Safety:** User passwords and authentication tokens **never leave the user's device**, are never logged, and are never transmitted to any developer server or third party. On any authentication error or repeated failure, auto-login immediately trips a Single-Attempt Circuit Breaker, purging stored credentials from `chrome.storage.local` to prevent Active Directory account lockouts. Users can reset stored credentials at any time via the extension popup.
* **Cross-tab token sync:** When a session is silently refreshed, the leading browser tab writes the updated token backup to `localStorage`. Other open tabs of the same origin detect this via the native `storage` event and update their own `sessionStorage` accordingly. All synchronization occurs strictly within the user's browser — no data leaves the device.

#### 2.2. Academic & Schedule Data
* Schedule events, grades, physical education booking slots, classmate lists, and the locally stored friends list are fetched directly by the user's browser from official Modeus API endpoints, **or read from the portal's own native network responses** (the extension intercepts Angular's `window.fetch` and `XMLHttpRequest.prototype.send` responses for `/academic-period-results-table/primary`, `/persons/search`, and `/module-elements/`).
* All rendering and processing occur strictly locally in the browser's memory and local storage. No academic records or personal identifiers (`person_id`, full name, email) are ever transmitted externally.

#### 2.3. Static Dictionaries, Update Checks & Anonymous Survey Telemetry
* **Static Configurations & Update Checks:** The extension fetches read-only JSON dictionaries (building addresses, teacher reviews, and survey configurations) from the public GitHub repository and periodically checks for new extension releases via the public GitHub Releases API (`api.github.com`).
* **Anonymous Product Feedback:** Engagement duration is calculated locally in `localStorage` to determine when to display an optional in-app feature survey. When a user submits or dismisses a survey, a strictly anonymous payload is sent via a `POST` request to a Google Apps Script webhook, containing: send timestamp (`timestamp`), survey identifier (`surveyId`), extension version (`version`), action status (`action`), and selected answers (`answers`), including any optional custom text entered in the free-text field. No personally identifiable information (PII) or authentication data is included. Users can permanently opt out of all surveys with a single click.

### 3. Permissions Justification
* `chrome.storage.local` (never synced to the cloud): Stores the encrypted auto-login credential vault (`mse_sso_vault`) and a one-time manual logout flag (`mse_manual_logout_once`). Inaccessible to web page scripts.
* `chrome.storage.sync`: Stores exclusively the global extension on/off toggle (`enabled: true/false`). No personal data is included or synced.
* `declarativeNetRequest`: Used strictly on `sub_frame` resources on university authentication domains (`fs.utmn.ru`, `auth.modeus.org`) to strip framing restriction headers (`X-Frame-Options`, `Content-Security-Policy`) required for silent OAuth token refresh inside a hidden `iframe`.
* `host_permissions`: Required to inject UI enhancements on the university Modeus portal, perform opt-in SSO renewal, load static JSON dictionaries from GitHub Raw, and submit anonymous survey responses to Google Apps Script.

### 4. Data Control & Deletion
You have full control over your data at all times:
* You can instantly stop all extension scripts using the emergency stop button (`#enhancer-stop-button`) in the Modeus portal UI, or disable the extension entirely via the popup menu.
* You can reset stored auto-login credentials at any time using the Reset button in the extension popup.
* Clicking the standard Sign Out button in the Modeus portal immediately deletes the token backup (`mse_auth_backup`) from `localStorage`.
* Uninstalling the extension from your browser automatically deletes all data stored in `chrome.storage.local` and `chrome.storage.sync`.

### 5. Compliance with Chrome Web Store Limited Use Policy
The use of information received from Google APIs and browser APIs adheres to the **Chrome Web Store User Data Policy**, including the **Limited Use** requirements. We do not sell user data, use it for advertising, or transfer it to third parties.
