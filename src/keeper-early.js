(function () {
    // Во фреймах ничего не делаем
    if (window.self !== window.top) return;

    function syncEnabledStateFromExtension() {
        if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) return;
        try {
            Promise.resolve(chrome.storage.sync.get('enabled')).then((res) => {
                const isEnabled = res?.enabled ?? true;
                try {
                    if (!isEnabled) {
                        localStorage.setItem('mse_disabled', '1');
                        localStorage.removeItem('mse_auth_backup');
                    } else {
                        localStorage.removeItem('mse_disabled');
                    }
                } catch { }
            }).catch(() => { });
        } catch { }
    }

    function clearSsoTriedFlag() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local?.remove) return;
        try {
            Promise.resolve(chrome.storage.local.remove('mse_sso_tried')).catch(() => { });
        } catch { }
    }

    syncEnabledStateFromExtension();

    try {
        if (localStorage.getItem('mse_disabled') === '1') return;
    } catch { }

    const AUTH_STORAGE_KEYS = [
        'access_token',
        'access_token_stored_at',
        'expires_at',
        'id_token',
        'id_token_claims_obj',
        'id_token_expires_at',
        'id_token_stored_at',
        'session_state',
        'nonce'
    ];

    const SESSION_KEY_OAUTH_STATE = 'mse_oauth_expected_state';
    const SESSION_KEY_OAUTH_NONCE = 'mse_oauth_expected_nonce';

    function generateCryptoToken(byteLength = 16) {
        const bytes = new Uint8Array(byteLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }

    function parseJwtPayload(token) {
        if (!token || typeof token !== 'string') return null;
        try {
            let payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
            if (!payload) return null;
            while (payload.length % 4) payload += '=';
            const binary = atob(payload);
            const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            return JSON.parse(new TextDecoder('utf-8').decode(bytes));
        } catch {
            return null;
        }
    }

    function resolveBackupIdTokenExpiry(backup) {
        if (backup?.id_token) {
            const claims = parseJwtPayload(backup.id_token);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp)) {
                return claims.exp * 1000;
            }
        }
        return Number(backup?.id_token_expires_at || 0);
    }

    function hasValidToken() {
        const accessToken = sessionStorage.getItem('access_token');
        const expiresAt = Number(sessionStorage.getItem('expires_at') || 0);
        const now = Date.now();
        if (accessToken && expiresAt > now) return true;

        const idToken = sessionStorage.getItem('id_token');
        if (idToken) {
            const claims = parseJwtPayload(idToken);
            if (typeof claims?.exp === 'number' && !isNaN(claims.exp) && claims.exp * 1000 > now) {
                return true;
            }
        }

        try {
            const backupRaw = localStorage.getItem('mse_auth_backup');
            if (backupRaw) {
                const backup = JSON.parse(backupRaw);
                const idExpiresAt = resolveBackupIdTokenExpiry(backup);
                if (idExpiresAt > now) return true;
            }
        } catch { }

        return false;
    }

    // 1. Принудительный сброс сессии WSO2 при явном выходе (возврат с wa=wsignout1.0)
    if (window.location.hash.includes('mse_logout=1')) {
        try {
            localStorage.removeItem('mse_auth_backup');
            sessionStorage.clear();
            const state = generateCryptoToken(16);
            const nonce = generateCryptoToken(16);
            sessionStorage.setItem(SESSION_KEY_OAUTH_STATE, state);
            sessionStorage.setItem(SESSION_KEY_OAUTH_NONCE, nonce);
            sessionStorage.setItem('nonce', nonce);
            const authUrl = `https://auth.modeus.org/oauth2/authorize?response_type=id_token%20token&client_id=sKir7YQnOUu4G0eCfn3tTxnBfzca&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent('https://utmn.modeus.org/')}&scope=openid&nonce=${encodeURIComponent(nonce)}&prompt=login`;
            window.location.replace(authUrl);
        } catch { }
        return;
    }

    // 2. Перехват и раннее сохранение токенов из хэша (#access_token=...) ДО запуска Angular
    // Срабатывает ТОЛЬКО для собственного OAuth-запроса MSE при наличии и совпадении state и nonce
    if (window.location.hash.includes('access_token=')) {
        try {
            const expectedState = sessionStorage.getItem(SESSION_KEY_OAUTH_STATE);
            const expectedNonce = sessionStorage.getItem(SESSION_KEY_OAUTH_NONCE);

            if (expectedState && expectedNonce) {
                sessionStorage.removeItem(SESSION_KEY_OAUTH_STATE);
                sessionStorage.removeItem(SESSION_KEY_OAUTH_NONCE);

                const hashStr = window.location.hash.replace(/^#/, '');
                const params = new URLSearchParams(hashStr);
                const accessToken = params.get('access_token');
                const returnedState = params.get('state');
                const idToken = params.get('id_token');
                const claims = idToken ? parseJwtPayload(idToken) : null;

                const isStateValid = Boolean(returnedState && returnedState === expectedState);
                const isNonceValid = Boolean(idToken && claims?.nonce && claims.nonce === expectedNonce);

                if (!isStateValid || !isNonceValid) {
                    console.warn('[MSE Keeper] Отклонены OAuth-токены из хэша: несовпадение state или nonce');
                } else if (accessToken) {
                    const rawExpiresIn = params.get('expires_in');
                    const expiresIn = (rawExpiresIn === null || rawExpiresIn === '') ? 3600 : Number(rawExpiresIn);
                    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
                        console.warn('[MSE Keeper] Отклонены OAuth-токены из хэша: некорректный expires_in');
                    } else {
                        const sessionState = params.get('session_state');
                        const now = Date.now();
                        const expiresAt = now + expiresIn * 1000;

                        sessionStorage.setItem('access_token', accessToken);
                        sessionStorage.setItem('access_token_stored_at', String(now));
                        sessionStorage.setItem('expires_at', String(expiresAt));
                        sessionStorage.setItem('id_token', idToken);

                        if (claims?.exp) {
                            sessionStorage.setItem('id_token_expires_at', String(claims.exp * 1000));
                            sessionStorage.setItem('id_token_claims_obj', JSON.stringify(claims));
                            sessionStorage.setItem('id_token_stored_at', String(now));
                        }
                        if (sessionState) {
                            sessionStorage.setItem('session_state', sessionState);
                        }
                        sessionStorage.setItem('nonce', expectedNonce);

                        const backupData = {};
                        AUTH_STORAGE_KEYS.forEach(key => {
                            const val = sessionStorage.getItem(key);
                            if (val !== null) backupData[key] = val;
                        });
                        localStorage.setItem('mse_auth_backup', JSON.stringify(backupData));
                        clearSsoTriedFlag();
                        console.log('[MSE Keeper] Токены из хэша успешно сохранены в sessionStorage');

                        // Немедленно очищаем URL от хэша, чтобы Angular увидел чистый '/'
                        // и не запускал валидацию кастомного state в tryLoginImplicitFlow
                        history.replaceState(null, '', '/');
                    }
                }
            }
        } catch (e) {
            console.warn('[MSE Keeper] Ошибка парсинга токенов из хэша:', e);
        }
    }

    // 3. Восстановление сессии из резервной копии, если sessionStorage пуст
    try {
        if (!sessionStorage.getItem('access_token')) {
            const backupRaw = localStorage.getItem('mse_auth_backup');
            if (backupRaw) {
                const backup = JSON.parse(backupRaw);
                const now = Date.now();
                const idExpiresAt = resolveBackupIdTokenExpiry(backup);

                // Суточный токен протух — удаляем невалидный бэкап и выходим
                if (idExpiresAt <= now) {
                    localStorage.removeItem('mse_auth_backup');
                } else {
                    AUTH_STORAGE_KEYS.forEach(key => {
                        if (backup[key] !== undefined && backup[key] !== null) {
                            sessionStorage.setItem(key, String(backup[key]));
                        }
                    });
                    console.log('[MSE Keeper] Сессия успешно реанимирована из бэкапа до старта приложения');
                }
            }
        }
    } catch (e) {
        console.warn('[MSE Keeper] Ошибка раннего восстановления:', e);
    }

    // 4. Страховка от зависания на /not-authorized при наличии валидной сессии
    if (hasValidToken()) {
        clearSsoTriedFlag();
        if (window.location.pathname.includes('/not-authorized')) {
            console.log('[MSE Keeper] Обнаружен URL not-authorized при валидной сессии — перенаправление на /');
            window.location.replace('/');
        }
    }
})();
