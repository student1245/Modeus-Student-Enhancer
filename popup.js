const toggle = document.getElementById('toggle');
const reloadBtn = document.getElementById('reload');

(async () => {
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  toggle.checked = enabled;
})();

toggle.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: toggle.checked });
});

reloadBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.reload(tab.id);
    }
  } catch (e) {
    console.warn('[MSE Popup] Ошибка перезагрузки вкладки:', e);
  }
});
