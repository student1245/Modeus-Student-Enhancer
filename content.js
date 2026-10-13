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

  async function fetchFromLocalBundle(filename) {
    const startTime = performance.now();
    try {
      const url = chrome.runtime.getURL(filename);
      const res = await fetch(url);
      const text = await res.text();
      const durationMs = Math.round(performance.now() - startTime);
      return { text, source: `локальный пакет (${durationMs} мс)` };
    } catch (e) {
      console.warn(`[MSE] Не удалось загрузить ${filename} из локального пакета:`, e);
      return null;
    }
  }

  const META_BUILDINGS = 'modeus-buildings-map';
  const META_REVIEWS = 'modeus-teacher-reviews';
  const META_SURVEY = 'modeus-survey-config';

  const RESOURCE_BUILDINGS = 'buildings.json';
  const RESOURCE_TEACHER_REVIEWS = 'teacher_reviews.json';
  const RESOURCE_SURVEY = 'data/survey.json';

  const SURVEY_CACHE_KEY = 'mse_survey_cache';
  const SURVEY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов

  function getSurveyFromCache() {
    try {
      const raw = localStorage.getItem(SURVEY_CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      const isFresh = cached?.timestamp && (Date.now() - cached.timestamp < SURVEY_CACHE_TTL_MS);
      if (isFresh && cached.text) {
        return cached;
      }
    } catch {
      return null;
    }
    return null;
  }

  function saveSurveyToCache(text) {
    try {
      localStorage.setItem(SURVEY_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        text
      }));
    } catch {
      // Игнорируем ошибки квоты localStorage
    }
  }

  function mountDataToMeta(metaName, text, source) {
    const meta = document.createElement('meta');
    meta.name = metaName;
    const utf8Bytes = new TextEncoder().encode(text);
    const binaryString = Array.from(utf8Bytes, byte => String.fromCharCode(byte)).join('');
    meta.content = btoa(binaryString);
    meta.setAttribute('data-source', source);
    document.head.appendChild(meta);
  }

  async function fetchResource(filename) {
    if (filename === RESOURCE_SURVEY && !isDebug()) {
      const cached = getSurveyFromCache();
      if (cached) {
        return { text: cached.text, source: 'кэш localStorage (TTL 12 ч)' };
      }
    }

    const remoteResult = await fetchFromGitHub(filename);
    if (remoteResult) {
      if (filename === RESOURCE_SURVEY) {
        saveSurveyToCache(remoteResult.text);
      }
      return remoteResult;
    }

    return fetchFromLocalBundle(filename);
  }

  async function loadJsonData(filename, metaName) {
    logDb(`Начало загрузки ${filename}: запрос к GitHub...`);
    const result = await fetchResource(filename);

    if (result?.text) {
      const sizeKb = Math.round(result.text.length / 1024);
      logDb(`Успешно загружено: ${filename} (~${sizeKb} КБ, источник: ${result.source})`);
      mountDataToMeta(metaName, result.text, result.source);
    }
  }

  // Загружаем корпуса, отзывы и конфигурацию опроса параллельно
  await Promise.all([
    loadJsonData(RESOURCE_BUILDINGS, META_BUILDINGS),
    loadJsonData(RESOURCE_TEACHER_REVIEWS, META_REVIEWS),
    loadJsonData(RESOURCE_SURVEY, META_SURVEY)
  ]);

  const versionMeta = document.createElement('meta');
  versionMeta.name = 'modeus-enhancer-version';
  versionMeta.content = chrome.runtime.getManifest().version;
  document.head.appendChild(versionMeta);

  const peScript = document.createElement('script');
  peScript.src = chrome.runtime.getURL('pe-module.js');
  peScript.async = false; // Важно, чтобы сохранился порядок загрузки
  (document.head || document.documentElement).appendChild(peScript);

  const coreScriptElement = document.createElement('script');
  coreScriptElement.src = chrome.runtime.getURL('injected.js');
  coreScriptElement.async = false;
  (document.head || document.documentElement).appendChild(coreScriptElement);
})();