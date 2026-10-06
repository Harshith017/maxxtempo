/* Runs the browser tests: serves the app on http://localhost:8765 (what the tests
   expect), runs each test file in turn, and fails if any prints FAIL or crashes.
   Usage: node tests/e2e/run.cjs [name ...]   (no names: every test in TESTS) */
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..'), PORT = 8765;
const TESTS = require('./tests.json');
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.png':'image/png', '.css':'text/css', '.webmanifest':'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : TESTS;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  const bad = [];
  for (const n of names) {
    const file = path.join(__dirname, n.endsWith('.cjs') ? n : n + '.cjs'), t0 = Date.now();
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 240000, env: { ...process.env } });
    const out = (r.stdout || '') + (r.stderr || ''), fails = out.split('\n').filter(l => l.startsWith('FAIL'));
    const ok = r.status === 0 && !fails.length;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    if (!ok) { bad.push(n); console.log((fails.length ? fails.join('\n') : out.slice(-1500)).replace(/^/gm, '     ')); }
  }
  console.log(bad.length ? `\n${bad.length} of ${names.length} failed: ${bad.join(', ')}` : `\nAll ${names.length} passed.`);
  server.close(); process.exit(bad.length ? 1 : 0);
});
