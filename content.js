(async () => {
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  if (!enabled) return;

  if (document.documentElement.hasAttribute('data-modeus-enhancer-injected')) return;
  document.documentElement.setAttribute('data-modeus-enhancer-injected', '1');

  const GITHUB_USER = 'student1245';
  const GITHUB_REPO = 'Modeus-Student-Enhancer';
  const GITHUB_BRANCH = 'main';
  const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}`;

  // Универсальная функция: сначала ищет на GitHub, если недоступен — берет локальный файл
  async function loadJsonData(filename, metaName) {
    let text = null;

    // 1. Пробуем скачать свежую базу с Гита
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500); // тайм-аут 2.5 сек
      const res = await fetch(`${RAW_URL}/${filename}?t=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) text = await res.text();
    } catch (e) {
      // Игнорируем ошибку сети, сработает локальный файл ниже
    }

    // 2. Если с Гита не скачалось — берем встроенный локальный файл расширения
    if (!text) {
      try {
        const url = chrome.runtime.getURL(filename);
        text = await (await fetch(url)).text();
      } catch (e) {
        console.warn(`[MSE] Не получилось загрузить ${filename}`, e);
      }
    }

    // 3. Зашиваем данные в meta-тег для injected.js
    if (text) {
      const meta = document.createElement('meta');
      meta.name = metaName;
      meta.content = btoa(unescape(encodeURIComponent(text)));
      document.head.appendChild(meta);
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

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injected.js');
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
})();