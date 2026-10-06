(function () {
    // Во фреймах ничего не делаем
    if (window.self !== window.top) return;

    try {
        if (!sessionStorage.getItem('access_token')) {
            const backupRaw = localStorage.getItem('mse_auth_backup');
            if (backupRaw) {
                const backup = JSON.parse(backupRaw);
                const now = Date.now();
                const idExpiresAt = Number(backup['id_token_expires_at'] || 0);

                // Восстанавливаем только если суточный id_token еще жив
                if (idExpiresAt > now) {
                    Object.keys(backup).forEach((key) => {
                        sessionStorage.setItem(key, backup[key]);
                    });
                    console.log('[MSE Keeper] Сессия успешно реанимирована из бэкапа до старта приложения');
                }
            }
        }
    } catch (e) {
        console.warn('[MSE Keeper] Ошибка раннего восстановления:', e);
    }
})();