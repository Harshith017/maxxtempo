const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="1" x2="0.4" y2="0"><stop offset="0" stop-color="#6366F1"/><stop offset="0.55" stop-color="#A855F7"/><stop offset="1" stop-color="#E879F9"/></linearGradient><radialGradient id="h" cx="0.5" cy="0.42" r="0.5"><stop offset="0" stop-color="#2A1650"/><stop offset="1" stop-color="#07060B"/></radialGradient></defs><rect width="512" height="512" fill="url(#h)"/>
  <path d="M256 102 C302 150 320 190 320 223 C320 259 291 285 256 285 C221 285 192 259 192 223 C192 197 205 176 220 161 C222 180 231 193 243 197 C236 166 240 133 256 102 Z" fill="url(#g)"/>
  <rect x="138" y="318" width="236" height="20" rx="6" fill="#F5F3FA"/>
  <rect x="110" y="298" width="28" height="60" rx="7" fill="#F5F3FA"/><rect x="146" y="282" width="30" height="92" rx="8" fill="#F5F3FA"/>
  <rect x="336" y="282" width="30" height="92" rx="8" fill="#F5F3FA"/><rect x="374" y="298" width="28" height="60" rx="7" fill="#F5F3FA"/>
</svg>`;
(async () => {
  const b = await chromium.launch();
  for (const size of [512, 192, 180]) {
    const p = await b.newPage({ viewport:{width:size, height:size}, deviceScaleFactor:1 });
    await p.setContent(`<html><body style="margin:0">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({ path: `/home/user/fuel-lift/icon-${size}.png`, clip:{x:0,y:0,width:size,height:size} }); await p.close();
  }
  await b.close(); console.log('icons written');
})();
