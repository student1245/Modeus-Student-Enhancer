# Политика конфиденциальности / Privacy Policy — Modeus Student Enhancer (MSE)

**Последнее обновление / Last Updated:** Октябрь 2026 / October 2026

---

## 🇷🇺 Русская версия (Russian Version)

### 1. Общие положения
Расширение для браузера **Modeus Student Enhancer (MSE)** — это некоммерческий инструмент с открытым исходным кодом, созданный для улучшения пользовательского опыта студентов при работе с образовательной платформой расписания Modeus. Мы придерживаемся принципа минимизации данных и локальной обработки (**Local-First Processing**). Modeus Student Enhancer (MSE) является независимым неофициальным проектом с открытым исходным кодом (MIT License) и не аффилирован с разработчиками платформы Modeus или администрацией университета.

### 2. Какие данные обрабатывает расширение и где они хранятся

#### 2.1. Токены сессии и данные для автоматического входа (Authentication Data)
* **Фоновое поддержание сессии (Session Keeper):** Для предотвращения внезапного завершения сессии расширение считывает текущие авторизационные токены платформы (`access_token`, `id_token`) из `sessionStorage` и сохраняет их резервную копию в `localStorage` вашего браузера (`mse_auth_backup`), а также обновляет их через скрытый фрейм (`sub_frame`) на официальном сервере авторизации университета.
* **Опциональный автовход (Auto-Login 24h+):** Только если вы **явно включите** функцию автоматического входа в настройках расширения, ваши логин и пароль шифруются непосредственно в браузере с использованием криптографического стандарта **Web Crypto API (AES-GCM 256-bit)** и неэкспортируемого ключа (`extractable: false`), после чего сохраняются исключительно локально на вашем устройстве в изолированном хранилище `chrome.storage.local`.
* **Гарантия безопасности:** Ваши пароли и авторизационные токены **никогда не покидают ваше устройство**, не синхронизируются через облако и не передаются разработчикам или третьим лицам. При первой же ошибке авторизации (например, после смены пароля в университете) автоматический вход мгновенно отключается для защиты вашей учетной записи от блокировки.

#### 2.2. Академические данные и расписание
* Данные о вашем расписании, баллах успеваемости, учебных модулях физкультуры и составе учебных групп запрашиваются вашим браузером напрямую с официальных API-серверов платформы Modeus с использованием вашей текущей сессии.
* Вся обработка и визуализация этих данных происходят исключительно в оперативной памяти и локальном хранилище вашего браузера. Расширение не выгружает ваше расписание, ФИО, оценки или список друзей на внешние серверы.

#### 2.3. Справочные базы и анонимная обратная связь
* **Справочники (GitHub Raw):** При запуске расширение обращается к публичному репозиторию на GitHub только для чтения актуальных справочников адресов учебных корпусов (`buildings.json`), отзывов (`teacher_reviews.json`) и конфигурации опросов (`data/survey.json`).
* **Добровольные опросы и телеметрия:** Для понимания того, какие функции наиболее полезны активным пользователям, расширение ведет локальный подсчет времени активности вкладки в `localStorage` и может предложить пройти короткий встроенный опрос. При отправке ответа или отказе от опроса на вебхук Google Apps Script передается **строго анонимный пакет данных**: идентификатор опроса (`surveyId`), версия расширения, статус действия и выбранные варианты ответов. Пакет не содержит вашего имени, email, токенов или идентификатора студента (`person_id`). Вы можете навсегда отключить опросы кнопкой «Больше никогда не показывать».

### 3. Использование разрешений браузера (Permissions Justification)
* `storage` — хранение локальных настроек расширения, состояния переключателя и зашифрованных данных опционального автовхода.
* `declarativeNetRequest` (`data/rules.json`) — модификация сетевых заголовков `X-Frame-Options` и `Content-Security-Policy` строго для вложенных фреймов (`sub_frame`), инициированных доменом расписания, что технически необходимо для бесшовного фонового продления сессии в скрытом `iframe`.
* `host_permissions` — встраивание пользовательского интерфейса в портал расписания, выполнение локального автовхода на домене SSO университета, загрузка статических JSON-справочников из репозитория GitHub и отправка анонимных ответов на опросы.

### 4. Управление данными и их удаление
Вы имеете полный контроль над своими данными:
* Вы можете мгновенно остановить работу скрипта кнопкой аварийной остановки (`#enhancer-stop-button`) в интерфейсе портала или выключить расширение через всплывающее меню (`popup/popup.html`).
* Вы можете в любой момент очистить сохраненные данные автовхода в настройках расширения.
* При удалении расширения из браузера все данные в `chrome.storage.local` и `IndexedDB` удаляются автоматически.

### 5. Соответствие политике ограниченного использования (Limited Use)
Использование информации, полученной из API браузера, полностью соответствует требованиям **Chrome Web Store User Data Policy**, включая требования **Limited Use**: мы не продаем данные третьим лицам, не используем их для показа рекламы и не передаем брокерам данных.

---

## 🇬🇧 English Version (For Store Reviewers)

### 1. Overview
**Modeus Student Enhancer (MSE)** is an open-source, non-commercial browser extension designed to improve the user experience for university students using the Modeus educational platform. We strictly follow a **Local-First Processing** and data minimization architecture. Modeus Student Enhancer (MSE) is an independent, unofficial open-source project (MIT License) and is not affiliated with the developers of the Modeus platform or the university administration.

### 2. Data Collection, Storage, and Processing

#### 2.1. Authentication Information (Session Keeper & Optional Auto-Login)
* **Session Keeper:** To prevent unexpected logouts and data loss, the extension reads active OAuth/JWT tokens (`access_token`, `id_token`) from `sessionStorage`, backs them up locally in the browser's `localStorage` (`mse_auth_backup`), and silently refreshes them via a hidden `sub_frame` pointing to the official university SSO endpoint.
* **Optional Auto-Login (Strict Opt-In):** Only if the user **explicitly enables** the Auto-Login feature, the extension encrypts the user's login credentials locally using the browser's native **Web Crypto API (AES-GCM 256-bit)** with a non-extractable key (`extractable: false` stored in `IndexedDB`) and stores the ciphertext exclusively on the user's device in `chrome.storage.local`.
* **Zero External Transfer:** User passwords and authentication tokens **never leave the user's device**, are never logged, and are never transmitted to any developer server or third party. On any authentication error, auto-login immediately trips a single-attempt circuit breaker and disables itself to prevent Active Directory account lockouts.

#### 2.2. Academic & Schedule Data
* Schedule events, grades, physical education booking slots, and classmate lists are fetched directly by the user's browser from official Modeus API endpoints using the user's active session.
* All rendering and processing occur strictly locally in the browser's memory and local storage. No academic records or personal identifiers (`person_id`, full name, email) are ever transmitted externally.

#### 2.3. Static Dictionaries & Anonymous Survey Telemetry
* **Static Configurations:** The extension fetches read-only JSON dictionaries (building addresses, teacher reviews, and survey configurations) from the public GitHub repository.
* **Anonymous Product Feedback:** Engagement duration is calculated locally in `localStorage` to determine when to display an optional in-app feature survey. When a user submits or dismisses a survey, a strictly anonymous payload (`surveyId`, extension version, action status, and selected feature choices) is sent via a `POST` request to a Google Apps Script webhook. No personally identifiable information (PII) or authentication data is included. Users can permanently opt out of all surveys with a single click.

### 3. Permissions Justification
* `storage`: Used to persist extension state, user preferences, and locally encrypted opt-in auto-login credentials.
* `declarativeNetRequest`: Used strictly on `sub_frame` resources initiated by the schedule portal to strip framing restriction headers (`X-Frame-Options`, `Content-Security-Policy`) required for silent OAuth token refresh inside a hidden `iframe`.
* `host_permissions`: Required to inject UI enhancements on the university Modeus portal, perform opt-in SSO renewal, load static JSON dictionaries from GitHub Raw, and submit anonymous survey responses to Google Apps Script.

### 4. Compliance with Chrome Web Store Limited Use Policy
The use of information received from Google APIs and browser APIs adheres to the **Chrome Web Store User Data Policy**, including the **Limited Use** requirements. We do not sell user data, use it for advertising, or transfer it to third parties.
