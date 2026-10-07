(function () {
    // Во фреймах ничего не делаем
    if (window.self !== window.top) return;

    try {
        if (!sessionStorage.getItem('access_token')) {
            const backupRaw = localStorage.getItem('mse_auth_backup');
            if (backupRaw) {
                const backup = JSON.parse(backupRaw);
                const now = Date.now();
                let idExpiresAt = 0;

                // Строго математически опираемся на фактические метаданные самого токена
                if (backup['id_token']) {
                    try {
                        const payload = backup['id_token'].split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
                        if (payload) {
                            const binary = atob(payload);
                            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
                            const decoded = new TextDecoder('utf-8').decode(bytes);
                            const claims = JSON.parse(decoded);
                            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                                idExpiresAt = claims.exp * 1000;
                            }
                        }
                    } catch {}
                }

                if (!idExpiresAt) {
                    idExpiresAt = Number(backup['id_token_expires_at'] || 0);
                }

                // Восстанавливаем только если суточный id_token еще жив
                if (idExpiresAt > now) {
                    Object.keys(backup).forEach((key) => {
                        sessionStorage.setItem(key, backup[key]);
                    });
                    console.log('[MSE Keeper] Сессия успешно реанимирована из бэкапа до старта приложения');
                } else {
                    // Суточный токен протух — удаляем невалидный бэкап
                    localStorage.removeItem('mse_auth_backup');
                }
            }
        }
    } catch (e) {
        console.warn('[MSE Keeper] Ошибка раннего восстановления:', e);
    }
})();