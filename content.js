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

  function mountDataToMeta(metaName, text, source) {
    const meta = document.createElement('meta');
    meta.name = metaName;
    const utf8Bytes = new TextEncoder().encode(text);
    const binaryString = Array.from(utf8Bytes, byte => String.fromCharCode(byte)).join('');
    meta.content = btoa(binaryString);
    meta.setAttribute('data-source', source);
    document.head.appendChild(meta);
  }

  async function loadJsonData(filename, metaName) {
    logDb(`Начало загрузки ${filename}: запрос к GitHub...`);
    const remoteResult = await fetchFromGitHub(filename);
    const result = remoteResult || (await fetchFromLocalBundle(filename));

    if (result?.text) {
      const sizeKb = Math.round(result.text.length / 1024);
      logDb(`Успешно загружено: ${filename} (~${sizeKb} КБ, источник: ${result.source})`);
      mountDataToMeta(metaName, result.text, result.source);
    }
  }

  // Загружаем корпуса и отзывы параллельно
  await Promise.all([
    loadJsonData('buildings.json', 'modeus-buildings-map'),
    loadJsonData('teacher_reviews.json', 'modeus-teacher-reviews')
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