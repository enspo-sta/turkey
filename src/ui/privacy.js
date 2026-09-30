// The privacy policy, kept in one place: the game's Privacy screen shows it
// and build.mjs writes it to dist/privacy.html for the App Store's privacy
// policy link.
export const PRIVACY_UPDATED = '30 September 2026';

export const PRIVACY_SECTIONS = [
  [
    'In short',
    'Ruben Hotrod Fishing does not collect any personal data. There are no accounts, no sign-in, no advertising, no analytics and no tracking, and the game does not share anything with anyone.',
  ],
  [
    'What the game stores',
    'Your progress (money, catches, gear, the fish journal, challenges and settings) is saved only on your own device: inside the app on iPhone and iPad, or in your browser’s website storage when you play on the web. It is never sent to the developer or to anyone else.',
  ],
  [
    'Network use',
    'The iPhone and iPad app runs entirely on the device and makes no network connections. When you play in a web browser, the website that hosts the game receives the ordinary technical information every web request carries, such as your IP address, under that host’s own policy. The game itself sends nothing.',
  ],
  [
    'Deleting your data',
    'Delete the app, or clear the website data in your browser, to remove your saved progress. Reset progress in the game’s Settings, or starting a new game, also replaces it.',
  ],
  ['Children', 'The game collects no personal data from anyone, children included.'],
  ['Changes', 'If this policy changes, the new version will be published at the same address with a new date.'],
  [
    'Contact',
    'Questions about privacy or the game can be raised at https://github.com/enspo-sta/turkey/issues',
  ],
];

// Plain HTML for the policy body (no page chrome), with the contact address
// turned into a link.
export function privacyHTML() {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const link = (s) => esc(s).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return PRIVACY_SECTIONS.map(([h, p]) => `<h3>${esc(h)}</h3><p>${link(p)}</p>`).join('\n');
}

// Standalone page for hosting next to the game.
export function privacyPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ruben Hotrod Fishing privacy policy</title>
<style>
:root { color-scheme: dark; --bg: #0d1a1f; --panel: #11232a; --ink: #f4ead6; --dim: #c9c0ad; --flame: #ffcc3a; --link: #7fd6cf; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body { font: 17px/1.65 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; padding: 32px 16px 48px; }
main { max-width: 68ch; margin: 0 auto; }
h1 { font-size: 30px; line-height: 1.2; margin: 0 0 6px; color: var(--flame); }
.updated { color: var(--dim); margin: 0 0 28px; }
h3 { font-size: 19px; margin: 26px 0 6px; }
p { margin: 0; }
a { color: var(--link); }
</style>
</head>
<body>
<main>
<h1>Ruben Hotrod Fishing: privacy policy</h1>
<p class="updated">Last updated ${PRIVACY_UPDATED}</p>
${privacyHTML()}
</main>
</body>
</html>
`;
}
