// Централизованный словарь векторных SVG-иконок проекта
// Синхронизирован 1-в-1 с эталонными файлами в icons/svg/
(function (global) {
    'use strict';

    const MSE_ICONS = {
        'ban': '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
        'calendar-search': '<path d="M16 2v3"/><path d="M21 10.69V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h7.25"/><path d="m22 21-1.875-1.875"/><path d="M3 9h18"/><path d="M8 2v3"/><circle cx="18" cy="17" r="3"/>',
        'calendar': '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
        'check': '<path d="M20 6 9 17l-5-5"/>',
        'chevron-down': '<path d="m6 9 6 6 6-6"/>',
        'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
        'graduation-cap': '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
        'heart': '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
        'move-right': '<path d="M18 8L22 12L18 16"/><path d="M2 12H22"/>',
        'refresh-ccw': '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
        'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        'user-group': '<path d="M17 21v-1a2 2 0 00-2-2H9a2 2 0 00-2 2v1"/><path d="M19 10h1a2 2 0 012 2v1"/><path d="M5 10H4a2 2 0 00-2 2v1"/><circle cx="12" cy="11" r="3"/><circle cx="18" cy="4" r="2"/><circle cx="6" cy="4" r="2"/>',
        'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
        'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        'x': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
    };

    function getSvgIcon(name, { size = 16, width, height, strokeWidth = 2, fill = 'none', className = '', style = '' } = {}) {
        const w = width || size;
        const h = height || size;
        const inner = MSE_ICONS[name] || '';
        const classAttr = className ? ` class="${className}"` : '';
        const styleAttr = style ? ` style="${style}"` : '';
        return `<svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${classAttr}${styleAttr}>${inner}</svg>`;
    }

    global.MSE_ICONS = MSE_ICONS;
    global.getSvgIcon = getSvgIcon;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { MSE_ICONS, getSvgIcon };
    }
})(typeof window !== 'undefined' ? window : globalThis);
