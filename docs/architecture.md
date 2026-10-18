# 🏗 Архитектура: Modeus Student Enhancer (MSE)

Техническая документация архитектуры расширения для платформы Modeus (Angular SPA, `https://utmn.modeus.org/*`). Описывает разделение контекстов выполнения Chromium, жизненный цикл инициализации, механизмы подсистем, спецификацию API и модель хранения данных.

---

## Содержание

1. [Карта проекта и миры Chromium (Isolated vs Main)](#1-карта-проекта-и-миры-chromium-isolated-vs-main)
   * [1.1. Технологический стек и файловая структура](#11-технологический-стек-и-файловая-структура)
   * [1.2. Разделение миров: Isolated World vs Main World](#12-разделение-миров-isolated-world-vs-main-world)
   * [1.3. Жизненный цикл инициализации и мост данных через `<meta>`](#13-жизненный-цикл-инициализации-и-мост-данных-через-meta)
   * [1.4. Реестр архитектурных решений (ADR)](#14-реестр-архитектурных-решений-adr)
2. [Архитектура подсистем](#2-архитектура-подсистем)
   * [Карта монолита src/injected.js](#карта-монолита-srcinjectedjs)
   * [2.1. Session Keeper](#21-session-keeper)
   * [2.2. Расписание и поиск общих пар](#22-расписание-и-поиск-общих-пар)
   * [2.3. Модуль успеваемости](#23-модуль-успеваемости)
   * [2.4. Умный подбор физкультуры](#24-умный-подбор-физкультуры)
   * [2.5. Корпуса и отзывы](#25-корпуса-и-отзывы)
   * [2.6. Система логирования и режим отладки (Debug Mode)](#26-система-логирования-и-режим-отладки-debug-mode)
   * [2.7. Подсистема интерактивных опросов и аналитики](#27-подсистема-интерактивных-опросов-и-аналитики)
   * [2.8. Подсистема проверки обновлений ([MSE Update])](#28-подсистема-проверки-обновлений-mse-update)
3. [Справочник API и хранилищ](#3-справочник-api-и-хранилищ)
   * [3.1. Эндпоинты платформы Modeus](#31-эндпоинты-платформы-modeus)
   * [3.2. Формат OAuth-хэша переадресации](#32-формат-oauth-хэша-переадресации)
   * [3.3. Таблица локальных хранилищ](#33-таблица-локальных-хранилищ)
     * [3.3.1. Нативные ключи сессии Modeus (sessionStorage)](#331-нативные-ключи-сессии-modeus-sessionstorage)
     * [3.3.2. Собственные ключи расширения (localStorage / sessionStorage / chrome.storage)](#332-собственные-ключи-расширения-localstorage--sessionstorage--chromestorage)
   * [3.4. Внешний вебхук опросов и аналитики (Google Apps Script)](#34-внешний-вебхук-опросов-и-аналитики-google-apps-script)
4. [Быстрый старт для разработчика (How to Contribute & Debug)](#4-быстрый-старт-для-разработчика-how-to-contribute--debug)

---

## 1. Карта проекта и миры Chromium (Isolated vs Main)

### 1.1. Технологический стек и файловая структура

* **Платформа:** Google Chrome Extensions (Manifest V3).
* **Среда выполнения:** Vanilla JavaScript (ES6+), DOM API, CSS3.
* **Целевое приложение:** Modeus Web Client (Angular 14+, PrimeNG, FullCalendar).
* **Сетевой уровень:** DeclarativeNetRequest API (модификация заголовков), Fetch API, перехват XMLHttpRequest.

```text
modeus-beta/
├── manifest.json         # Манифест Manifest V3: разрешения, декларации скриптов, web_accessible_resources
├── buildings.json        # Локальный fallback-справочник корпусов (код -> адрес)
├── teacher_reviews.json  # Локальный fallback-справочник отзывов на преподавателей
├── LICENSE               # Лицензия проекта (MIT License)
├── readme.md             # Пользовательское руководство и инструкция по установке
├── data/
│   ├── rules.json        # Декларативные правила DeclarativeNetRequest для снятия заголовков CSP и XFO
│   └── survey.json       # Конфигурация дистанционных опросов (локальный dev-черновик)
├── docs/
│   ├── architecture.md   # Архитектурная спецификация и техническая документация подсистем
│   ├── PRIVACY.md        # Политика конфиденциальности (RU / EN)
│   └── adr/              # Реестр архитектурных решений (ADR-001 — ADR-004)
├── popup/
│   ├── popup.html        # Всплывающее окно управления расширением (вкл/выкл)
│   └── popup.js          # Логика переключения состояния в chrome.storage.sync
├── src/
│   ├── keeper-early.js   # Content script (run_at: document_start): ранняя реанимация сессии до старта Angular
│   ├── content.js        # Content script (run_at: document_end): фоновый предзагрузчик баз и инжектор скриптов
│   ├── sso-autologin.js  # Content script (all_frames, run_at: document_end на fs.utmn.ru): опциональный автовход 24ч+ (ADR-005)
│   ├── injected.js       # Main world script: ядро календаря, поиск пар, успеваемость, Session Keeper
│   └── pe-module.js      # Main world script: модуль умного подбора физкультуры и бронирования секций
├── styles/
│   ├── styles.css        # Основные стили расширения (поиск, друзья, тултипы, оценки, toast-уведомления)
│   └── pe-styles.css     # Стили интерфейса физкультуры (инжектируются через manifest content_scripts)
└── icons/                # Иконки расширения (16, 32, 48, 128 px)
```

### 1.2. Разделение миров: Isolated World vs Main World

В архитектуре Chromium выполнение кода расширения разделено на два изолированных контекста:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        БРАУЗЕР (Chromium)                              │
├───────────────────────────────────┬────────────────────────────────────┤
│    ISOLATED WORLD (Расширение)    │    MAIN WORLD (Страница Modeus)    │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Доступ к chrome.* API           │ • Доступ к window.studentEnhancer  │
│ • chrome.storage.local/sync       │ • Доступ к window.MSE_PE           │
│ • data/rules.json (DNR сети)      │ • Перехват window.fetch            │
│ • src/content.js (modeus.org)     │ • Перехват XMLHttpRequest.send     │
│ • src/keeper-early.js (modeus.org)│ • Чтение/запись sessionStorage     │
│ • src/sso-autologin.js (utmn.ru)  │ • Патчинг history.pushState        │
│ • Изолирован от window-переменных │ • Прямой доступ к контексту Angular│
│   страницы (сейф mse_sso_vault    │                                    │
│   защищен от скриптов Main World) │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

1. **Isolated World (Изолированный мир):**
   * Выполняет `src/keeper-early.js`, `src/content.js` (на `utmn.modeus.org`) и `src/sso-autologin.js` (на `fs.utmn.ru`).
   * Имеет доступ к `chrome.storage.local` (зашифрованный сейф `mse_sso_vault`), `chrome.storage.sync`, `chrome.runtime.getURL` и декларативным сетевым правилам.
   * Изолирован от контекста `window` страницы и не может напрямую перехватывать вызовы `fetch` Angular-приложения, однако разделяет общее дисковое и сессионное хранилище источника (`localStorage` и `sessionStorage`).
2. **Main World (Главный мир страницы):**
   * Выполняет `src/injected.js` и `src/pe-module.js`, внедряемые в DOM через теги `<script>`.
   * Имеет прямой доступ к глобальному объекту `window`, прототипам `fetch` и `XMLHttpRequest`, а также к контексту рендеринга Angular.
   * Патчит `window.fetch` и `XMLHttpRequest.prototype.send` через функцию `interceptNetworkRequests()`:
     * **`window.fetch`** перехватывает нативные запросы поиска персон (`/api/people/persons/search` для сбора людей и автодополнения), модулей физкультуры (`/module-elements/` в Booking API) и таблицу успеваемости (`/academic-period-results-table/primary`).
     * **`XMLHttpRequest.prototype.send`** (транспорт `HttpClient` в Angular) перехватывает загрузку таблицы успеваемости (`/academic-period-results-table/primary` для расчета максимумов и дефицита баллов) и дублирует обработку `/api/people/persons/search`.

### 1.3. Жизненный цикл инициализации и мост данных через `<meta>`

```text
[ Браузер: Навигация на https://utmn.modeus.org/* ]
                           │
                           ▼
             [ document_start: src/keeper-early.js ]
             ├── Проверка window.self === window.top
             ├── Чтение sessionStorage('access_token')
             └── Если пусто -> Проверка суточного JWT в localStorage('mse_auth_backup')
                 └── Если валиден -> Восстановление 9 ключей сессии
                           │
                           ▼
          [ Браузер парсит DOM и стили страницы ]
                           │
                           ▼
              [ document_end: src/content.js ]
             ├── Проверка флага chrome.storage.sync('enabled')
             ├── Чтение mse_sso_vault -> Вставка <meta name="modeus-sso-autologin" content="1|0">
             ├── Слушатель mse:manual-logout -> пауза автовхода на 10 минут
             ├── Мгновенная инициализация справочников из кэша localStorage / пакета (< 5 мс)
             │   ├── buildings.json (кэш mse_buildings_cache 24ч / локальный пакет)
             │   ├── teacher_reviews.json (кэш mse_reviews_cache 24ч / локальный пакет)
             │   └── survey.json (Prod: кэш mse_survey_cache 12ч; Dev: локальный черновик)
             ├── Кодирование данных в Base64
             ├── Вставка <meta name="modeus-buildings-map" content="...">
             ├── Вставка <meta name="modeus-teacher-reviews" content="...">
             ├── Вставка <meta name="modeus-survey-config" content="...">
             ├── Вставка <meta name="modeus-enhancer-version" content="...">
             ├── Мгновенная инъекция <script src="src/pe-module.js" async="false">
             ├── Мгновенная инъекция <script src="src/injected.js" async="false">
             └── Неблокирующая фоновая ревалидация с GitHub Raw (SWR) -> mse:databases-updated
                           │
                           ▼
              [ Main World: src/injected.js ]
             ├── Guard от повторного запуска (window.studentEnhancer)
             ├── Инициализация баз initDatabases() (декодирование <meta>-тегов и loadSurveyConfig())
             ├── Перехват сетевых запросов (fetch и XMLHttpRequest.prototype.send)
             ├── Инициализация Session Keeper (бэкап токенов + интервал 20с + поддержка 24ч+ автовхода)
             ├── Патчинг history.pushState и слушатель popstate
             ├── Запуск фоновой проверки обновлений checkExtensionUpdate() (1.5с + интервал 2ч)
             ├── Запуск трекера активности startEngagementTracker() (heartbeat 1с)
             └── Точка входа:
                 checkReady (таймер готовности DOM) -> setupUI() -> loadAllData() -> запуск MutationObserver
```

Передача справочников корпусов, отзывов и конфигурации опросов из изолированного мира `src/content.js` в мир страницы `src/injected.js` выполняется через синхронный DOM-мост: данные сериализуются в Base64 и сохраняются в тегах `<meta>` (с мгновенным чтением из кэша `localStorage` и локального бандла, что гарантирует старт скриптов < 5 мс без сетевой блокировки). При получении обновлений с GitHub Raw фоновый процесс обновляет `<meta>` и рассылает событие `mse:databases-updated`. Архитектурное обоснование выбора синхронного DOM-моста вместо асинхронных `postMessage` и `CustomEvent` зафиксировано в [ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md).

### 1.4. Реестр архитектурных решений (ADR)

Архитектурные решения (ADR) фиксируют ключевые необратимые развилки, защищая команду от повторных споров и ошибочного рефакторинга.

| ID | Название | Статус | Суть решения |
|---|---|---|---|
| [ADR-001](adr/ADR-001-silent-session-refresh.md) | Бесшовное фоновое продление сессии (Session Keeper) | Accepted | Скрытый iframe + data/rules.json (DNR) вместо fetch и редиректа |
| [ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md) | Передача данных через &lt;meta&gt;-теги (DOM Data Bridge) | Accepted | Синхронный мост Base64 вместо асинхронного postMessage |
| [ADR-003](adr/ADR-003-rejection-of-credential-storage.md) | Отказ от хранения учетных данных Active Directory | Superseded | Заменен на ADR-005 (переход к безопасному локальному Opt-In хранению) |
| [ADR-004](adr/ADR-004-remote-survey-and-telemetry.md) | Удаленное управление опросами и бессерверная телеметрия | Accepted | GitHub Raw (Remote Config) + Google Apps Script Webhook (no-cors) |
| [ADR-005](adr/ADR-005-opt-in-sso-autologin.md) | Опциональный автовход на сервере авторизации (Сессия 24ч+) | Accepted | AES-GCM 256-bit + chrome.storage.local + Single-Attempt Circuit Breaker |

---

## 2. Архитектура подсистем

### Карта монолита src/injected.js

Поскольку основная бизнес-логика расширения сосредоточена в `src/injected.js` (Main World), данная таблица служит навигатором по подсистемам, ключевым точкам входа и объектам взаимодействия с DOM и браузерными API:

| Подсистема | Ключевые функции в `src/injected.js` | Какие DOM-селекторы и API трогает |
|---|---|---|
| **Логирование и отладка** | `logger`, `isDebug()`, `window.MSE_enableDebug()`, `window.MSE_status()` | `localStorage` (`mse_debug`), `window.__MSE_DEBUG__`, `console.log/warn/error` |
| **Session Keeper** | `monitorSessionHealth()`, `triggerSilentRefresh()`, `handleAuthStorageSync()`, `saveAuthTokensBackup()` | `iframe#mse-silent-refresher`, `sessionStorage` (9 ключей авторизации), `localStorage` (`mse_auth_backup`), Web Locks API (`navigator.locks`, `mse_silent_refresh_lock`), события `storage`, `visibilitychange`, `click`, `#mse-toast-container` |
| **Сетевой перехват** | `interceptNetworkRequests()`, `processPersonSearchResponse()` | Перехват `window.fetch` (`/api/people/persons/search`, `/module-elements/`, `/academic-period-results-table/primary`), перехват `XMLHttpRequest.prototype.open`/`send` (`/api/people/persons/search`, `/academic-period-results-table/primary`) |
| **Базы данных и DOM-мост** | `initDatabases()`, `loadBuildingsDatabase()`, `loadTeacherReviewsDatabase()`, `loadSurveyConfig()` | `meta[name="modeus-buildings-map"]`, `meta[name="modeus-teacher-reviews"]`, `meta[name="modeus-survey-config"]`, `meta[name="modeus-enhancer-version"]`, `databaseState` |
| **Меню друзей** | `renderFriendsMenu()`, `addFriend()`, `removeFriend()`, `getFriends()` | `localStorage` (`mse_friends_list`, `mse_my_person_id`), `modeus-main-menu p-panelmenu > .p-panelmenu.p-component`, `#mse-friends-menu`, `#mse-return-to-me-menu`, `.mse-remove-friend-btn`, `.p-multiselect-items li.p-multiselect-item` |
| **Корпуса и отзывы** | `enhanceBuildingNames()`, `enhanceLists()`, `enhancePopovers()`, `renderFooterFeedback()` | `.fc-time small.text-muted`, `ngb-popover-window`, `.location-info__header-text`, `.teachers-list li > div:not(.title) div`, `#teacher-tooltip`, `modeus-aside-panel`, `#mse-feedback-footer` |
| **Календарь и поиск студентов** | `setupUI()`, `loadAllData()`, `runWithConcurrency()`, `highlightEventsForStudents()` | `.main-calendar-form`, `#enhancer-search-container`, `#student-search-input`, `#search-suggestions`, `#selected-students-dropdown-wrapper`, `#selected-students-container`, `#selected-students-toggle`, `#refresh-data-btn`, `#search-clear-btn`, `.fc-time-grid-event`, in-memory кэш `attendeesMemoryCache` |
| **Модуль успеваемости** | `processPrimaryGradesData()`, `enhanceGradesTable()`, `injectIndividualGradeBadges()` | `table thead th`, `.p-datatable-thead th`, `table tbody tr`, `.p-datatable-tbody > tr`, `.lesson-realization`, `.mse-max-done`, `.mse-grade-badge`, API `/courses/.../lessons-technology` |
| **Проверка обновлений** | `checkExtensionUpdate()`, `resolveLatestRelease()`, `renderUpdatePopup()`, `window.MSE_testUpdate()` | `GitHub Releases API`, `localStorage` (`mse_last_update_check`, `mse_latest_release`, `mse_dismissed_v{version}`), `#search-controls`, `#mse-update-badge`, `#mse-update-popup`, `#mse-update-btn`, `#mse-dismiss-btn` |
| **Опросы и трекер активности** | `startEngagementTracker()`, `recordActiveHeartbeat()`, `shouldShowSurvey()`, `renderSurveyPopup()` | `localStorage` (`mse_install_date`, `mse_today_active_seconds`, `mse_total_active_seconds`, `mse_qualified_days`, `mse_last_active_date`, `mse_survey_snooze_until`, `mse_survey_dismissed_{id}`, `mse_surveys_disabled_forever`), `#mse-survey-popup`, Google Apps Script Webhook |
| **Жизненный цикл и деактивация** | `processUrlChange()`, `debouncedMutationHandler()`, `stopAndCleanUp()` | `MutationObserver`, `history.pushState`, `popstate`, `body.mse-active`, `#enhancer-stop-button`, `.event-card-container__header`, `window.studentEnhancer` |

### 2.1. Session Keeper

> [!IMPORTANT]
> **Двухконтурная модель токенов в Modeus (`access_token` 60 мин vs `id_token` 24 часа)**
> 1. `access_token` (UUID, живет **60 минут**) — используется самим Angular-клиентом Modeus; его истечение приводит к ошибкам запросов хост-приложения и выбросу пользователя из интерфейса.
> 2. `id_token` (JWT, живет **24 часа**) — содержит клеймы студента (`person_id`, `exp`) и используется как `Bearer`-токен для прямых API-запросов расширения (календарь, физкультура, успеваемость) и как индикатор жизни суточной SSO-сессии.

Фоновое продление авторизационного токена Modeus (срок жизни — 60 минут) предотвращает внезапные выбросы на страницу входа с потерей несохраненных данных студента.

#### Базовый механизм жизненного цикла

1. **Холодный старт (`src/keeper-early.js`):** На этапе `document_start` скрипт проверяет наличие `sessionStorage.getItem('access_token')`. Если токен пуст, из резервной копии `localStorage.mse_auth_backup` считывается суточный ID-токен: если он еще валиден по метаданным JWT (`claims.exp * 1000`), все 9 ключей сессии восстанавливаются в `sessionStorage` строго до старта Angular-приложения. При обнаружении просроченного токена невалидный бэкап удаляется.
2. **Мониторинг каждые 20 с (`monitorSessionHealth`):** Фоновый таймер в `src/injected.js` регулярно опрашивает остаток времени жизни токена. При получении токена с малым остатком жизни запускается таймер точного ожидания до фактического истечения.
3. **Тихий рефреш за 60 с до истечения (`triggerSilentRefresh`):** Когда до истечения срока действия токена остается менее 60 секунд, создается скрытый элемент `iframe#mse-silent-refresher`, направленный на URL авторизации Modeus. После прохождения SSO-редиректов фрейм возвращается на `https://utmn.modeus.org/#access_token=...`. Родительское окно опрашивает хэш с интервалом 50 мс по правилу Same-Origin, парсит свежие токены (`access_token`, `id_token`, `expires_in`, `session_state`), обновляет `sessionStorage` и перезаписывает бэкап `saveAuthTokensBackup()` ([ADR-001](adr/ADR-001-silent-session-refresh.md)).
4. **Изоляция сетевых правил (`data/rules.json`):** Прямой `fetch` к SSO блокируется CORS и SameSite-куками ADFS. Поэтому для тихого фрейма задействован DeclarativeNetRequest, снимающий заголовки `Content-Security-Policy` и `X-Frame-Options` строго для типа ресурса `sub_frame` на доменах авторизации (`fs.utmn.ru`, `auth.modeus.org`), что полностью исключает влияние на основной контекст страницы (`main_frame`) и обеспечивает безопасность пользовательских данных ([ADR-005](adr/ADR-005-opt-in-sso-autologin.md)).

#### Защита от сбоев и граничных сценариев

| Сценарий | Механизм защиты в коде |
|---|---|
| **Гонка нескольких вкладок** *(Multi-tab Race Condition)* | **Координация лидерства через Web Locks API:** `triggerSilentRefresh()` запрашивает блокировку `navigator.locks.request('mse_silent_refresh_lock', { ifAvailable: true })`. Только одна вкладка-лидер запускает рефреш и создает iframe; фоновые вкладки пропускают шаг. После обновления токенов вкладка-лидер сохраняет бэкап в `localStorage`, что вызывает событие `window.onstorage` (`handleAuthStorageSync`): остальные открытые вкладки синхронно переносят 9 ключей в свой `sessionStorage`, сбрасывают `refreshFailureCount = 0` и останавливают локальный процесс рефреша. |
| **Спящий режим ПК / заморозка вкладки** *(Sleep Resilience)* | При пробуждении ПК или разморозке вкладки (`timeSinceLastCheck > 45` с, слушатель `visibilitychange`) выполняется принудительный сброс зависших состояний и удаление элементов `#mse-silent-refresher`. Сторожевой таймаут зависания (`SESSION_STUCK_TIMEOUT_MS = 25000` мс) гарантированно вызывает `cleanupSilentRefresh()`, предотвращая блокировку последующих проверок («iframe уже запущен»). |
| **Отказ сервера SSO** *(Circuit Breaker)* | При 5 последовательных неудачных попытках тихого рефреша (`SESSION_MAX_REFRESH_ATTEMPTS = 5`) фоновые сетевые запросы прекращаются, исключая лавинообразный спам 302-редиректами в Network DevTools. Невалидный бэкап удаляется из `localStorage`, а пользователю выводится toast-уведомление о необходимости повторного входа. |
| **Истечение суточного JWT / Сессия 24ч+** | Срок действия сессии определяется по клейму `claims.exp * 1000` в `getMainTokenExpiresAt()`. При отключенном автовходе по истечении 24 часов сессия завершается. При активном автовходе ([ADR-005](adr/ADR-005-opt-in-sso-autologin.md), `<meta name="modeus-sso-autologin" content="1">`) функция `monitorSessionHealth()` не останавливает работу, а запускает `triggerSilentRefresh()`: скрытый iframe переходит на `fs.utmn.ru`, где `src/sso-autologin.js` автоматически авторизуется и обновляет токены на следующие 24 часа. |
| **Смена пароля / Ошибка входа ADFS** *(Single-Attempt Circuit Breaker)* | Контент-скрипт `src/sso-autologin.js` проверяет наличие текста в `#errorText` и сессионный флаг `sessionStorage.mse_sso_tried`. При первой же ошибке входа хранилище `mse_sso_vault` немедленно удаляется из `chrome.storage.local`, а повторные попытки прекращаются, защищая корпоративную учетную запись от блокировки в Active Directory. |

### 2.2. Расписание и поиск общих пар

* **Инициализация интерфейса и жизненный цикл:** Точка входа `setupUI()` монтирует элементы поиска и управления в `.main-calendar-form`, запускает сбор данных расписания `loadAllData()` и регистрирует `MutationObserver` для отслеживания навигации по неделям.
* **Определение активного контекста расписания:** Функция `getActiveCalendarPersonId()` декодирует текущий JWT и проверяет URL на наличие параметра `eventsFilter`. Если пользователь просматривает расписание другого человека, запросы отправляются с идентификатором этого студента, исключая загрязнение кэша и ложную подсветку чужих занятий.
* **Сбор данных недели и контроль параллелизма:**
  * Из заголовков FullCalendar (`.fc-day-header`) извлекается видимый диапазон дат, после чего отправляется запрос `POST /schedule-calendar-v2/api/calendar/events/search` с заголовком `Authorization: Bearer <id_token>`.
  * **Ограничитель параллелизма (`runWithConcurrency(taskFns, limit = 5)`):** Запросы участников занятий (`GET /.../attendees`) выполняются пулом воркеров с лимитом не более 5 одновременных соединений (`CALENDAR_ATTENDEES_CONCURRENCY`), предотвращая HTTP 429 (Too Many Requests).
  * **Легковесный in-memory кэш (`attendeesMemoryCache`):** Успешные ответы сохраняются в структуре `Map<eventId, attendeesData>`. При сетевых сбоях и статусах `!res.ok` функция `fetchEventAttendees()` возвращает `null`, исключая кэширование пустых списков, а вызывающий код безопасно использует fallback `[]`.
  * **Инвалидация кэша:** Кэш очищается (`attendeesMemoryCache.clear()`) при смене просматриваемого профиля (`activePersonId`), явном нажатии кнопки обновления данных (`#refresh-data-btn`) и вызове процедуры `stopAndCleanUp()`.
  * **Сводка в логгере:** В канал `[MSE Calendar]` выводится сводка распределения загрузки: количество событий из кэша, количество загруженных по сети и общее число уникальных студентов.
* **Сетевой перехват поиска студентов:** Запросы поиска пользователей перехватываются на эндпоинте `POST /api/people/persons/search` через переопределенный `window.fetch` (и `XMLHttpRequest.prototype.send`), пополняя память автодополнения и списки групп (`eventCache`, `uniqueStudents`).
* **Связывание с DOM и подсветка:**
  * Процедура `linkDomEventsToCache()` сопоставляет карточки `.fc-time-grid-event` с объектами кэша по времени начала и названию пары, размечая элементы атрибутом `data-event-id`.
  * Функция `highlightEventsForStudents()` выделяет карточки общих занятий яркой рамкой с выводом имен пересекающихся студентов, а несовпадающие пары затемняются (`.search-fade`).
  * В карточках состава пар студенты маркируются бейджами: `❤️` — из списка друзей (`mse_friends_list`), `🎓` — совпадение направления и профиля подготовки.

### 2.3. Модуль успеваемости

* **Сетевой перехват оценок:** Перехватчик на уровне `XMLHttpRequest.prototype.send` и `window.fetch` отслеживает завершение запроса `POST /students-app/api/pages/student-card/my/academic-period-results-table/primary` (транспорт `HttpClient` в Angular). Из ответа извлекаются дисциплины, семестры и порядок занятий (`orderIndex`).
* **Сессионное кэширование успеваемости:** Распарсенная таблица дисциплин сохраняется в `sessionStorage` (`mse_grades_primary_cache`) и лениво восстанавливается при переходе на страницу успеваемости без повторных сетевых запросов.
* **Загрузка технологических карт:** Для каждой дисциплины отправляется фоновый запрос `GET /courses/api/course-units/{id}/lessons-technology`, формирующий карту максимальных баллов по контрольным точкам занятий.
* **Отображение баллов и агрегация:**
  * Функция `enhanceGradesTable()` сопоставляет названия дисциплин регистронезависимо (`toLowerCase()`) и находит колонки «Встреча N» с уроками из техкарты (с fallback на сопоставление по имени занятия).
  * При получении максимального балла оценка выделяется подчеркиванием без дополнительных дробей (`.mse-max-done`).
  * При частичном балле к значению добавляется знаменатель (`/${max}`).
  * При наличии 3 и более оценок за одно занятие баллы и максимумы суммируются в единую дробь через `injectIndividualGradeBadges()`, предотвращая деформацию ячеек таблицы.
* **Расчет потерь баллов:** По двойному клику на ячейку «Текущий итог» вычисляется сумма потерянных баллов по оцененным контрольным точкам (`потери = max - earned`). Значение отображается красным дефицитом (`-X.XX`) либо нулем (`0.00`). Повторный двойной клик возвращает стандартный балл.

### 2.4. Умный подбор физкультуры

* **Точка входа и окно выбора:** Наблюдатель мутаций DOM отслеживает появление интерфейса выбора траекторий (`/learning-path-selection/menus/`) и встраивает кнопку запуска умного подбора (`src/pe-module.js`, интерфейс `window.MSE_PE`).
* **Сетка занятости:** Загружается дерево кампании бронирования и расписание студента на 21 день вперед (`POST /calendar/events/search`). Расписание раскладывается по матрице из 7 стандартных пар для рабочих дней недели, блокируя занятые слоты.
* **Фильтрация и режим «Пойти с другом»:**
  * Доступна фильтрация по видам спорта, корпусам и наличию мест.
  * Поиск студента сначала проверяет локальный список друзей (`mse_friends_list`), а при отсутствии — отправляет запрос `POST /people/persons/search`.
  * Модуль загружает календарь друга на 3 недели вперед и выполняет попарное сравнение слотов: названия дисциплин сортируются по алфавиту для устранения влияния порядка ответов API, после чего маркируются пересекающиеся пары.
* **Запись и отмена секций:**
  * Бронирование и отписка производятся прямыми запросами `POST` и `DELETE` к Booking API (`/selected-teams`) с мгновенным локальным обновлением счетчиков мест в модальном окне без перезагрузки страницы.
  * **Подбор модуля для секции (`teamToModulesMap`):** При записи проверяется привязка выбранной команды (`teamId`) к модулям кампании (`module-elements`). Запрос направляется строго в тот модуль, которому принадлежит команда и в котором еще не занят слот, исключая ошибку 400 («Выбранные команды не соответствуют модулю»).
  * **Логирование `[MSE PE]`:** Все сетевые операции модуля логируются с деталями запроса (URL, `moduleId`, `teamId`, тело) и выводом ответа бэкенда в `console.error` при возникновении не-2xx статусов.

### 2.5. Корпуса и отзывы

* **Обогащение названий корпусов (`enhanceBuildingNames`):** По регулярному выражению находит обозначения корпусов («Корпус-X», «УЛК-Y») и заменяет их на адреса и общепринятые названия из базы `buildings.json`. Обработка выполняется в 4 сценариях:
  1. В сетке FullCalendar (`.fc-time small.text-muted`).
  2. В списках аудиторий (`enhanceLists()`, `.location-info__header-text`).
  3. Во всплывающих окнах-поповерах (`enhancePopovers()`, `ngb-popover-window`).
  4. В детальной карточке события боковой панели.
  Для каждого распознанного корпуса формируется тултип и ссылка на 2ГИС.
* **Отзывы о преподавателях:** Обработчики `enhancePopovers()` и боковой панели (`.teachers-list li`) при наведении курсора отображают плавающий тултип `#teacher-tooltip` с ролью преподавателя (лектор/семинарист) и отзывами из базы `teacher_reviews.json`.
* **Подвал боковой панели:** Функция `renderFooterFeedback()` монтирует блок `#mse-feedback-footer` с контактами поддержки и кнопкой аварийной остановки (`#enhancer-stop-button`).
* **Аварийная остановка («Стоп-скрипт»):**
  * При нажатии кнопки `#enhancer-stop-button` (или вызове `stopAndCleanUp()`) отключается `MutationObserver`, восстанавливаются оригинальные методы `window.fetch`, `XMLHttpRequest.prototype.send` и `history.pushState`, удаляются слушатели событий (`storage`, `popstate`), удаляются все внедренные DOM-элементы, с `document.body` снимается CSS-класс `mse-active` и аннулируется глобальный объект `window.studentEnhancer`.

### 2.6. Система логирования и режим отладки (Debug Mode)

* **Централизованный логгер (`logger`):**
  * Все служебные вызовы обернуты в объект `logger` (в глобальной области: `window.MSE_logger`).
  * Для обхода фильтра **Verbose** в Chrome DevTools информационные и отладочные сообщения направляются через `console.log` со стилизованными цветовыми префиксами.
  * **Таймштампы (ЧЧ:ММ:СС.ммм):** Сообщения снабжаются системной меткой времени с точностью до миллисекунд (например, `[14:05:23.456]`).
  * **Точность времени токенов:** Остаток жизни токенов выводится с 3 знаками после запятой (например, `3541.234 сек.`), а при истечении фиксируется интервал просрочки: `просрочен на X.XXX сек. (Y мс)`.
  * Реализовано четыре общих уровня (`debug`, `info`, `warn`, `error`) и семь контекстных каналов:
    * `[MSE Session]`: время жизни access-токена и суточного токена, создание скрытого iframe, статус ответа и новый срок действия токена.
    * `[MSE Network]`: события перехвата сетевых данных (поиск персон: найдено N чел; таблица `/primary`: N предметов; секции физкультуры).
    * `[MSE Calendar]`: этапы загрузки `loadAllData` (загружено N событий на неделю; получены участники; привязано N карточек к DOM).
    * `[MSE DB]`: статус загрузки баз корпусов и отзывов о преподавателях (запрос к GitHub, замер времени ответа, fallback на локальный пакет).
    * `[MSE Update]`: статус проверки обновлений (версия на GitHub, возраст кэша, сравнение SemVer, симуляция обновлений).
    * `[MSE Survey]`: метрики вовлеченности (`logger.survey`), суточный ролловер активности, проверка guard-условий показа и отправка телеметрии.
    * `[MSE PE]`: логирование запросов бронирования и отмены секций физкультуры, параметров модулей и ошибок бэкенда Booking API.
* **Переключение режима отладки без перезагрузки:**
  * Проверка активности режима выполняется динамически функцией `isDebug()`, опрашивающей флаг `mse_debug: "1"` в `localStorage` и свойство `window.__MSE_DEBUG__`. Это позволяет переключать детализацию логов на лету без перезагрузки страницы (F5) через консольные команды (см. справочную таблицу в [разделе 4](#4-быстрый-старт-для-разработчика-how-to-contribute--debug)).
* **Разделение DEV vs PROD:**
  * **PROD (по умолчанию):** При обычной загрузке страницы выводится только стартовый баннер расширения.
  * **WARN / ERROR:** Предупреждения и критические ошибки выводятся **всегда**, обеспечивая диагностику сбоев у пользователей.

### 2.7. Подсистема интерактивных опросов и аналитики

* **Назначение:** Сбор пользовательских предпочтений и приоритизация продуктовых функций среди активных студентов без перехода на внешние сервисы.
* **Архитектурный мост и кэширование (Dev vs Prod):** В продакшене опрос загружается с GitHub Raw (`data/survey.json`) с кэшированием в `localStorage.mse_survey_cache` (TTL 12 ч), а в dev-режиме (`mse_debug: "1"`) читается локальный черновик. Конфигурация сериализуется в Base64 и монтируется скриптом `src/content.js` в синхронный метатег `<meta name="modeus-survey-config">` ([ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md)), откуда считывается функцией `loadSurveyConfig()`.
* **Трекер продуктовой активности:** Ежесекундный heartbeat (`recordActiveHeartbeat()`) учитывает чистое время взаимодействия при активной вкладке. При наступлении новых суток преодоление суточного порога `minDailySecondsToQualify` фиксирует дату в массиве `mse_qualified_days`.
* **Условия показа опроса (`shouldShowSurvey`):**
  Показ опроса инициируется только при одновременном выполнении условий:
  1. Опрос включен автором (`config.enabled === true`).
  2. Опросы не отключены пользователем (`mse_surveys_disabled_forever !== '1'`).
  3. Опрос с данным ID еще не отклонялся и не завершался (`mse_survey_dismissed_{id} !== '1'`).
  4. Не активен таймер отсрочки (`Date.now() > mse_survey_snooze_until`).
  5. Выполнены критерии таргетинга: `daysSinceInstall >= minDaysSinceInstall`, `qualifiedDaysCount >= minQualifiedDays` и `totalActiveSeconds >= minTotalActiveSeconds`.
* **Спецификация параметров продуктового таргетинга (`targeting` в `data/survey.json`):**
  | Параметр | Тип | Единицы | Описание и продуктовый смысл |
  |---|---|---|---|
  | `minDaysSinceInstall` | `number` | календарные дни | **Стаж использования:** минимальное количество суток с даты первого запуска расширения (`mse_install_date`). Защищает нового пользователя от показа анкет в период первичного онбординга. |
  | `minQualifiedDays` | `number` | дни | **Регулярность визитов:** минимальное количество разных календарных дней, в каждый из которых студент набрал активность >= `minDailySecondsToQualify` (`mse_qualified_days`). Отсекает разовые открытия. |
  | `minDailySecondsToQualify` | `number` | секунды | **Суточный порог квалификации:** чистое время активного взаимодействия за день (например, 60 с или 120 с), необходимое для зачета суток как квалифицированного дня. |
  | `minTotalActiveSeconds` | `number` | секунды | **Суммарный хронометраж:** совокупное чистое время активной работы с расширением за всё время (`mse_total_active_seconds`, например 300 с = 5 минут). |
* **Пользовательский интерфейс опроса (`#mse-survey-popup`):** Модальное окно монтируется в `document.body` и последовательно проводит пользователя через экраны приглашения (`invite`), вопросов (`single`/`multiple` с опциональным текстовым инпутом «Свой вариант») и завершения либо отказа. Все тексты и ответы экранируются перед рендерингом, а переход к следующему шагу валидируется обязательным выбором варианта.
* **Анонимная телеметрия (`sendSurveyMetric`):** Результаты и события взаимодействия передаются методом POST на внешний вебхук Google Apps Script в режиме `mode: 'no-cors'` с типом `'Content-Type': 'text/plain'`, что исключает блокировку браузером при HTTP 302 переадресации ([ADR-004](adr/ADR-004-remote-survey-and-telemetry.md)). Управление опросами из консоли осуществляется командами `window.MSE_*` (см. [раздел 4](#4-быстрый-старт-для-разработчика-how-to-contribute--debug)).

### 2.8. Подсистема проверки обновлений ([MSE Update])

Оповещает пользователей о выходе новых версий расширения со ссылкой на релиз GitHub без постоянного фонового service worker:

1. **Механика и 2-часовой кэш:** Функция `resolveLatestRelease()` запрашивает GitHub Releases API (`GET /repos/student1245/Modeus-Student-Enhancer/releases/latest`). Результаты кэшируются в `localStorage` на 2 часа (`mse_last_update_check`, `mse_latest_release`), предотвращая превышение лимитов GitHub API. При клике «Позже» выставляется флаг скрытия `mse_dismissed_v{version}`.
2. **Отрисовка UI при новой версии SemVer:** Номер релиза сопоставляется с текущей версией (`CURRENT_VERSION` из `<meta name="modeus-enhancer-version">`) через `compareSemVer()`. Если релиз новее, монтируются кликабельный бейдж `renderUpdateBadge()` в панели `#search-controls` и модальное окно `renderUpdatePopup()` с описанием изменений и ссылкой на GitHub.
3. **Точка входа `checkExtensionUpdate()`:** Первичная фоновая проверка запускается через 1.5 секунды после загрузки страницы, далее опрос повторяется каждые 2 часа через таймер `setInterval()`. Логирование ведется в канал `[MSE Update]`, а ручное тестирование выполняется командами `window.MSE_*` (см. [раздел 4](#4-быстрый-старт-для-разработчика-how-to-contribute--debug)).

---

## 3. Справочник API и хранилищ

### 3.1. Эндпоинты платформы Modeus

#### Поиск событий расписания
* **URL:** `POST https://utmn.modeus.org/schedule-calendar-v2/api/calendar/events/search?tz=Asia/Tyumen`
* **Заголовки:** `Authorization: Bearer <id_token>`, `Content-Type: application/json`
* **Тело запроса:**
  ```json
  {
    "size": 500,
    "timeMin": "2026-10-05T00:00:00Z",
    "timeMax": "2026-10-11T23:59:59Z",
    "attendeePersonId": [
      "b8c3d9a1-42e1-4b10-9f5b-18a7c2d89001"
    ]
  }
  ```
* **Ответ сервера (сокращенный):**
  ```json
  {
    "_embedded": {
      "events": [
        {
          "id": "e817a3a2-7201-419b-b620-332e185c7d01",
          "name": "Практическое занятие",
          "startsAtLocal": "2026-10-06T10:15:00",
          "endsAtLocal": "2026-10-06T11:45:00",
          "_links": {
            "course-unit-realization": {
              "href": "https://utmn.modeus.org/schedule-calendar-v2/api/course-unit-realizations/c1b2a3d4-0000-1111-2222-333344445555"
            }
          }
        }
      ],
      "course-unit-realizations": [
        {
          "id": "c1b2a3d4-0000-1111-2222-333344445555",
          "nameShort": "Архитектура ИС"
        }
      ]
    }
  }
  ```

#### Технологическая карта дисциплины
* **URL:** `GET https://utmn.modeus.org/courses/api/course-units/{courseUnitId}/lessons-technology`
* **Заголовки:** `Authorization: Bearer <id_token>`
* **Ответ сервера (сокращенный):**
  ```json
  {
    "lessonTechnologies": [
      {
        "lessonId": "7f8b9c0d-1111-2222-3333-444455556666",
        "lessonName": "Лабораторная работа 1",
        "controlObjects": [
          { "index": 0, "name": "Защита отчета", "maxValue": 10.0 }
        ]
      }
    ]
  }
  ```

#### Вспомогательные сервисные эндпоинты
* **Участники календарного события:**
  `GET /schedule-calendar-v2/api/calendar/events/{eventId}/attendees` — возвращает список участников пары, роли (`STUDENT`, `TEACHER`), направления подготовки (`specialtyName`) и профили (`specialtyProfile`).
* **Поиск персон по имени:**
  `POST /schedule-calendar-v2/api/people/persons/search` — тело запроса `{"fullName": "Иванов", "sort": "+fullName", "size": 10, "page": 0}`.
* **Таблица результатов успеваемости:**
  `POST /students-app/api/pages/student-card/my/academic-period-results-table/primary` — возвращает семестры, дисциплины и структуру уроков для табеля успеваемости.
* **Меню кампании студента (модули выбора):**
  `GET /course-unit-booking/api/v1/students/{studentId}/campaigns/{campaignId}/student-campaign-menu` — возвращает список элементов модулей (`moduleElements: [{id, name}]`) кампании.
* **Элемент модуля кампании (список циклов и команд):**
  `GET /course-unit-booking/api/v1/students/{studentId}/campaigns/{campaignId}/student-campaign-menu/module-elements/{moduleId}` — возвращает циклы и секции (`cycles: [{teams: [...]}]`) и текущие записи (`selectedTeamIds`).
* **Бронирование и отмена секции физкультуры:**
  `POST|DELETE /course-unit-booking/api/v1/students/{studentId}/campaigns/{campaignId}/student-campaign-menu/module-elements/{moduleId}/selected-teams` — тело запроса `["<teamId>"]`. Заголовки: `Authorization: Bearer <id_token>`, `Content-Type: application/json`.

### 3.2. Формат OAuth-хэша переадресации

Строка фрагмента URI (`location.hash`), возвращаемая сервером авторизации при успешном завершении Silent Token Refresh в скрытом iframe:

```text
#access_token=a7aa4e14-b5bd-39bb-b2d6-cf66e9d79243&id_token=eyJ...&token_type=Bearer&expires_in=3600&session_state=6f2a...&state=k9f8...
```

| Параметр | Тип | Описание |
|---|---|---|
| `access_token` | String (UUID/GUID) | Bearer-токен авторизации запросов к сервисам Modeus |
| `id_token` | String (JWT) | OpenID Connect токен пользователя (`person_id`, email, роли) |
| `token_type` | String | Тип токена (всегда `Bearer`) |
| `expires_in` | Number / String | Время жизни токена в секундах (обычно `3600`) |
| `session_state` | String (Hash) | Идентификатор сессии SSO поставщика удостоверений |
| `state` | String | Случайная строка защиты от CSRF |

### 3.3. Таблица локальных хранилищ

#### 3.3.1. Нативные ключи сессии Modeus (sessionStorage)

Ключи создаются и обновляются нативным Angular-клиентом Modeus и сервером аутентификации. Расширение читает их для мониторинга сессии и авторизации прямых API-запросов, а также обновляет при получении хэша из скрытого фрейма.

| Хранилище | Ключ | Тип данных | Назначение и жизненный цикл |
|---|---|---|---|
| `sessionStorage` | `access_token` | `string` | Актуальный OAuth access-токен текущей сессии для запросов Angular. |
| `sessionStorage` | `access_token_stored_at` | `string` (timestamp) | Время сохранения access-токена в миллисекундах. |
| `sessionStorage` | `expires_at` | `string` (timestamp) | Время истечения срока действия access-токена. Служит триггером для тихого рефреша. |
| `sessionStorage` | `id_token` | `string` | JWT с профилем студента. Используется расширением в заголовках `Authorization: Bearer`. |
| `sessionStorage` | `id_token_claims_obj` | `string` (JSON) | Распарсенные клеймы ID-токена (ФИО, email, personId, роли). |
| `sessionStorage` | `id_token_expires_at` | `string` (timestamp) | Время истечения суточного срока действия ID-токена. |
| `sessionStorage` | `id_token_stored_at` | `string` (timestamp) | Время сохранения ID-токена в миллисекундах. |
| `sessionStorage` | `nonce` | `string` | Случайное проверочное значение OpenID Connect. |
| `sessionStorage` | `session_state` | `string` | Идентификатор сессии SSO сервера авторизации. |

#### 3.3.2. Собственные ключи расширения (localStorage / sessionStorage / chrome.storage)

Ключи создаются исключительно кодом расширения для сохранения настроек, резервного копирования авторизации, кэширования справочников и аналитики продуктовой активности.

| Хранилище | Ключ | Тип данных | Назначение и жизненный цикл |
|---|---|---|---|
| `chrome.storage.sync` | `enabled` | `boolean` | Глобальный переключатель работы расширения из popup-меню (`true`/`false`). Синхронизируется между браузерами пользователя. |
| `chrome.storage.local` | `mse_sso_vault` | `object` (JSON) | Зашифрованные учетные данные корпоративного входа (`{ ciphertextBase64, ivBase64, keyJwk, updatedAt }`) для опционального автовхода 24ч+ ([ADR-005](adr/ADR-005-opt-in-sso-autologin.md)). Защищены от Main World. |
| `chrome.storage.local` | `mse_manual_logout_until` | `number` (timestamp) | Метка времени, до которой приостановлен автовход на `fs.utmn.ru` (10 минут паузы после явного логаута в Modeus). |
| `sessionStorage` | `mse_sso_tried` | `string` (`"1"`) | Сессионный флаг выполнения автоматической попытки входа на `fs.utmn.ru` для работы Single-Attempt Circuit Breaker. |
| `localStorage` | `mse_auth_backup` | `string` (JSON) | Резервная копия 9 ключей авторизации для восстановления сессии скриптом `src/keeper-early.js` при холодном старте. Удаляется при логауте. |
| `localStorage` | `mse_debug` | `string` (`"1"`) | Флаг включения подробного режима логирования в консоль браузера (Debug Mode). |
| `localStorage` | `mse_friends_list` | `string` (JSON) | Список сохраненных друзей `[{"id": "...", "fullName": "..."}]`. |
| `localStorage` | `mse_my_specialty` | `string` | Кэшированное название направления подготовки пользователя. |
| `localStorage` | `mse_my_profile` | `string` | Кэшированное название профиля подготовки пользователя. |
| `localStorage` | `mse_my_person_id` | `string` | Идентификатор персоны владельца сессии для возврата к своему расписанию. |
| `localStorage` | `mse_last_update_check` | `string` (timestamp) | Метка времени последней проверки релиза на GitHub API (кэш на 2 часа). |
| `localStorage` | `mse_latest_release` | `string` (JSON) | Кэш ответа GitHub Releases API (`/releases/latest`). |
| `localStorage` | `mse_dismissed_v{version}` | `string` (`"1"`) | Флаг скрытия уведомления об обновлении для конкретной версии расширения. |
| `localStorage` | `mse_install_date` | `string` (`YYYY-MM-DD`) | Дата первого запуска расширения пользователем. |
| `localStorage` | `mse_today_active_seconds` | `string` (number) | Накопленные секунды чистого взаимодействия за текущий календарный день. |
| `localStorage` | `mse_total_active_seconds` | `string` (number) | Суммарное накопленное чистое время активности за все время использования. |
| `localStorage` | `mse_qualified_days` | `string` (JSON array) | Массив дат (`YYYY-MM-DD`), в которые пользователь преодолел суточный порог активности. |
| `localStorage` | `mse_last_active_date` | `string` (`YYYY-MM-DD`) | Дата последней зафиксированной активности для вычисления суточного ролловера. |
| `localStorage` | `mse_buildings_cache` | `string` (JSON) | Кэш справочника корпусов `buildings.json` с меткой времени (TTL 24 часа) для мгновенного монтажа без задержки инъекции скриптов. |
| `localStorage` | `mse_reviews_cache` | `string` (JSON) | Кэш справочника отзывов `teacher_reviews.json` с меткой времени (TTL 24 часа) для мгновенного монтажа без задержки инъекции скриптов. |
| `sessionStorage` | `mse_grades_primary_cache` | `string` (JSON) | Кэш структуры дисциплин и занятий (`/academic-period-results-table/primary`) для мгновенного восстановления максимальных баллов при переходах по SPA и обновлениях страницы. |
| `localStorage` | `mse_survey_cache` | `string` (JSON) | Записывается и читается скриптом `src/content.js` (Isolated World) в общем `localStorage` с меткой времени (TTL 12 часов). |
| `localStorage` | `mse_survey_snooze_until` | `string` (timestamp) | Метка времени, до которой отложен показ опроса (при выборе действия «Позже», 3 дня). |
| `localStorage` | `mse_survey_dismissed_{id}` | `string` (`"1"`) | Флаг отклонения или завершения конкретного опроса с идентификатором `{id}`. |
| `localStorage` | `mse_surveys_disabled_forever` | `string` (`"1"`) | Флаг перманентного отключения подсистемы опросов пользователем («Больше никогда не показывать»). |

### 3.4. Внешний вебхук опросов и аналитики (Google Apps Script)

* **URL вебхука:** `https://script.google.com/macros/s/AKfycbwUgqAKHztog8GakSgnepiYVcLGc5MkmX1OuHxlC4YtI79iMZiNvwRH9MKaRRvRNntBMg/exec` (по умолчанию; переопределяется через поле `webhookUrl` в `data/survey.json`).
* **Метод:** `POST`
* **Сетевой режим (Main World):** `mode: 'no-cors'`, `headers: { 'Content-Type': 'text/plain' }`
  > [!NOTE]
  > Использование `mode: 'no-cors'` и `text/plain` гарантирует отправку запроса без предварительного CORS preflight (OPTIONS) и исключает ошибку сетевой блокировки браузером при HTTP 302 переадресации Google Apps Script ([ADR-004](adr/ADR-004-remote-survey-and-telemetry.md)).
* **Пример JSON полезной нагрузки (Payload):**
  ```json
  {
    "timestamp": "2026-10-13T19:30:00.000Z",
    "surveyId": "survey_2026_q4_features",
    "version": "2.2.3",
    "action": "completed",
    "answers": {
      "favorite_feature": "Анти-вылет сессии 24ч",
      "desired_feature": [
        "Тёмная тема (Dark Mode)",
        "Свой вариант: Автоматический экспорт расписания в iCal"
      ]
    }
  }
  ```
* **Допустимые значения `action`:**
  * `"completed"` — опрос успешно пройден (передается объект `answers`).
  * `"declined"` — пользователь отказался от прохождения текущего опроса («Не этот опрос»).
  * `"disabled_forever"` — пользователь перманентно отключил опросы («Никогда не спрашивать»).

---

## 4. Быстрый старт для разработчика (How to Contribute & Debug)

1. **Запуск и тестирование в браузере:**
   * Откройте страницу управления расширениями: `chrome://extensions`.
   * Включите переключатель **«Режим разработчика»** (Developer mode) в правом верхнем углу.
   * Нажмите кнопку **«Загрузить распакованное»** (Load unpacked) и выберите папку проекта `modeus-beta`.
   * Перейдите на страницу расписания университета: `https://utmn.modeus.org/`.

2. **Справочная таблица консольных команд (`window.MSE_*`):**
   Все управляющие методы и команды тестирования доступны в глобальной области видимости DevTools (F12 → Console) без необходимости перезагрузки страницы:

   | Команда | Назначение |
   |---|---|
   | `window.MSE_enableDebug()` | Мгновенно включает подробный режим отладки по 7 каналам без перезагрузки (сохраняет `mse_debug: "1"` в `localStorage`) и выводит сводный статус |
   | `window.MSE_disableDebug()` | Отключает подробный вывод в рантайме и удаляет флаг `mse_debug` из `localStorage` |
   | `window.MSE_status()` | Выводит в консоль сводку по сессии и токенам, состоянию баз данных и проверке обновлений |
   | `window.MSE_checkUpdates(force = true)` | Принудительно запрашивает свежий релиз с GitHub Releases API в обход 2-часового кэша |
   | `window.MSE_testUpdate(mockVersion = '9.9.9')` | Симулирует появление новой версии, отрисовывая бейдж в `#search-controls` и модальное окно (алиас: `MSE_simulateUpdate`) |
   | `window.MSE_checkSurvey()` | Проверяет выполнение guard-условий продуктового таргетинга и запускает опрос при их удовлетворении |
   | `window.MSE_simulateSurvey(customConfig)` | Симулирует показ опроса из `data/survey.json` (или переданного объекта) в обход условий показа |
   | `window.MSE_getEngagementStats()` | Возвращает объект метрик активности (стаж в днях, секунды за сегодня/всего, квалифицированные дни) |
   | `window.MSE_getSurveyConfig()` | Возвращает активный объект конфигурации опроса |
   | `window.MSE_setSurveyConfig(config)` | Динамически подменяет конфигурацию опроса в рантайме |
   | `window.MSE_clearSurveyCache()` | Сбрасывает кэш опроса и флаги скрытия/отказа в `localStorage` |
   | `window.MSE_showToast(text, type, duration)` | Отображает тестовое всплывающее уведомление (toast) |

3. **Правило чистой деактивации (`stopAndCleanUp`):**
   * При реализации любых новых функций, добавляющих DOM-элементы, таймеры, наблюдатели (`MutationObserver`) или патчирующих нативные прототипы браузера, разработчик **обязан** зарегистрировать их удаление и сброс в процедуре `stopAndCleanUp()`. Это гарантирует корректную работу кнопки экстренной остановки «Стоп-скрипт» (`#enhancer-stop-button` / `window.studentEnhancer.stop()`).
