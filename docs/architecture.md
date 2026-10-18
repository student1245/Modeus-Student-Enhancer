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
     * [3.3.2. Собственные ключи расширения (localStorage / chrome.storage)](#332-собственные-ключи-расширения-localstorage--chromestorage)
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
│ • chrome.storage.sync             │ • Доступ к window.MSE_PE           │
│ • data/rules.json (DNR сети)      │ • Перехват window.fetch            │
│ • src/content.js                  │ • Перехват XMLHttpRequest.send     │
│ • src/keeper-early.js             │ • Чтение/запись sessionStorage     │
│ • Изолирован от window-переменных │ • Патчинг history.pushState        │
│   страницы (хранилища             │ • Прямой доступ к контексту Angular│
│   sessionStorage и localStorage   │                                    │
│   общие)                          │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```

1. **Isolated World (Изолированный мир):**
   * Выполняет `src/keeper-early.js` и `src/content.js`.
   * Имеет доступ к `chrome.storage.sync`, `chrome.runtime.getURL` и декларативным сетевым правилам.
   * Изолирован от контекста `window` страницы и не может напрямую перехватывать вызовы `fetch` Angular-приложения, однако разделяет общее дисковое и сессионное хранилище источника (`localStorage` и `sessionStorage`).
2. **Main World (Главный мир страницы):**
   * Выполняет `src/injected.js` и `src/pe-module.js`, внедряемые в DOM через теги `<script>`.
   * Имеет прямой доступ к глобальному объекту `window`, прототипам `fetch` и `XMLHttpRequest`, а также к контексту рендеринга Angular.
   * Патчит `window.fetch` и `XMLHttpRequest.prototype.send` через функцию `interceptNetworkRequests()`:
     * **`window.fetch`** перехватывает нативные запросы поиска персон (`/api/people/persons/search` для сбора людей и автодополнения) и модулей физкультуры (`/module-elements/` в Booking API для логирования в `[MSE Network]`).
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
             ├── Параллельный Fetch (GitHub Raw, таймаут 2.5с)
             │   ├── buildings.json (Fallback: локальный файл)
             │   ├── teacher_reviews.json (Fallback: локальный файл)
             │   └── survey.json (Prod: кэш mse_survey_cache 12ч / GitHub; Dev: локальный черновик)
             ├── Кодирование данных в Base64
             ├── Вставка <meta name="modeus-buildings-map" content="...">
             ├── Вставка <meta name="modeus-teacher-reviews" content="...">
             ├── Вставка <meta name="modeus-survey-config" content="...">
             ├── Вставка <meta name="modeus-enhancer-version" content="...">
             ├── Инъекция <script src="src/pe-module.js" async="false">
             └── Инъекция <script src="src/injected.js" async="false">
                           │
                           ▼
              [ Main World: src/injected.js ]
             ├── Guard от повторного запуска (window.studentEnhancer)
             ├── Инициализация баз initDatabases() (декодирование <meta>-тегов и loadSurveyConfig())
             ├── Перехват сетевых запросов (fetch и XMLHttpRequest.prototype.send)
             ├── Инициализация Session Keeper (бэкап токенов + интервал 20с)
             ├── Патчинг history.pushState и слушатель popstate
             ├── Запуск фоновой проверки обновлений checkExtensionUpdate() (1.5с + интервал 2ч)
             ├── Запуск трекера активности startEngagementTracker() (heartbeat 1с)
             └── Точка входа:
                 checkReady (таймер готовности DOM) -> setupUI() -> loadAllData() -> запуск MutationObserver
```

Передача справочников корпусов, отзывов и конфигурации опросов из изолированного мира `src/content.js` в мир страницы `src/injected.js` выполняется через синхронный DOM-мост: данные сериализуются в Base64 и сохраняются в тегах `<meta>`. Скрипт `src/injected.js` считывает их из DOM при старте, декодирует через `TextDecoder` в `initDatabases()` / `loadSurveyConfig()` и восстанавливает в структуры памяти. Архитектурное обоснование выбора синхронного DOM-моста вместо асинхронных `postMessage` и `CustomEvent` зафиксировано в [ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md).

### 1.4. Реестр архитектурных решений (ADR)

Архитектурные решения (ADR) фиксируют ключевые необратимые развилки, защищая команду от повторных споров и ошибочного рефакторинга.

| ID | Название | Статус | Суть решения |
|---|---|---|---|
| [ADR-001](adr/ADR-001-silent-session-refresh.md) | Бесшовное фоновое продление сессии (Session Keeper) | Accepted | Скрытый iframe + data/rules.json (DNR) вместо fetch и редиректа |
| [ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md) | Передача данных через &lt;meta&gt;-теги (DOM Data Bridge) | Accepted | Синхронный мост Base64 вместо асинхронного postMessage |
| [ADR-003](adr/ADR-003-rejection-of-credential-storage.md) | Отказ от хранения учетных данных Active Directory | Accepted | Zero Password Knowledge: сессия ограничена 24 ч, делегирование браузеру и DPAPI |
| [ADR-004](adr/ADR-004-remote-survey-and-telemetry.md) | Удаленное управление опросами и бессерверная телеметрия | Accepted | GitHub Raw (Remote Config) + Google Apps Script Webhook (no-cors) |

---

## 2. Архитектура подсистем

### Карта монолита src/injected.js

Поскольку основная бизнес-логика расширения сосредоточена в `src/injected.js` (Main World), данная таблица служит навигатором по подсистемам, ключевым точкам входа и объектам взаимодействия с DOM и браузерными API:

| Подсистема | Ключевые функции в `src/injected.js` | Какие DOM-селекторы и API трогает |
|---|---|---|
| **Логирование и отладка** | `logger`, `isDebug()`, `window.MSE_enableDebug()`, `window.MSE_status()` | `localStorage` (`mse_debug`), `window.__MSE_DEBUG__`, `console.log/warn/error` |
| **Session Keeper** | `monitorSessionHealth()`, `triggerSilentRefresh()`, `handleAuthStorageSync()`, `saveAuthTokensBackup()` | `iframe#mse-silent-refresher`, `sessionStorage` (9 ключей авторизации), `localStorage` (`mse_auth_backup`), Web Locks API (`navigator.locks`, `mse_silent_refresh_lock`), события `storage`, `visibilitychange`, `click`, `#mse-toast-container` |
| **Сетевой перехват** | `interceptNetworkRequests()`, `processPersonSearchResponse()` | Перехват `window.fetch` (`/api/people/persons/search`, `/module-elements/`), перехват `XMLHttpRequest.prototype.open`/`send` (`/api/people/persons/search`, `/academic-period-results-table/primary`) |
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

* **Назначение:** Фоновое продление авторизационного токена Modeus (срок жизни токена — 60 минут) и устранение внезапных выбросов на страницу входа с потерей несохраненных данных.
* **Архитектурный контракт:** Реализован через скрытый `iframe` в связке с модификацией заголовков `sub_frame` через DeclarativeNetRequest (`data/rules.json`). Обычный `fetch` к SSO блокируется политикой CORS и SameSite-куками ADFS, поэтому используется скрытый iframe (подробнее в [ADR-001](adr/ADR-001-silent-session-refresh.md)). Отказ от хранения паролей Active Directory и сохранение принципа Zero Password Knowledge зафиксированы в [ADR-003](adr/ADR-003-rejection-of-credential-storage.md).
* **Изоляция сетевых правил (`data/rules.json`):** Снятие заголовков `Content-Security-Policy` и `X-Frame-Options` через DeclarativeNetRequest ограничено строго типом ресурса `sub_frame` (`"resourceTypes": ["sub_frame"]`) на доменах авторизации (`fs.utmn.ru`, `auth.modeus.org`) и никогда не затрагивает основной фрейм страницы (`main_frame`), обеспечивая строгую изоляцию контекста приложения. Ограничение по `initiatorDomains` намеренно не используется, так как в цепочке SSO (utmn.modeus.org ↔ auth.modeus.org ↔ fs.utmn.ru) при промежуточных редиректах инициатором запросов выступают разные домены авторизации.
* **Монитор сессии и тихий рефреш:**
  * Фоновый таймер `monitorSessionHealth()` запускается каждые 20 секунд.
  * Если до истечения срока действия токена остается менее 60 секунд, вызывается процедура тихого обновления `triggerSilentRefresh()`.
  * Создается скрытый элемент `iframe#mse-silent-refresher`, направленный на авторизационный URL Modeus.
  * После прохождения цепочки редиректов SSO фрейм возвращается на URL `https://utmn.modeus.org/#access_token=...`. Родительское окно опрашивает хэш фрейма с интервалом 50 мс по правилу Same-Origin, парсит свежие параметры (`access_token`, `id_token`, `expires_in`, `session_state`) и обновляет `sessionStorage`.
  * При получении токена с малым остатком жизни запускается таймер точного ожидания до его фактического истечения.
* **Межвкладочная координация и защита от гонок (Multi-tab Race Condition Resilience):**
  * **Координация лидерства через Web Locks API:** Запуск тихого рефреша в `triggerSilentRefresh()` обернут в нативный механизм неблокирующего захвата блокировки `navigator.locks.request('mse_silent_refresh_lock', { ifAvailable: true }, async (lock) => ...)`. Только одна вкладка-лидер получает блокировку и запускает `executeSilentRefresh()`, создавая скрытый iframe. Если блокировка уже занята другой вкладкой (`lock === null`), фоновая вкладка логирует пропуск в канал `[MSE Session]` и мгновенно выходит без выполнения сетевых запросов и создания iframe. При отсутствии поддержки Web Locks в браузере работает прозрачный fallback.
  * **Реактивная синхронизация токенов через событие `storage`:** После успешного обновления токенов вкладка-лидер сохраняет бэкап в `localStorage` (`mse_auth_backup`). Во всех остальных открытых вкладках срабатывает слушатель `handleAuthStorageSync(e)` на объекте `window`. Обработчик синхронно копирует все 9 ключей сессии в локальный `sessionStorage` вкладки, сбрасывает счетчик неудачных попыток (`refreshFailureCount = 0`), деактивирует состояние Circuit Breaker, сбрасывает таймер ожидания `smartWaitTimer` и останавливает локальный рефреш при его наличии.
  * **Гарантия очистки:** Слушатель события `storage` зарегистрирован в процедуре аварийной остановки (`stopAndCleanUp()`) через `window.removeEventListener('storage', handleAuthStorageSync)`.
* **Устойчивость к спящему режиму (Sleep Resilience):**
  * При пробуждении ПК после сна или разморозке вкладки (`timeSinceLastCheck > 45` с, слушатель `visibilitychange`) выполняется автоматический сброс зависших состояний и принудительное удаление элементов `#mse-silent-refresher`.
  * Тайм-аут зависания процесса рефреша (`SESSION_STUCK_TIMEOUT_MS = 25000` мс): если процесс рефреша не завершился в срок, состояние и DOM-элементы гарантированно сбрасываются через `cleanupSilentRefresh()`, предотвращая блокировку последующих проверок («Запрос отклонен: iframe уже запущен»).
* **Предохранитель от бесконечного цикла (Circuit Breaker):**
  * При 5 последовательных неудачных попытках тихого рефреша (`SESSION_MAX_REFRESH_ATTEMPTS = 5`) активируется предохранитель: фоновые сетевые запросы к серверу авторизации полностью прекращаются, исключая лавинообразный спам 302-редиректами в Network DevTools.
  * Автоматически удаляется невалидный бэкап сессии из `localStorage.mse_auth_backup`.
  * Пользователю отображается понятное уведомление (toast) о завершении сессии и необходимости повторного входа.
* **Определение срока жизни сессии по JWT (`claims.exp`):**
  * Время истечения основного токена (`getMainTokenExpiresAt()`) вычисляется на основе клейма `claims.exp` из JWT (`claims.exp * 1000`), являющегося первичным источником истины.
* **Реанимация при холодном старте:** Основной скрипт сохраняет копию авторизационных ключей через `saveAuthTokensBackup()` в `localStorage.mse_auth_backup`. При открытии новой вкладки ранний обработчик `src/keeper-early.js` на стадии `document_start` проверяет отсутствие `sessionStorage.getItem('access_token')`. Если токен отсутствует, скрипт валидирует суточный ID-токен из резервной копии по метаданным JWT (`claims.exp * 1000`). Если токен еще действует, все 9 ключей копируются в `sessionStorage`, восстанавливая сессию до инициализации Angular. При обнаружении просроченного токена невалидный бэкап немедленно удаляется.

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

* **Сетевой перехват оценок:** Перехватчик на уровне `XMLHttpRequest.prototype.send` отслеживает завершение запроса `POST /students-app/api/pages/student-card/my/academic-period-results-table/primary` (транспорт `HttpClient` в Angular). Из ответа извлекаются дисциплины, семестры и порядок занятий (`orderIndex`).
* **Загрузка технологических карт:** Для каждой дисциплины отправляется фоновый запрос `GET /courses/api/course-units/{id}/lessons-technology`, формирующий карту максимальных баллов по контрольным точкам занятий.
* **Отображение баллов и агрегация:**
  * Функция `enhanceGradesTable()` сопоставляет колонки «Встреча N» с уроками из техкарты.
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
  * Реализовано четыре общих уровня (`debug`, `info`, `warn`, `error`) и шесть контекстных каналов:
    * `[MSE Session]`: время жизни access-токена и суточного токена, создание скрытого iframe, статус ответа и новый срок действия токена.
    * `[MSE Network]`: события перехвата сетевых данных (поиск персон: найдено N чел; таблица `/primary`: N предметов; секции физкультуры).
    * `[MSE Calendar]`: этапы загрузки `loadAllData` (загружено N событий на неделю; получены участники; привязано N карточек к DOM).
    * `[MSE DB]`: статус загрузки баз корпусов и отзывов о преподавателях (запрос к GitHub, замер времени ответа, fallback на локальный пакет).
    * `[MSE Update]`: статус проверки обновлений (версия на GitHub, возраст кэша, сравнение SemVer, симуляция обновлений).
    * `[MSE PE]`: логирование запросов бронирования и отмены секций физкультуры, параметров модулей и ошибок бэкенда Booking API.
* **Переключение режима отладки без перезагрузки:**
  * Проверка активности режима выполняется динамически через `isDebug()`:
  * `window.MSE_enableDebug()` — активирует подробный вывод в рантайме, сохраняет флаг `mse_debug: "1"` в `localStorage` и выводит текущую сводку: версию расширения, статус токенов, состояние баз данных и статус обновлений.
  * `window.MSE_disableDebug()` — отключает подробный вывод в рантайме и удаляет ключ из `localStorage`.
  * `window.MSE_status()` — выводит статус сессии, баз данных и обновлений по запросу.
  * `window.MSE_checkUpdates(force = true)` — принудительно запрашивает свежий релиз с GitHub Releases API.
  * `window.MSE_testUpdate(mockVersion = '9.9.9')` — симулирует появление новой версии, отрисовывая бейдж и модальное окно.
  * `window.MSE_simulateSurvey(customConfig)` — симулирует показ опроса из `data/survey.json` (или кастомного конфига) в тестовом режиме в обход условий показа.
  * `window.MSE_checkSurvey()` — проверяет выполнение условий показа опроса и запускает его при удовлетворении критериев.
  * `window.MSE_clearSurveyCache()` — сбрасывает кэш опроса и флаги скрытия в `localStorage`.
* **Разделение DEV vs PROD:**
  * **PROD (по умолчанию):** При обычной загрузке страницы выводится только стартовый баннер расширения.
  * **WARN / ERROR:** Предупреждения и критические ошибки выводятся **всегда**, обеспечивая диагностику сбоев у пользователей.

### 2.7. Подсистема интерактивных опросов и аналитики

* **Назначение:** Сбор пользовательских предпочтений и приоритизация продуктовых функций среди активных студентов без перехода на внешние сервисы.
* **Архитектурный мост и кэширование (Dev vs Prod):**
  * **Продакшен (студенты):** Опрос работает онлайн через GitHub Raw (`raw.githubusercontent.com/.../data/survey.json`) с кэшированием в `localStorage.mse_survey_cache` (TTL 12 часов). В релизный ZIP-пакет файл `data/survey.json` не включается, исключая устаревшие оффлайн-опросы. При отсутствии сети или сбое запроса к GitHub опрос тихо пропускается.
  * **Режим разработки (автор):** Локальный файл `data/survey.json` (`web_accessible_resources`) используется для локальной отладки черновиков анкет без публикации на GitHub. Он считывается при активном флаге отладки (`mse_debug: "1"`), а также тестируется через `window.MSE_simulateSurvey()`.
  * **Мост данных:** Конфигурация сериализуется в Base64 и монтируется скриптом `src/content.js` в синхронный метатег `<meta name="modeus-survey-config">` ([ADR-002](adr/ADR-002-dom-data-bridge-meta-tags.md)), откуда считывается функцией `loadSurveyConfig()` в контексте Main World.
* **Трекер продуктовой активности (Engagement-Based Retention):**
  * Учет чистого времени взаимодействия (heartbeat) ведется каждую секунду через `recordActiveHeartbeat()` с защитой от спящего режима (`deltaMs <= 3000`) и только при активной вкладке (`document.visibilityState === 'visible'`).
  * **Суточный ролловер:** При смене календарной даты проверяется преодоление суточного порога (`minDailySecondsToQualify`). При достаточной активности дата сохраняется в массив `mse_qualified_days`, а суточный счетчик сбрасывается.
* **Условия показа опроса (`shouldShowSurvey`):**
  * Показ опроса инициируется только при одновременном выполнении условий:
    1. Опрос включен автором (`config.enabled === true`).
    2. Опросы не отключены пользователем (`mse_surveys_disabled_forever !== '1'`).
    3. Опрос с данным ID еще не отклонялся и не завершался (`mse_survey_dismissed_{id} !== '1'`).
    4. Не активен таймер отсрочки (`Date.now() > mse_survey_snooze_until`).
    5. Выполнены критерии таргетинга (`config.targeting`):
       * `daysSinceInstall >= targeting.minDaysSinceInstall` (стаж с момента установки расширения).
       * `qualifiedDaysCount >= targeting.minQualifiedDays` (число квалифицированных дней с активностью >= `minDailySecondsToQualify`).
       * `totalActiveSeconds >= targeting.minTotalActiveSeconds` (суммарное чистое время активного взаимодействия).
* **Спецификация параметров продуктового таргетинга (`targeting` в `data/survey.json`):**
  | Параметр | Тип | Единицы | Описание и продуктовый смысл |
  |---|---|---|---|
  | `minDaysSinceInstall` | `number` | календарные дни | **Стаж использования:** минимальное количество суток с даты первого запуска расширения (`mse_install_date`). Защищает нового пользователя от показа анкет в период первичного онбординга. |
  | `minQualifiedDays` | `number` | дни | **Регулярность визитов:** минимальное количество разных календарных дней, в каждый из которых студент набрал активность >= `minDailySecondsToQualify` (`mse_qualified_days`). Отсекает разовые открытия. |
  | `minDailySecondsToQualify` | `number` | секунды | **Суточный порог квалификации:** чистое время активного взаимодействия за день (например, 60 с или 120 с), необходимое для зачета суток как квалифицированного дня. |
  | `minTotalActiveSeconds` | `number` | секунды | **Суммарный хронометраж:** совокупное чистое время активной работы с расширением за всё время (`mse_total_active_seconds`, например 300 с = 5 минут). |
* **Пользовательский интерфейс опроса (`#mse-survey-popup`):**
  * Интерфейс монтируется в `document.body` и последовательно отображает экраны приглашения, вопросов и завершения либо отказа (`invite`, `question`, `completed`, `decline`).
  * Поддерживаются типы вопросов `single` (радиокнопки) и `multiple` (чекбоксы).
  * Параметр `allowCustom: true` активирует поле «Свой вариант» с текстовым инпутом `<input class="mse-survey-custom-input">` и автофокусом.
  * **Валидация:** Кнопка перехода к следующему шагу блокируется до выбора хотя бы одного варианта или ввода непустого текста в кастомном поле.
  * **Санитизация:** Все тексты вопросов, вариантов ответов и пользовательский ввод экранируются перед рендерингом и отправкой.
* **Анонимная телеметрия (`sendSurveyMetric`):**
  * Результаты и события взаимодействия (`completed`, `declined`, `disabled_forever`) передаются методом POST на внешний вебхук Google Apps Script ([ADR-004](adr/ADR-004-remote-survey-and-telemetry.md)).
  * Запрос отправляется в режиме `mode: 'no-cors'` с заголовком `'Content-Type': 'text/plain'`, что исключает блокировку браузером при HTTP 302 переадресации Google.
* **Управление и отладка в консоли:**
  * `window.MSE_checkSurvey()` — проверяет условия показа и запускает опрос при их выполнении.
  * `window.MSE_simulateSurvey(customConfig)` — симулирует показ опроса из `data/survey.json` (или переданного объекта) в тестовом режиме.
  * `window.MSE_getEngagementStats()` — возвращает метрики стажа, секунд активности и квалифицированных дней.
  * `window.MSE_getSurveyConfig()` / `window.MSE_setSurveyConfig(config)` — чтение и подмена активной конфигурации.
  * `window.MSE_clearSurveyCache()` — очистка кэша опроса и флагов скрытия в `localStorage`.

### 2.8. Подсистема проверки обновлений ([MSE Update])

* **Назначение:** Оповещение пользователей о выходе новых версий расширения со ссылкой на релиз GitHub без использования постоянного фонового service worker.
* **Сетевой эндпоинт и протокол:**
  * Запрос выполняется к GitHub Releases API: `GET https://api.github.com/repos/student1245/Modeus-Student-Enhancer/releases/latest` (константа `API_GITHUB_LATEST`).
  * Результаты проверки кэшируются в `localStorage` на 2 часа (`UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000`).
* **Модель локального кэширования:**
  * `localStorage.mse_last_update_check` (timestamp) — время последнего обращения к сети.
  * `localStorage.mse_latest_release` (JSON) — данные последнего релиза (`tag_name`, `html_url`, `name`).
  * `localStorage.mse_dismissed_v{version}` (`"1"`) — флаг скрытия уведомления для конкретной версии (по клику на «Позже»).
* **Жизненный цикл и проверка версий (`checkExtensionUpdate`):**
  * Функция `resolveLatestRelease()` проверяет возраст кэша. Если кэш моложе 2 часов и не передан флаг принудительной проверки (`force: true`), используются сохраненные данные, иначе выполняется сетевой запрос к GitHub.
  * Номер версии релиза сопоставляется с текущей версией манифеста (`CURRENT_VERSION`, читаемой из `<meta name="modeus-enhancer-version">`) по правилам SemVer (`compareSemVer`).
  * Если версия релиза новее текущей:
    * В панель фильтров `#search-controls` монтируется кликабельный бейдж обновления `renderUpdateBadge()`: `<a id="mse-update-badge" href="..." target="_blank"><span>⚡ v{version}</span></a>`.
    * В `document.body` монтируется модальное уведомление `renderUpdatePopup()` с кнопками перехода к релизу (`#mse-update-btn`) и скрытия (`#mse-dismiss-btn`).
* **Периодичность запуска:**
  * Фоновая проверка запускается через **1.5 секунды** после загрузки страницы (`setTimeout`).
  * Периодический опрос выполняется каждые **2 часа** через `setInterval(UPDATE_CHECK_INTERVAL_MS)`.
* **Команды отладки и тестирования:**
  * `window.MSE_checkUpdates(force = true)` — принудительный опрос GitHub API в обход 2-часового кэша.
  * `window.MSE_testUpdate(mockVersion = '9.9.9')` (или `window.MSE_simulateUpdate`) — визуальная симуляция появления обновления с тестовым номером версии для проверки бейджа и модального окна.
  * Логирование шагов проверки ведется в канал `[MSE Update]`.

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

#### 3.3.2. Собственные ключи расширения (localStorage / chrome.storage)

Ключи создаются исключительно кодом расширения для сохранения настроек, резервного копирования авторизации, кэширования справочников и аналитики продуктовой активности.

| Хранилище | Ключ | Тип данных | Назначение и жизненный цикл |
|---|---|---|---|
| `chrome.storage.sync` | `enabled` | `boolean` | Глобальный переключатель работы расширения из popup-меню (`true`/`false`). Синхронизируется между браузерами пользователя. |
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

2. **Включение отладки на лету (Debug Mode):**
   * Откройте консоль браузера (F12 → Console) и выполните:
     ```javascript
     window.MSE_enableDebug();
     ```
   * Это мгновенно активирует подробные цветные логи по 6 каналам (`[MSE Session]`, `[MSE Network]`, `[MSE Calendar]`, `[MSE DB]`, `[MSE Update]`, `[MSE PE]`) без перезагрузки страницы (сохраняет флаг `mse_debug: "1"` в `localStorage`).
   * Для отключения подробных логов используйте `window.MSE_disableDebug()`, а для вывода текущей сводки по сессии и базам данных — `window.MSE_status()`.

3. **Тестирование подсистемы опросов:**
   * Для симуляции отображения интерфейса опроса в обход guard-условий продуктового таргетинга выполните:
     ```javascript
     window.MSE_simulateSurvey();
     ```
   * Для штатной проверки выполнения условий таргетинга вызовите `window.MSE_checkSurvey()`.
   * Для сброса кэша опроса и флагов скрытия в `localStorage` вызовите `window.MSE_clearSurveyCache()`.

4. **Тестирование подсистемы проверки обновлений:**
   * Для визуальной симуляции бейджа и модального окна новой версии выполните:
     ```javascript
     window.MSE_testUpdate('9.9.9');
     ```
   * Для принудительной сетевой проверки свежего релиза с GitHub Releases API в обход 2-часового кэша вызовите:
     ```javascript
     window.MSE_checkUpdates(true);
     ```

5. **Правило чистой деактивации (`stopAndCleanUp`):**
   * При реализации любых новых функций, добавляющих DOM-элементы, таймеры, наблюдатели (`MutationObserver`) или патчирующих нативные прототипы браузера, разработчик **обязан** зарегистрировать их удаление и сброс в процедуре `stopAndCleanUp()`. Это гарантирует корректную работу кнопки экстренной остановки «Стоп-скрипт» (`#enhancer-stop-button` / `window.studentEnhancer.stop()`).
