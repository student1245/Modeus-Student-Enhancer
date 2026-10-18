const toggle = document.getElementById('toggle');
const reloadBtn = document.getElementById('reload');
const autologinStatus = document.getElementById('autologin-status');
const resetVaultBtn = document.getElementById('reset-vault');

(async () => {
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  toggle.checked = enabled;
  await updateAutologinUI();
})();

async function updateAutologinUI() {
  try {
    const { mse_sso_vault } = await chrome.storage.local.get('mse_sso_vault');
    if (mse_sso_vault) {
      autologinStatus.textContent = 'Активен';
      autologinStatus.classList.add('active');
      resetVaultBtn.style.display = 'inline-block';
    } else {
      autologinStatus.textContent = 'Не настроен';
      autologinStatus.classList.remove('active');
      resetVaultBtn.style.display = 'none';
    }
  } catch (e) {
    console.warn('[MSE Popup] Ошибка чтения статуса автовхода:', e);
  }
}

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

resetVaultBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('mse_sso_vault');
    await updateAutologinUI();
  } catch (e) {
    console.warn('[MSE Popup] Ошибка сброса сейфа автовхода:', e);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.mse_sso_vault) {
    updateAutologinUI();
  }
});
