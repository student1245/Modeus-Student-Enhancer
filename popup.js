const toggle = document.getElementById('toggle');
const reloadBtn = document.getElementById('reload');

(async () => {
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  toggle.checked = enabled;
})();

toggle.addEventListener('change', async () => {
  await chrome.storage.sync.set({ enabled: toggle.checked });
});

reloadBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id) chrome.tabs.reload(tab.id);
  });
});
