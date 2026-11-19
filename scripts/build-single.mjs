// 파일 하나짜리 버전 만들기: dist/cat-mail-carrier.html (메신저로 보내거나 claude.ai 공유 페이지로 올릴 때)
// 사용법: npm run build:single            → 완전한 HTML 문서
//         node scripts/build-single.mjs --fragment  → <body> 안쪽만 (claude.ai 게시용)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = p => readFileSync(join(ROOT, p), 'utf8');
const fragment = process.argv.includes('--fragment');
const html = read('index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src='));
const config = read('js/config.js').replace("apiBase: 'auto'", "apiBase: ''").replace('serviceWorker: true', 'serviceWorker: false');
const js = [config, read('js/ops.js'), read('js/board.js'), read('js/game.js'), read('js/board-ui.js')].join('\n;\n');
const head = `<title>고양이 우편배달부</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&family=Nanum+Brush+Script&display=swap">
<style>
${read('css/style.css')}</style>`;
const inner = `${head}
${body.replace(/<noscript>.*?<\/noscript>\n?/s, '')}<script>
${js}
</script>
`;
const out = fragment ? inner : `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n${inner}</body>\n</html>\n`;
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const file = join(ROOT, 'dist', fragment ? 'cat-mail-carrier.fragment.html' : 'cat-mail-carrier.html');
writeFileSync(file, out);
console.log(file, (out.length / 1024).toFixed(0) + ' KB');
