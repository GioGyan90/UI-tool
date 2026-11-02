const paths = {
head:'<circle cx="12" cy="10" r="7"/><path d="M8 16v4h8v-4M9 10h.01m6 0h.01"/>',
neck:'<path d="M8 3v7l-5 5v6h18v-6l-5-5V3M8 14l4 3 4-3"/>',
hair:'<path d="M5 14c-3-6 0-11 7-11s10 5 7 11l-2-4-2 2-1-5-4 5-2-3-3 5Z"/><path d="M7 14v3c1 4 9 4 10 0v-3"/>',
'hair-back':'<path d="M6 6c0-5 12-5 12 0 0 4 3 9 3 15l-5-3-4 4-4-4-5 3c0-6 3-11 3-15Z"/><path d="M8 8v6m4-8v10m4-8v6"/>',
'outer-back':'<path d="m7 3 5 2 5-2 4 18H3L7 3Z"/><path d="M12 5v16M6 8h12M5 18h14"/>',
top:'<path d="m8 4-5 3-2 5 4 2 1-3v10h12V11l1 3 4-2-2-5-5-3c-1 4-7 4-8 0Z"/>',
outer:'<path d="m9 3-5 3-2 14 4 1 2-12-1 12h10L16 9l2 12 4-1-2-14-5-3"/><path d="m9 3 3 5 3-5M12 8v13M8 12h2m4 0h2"/>',
pants:'<path d="M6 3h12l2 18h-6l-2-11-2 11H4L6 3Z"/><path d="M6 7h12M12 3v7M8 7v2m8-2v2"/>',
shoes:'<path d="M5 9h7l2 5 7 3v4H3V11l2-2Z"/><path d="M3 18h18M10 10l3 1m-2 2 3 1"/>',
body:'<circle cx="12" cy="5" r="3"/><path d="M5 21v-6a7 7 0 0 1 14 0v6M9 21v-5m6 5v-5"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
'eye-off':'<path d="m3 3 18 18M10 5c7-2 12 7 12 7s-2 3-5 5M6 6l-4 6s5 9 13 6"/>',
layers:'<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
room:'<path d="M4 21V5l9-2v18M4 21H2m11 0h9M13 5h7v16M10 12v2"/>',
grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
save:'<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8"/>',
external:'<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
download:'<path d="M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m5 5 14 14M19 5 5 19"/>',
'arrow-right':'<path d="M4 12h16m-6-6 6 6-6 6"/>','arrow-up-right':'<path d="M5 19 19 5M6 5h13v13"/>',
expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>',reset:'<path d="M3 4v6h6M3 10a9 9 0 1 1 1 8"/>',
help:'<circle cx="12" cy="12" r="9"/><path d="M9 9c0-4 7-4 6 0 0 2-3 2-3 5m0 3h.01"/>',sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-2v4m-2-2h4"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
export function iconize() {
  for (const node of document.querySelectorAll('[data-icon]')) node.outerHTML = icon(node.dataset.icon);
}
