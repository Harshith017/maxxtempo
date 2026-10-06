const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const earthy = {protein:'#C0643A', carbs:'#B8901A', fat:'#7B5EA7', water:'#3C7FB8', good:'#2F8A3A', warn:'#B7791F', bad:'#C0453A'};
const T = {
  'forest-offwhite': {dark:false, v:{...earthy, bg:'#F6F4EF', surface:'#FFFFFF', 'surface-2':'#ECE9E2', line:'#DEDAD1', ink:'#1E2A22', 'ink-2':'#4B5A50', 'ink-3':'#76847B', accent:'#228B22', 'accent-ink':'#FFFFFF', 'accent-text':'#1E7A1E'}},
  'kelly-gray':      {dark:false, v:{...earthy, bg:'#EEF1EE', surface:'#FFFFFF', 'surface-2':'#E2E7E2', line:'#D1D8D1', ink:'#17231B', 'ink-2':'#46554B', 'ink-3':'#708076', accent:'#4CBB17', 'accent-ink':'#0F1A12', 'accent-text':'#2F8A0C'}},
  'forest-bars':     {dark:false, bars:'#1F4D2B', v:{...earthy, bg:'#F2F3F0', surface:'#FFFFFF', 'surface-2':'#E6E9E4', line:'#D6DBD4', ink:'#1B2620', 'ink-2':'#4A574F', 'ink-3':'#748078', accent:'#228B22', 'accent-ink':'#FFFFFF', 'accent-text':'#1E7A1E'}},
  'forest-dark':     {dark:true, v:{protein:'#E08A5E', carbs:'#D9B44A', fat:'#A98BD6', water:'#6FA8D8', good:'#7CCB6B', warn:'#E0A33A', bad:'#E8776A', bg:'#0F1A13', surface:'#16241B', 'surface-2':'#1F3226', line:'#2A4032', ink:'#F1F0EA', 'ink-2':'#C2C8BE', 'ink-3':'#8F9A90', accent:'#4CBB17', 'accent-ink':'#0F1A13', 'accent-text':'#6FD13A'}},
};
(async () => {
  const b = await chromium.launch();
  for (const [name, t] of Object.entries(T)) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme: t.dark?'dark':'light' });
    const p = await ctx.newPage();
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/^https:\/\/(?!cdn\.jsdelivr|fonts)/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
    await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200);
    const vars = Object.entries(t.v).map(([k,v])=>`--${k}:${v};`).join('');
    let css = `:root, :root:not([data-theme="light"]){${vars}--btn:var(--accent);--btn-ink:var(--accent-ink);--focus:var(--accent);color-scheme:${t.dark?'dark':'light'}}
      .brand span{color:var(--accent-text)} .tab[aria-current="page"]{background:var(--accent);color:var(--accent-ink)} .dcell:first-child .meter i{background:var(--accent)!important}`;
    if (t.bars) css += `.top{background:${t.bars}!important;box-shadow:0 0 0 100vmax ${t.bars}!important;border-bottom-color:${t.bars}!important} .brand{color:#F4F3EE} .brand span{color:#9BE07A}
      .daychip,.iconbtn.gear{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:#F4F3EE} .gear svg{stroke:#F4F3EE}
      .tabs{background:${t.bars}!important;border-top-color:${t.bars}!important} .tab{color:rgba(244,243,238,.72)} .tab[aria-current="page"]{background:#F4F3EE;color:${t.bars}}`;
    await p.addStyleTag({ content: css });
    await p.fill('#logText', '2 roti, 1 katori dal, 200 g curd rice, 500 ml water'); await p.click('[data-action=log]'); await p.waitForTimeout(700);
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.screenshot({ path: `${__dirname}/greens/${name}.png` }); console.log('shot', name);
    await ctx.close();
  }
  await b.close();
})();
