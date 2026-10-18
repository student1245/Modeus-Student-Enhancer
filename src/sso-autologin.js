(async () => {
    // Проверка глобального переключателя расширения
    const { enabled = true } = await chrome.storage.sync.get({ enabled: true });
    if (!enabled) return;

    // Игнорируем сценарий явного выхода ADFS
    if (window.location.href.includes('wa=wsignout')) return;

    // Поиск ключевых элементов формы авторизации Microsoft ADFS
    const usernameInput = document.querySelector('#userNameInput') || document.querySelector('input[name="UserName"]');
    const passwordInput = document.querySelector('#passwordInput') || document.querySelector('input[name="Password"]');
    const submitButton = document.querySelector('#submitButton') || document.querySelector('input[type="submit"], button[type="submit"]');
    const loginForm = document.querySelector('#loginForm') || submitButton?.form;

    if (!usernameInput || !passwordInput || !loginForm) return;

    // Вспомогательные криптографические функции (Web Crypto API: AES-GCM 256-bit)
    function bufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    async function encryptCredentials(username, password) {
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const payloadText = JSON.stringify({ username, password });
        const encoded = new TextEncoder().encode(payloadText);
        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );
        const keyJwk = await crypto.subtle.exportKey('jwk', key);
        return {
            ciphertextBase64: bufferToBase64(ciphertextBuffer),
            ivBase64: bufferToBase64(iv),
            keyJwk,
            updatedAt: Date.now()
        };
    }

    async function decryptCredentials(vault) {
        if (!vault?.ciphertextBase64 || !vault?.ivBase64 || !vault?.keyJwk) return null;
        const key = await crypto.subtle.importKey(
            'jwk',
            vault.keyJwk,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        const iv = base64ToBuffer(vault.ivBase64);
        const ciphertext = base64ToBuffer(vault.ciphertextBase64);
        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        const decryptedText = new TextDecoder().decode(decryptedBuffer);
        return JSON.parse(decryptedText);
    }

    // Безопасная эмуляция пользовательского ввода (React/Angular/Vanilla friendly)
    function setInputValue(input, value) {
        if (!input) return;
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (valueSetter) {
            valueSetter.call(input, value);
        } else {
            input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function showCircuitBreakerNotice() {
        const noticeId = 'mse-circuit-breaker-notice';
        if (document.getElementById(noticeId)) return;
        const notice = document.createElement('div');
        notice.id = noticeId;
        notice.style.cssText = 'background: #f8f9fa; border-left: 3px solid #ef4444; color: #b91c1c; padding: 8px 12px; font-family: "Segoe UI", "Segoe WP", Tahoma, Arial, sans-serif; font-size: 12px; margin-bottom: 15px; line-height: 1.4;';
        notice.innerHTML = '⚠️ <strong>Автовход MSE отключен:</strong> сервер отклонил пароль. Введите актуальный пароль вручную.';
        const target = document.querySelector('#errorText') || loginForm;
        if (target?.parentNode) {
            target.parentNode.insertBefore(notice, target);
        }
    }

    // Шаг 1: Проверка ошибок сервера и однократный предохранитель (Single-Attempt Circuit Breaker)
    const hasError = Boolean(document.querySelector('#errorText')?.textContent?.trim());
    const wasTried = sessionStorage.getItem('mse_sso_tried') === '1';

    const { mse_sso_vault, mse_manual_logout_until = 0 } = await chrome.storage.local.get([
        'mse_sso_vault',
        'mse_manual_logout_until'
    ]);

    if (hasError || wasTried) {
        sessionStorage.removeItem('mse_sso_tried');
        if (mse_sso_vault) {
            await chrome.storage.local.remove('mse_sso_vault');
            if (window.self === window.top) {
                showCircuitBreakerNotice();
            }
        }
        if (window.self === window.top) {
            mountRememberMeUI(false);
        }
        return;
    }

    // Шаг 2: Автоматический вход при наличии сохраненного сейфа
    const isCooldownActive = Date.now() <= mse_manual_logout_until;
    if (mse_sso_vault && !isCooldownActive) {
        sessionStorage.setItem('mse_sso_tried', '1');
        try {
            const credentials = await decryptCredentials(mse_sso_vault);
            if (credentials?.username && credentials?.password) {
                setInputValue(usernameInput, credentials.username);
                setInputValue(passwordInput, credentials.password);
                if (submitButton) {
                    submitButton.click();
                } else {
                    HTMLFormElement.prototype.submit.call(loginForm);
                }
                return;
            }
        } catch (err) {
            console.warn('[MSE SSO Autologin] Ошибка расшифровки хранилища:', err);
            await chrome.storage.local.remove('mse_sso_vault');
            sessionStorage.removeItem('mse_sso_tried');
        }
    }

    // Шаг 3: Монтирование UI чекбокса «Запомнить меня» в основном окне
    function mountRememberMeUI(isVaultSaved) {
        if (document.getElementById('mse-remember-container')) return;

        const container = document.createElement('div');
        container.id = 'mse-remember-container';
        container.style.cssText = 'margin: 12px 0 16px 0; font-family: "Segoe UI", "Segoe WP", Tahoma, Arial, sans-serif; font-size: 13px; font-weight: 400; color: #262626;';

        container.innerHTML = `
            <label style="display: flex; align-items: center; cursor: pointer; user-select: none; gap: 8px;">
                <input type="checkbox" id="mse-remember-checkbox" style="cursor: pointer; width: 15px; height: 15px; accent-color: #0067b8; margin: 0;" ${isVaultSaved ? 'checked' : ''}>
                <span>Запомнить меня (бесконечная сессия)</span>
            </label>
            <div id="mse-remember-warning" style="display: none; margin-top: 8px; padding: 8px 12px; background: #f8f9fa; border-left: 3px solid #f59e0b; color: #475569; font-size: 12px; line-height: 1.45;">
                ⚠️ <strong>Экспериментальная функция:</strong> используйте только на личном ПК. Учетные данные шифруются локально (AES-GCM 256-bit) для поддержания сессии 24ч+ и никогда не покидают браузер. При любой ошибке входа данные мгновенно удаляются.
            </div>
        `;

        const passwordContainer = passwordInput.closest('.fieldMargin') || passwordInput.parentNode;
        if (submitButton && submitButton.parentNode) {
            submitButton.parentNode.insertBefore(container, submitButton);
        } else if (passwordContainer && passwordContainer.parentNode) {
            passwordContainer.parentNode.insertBefore(container, passwordContainer.nextSibling);
        } else {
            loginForm.appendChild(container);
        }

        const checkbox = container.querySelector('#mse-remember-checkbox');
        const warning = container.querySelector('#mse-remember-warning');

        // Реактивное сохранение сейфа в chrome.storage.local
        let pendingSavePromise = null;
        let saveDebounceTimer = null;

        async function doSaveVault() {
            if (!checkbox.checked) {
                await chrome.storage.local.remove('mse_sso_vault');
                return null;
            }

            const username = usernameInput.value?.trim();
            const password = passwordInput.value;
            if (!username || !password) return null;

            try {
                const vault = await encryptCredentials(username, password);
                await chrome.storage.local.set({
                    mse_sso_vault: vault,
                    mse_manual_logout_until: 0
                });
                return vault;
            } catch (err) {
                console.error('[MSE SSO Autologin] Ошибка сохранения сейфа:', err);
                return null;
            }
        }

        function triggerReactiveSave(delay = 50) {
            clearTimeout(saveDebounceTimer);
            if (!checkbox.checked) {
                pendingSavePromise = chrome.storage.local.remove('mse_sso_vault');
                return pendingSavePromise;
            }
            if (delay === 0) {
                pendingSavePromise = doSaveVault();
                return pendingSavePromise;
            }
            saveDebounceTimer = setTimeout(() => {
                pendingSavePromise = doSaveVault();
            }, delay);
        }

        checkbox.addEventListener('change', () => {
            warning.style.display = checkbox.checked ? 'block' : 'none';
            if (checkbox.checked) {
                triggerReactiveSave(0);
            } else {
                clearTimeout(saveDebounceTimer);
                pendingSavePromise = chrome.storage.local.remove('mse_sso_vault');
            }
        });

        const handleInput = () => {
            if (checkbox.checked) {
                triggerReactiveSave(50);
            }
        };

        const handleChangeOrBlur = () => {
            if (checkbox.checked) {
                triggerReactiveSave(0);
            }
        };

        usernameInput.addEventListener('input', handleInput);
        usernameInput.addEventListener('change', handleChangeOrBlur);
        usernameInput.addEventListener('blur', handleChangeOrBlur);

        passwordInput.addEventListener('input', handleInput);
        passwordInput.addEventListener('change', handleChangeOrBlur);
        passwordInput.addEventListener('blur', handleChangeOrBlur);

        // Перехват отправки формы (клик на span #submitButton, Enter в input, submit формы)
        let isSubmitting = false;

        const handleSubmitIntercept = async (e) => {
            if (isSubmitting) return;

            if (e.type === 'keydown' || e.type === 'keypress') {
                if (e.key !== 'Enter' && e.keyCode !== 13) return;
            }

            const username = usernameInput.value?.trim();
            const password = passwordInput.value;
            // Если поля не заполнены, позволяем нативному ADFS показать ошибку
            if (!username || !password) return;

            e.preventDefault();
            e.stopImmediatePropagation();

            clearTimeout(saveDebounceTimer);

            if (checkbox.checked) {
                if (pendingSavePromise) {
                    await pendingSavePromise;
                }
                await doSaveVault();
            } else {
                await chrome.storage.local.remove('mse_sso_vault');
            }

            isSubmitting = true;

            if (submitButton) {
                submitButton.click();
            } else {
                HTMLFormElement.prototype.submit.call(loginForm);
            }

            // Fallback через 200 мс на случай, если click на span не инициировал submit формы
            setTimeout(() => {
                try {
                    HTMLFormElement.prototype.submit.call(loginForm);
                } catch { }
            }, 200);

            // Сброс флага через 3 секунды, если отправка была отменена браузером
            setTimeout(() => {
                isSubmitting = false;
            }, 3000);
        };

        if (submitButton) {
            submitButton.addEventListener('click', handleSubmitIntercept, true);
        }
        passwordInput.addEventListener('keydown', handleSubmitIntercept, true);
        passwordInput.addEventListener('keypress', handleSubmitIntercept, true);
        usernameInput.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' || e.keyCode === 13) && passwordInput.value) {
                handleSubmitIntercept(e);
            }
        }, true);
        loginForm.addEventListener('submit', handleSubmitIntercept, true);
    }

    if (window.self === window.top) {
        mountRememberMeUI(Boolean(mse_sso_vault));
    }
})();
