const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-supabase.js', 'utf8');
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed.json','utf8'));
const T = {
  current: null,
  volt:    {bg:'#0B0C0E',surface:'#15171A','surface-2':'#1F2226',line:'#2B2F35',ink:'#EEF0F2','ink-2':'#B4B9C1','ink-3':'#868C96',accent:'#C8F135',protein:'#FF8A4C',carbs:'#2EC4B6',fat:'#9D8CFF',water:'#4DA3FF',good:'#7FD858',warn:'#F2B43C',bad:'#FF6B5E'},
  electric:{bg:'#090E1A',surface:'#101727','surface-2':'#1A2336',line:'#25304A',ink:'#E8EDF7','ink-2':'#A8B3CB','ink-3':'#7B87A2',accent:'#22D3EE',protein:'#FF8A5B',carbs:'#34D399',fat:'#A78BFA',water:'#60A5FA',good:'#4ADE80',warn:'#FBBF24',bad:'#F87171'},
  violet:  {bg:'#0D0A13',surface:'#16111E','surface-2':'#211A2C',line:'#30273E',ink:'#EFEAF6','ink-2':'#BAB1CA','ink-3':'#8D839E',accent:'#A970FF',protein:'#FF8F5A',carbs:'#2DD4BF',fat:'#F472B6',water:'#60A5FA',good:'#6EE7A0',warn:'#FBBF24',bad:'#FB7185'},
};
(async () => {
  const b = await chromium.launch();
  for (const [name, t] of Object.entries(T)) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, colorScheme:'dark' });
    const p = await ctx.newPage();
    await p.addInitScript(`window.__SEED__=${JSON.stringify(seed)};`);
    await p.route(/^https:\/\/(?!cdn\.jsdelivr|fonts)/, r => r.abort());
    await p.route(/cdn\.jsdelivr\.net\/npm\/@supabase/, r => r.fulfill({ contentType:'application/javascript', body: stub }));
    await p.goto('http://localhost:8765/', { waitUntil:'load' }); await p.waitForTimeout(1200);
    if (t) {
      const vars = Object.entries(t).map(([k,v])=>`--${k}:${v};`).join('');
      await p.addStyleTag({ content: `:root:not([data-theme="light"]){${vars}--btn:${t.accent};--btn-ink:${t.bg};--focus:${t.accent}} .brand span{color:var(--accent)} .tab[aria-current="page"]{background:var(--accent);color:var(--bg)} .daychip{border-color:var(--line)}` });
    }
    await p.fill('#logText', '2 roti, 1 katori dal, 200 g curd rice, 500 ml water'); await p.click('[data-action=log]'); await p.waitForTimeout(700);
    await p.evaluate(()=>window.scrollTo(0,0));
    await p.screenshot({ path: `${__dirname}/themes/${name}.png` }); console.log('shot', name);
    await ctx.close();
  }
  await b.close();
})();
