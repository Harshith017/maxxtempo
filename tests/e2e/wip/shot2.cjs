const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:390,height:1400}}); await p.goto('file://'+__dirname+'/trends-new.png'); await p.screenshot({path:__dirname+'/trends-top.png', clip:{x:0,y:0,width:390,height:1400}}); await b.close(); })();
