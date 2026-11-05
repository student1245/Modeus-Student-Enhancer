/**
 * Modeus Student Enhancer (MSE) — Набор автоматизированных тестов
 * Шаг 1: Архитектурные контракты, безопасность Manifest V3 и детектор мёртвого кода/CSS
 *
 * Раннер: node:test и node:assert/strict
 * Команда для запуска: node --test tools-src/*.test.js
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '..');

// --- Вспомогательные функции (Clean Code) ---

function readProjectFile(relPath) {
    return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

function parseJsonFile(relPath) {
    const raw = readProjectFile(relPath);
    try {
        return JSON.parse(raw);
    } catch (err) {
        assert.fail(`Невалидный JSON в файле ${relPath}: ${err.message}`);
    }
}

function stripComments(code) {
    return code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function getJsFilesFromDir(dirRelPath) {
    const fullDir = path.join(ROOT_DIR, dirRelPath);
    if (!fs.existsSync(fullDir)) return [];
    return fs.readdirSync(fullDir)
        .filter(f => f.endsWith('.js'))
        .map(f => path.join(dirRelPath, f).replace(/\\/g, '/'));
}

function extractCssClasses(cssContent) {
    const cleanCss = stripComments(cssContent);
    const matches = cleanCss.match(/(?<![\w\d])\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g) || [];
    return Array.from(new Set(matches.map(m => m.slice(1))));
}

// --- Наборы тестов ---

describe('Шаг 1: Архитектурные контракты, Manifest V3 и детектор мёртвого кода', () => {

    test('Тест 1: Валидность manifest.json, баз данных и синтаксиса JS', () => {
        // 1. Проверка JSON файлов
        const manifest = parseJsonFile('manifest.json');
        const buildings = parseJsonFile('buildings.json');
        const reviews = parseJsonFile('teacher_reviews.json');
        const rules = parseJsonFile('data/rules.json');
        const survey = parseJsonFile('data/survey.json');

        assert.ok(manifest && typeof manifest === 'object', 'manifest.json должен быть объектом');
        assert.ok(buildings && typeof buildings === 'object', 'buildings.json должен быть объектом');
        assert.ok(reviews && typeof reviews === 'object', 'teacher_reviews.json должен быть объектом');
        assert.ok(Array.isArray(rules), 'data/rules.json должен быть массивом правил');
        assert.ok(survey && typeof survey === 'object', 'data/survey.json должен быть объектом');

        // 2. Проверка физического существования файлов из manifest.json
        const referencedFiles = [];

        if (manifest.icons) {
            Object.values(manifest.icons).forEach(iconPath => referencedFiles.push(iconPath));
        }
        if (manifest.action?.default_popup) {
            referencedFiles.push(manifest.action.default_popup);
        }
        if (Array.isArray(manifest.content_scripts)) {
            manifest.content_scripts.forEach(cs => {
                if (cs.js) referencedFiles.push(...cs.js);
                if (cs.css) referencedFiles.push(...cs.css);
            });
        }
        if (Array.isArray(manifest.declarative_net_request?.rule_resources)) {
            manifest.declarative_net_request.rule_resources.forEach(res => {
                if (res.path) referencedFiles.push(res.path);
            });
        }
        if (Array.isArray(manifest.web_accessible_resources)) {
            manifest.web_accessible_resources.forEach(war => {
                if (war.resources) referencedFiles.push(...war.resources);
            });
        }

        referencedFiles.forEach(fileRel => {
            const abs = path.join(ROOT_DIR, fileRel);
            assert.ok(fs.existsSync(abs), `Файл '${fileRel}', указанный в manifest.json, отсутствует на диске: ${abs}`);
        });

        // 3. Проверка синтаксиса JS файлов через vm.Script
        const jsFilesToCheck = [
            ...getJsFilesFromDir('src'),
            ...getJsFilesFromDir('popup'),
            ...getJsFilesFromDir('tools-src')
        ];

        jsFilesToCheck.forEach(fileRel => {
            const code = readProjectFile(fileRel);
            try {
                new vm.Script(code, { filename: fileRel });
            } catch (syntaxError) {
                assert.fail(`Синтаксическая ошибка в ${fileRel}: ${syntaxError.message}`);
            }
        });
    });

    test('Тест 2: Изоляция миров Chromium (Isolated World vs Main World, Раздел 1.2)', () => {
        const mainWorldScripts = ['src/injected.js', 'src/pe-module.js', 'src/icons.js'];

        mainWorldScripts.forEach(scriptPath => {
            const cleanCode = stripComments(readProjectFile(scriptPath));

            assert.strictEqual(
                cleanCode.includes('chrome.storage'),
                false,
                `Скрипт Main World ${scriptPath} не должен обращаться к chrome.storage API`
            );
            assert.strictEqual(
                cleanCode.includes('chrome.tabs'),
                false,
                `Скрипт Main World ${scriptPath} не должен обращаться к chrome.tabs API`
            );
            assert.strictEqual(
                cleanCode.includes('chrome.declarativeNetRequest'),
                false,
                `Скрипт Main World ${scriptPath} не должен обращаться к chrome.declarativeNetRequest API`
            );
        });

        // Ключ сейфа mse_sso_vault должен быть изолирован в content.js и sso-autologin.js
        const injectedClean = stripComments(readProjectFile('src/injected.js'));
        const peModuleClean = stripComments(readProjectFile('src/pe-module.js'));

        assert.strictEqual(
            injectedClean.includes('mse_sso_vault'),
            false,
            'Секретный ключ mse_sso_vault не должен фигурировать в src/injected.js'
        );
        assert.strictEqual(
            peModuleClean.includes('mse_sso_vault'),
            false,
            'Секретный ключ mse_sso_vault не должен фигурировать в src/pe-module.js'
        );
    });

    test('Тест 3: Инвариант безопасности сетевых правил data/rules.json (ADR-001 / ADR-005)', () => {
        const rules = parseJsonFile('data/rules.json');
        assert.ok(rules.length > 0, 'data/rules.json не должен быть пустым');

        const allowedDomains = ['||fs.utmn.ru', '||auth.modeus.org'];

        rules.forEach(rule => {
            const types = rule.condition?.resourceTypes || [];

            assert.deepStrictEqual(
                types,
                ['sub_frame'],
                `Правило #${rule.id}: resourceTypes должен быть строго ['sub_frame'], получено ${JSON.stringify(types)}`
            );

            assert.strictEqual(
                types.includes('main_frame'),
                false,
                `КРИТИЧЕСКАЯ УЯЗВИМОСТЬ: Правило #${rule.id} модифицирует заголовки main_frame!`
            );

            const filter = rule.condition?.urlFilter;
            assert.ok(
                allowedDomains.includes(filter),
                `Правило #${rule.id}: целевой домен ${filter} не входит в список разрешенных: ${allowedDomains.join(', ')}`
            );
        });
    });

    test('Тест 4: Контракт синхронного DOM-моста <meta> (ADR-002) и публичного Console API (Раздел 4.2)', () => {
        const contentJs = readProjectFile('src/content.js');
        const injectedJs = readProjectFile('src/injected.js');

        // 1. Проверка совпадения DOM-метатегов
        const expectedMetas = [
            'modeus-buildings-map',
            'modeus-teacher-reviews',
            'modeus-survey-config',
            'modeus-sso-autologin',
            'modeus-enhancer-version'
        ];

        expectedMetas.forEach(metaName => {
            assert.ok(
                contentJs.includes(metaName),
                `src/content.js должен монтировать метатег '${metaName}'`
            );
            assert.ok(
                injectedJs.includes(metaName),
                `src/injected.js должен считывать метатег '${metaName}'`
            );
        });

        // 2. Проверка публичного консольного API в src/injected.js
        const documentedCommands = [
            'MSE_enableDebug',
            'MSE_disableDebug',
            'MSE_status',
            'MSE_checkUpdates',
            'MSE_testUpdate',
            'MSE_simulateUpdate',
            'MSE_resetUpdates',
            'MSE_clearUpdateCache',
            'MSE_checkSurvey',
            'MSE_simulateSurvey',
            'MSE_getEngagementStats',
            'MSE_getSurveyConfig',
            'MSE_setSurveyConfig',
            'MSE_clearSurveyCache',
            'MSE_showToast'
        ];

        documentedCommands.forEach(cmd => {
            assert.ok(
                injectedJs.includes(`window.${cmd}`),
                `Команда '${cmd}', задокументированная в docs/architecture.md, не экспортируется в window в src/injected.js`
            );
        });
    });

    test('Тест 5: Умный детектор мёртвого CSS (с учётом нативных классов платформы Modeus)', () => {
        const peCss = readProjectFile('styles/pe-styles.css');
        const mainCss = readProjectFile('styles/styles.css');

        const peClasses = extractCssClasses(peCss);
        const mainClasses = extractCssClasses(mainCss);

        const runtimeSources = [
            'src/injected.js',
            'src/pe-module.js',
            'src/content.js',
            'src/keeper-early.js',
            'src/sso-autologin.js',
            'src/icons.js',
            'popup/popup.js',
            'popup/popup.html'
        ].map(readProjectFile).map(stripComments).join('\n');

        const allowedDynamicToastClasses = [
            'mse-toast-success',
            'mse-toast-error',
            'mse-toast-warning',
            'mse-toast-info'
        ];

        const isNativeOrDynamic = (cls) => {
            // Нативные классы Angular/FullCalendar/Bootstrap/PrimeNG платформы Modeus
            if (cls.startsWith('fc-') ||
                cls.startsWith('ngb-') ||
                cls.startsWith('p-') ||
                cls.startsWith('ui-') ||
                cls.startsWith('event-card-') ||
                cls.startsWith('location-info') ||
                cls.startsWith('teachers-list') ||
                cls.startsWith('main-calendar-form') ||
                cls.startsWith('calendar-container') ||
                cls.startsWith('search-wrap') ||
                cls.startsWith('search-field') ||
                cls.startsWith('search-highlight') ||
                cls.startsWith('mds-') ||
                cls === 'present' ||
                cls === 'text-muted' ||
                cls === 'fieldMargin' ||
                cls === 'card' ||
                cls === 'error-container' ||
                cls === 'content' ||
                cls === 'form-container') {
                return true;
            }
            // Разрешаем только конкретный список динамических модификаторов тостов при наличии префикса в рантайме
            if (allowedDynamicToastClasses.includes(cls)) {
                return runtimeSources.includes('mse-toast-');
            }
            return false;
        };

        const deadInPe = peClasses.filter(cls => !isNativeOrDynamic(cls) && !runtimeSources.includes(cls));
        const deadInMain = mainClasses.filter(cls => !isNativeOrDynamic(cls) && !runtimeSources.includes(cls));

        assert.deepStrictEqual(
            deadInPe,
            [],
            `Обнаружены мёртвые CSS-классы в styles/pe-styles.css: ${deadInPe.join(', ')}`
        );
        assert.deepStrictEqual(
            deadInMain,
            [],
            `Обнаружены мёртвые CSS-классы в styles/styles.css: ${deadInMain.join(', ')}`
        );
    });

    test('Тест 6: Детектор неиспользуемых функций в src/*.js и проверка verify-icons.js', () => {
        // 1. Проверка неиспользуемых именованных функций
        const srcFiles = ['src/injected.js', 'src/pe-module.js', 'src/content.js', 'src/keeper-early.js', 'src/sso-autologin.js', 'src/icons.js'];

        srcFiles.forEach(fileRel => {
            const cleanCode = stripComments(readProjectFile(fileRel));
            const fnRegex = /\b(?:function\s+([a-zA-Z0-9_$]+)\s*\(|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function\b)/g;

            let match;
            const declaredFns = [];
            while ((match = fnRegex.exec(cleanCode)) !== null) {
                const fnName = match[1] || match[2] || match[3];
                // Игнорируем стандартные/служебные имена
                if (fnName && !['resolve', 'reject', 'init'].includes(fnName)) {
                    declaredFns.push(fnName);
                }
            }

            const deadFns = [];
            declaredFns.forEach(fn => {
                const occurrences = (cleanCode.match(new RegExp(`\\b${fn}\\b`, 'g')) || []).length;
                if (occurrences === 1) {
                    deadFns.push(fn);
                }
            });

            assert.deepStrictEqual(
                deadFns,
                [],
                `Обнаружены объявленные, но нигде не вызываемые функции в ${fileRel}: ${deadFns.join(', ')}`
            );
        });

        // 2. Интеграция verify-icons.js
        const iconsScriptPath = path.join(ROOT_DIR, 'tools-src', 'verify-icons.js');
        assert.ok(fs.existsSync(iconsScriptPath), 'tools-src/verify-icons.js должен существовать');
        // Запуск через require гарантирует прохождение всех ассертов синхронизации 23 иконок и Zero-Raw-SVG
        require(iconsScriptPath);

        // 3. Проверка отсутствия системных UI-эмодзи
        const forbiddenEmojis = ['🥊', '⚡', '💬', '✅', '⚠️', '📍', '🎓', '🤔', '⏳', '⭐'];
        srcFiles.forEach(fileRel => {
            const cleanCode = stripComments(readProjectFile(fileRel));
            forbiddenEmojis.forEach(emoji => {
                assert.strictEqual(
                    cleanCode.includes(emoji),
                    false,
                    `В ${fileRel} обнаружен системный UI-эмодзи '${emoji}'. Замените на векторную иконку из icons.js.`
                );
            });
        });
    });

});
