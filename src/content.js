(async () => {
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  if (!enabled) return;

  if (document.documentElement.hasAttribute('data-modeus-enhancer-injected')) return;
  document.documentElement.setAttribute('data-modeus-enhancer-injected', '1');

  const GITHUB_USER = 'student1245';
  const GITHUB_REPO = 'Modeus-Student-Enhancer';
  const GITHUB_BRANCH = 'main';
  const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

  const FETCH_TIMEOUT_MS = 2500;

  const META_BUILDINGS = 'modeus-buildings-map';
  const META_REVIEWS = 'modeus-teacher-reviews';
  const META_SURVEY = 'modeus-survey-config';
  const META_AUTOLOGIN = 'modeus-sso-autologin';

  const RESOURCE_BUILDINGS = 'buildings.json';
  const RESOURCE_TEACHER_REVIEWS = 'teacher_reviews.json';
  const RESOURCE_SURVEY = 'data/survey.json';

  const CACHE_KEY_BUILDINGS = 'mse_buildings_cache';
  const CACHE_KEY_REVIEWS = 'mse_reviews_cache';
  const CACHE_KEY_SURVEY = 'mse_survey_cache';

  const DATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;   // 24 часа для баз корпусов и отзывов
  const SURVEY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов для опроса

  const isDebug = () => {
    try {
      return localStorage.getItem('mse_debug') === 'true' || localStorage.getItem('mse_debug') === '1';
    } catch {
      return false;
    }
  };

  const logDb = (...args) => {
    if (isDebug()) {
      console.log('%c[MSE DB]', 'color: #f59e0b; font-weight: bold;', ...args);
    }
  };

  function readCache(key, ttlMs) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.text) return null;
      const isStale = !parsed.timestamp || (Date.now() - parsed.timestamp > ttlMs);
      return { text: parsed.text, isStale };
    } catch {
      return null;
    }
  }

  function writeCache(key, text) {
    try {
      localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        text
      }));
    } catch {
      // Игнорируем QuotaExceededError
    }
  }

  function mountOrUpdateMeta(metaName, text, source) {
    let meta = document.querySelector(`meta[name="${metaName}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = metaName;
      document.head.appendChild(meta);
    }
    const utf8Bytes = new TextEncoder().encode(text);
    const binaryString = Array.from(utf8Bytes, byte => String.fromCharCode(byte)).join('');
    meta.content = btoa(binaryString);
    meta.setAttribute('data-source', source);
  }

  function mountVersionMeta() {
    let versionMeta = document.querySelector('meta[name="modeus-enhancer-version"]');
    if (!versionMeta) {
      versionMeta = document.createElement('meta');
      versionMeta.name = 'modeus-enhancer-version';
      (document.head || document.documentElement).appendChild(versionMeta);
    }
    versionMeta.content = chrome.runtime.getManifest().version;
  }

  function mountOrUpdateAutologinMeta(hasVault) {
    let meta = document.querySelector(`meta[name="${META_AUTOLOGIN}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = META_AUTOLOGIN;
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.content = hasVault ? '1' : '0';
  }

  function injectScript(relativePath) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(relativePath);
    script.async = false;
    (document.head || document.documentElement).appendChild(script);
  }

  async function fetchFromLocalBundle(filename) {
    const startTime = performance.now();
    try {
      const url = chrome.runtime.getURL(filename);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (filename === RESOURCE_SURVEY) {
          logDb(`Локальный файл ${filename} отсутствует в бандле (штатно для prod-релиза)`);
          return null;
        }
        console.warn(`[MSE] Не удалось загрузить ${filename} из локального пакета: HTTP ${res.status}`);
        return null;
      }
      const text = await res.text();
      const durationMs = Math.round(performance.now() - startTime);
      return { text, source: `локальный пакет (${durationMs} мс)` };
    } catch (e) {
      if (filename === RESOURCE_SURVEY) {
        logDb(`Локальный файл ${filename} отсутствует в бандле: ${e.message}`);
        return null;
      }
      console.warn(`[MSE] Не удалось загрузить ${filename} из локального пакета:`, e);
      return null;
    }
  }

  async function fetchFromGitHub(filename) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const startTime = performance.now();
    try {
      const res = await fetch(`${RAW_URL}/${filename}?t=${Date.now()}`, { signal: controller.signal });
      if (!res.ok) {
        logDb(`GitHub вернул HTTP ${res.status} для ${filename}`);
        return null;
      }
      const text = await res.text();
      const durationMs = Math.round(performance.now() - startTime);
      return { text, source: `GitHub (${durationMs} мс)` };
    } catch (e) {
      logDb(`Запрос к GitHub для ${filename} завершился с ошибкой: ${e.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getInitialResourceData(filename, cacheKey, ttlMs) {
    const cached = readCache(cacheKey, ttlMs);
    if (cached?.text) {
      return { text: cached.text, source: 'кэш localStorage', isStale: cached.isStale };
    }
    const bundleResult = await fetchFromLocalBundle(filename);
    if (bundleResult?.text) {
      return { text: bundleResult.text, source: bundleResult.source, isStale: true };
    }
    return null;
  }

  async function getInitialSurveyData() {
    if (isDebug()) {
      const localDraft = await fetchFromLocalBundle(RESOURCE_SURVEY);
      if (localDraft?.text) {
        return { text: localDraft.text, source: localDraft.source, isStale: false };
      }
    }
    const cached = readCache(CACHE_KEY_SURVEY, SURVEY_CACHE_TTL_MS);
    if (cached?.text) {
      return { text: cached.text, source: 'кэш localStorage (TTL 12 ч)', isStale: cached.isStale };
    }
    return null;
  }

  async function revalidateResource(item) {
    if (!item.isStale && item.currentText) return false;
    logDb(`Фоновая ревалидация с GitHub: ${item.filename}...`);
    const remote = await fetchFromGitHub(item.filename);
    if (!remote?.text) return false;

    writeCache(item.cacheKey, remote.text);
    if (remote.text !== item.currentText) {
      mountOrUpdateMeta(item.metaName, remote.text, remote.source);
      logDb(`Фоновое обновление: ${item.filename} обновлен (${remote.source})`);
      return true;
    }
    return false;
  }

  async function revalidateResourcesInBackground(items) {
    try {
      const results = await Promise.all(items.map(revalidateResource));
      if (results.some(Boolean)) {
        document.dispatchEvent(new CustomEvent('mse:databases-updated'));
      }
    } catch (e) {
      logDb('Ошибка фоновой ревалидации баз:', e);
    }
  }

  // 1. Мгновенная инициализация из кэша / локального бандла (< 5 мс)
  const [buildingsData, reviewsData, surveyData, vaultResult] = await Promise.all([
    getInitialResourceData(RESOURCE_BUILDINGS, CACHE_KEY_BUILDINGS, DATA_CACHE_TTL_MS),
    getInitialResourceData(RESOURCE_TEACHER_REVIEWS, CACHE_KEY_REVIEWS, DATA_CACHE_TTL_MS),
    getInitialSurveyData(),
    chrome.storage.local.get('mse_sso_vault')
  ]);

  if (buildingsData?.text) {
    mountOrUpdateMeta(META_BUILDINGS, buildingsData.text, buildingsData.source);
    logDb(`Монтированы корпуса (${buildingsData.source})`);
  }
  if (reviewsData?.text) {
    mountOrUpdateMeta(META_REVIEWS, reviewsData.text, reviewsData.source);
    logDb(`Монтированы отзывы (${reviewsData.source})`);
  }
  if (surveyData?.text) {
    mountOrUpdateMeta(META_SURVEY, surveyData.text, surveyData.source);
    logDb(`Монтирован опрос (${surveyData.source})`);
  }

  mountOrUpdateAutologinMeta(Boolean(vaultResult?.mse_sso_vault));
  logDb(`Статус автовхода 24ч+: ${vaultResult?.mse_sso_vault ? 'активен (1)' : 'не настроен (0)'}`);

  // Синхронизация статуса автовхода при изменениях в chrome.storage.local
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.mse_sso_vault) {
      const isEnabled = Boolean(changes.mse_sso_vault.newValue);
      mountOrUpdateAutologinMeta(isEnabled);
      document.dispatchEvent(new CustomEvent('mse:autologin-updated', { detail: { isEnabled } }));
      logDb(`Обновлен статус автовхода: ${isEnabled ? 'активен (1)' : 'отключен (0)'}`);
    }
  });

  // Одноразовая пауза автовхода при явном выходе пользователя («Выйти»)
  document.addEventListener('mse:manual-logout', () => {
    chrome.storage.local.set({ mse_manual_logout_once: true });
    logDb('Зафиксирован явный выход из системы: установлен одноразовый флаг mse_manual_logout_once');
  });

  // 2. Мгновенная инъекция мета-версии и исполняемых скриптов ядра
  mountVersionMeta();
  injectScript('src/pe-module.js');
  injectScript('src/injected.js');

  // 3. Неблокирующая фоновая ревалидация с GitHub (SWR)
  revalidateResourcesInBackground([
    {
      filename: RESOURCE_BUILDINGS,
      cacheKey: CACHE_KEY_BUILDINGS,
      metaName: META_BUILDINGS,
      isStale: buildingsData?.isStale ?? true,
      currentText: buildingsData?.text
    },
    {
      filename: RESOURCE_TEACHER_REVIEWS,
      cacheKey: CACHE_KEY_REVIEWS,
      metaName: META_REVIEWS,
      isStale: reviewsData?.isStale ?? true,
      currentText: reviewsData?.text
    },
    {
      filename: RESOURCE_SURVEY,
      cacheKey: CACHE_KEY_SURVEY,
      metaName: META_SURVEY,
      isStale: surveyData?.isStale ?? true,
      currentText: surveyData?.text
    }
  ]);
})();
