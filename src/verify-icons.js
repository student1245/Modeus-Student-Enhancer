const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Verifying SVG Icons Sync & Zero-Raw-SVG Rule ---');

const srcDir = __dirname;
const rootDir = path.resolve(srcDir, '..');
const svgDir = path.join(rootDir, 'icons', 'svg');

// 1. Load centralized icons dictionary
const { MSE_ICONS, getSvgIcon } = require('./icons.js');
assert(MSE_ICONS && typeof MSE_ICONS === 'object', 'MSE_ICONS must be exported from src/icons.js');
assert(typeof getSvgIcon === 'function', 'getSvgIcon helper must be exported from src/icons.js');

// 2. Read all master SVG files
const svgFiles = fs.readdirSync(svgDir).filter(f => f.endsWith('.svg')).sort();
console.log(`Found ${svgFiles.length} master SVG files in icons/svg:`);
svgFiles.forEach(f => console.log(`  • ${f}`));

const masterIcons = {};
svgFiles.forEach(file => {
    const iconName = path.basename(file, '.svg');
    const content = fs.readFileSync(path.join(svgDir, file), 'utf8');
    const match = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    assert(match, `Invalid SVG file format in ${file}`);
    masterIcons[iconName] = match[1].trim();
});

// 3. Verify 100% two-way match between icons/svg/ and MSE_ICONS
const iconKeys = Object.keys(MSE_ICONS).sort();
assert.strictEqual(iconKeys.length, svgFiles.length, `Expected ${svgFiles.length} icons in MSE_ICONS, found ${iconKeys.length}`);

svgFiles.forEach(file => {
    const iconName = path.basename(file, '.svg');
    assert(MSE_ICONS[iconName] !== undefined, `MSE_ICONS is missing key '${iconName}' for file ${file}`);
    // Check geometry match
    const masterPath = masterIcons[iconName];
    const dictPath = MSE_ICONS[iconName];
    assert.strictEqual(dictPath, masterPath, `Geometry mismatch for icon '${iconName}':\nExpected: ${masterPath}\nActual:   ${dictPath}`);
    console.log(`✓ Icon '${iconName}' matches icons/svg/${file} (100% geometry match)`);
});

iconKeys.forEach(key => {
    assert(masterIcons[key] !== undefined, `MSE_ICONS has key '${key}' without corresponding file in icons/svg/`);
});
console.log('✓ Two-way sync verified: every file has a key, every key has a file');

// 4. Verify that raw <svg> tags do not exist in component HTML templates
function verifyNoRawSvg(relPath) {
    console.log(`\nChecking component templates in ${relPath} for raw <svg> tags...`);
    const code = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const lines = code.split('\n');
    let insideGetSvgIcon = false;
    const rawSvgLines = [];

    lines.forEach((line, lineIdx) => {
        // Skip inside getSvgIcon implementation
        if (line.includes('function getSvgIcon(')) insideGetSvgIcon = true;
        if (insideGetSvgIcon && line.includes('return `<svg')) return;
        if (insideGetSvgIcon && line.includes('}')) insideGetSvgIcon = false;

        // Skip comments
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

        if (!insideGetSvgIcon && line.includes('<svg')) {
            rawSvgLines.push({ lineNum: lineIdx + 1, text: trimmed });
        }
    });

    if (rawSvgLines.length > 0) {
        console.error(`Found raw <svg> tags in ${relPath}:`);
        rawSvgLines.forEach(err => console.error(`  Line ${err.lineNum}: ${err.text}`));
        assert.fail(`Raw <svg> tags found in component templates of ${relPath}. All icons must use getSvgIcon(...) or ICONS dictionary.`);
    }
    console.log(`✓ Zero raw <svg> strings in component templates of ${relPath}`);
}

verifyNoRawSvg('src/pe-module.js');
verifyNoRawSvg('src/injected.js');

console.log('\n=== ALL SVG ICONS ARE 100% SYNCED AND CENTRALIZED! ===');
