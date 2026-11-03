const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Проверка синхронизации SVG-иконок и правила Zero-Raw-SVG ---');

const toolsDir = __dirname;
const rootDir = path.resolve(toolsDir, '..');
const svgDir = path.join(rootDir, 'icons', 'svg');
const iconsJsPath = path.join(rootDir, 'src', 'icons.js');

// 1. Загрузка централизованного словаря иконок
const { MSE_ICONS, getSvgIcon } = require(iconsJsPath);
assert(MSE_ICONS && typeof MSE_ICONS === 'object', 'MSE_ICONS должен экспортироваться из src/icons.js');
assert(typeof getSvgIcon === 'function', 'Хелпер getSvgIcon должен экспортироваться из src/icons.js');

// 2. Чтение всех эталонных SVG-файлов из icons/svg/
const svgFiles = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg')).sort();
console.log(`Найдено ${svgFiles.length} эталонных SVG-файлов в icons/svg:`);
svgFiles.forEach(f => console.log(`  • ${f}`));

const masterIcons = {};
svgFiles.forEach(file => {
    const iconName = path.basename(file, '.svg');
    const content = fs.readFileSync(path.join(svgDir, file), 'utf8');
    const match = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    assert(match, `Некорректный формат SVG-файла: ${file}`);
    masterIcons[iconName] = match[1].trim();
});

// 3. Проверка 100% двустороннего соответствия между icons/svg/ и MSE_ICONS
const iconKeys = Object.keys(MSE_ICONS).sort();
assert.strictEqual(iconKeys.length, svgFiles.length, `Ожидалось ${svgFiles.length} иконок в MSE_ICONS, получено ${iconKeys.length}`);

svgFiles.forEach(file => {
    const iconName = path.basename(file, '.svg');
    assert(MSE_ICONS[iconName] !== undefined, `В MSE_ICONS отсутствует ключ '${iconName}' для файла ${file}`);
    // Проверка совпадения геометрии
    const masterPath = masterIcons[iconName];
    const dictPath = MSE_ICONS[iconName];
    assert.strictEqual(dictPath, masterPath, `Несовпадение геометрии для иконки '${iconName}':\nОжидалось: ${masterPath}\nПолучено:  ${dictPath}`);
    console.log(`✓ Иконка '${iconName}' совпадает с icons/svg/${file} (100% совпадение геометрии)`);
});

iconKeys.forEach(key => {
    assert(masterIcons[key] !== undefined, `В MSE_ICONS есть ключ '${key}' без соответствующего файла в icons/svg/`);
});
console.log('✓ Двусторонняя синхронизация подтверждена: для каждого файла есть ключ, для каждого ключа есть файл');

// 4. Проверка отсутствия сырых тегов <svg> в HTML-шаблонах компонентов
function verifyNoRawSvg(relPath) {
    console.log(`\nПроверка шаблонов компонентов в ${relPath} на сырые теги <svg>...`);
    const code = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const lines = code.split('\n');
    let insideGetSvgIcon = false;
    const rawSvgLines = [];

    lines.forEach((line, lineIdx) => {
        // Пропуск реализации внутри функции getSvgIcon
        if (line.includes('function getSvgIcon(')) insideGetSvgIcon = true;
        if (insideGetSvgIcon && line.includes('return `<svg')) return;
        if (insideGetSvgIcon && line.includes('}')) insideGetSvgIcon = false;

        // Пропуск комментариев
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

        if (!insideGetSvgIcon && line.includes('<svg')) {
            rawSvgLines.push({ lineNum: lineIdx + 1, text: trimmed });
        }
    });

    if (rawSvgLines.length > 0) {
        console.error(`Обнаружены сырые теги <svg> в ${relPath}:`);
        rawSvgLines.forEach(err => console.error(`  Строка ${err.lineNum}: ${err.text}`));
        assert.fail(`Обнаружены сырые теги <svg> в шаблонах компонентов ${relPath}. Все иконки должны использовать getSvgIcon(...) или словарь ICONS.`);
    }
    console.log(`✓ 0 сырых <svg> строк в шаблонах компонентов ${relPath}`);
}

verifyNoRawSvg('src/pe-module.js');
verifyNoRawSvg('src/injected.js');

console.log('\n=== ВСЕ SVG-ИКОНКИ НА 100% СИНХРОНИЗИРОВАНЫ И ЦЕНТРАЛИЗОВАНЫ! ===');
