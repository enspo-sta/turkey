// Bundles the game into a single self-contained HTML file (fonts, CSS and JS
// inlined) plus an artifact-friendly fragment and PWA files.
// Usage: node build.mjs [--dev]
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { privacyPage } from './src/ui/privacy.js';

const dev = process.argv.includes('--dev');
mkdirSync('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: ['es2020', 'safari15'],
  write: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
});
let js = result.outputFiles[0].text;
// never let the script close its own tag when inlined
js = js.replace(/<\/script/gi, '<\\/script');

const fontFaces = [
  ['Barlow Condensed', 500, 'BarlowCondensed-500.woff2'],
  ['Barlow Condensed', 700, 'BarlowCondensed-700.woff2'],
  ['Barlow Condensed', 800, 'BarlowCondensed-800.woff2'],
  ['Shrikhand', 400, 'Shrikhand-400.woff2'],
  ['Yellowtail', 400, 'Yellowtail-400.woff2'],
]
  .map(([family, weight, file]) => {
    const b64 = readFileSync(`assets/fonts/${file}`).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  })
  .join('\n');

const css = fontFaces + '\n' + readFileSync('src/ui/styles.css', 'utf8');
const body = readFileSync('src/ui/body.html', 'utf8');

const title = 'Ruben Hotrod Fishing';
const icon = existsSync('assets/icons/icon-180.png')
  ? `<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" type="image/png" href="icon-192.png">`
  : '';

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hotrod Fishing">
<meta name="theme-color" content="#0d1a1f">
<meta name="description" content="Ruben Hotrod Fishing: a first-person Alaskan fishing and hunting adventure. Drive your hot rod between fishing spots, cast with the timing meter, and keep your rifle ready for grizzlies.">
<link rel="manifest" href="manifest.webmanifest">
${icon}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync('dist/index.html', full);

// Artifact fragment: the host supplies doctype/head/body; title and style come first.
const fragment = `<title>${title}</title>
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
mkdirSync('build', { recursive: true });
writeFileSync('build/artifact.html', fragment);

const manifest = {
  name: 'Ruben Hotrod Fishing',
  short_name: 'Hotrod Fishing',
  description: 'First-person Alaskan fishing and hunting adventure.',
  start_url: './',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0d1a1f',
  theme_color: '#0d1a1f',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2));
// privacy policy page for the App Store listing, hosted next to the game
writeFileSync('dist/privacy.html', privacyPage());
for (const s of [180, 192, 512]) {
  const f = `assets/icons/icon-${s}.png`;
  if (existsSync(f)) copyFileSync(f, `dist/icon-${s}.png`);
}

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`built dist/index.html ${kb(full.length)} (js ${kb(js.length)})${dev ? ' [dev]' : ''}`);
