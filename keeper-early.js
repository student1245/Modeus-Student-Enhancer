(function () {
    // Во фреймах ничего не делаем
    if (window.self !== window.top) return;

    function resolveBackupIdTokenExpiry(backup) {
        if (backup?.id_token) {
            try {
                const payload = backup.id_token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
                if (payload) {
                    const binary = atob(payload);
                    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
                    const decoded = new TextDecoder('utf-8').decode(bytes);
                    const claims = JSON.parse(decoded);
                    if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                        return claims.exp * 1000;
                    }
                }
            } catch {
                // Игнорируем ошибку парсинга поврежденного JWT и переходим к запасному полю
            }
        }
        return Number(backup?.id_token_expires_at || 0);
    }

    try {
        if (sessionStorage.getItem('access_token')) return;

        const backupRaw = localStorage.getItem('mse_auth_backup');
        if (!backupRaw) return;

        const backup = JSON.parse(backupRaw);
        const now = Date.now();
        const idExpiresAt = resolveBackupIdTokenExpiry(backup);

        // Суточный токен протух — удаляем невалидный бэкап и выходим
        if (idExpiresAt <= now) {
            localStorage.removeItem('mse_auth_backup');
            return;
        }

        for (const [key, value] of Object.entries(backup)) {
            sessionStorage.setItem(key, value);
        }
        console.log('[MSE Keeper] Сессия успешно реанимирована из бэкапа до старта приложения');
    } catch (e) {
        console.warn('[MSE Keeper] Ошибка раннего восстановления:', e);
    }
})();