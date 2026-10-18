// Wraps the FatBoy page in a document, bundles the Supabase bridge and writes www/index.html.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('cloud/config.json', 'utf8'));
const url = process.env.SUPABASE_URL || config.url;
const anonKey = process.env.SUPABASE_ANON_KEY || config.anonKey;

const { outputFiles } = await build({
  entryPoints: ['cloud/bridge.js'],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'chrome100',
  define: { __SUPABASE_URL__: JSON.stringify(url), __SUPABASE_ANON_KEY__: JSON.stringify(anonKey) },
});

const page = readFileSync('app/FatBoy.html', 'utf8');
// The bridge must exist before the page's own script runs, and that script is the last one.
const at = page.lastIndexOf('<script>');
const withBridge = `${page.slice(0, at)}<script>${outputFiles[0].text}</script>\n${page.slice(at)}`;

mkdirSync('www', { recursive: true });
writeFileSync('www/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0c0f">
${withBridge}
</body>
</html>
`);
console.log(url ? 'Accounts on' : 'Accounts off (no Supabase URL set)', '-', withBridge.length, 'bytes');
