/* MaxxTempo — app. Ported from the claude.ai artifact: storage now goes
   through backend.js (Supabase + offline cache), AI through the `claude`
   edge function, and every number through calc.js. */
(() => {
'use strict';
const Calc = window.Calc;

/* ---------- constants ---------- */
const MICROS = [
  {key:'sodium_mg',label:'Sodium',unit:'mg',kind:'limit'},
  {key:'cholesterol_mg',label:'Cholesterol',unit:'mg',kind:'limit'},
  {key:'sat_fat_g',label:'Saturated fat',unit:'g',kind:'limit'},
  {key:'potassium_mg',label:'Potassium',unit:'mg'},
  {key:'calcium_mg',label:'Calcium',unit:'mg'},
  {key:'iron_mg',label:'Iron',unit:'mg'},
  {key:'magnesium_mg',label:'Magnesium',unit:'mg'},
  {key:'zinc_mg',label:'Zinc',unit:'mg'},
  {key:'vitamin_a_mcg',label:'Vitamin A',unit:'mcg'},
  {key:'vitamin_c_mg',label:'Vitamin C',unit:'mg'},
  {key:'vitamin_d_mcg',label:'Vitamin D',unit:'mcg'},
  {key:'vitamin_b12_mcg',label:'Vitamin B12',unit:'mcg'},
  {key:'folate_mcg',label:'Folate',unit:'mcg'},
  {key:'omega3_g',label:'Omega-3',unit:'g'},
];
const RDA = {
  male:{cholesterol_mg:300,sodium_mg:2000,potassium_mg:3400,calcium_mg:1000,iron_mg:8,magnesium_mg:400,zinc_mg:11,vitamin_a_mcg:900,vitamin_c_mg:90,vitamin_d_mcg:15,vitamin_b12_mcg:2.4,folate_mcg:400,omega3_g:1.6},
  female:{cholesterol_mg:300,sodium_mg:2000,potassium_mg:2600,calcium_mg:1000,iron_mg:18,magnesium_mg:310,zinc_mg:8,vitamin_a_mcg:700,vitamin_c_mg:75,vitamin_d_mcg:15,vitamin_b12_mcg:2.4,folate_mcg:400,omega3_g:1.1},
};
// Daily life only. Logged gym and sport sessions are added on the day you do them.
const ACTIVITY = Object.fromEntries(Calc.ACTIVITY_LEVELS.map(l => [l.id, {f:l.factor, label:l.label}]));
const actId = a => a==='athlete' ? 'very' : (ACTIVITY[a] ? a : 'light');
const GOALS = {lose:{label:'Lose fat',ppk:2.0},maintain:{label:'Maintain / recomp',ppk:1.6},gain:{label:'Build muscle',ppk:1.8}};
const DEFAULT_PROFILE = {name:'',sex:'male',age:25,birth:'',body_fat:null,maint_source:'auto',eat_back:true,height_cm:170,weight_kg:70,activity:'light',goal:'maintain',goal_rate:0.5,calorie_override:null,protein_override:null,carbs_override:null,fat_override:null,water_override_ml:null,steps_goal:10000,stack:[],watch_workouts:false};
const MEALS = ['breakfast','lunch','snack','dinner'];
const MUSCLES = ['chest','back','shoulders','biceps','triceps','legs','glutes','core','full body','cardio'];
const EXAMPLES = [
  '200g chicken breast, 150g cooked rice, 1 tbsp ghee',
  '2 rotis, 1 katori dal, 100g paneer bhurji',
  '500ml water',
  'slept 6h 50m, 8400 steps',
];

/* ---------- helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const localDate = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const nowTime = (d=new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const addDays = (date,n) => { const t=new Date(date+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10); };
const weekStart = date => { const t=new Date(date+'T00:00:00Z'); return addDays(date, -((t.getUTCDay()+6)%7)); };
const monthStart = date => date.slice(0,8)+'01';
const fmtDate = (date,opts={weekday:'short',day:'numeric',month:'short'}) => new Date(date+'T00:00:00').toLocaleDateString('en-IN',opts);
const n0 = v => Math.round(Number(v)||0).toLocaleString('en-IN');
const fmtL = ml => { const l = Math.round((ml||0)/10)/100; return String(l); };
const n1 = v => { const x=Math.round((Number(v)||0)*10)/10; return x.toLocaleString('en-IN',{maximumFractionDigits:1}); };
const fmtAmt = (v,unit) => (unit==='g'||unit==='mcg'&&v<10 ? n1(v) : n0(v));
const num = (v,max=1e5) => { const x=Number(v); return Number.isFinite(x)&&x>0 ? Math.min(x,max) : 0; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(16).slice(2)).slice(0,12);
const titleCase = s => String(s||'').trim().replace(/\s+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const exKey = s => String(s||'').trim().toLowerCase().replace(/\s+/g,' ');

/* Who the person is on a given date: age from date of birth, and the smoothed
   weight trend (a single heavy morning shouldn't move every target). */
function weightPoints(){ const pts=[]; for (const [date,d] of S.days) if (d.weight_kg>0) pts.push({date, kg:d.weight_kg}); return pts.sort((a,b)=>a.date<b.date?-1:1); }
let _trend = {rev:-1, pts:[]};
function trendPoints(){ if (_trend.rev!==S.rev) _trend = {rev:S.rev, pts:Calc.weightTrend(weightPoints())}; return _trend.pts; }
function trendWeight(date, p){
  const pts = trendPoints(); let last=null;
  for (const x of pts) { if (x.date<=date) last=x; else break; }
  return last ? last.trend : (pts.length ? pts[0].trend : (Number(p.weight_kg)||70));
}
function ageOf(p, date){ const a = p.birth ? Calc.ageOn(p.birth, date||localDate()) : NaN; return a>=10 && a<=110 ? a : (Number(p.age)||25); }
function whoOf(p, date){
  date = date || localDate();
  const kg = trendWeight(date, p), age = ageOf(p, date), cm = Number(p.height_cm)||170, sex = p.sex==='female'?'female':'male';
  const b = Calc.bmr({sex, kg, cm, age, bodyFat:p.body_fat});
  return {sex, kg, cm, age, bmrKcal:b.kcal, bmrMethod:b.method};
}
const who = date => whoOf(prof(), date);

/* Measured maintenance: energy balance over the last 28 days of full logs. */
function adaptiveFor(date, p){
  if (!S._adapt || S._adapt.rev!==S.rev) {
    const sums = {};
    for (const [d, day] of S.days) {
      if (!(day.foods||[]).length) continue;
      const t = dayTotals(day);
      sums[d] = {intake:t.kcal, exerciseNet:t.burned, complete:day.incomplete!==true};
    }
    S._adapt = {rev:S.rev, sums, weights:weightPoints(), byDate:{}};
  }
  const A = S._adapt;
  return A.byDate[date] ||= Calc.adaptiveMaintenance(A.sums, A.weights, addDays(date,-1), 28, whoOf(p, date).bmrKcal);
}

function computeTargets(p, date){
  date = date || S.date || localDate();
  const w = whoOf(p, date), sex = w.sex, kg = w.kg;
  const lvl = ACTIVITY[actId(p.activity)];
  const formula = w.bmrKcal*lvl.f;
  const ad = adaptiveFor(date, p);
  const useAd = p.maint_source!=='formula' && ad.ready;
  const maint = useAd ? ad.baseWithoutExercise : formula;
  const goal = GOALS[p.goal]?p.goal:'maintain';
  const rate = Math.min(Math.max(Number(p.goal_rate)||0,0), goal==='gain'?0.5:1);
  const tg = Calc.calorieTarget({maintenance:maint, goal, rateKgWeek:goal==='maintain'?0:rate, sex, bmrKcal:w.bmrKcal});
  let kcal = Math.round(tg.kcal/10)*10;
  if (Number(p.calorie_override)>0) kcal = Math.round(Number(p.calorie_override));
  const ppk = GOALS[goal].ppk, auto = Calc.macroTargets(kcal, kg, w.cm, ppk);
  const protein = Number(p.protein_override)>0 ? Math.round(Number(p.protein_override)) : auto.p;
  const co = Number(p.carbs_override)>0 ? Math.round(Number(p.carbs_override)) : null;
  const fo = Number(p.fat_override)>0 ? Math.round(Number(p.fat_override)) : null;
  let fat, carbs;
  if (co && fo) { carbs=co; fat=fo; if (!(Number(p.calorie_override)>0)) kcal = protein*4+carbs*4+fat*9; }
  else if (co) { carbs=co; fat=Math.max(Math.round((kcal-protein*4-carbs*4)/9),0); }
  else if (fo) { fat=fo; carbs=Math.max(Math.round((kcal-protein*4-fat*9)/4),0); }
  else { fat=Math.max(Math.round(kcal*0.25/9), Math.round(0.6*kg)); carbs=Math.max(Math.round((kcal-protein*4-fat*9)/4),0); }
  const out = {bmr:Math.round(w.bmrKcal), bmrMethod:w.bmrMethod, age:w.age, weight:kg, refKg:auto.refKg, level:lvl,
    tdee:Math.round(formula), maint:Math.round(maint), maintSource:useAd?'measured':'formula', adaptive:ad,
    goalDelta:Math.round(tg.delta), floored:tg.floored && !(Number(p.calorie_override)>0), floor:tg.floor,
    kcal,protein,carbs,fat,
    fiber: Number(p.fiber_override)>0 ? Number(p.fiber_override) : Math.round(kcal/1000*14), sugar:Math.round(kcal*0.1/4),
    water_ml: Number(p.water_override_ml)>0 ? Number(p.water_override_ml) : Math.round(kg*35/250)*250,
    micros:{...Calc.microTargets(sex, w.age), sat_fat_g:Math.round(kcal*0.1/9)}, focus:[]};
  const ra = p.report_adjust;
  if (ra) {
    if (ra.sat_fat_pct) out.micros.sat_fat_g = Math.round(kcal*ra.sat_fat_pct/100/9);
    if (ra.cholesterol_mg) out.micros.cholesterol_mg = ra.cholesterol_mg;
    if (ra.sodium_mg) out.micros.sodium_mg = ra.sodium_mg;
    if (ra.sugar_pct) out.sugar = Math.round(kcal*ra.sugar_pct/100/4);
    if (ra.fiber_g) out.fiber = Math.max(out.fiber, ra.fiber_g);
    for (const [k,v] of Object.entries(ra.micro_targets||{})) if (k in out.micros) out.micros[k] = Math.max(out.micros[k], v);
    out.focus = ra.focus||[];
  }
  return out;
}
/* Targets for one day: the base target plus the net calories of that day's
   training (carbs carry the extra, since that's what training burns most). */
function dayTargets(day, T){
  T = T || computeTargets(prof(), day.date);
  const p = prof(), ex = dayTotals(day).burned;
  const add = p.eat_back===false || Number(p.calorie_override)>0 ? 0 : Math.round(ex);
  return {...T, base:T.kcal, training:add, kcal:T.kcal+add, carbs:T.carbs+Math.round(add/4), fiber: Number(p.fiber_override)>0 ? T.fiber : Math.round((T.kcal+add)/1000*14)};
}

/* ---------- state ---------- */
const S = {
  db:null, sample:null, dbState:'connecting', aiState:'connecting', canPhoto:false,
  profile:null, days:new Map(), date:localDate(), view:'today',
  gymPeriod:'week', gymEx:null, trendRange:30,
  libFoods:[], libBusy:false, libStatus:'', mcp:null,
  myFoods:{}, myFoodsVer:0, _fidx:null, _fidxVer:-1,
  reports:[], repSel:null, repMarker:null, repBusy:false, repStatus:'', reviews:[], plans:[], planBusy:false, planStatus:'', planFor:null, planNote:'', revBusy:false, revStatus:'',
  queue:[], qBusy:false, qStatus:'', setup:null, setupShown:false,
  photo:null, photoUrl:null, busy:false, ctl:null, status:'', statusErr:false,
  rev:0, openFolds:(()=>{ try { return new Set(JSON.parse(localStorage.getItem('fl:folds')||'[]')); } catch { return new Set(); } })(), hidden:(()=>{ try { return new Set(JSON.parse(localStorage.getItem('fl:hidden')||'[]')); } catch { return new Set(); } })(), sync:'saving', user:null, usage:null, auth:{step:'email', email:'', msg:'', busy:false},
};
const prof = () => ({...DEFAULT_PROFILE, ...(S.profile||{})});
const targets = (date) => computeTargets(prof(), date);
const suggestedTargets = () => computeTargets({...prof(), calorie_override:null, protein_override:null, carbs_override:null, fat_override:null, fiber_override:null, water_override_ml:null}, localDate());
const emptyDay = date => ({date, foods:[], water:[], exercises:[], weight_kg:null});
const getDay = date => S.days.get(date) || emptyDay(date);
function mergeDays(){
  const m = new Map(S.daysRaw || []);
  for (const [date, h] of S.healthSync || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const add = {}; for (const k of ['steps','active_kcal','resting_kcal','sleep_min']) if (Number(h[k]) >= 0 && h[k] != null) add[k] = Number(h[k]);
    const d = m.get(date) || emptyDay(date);
    m.set(date, {...d, date, health:{...(d.health||{}), ...add}, health_synced_at:h.synced_at || null});
  }
  S.days = m;
}

/* ---------- storage ---------- */
const queues = {};
function writeDay(date, mutate){
  const run = async () => {
    const cur = structuredClone(getDay(date));
    mutate(cur);
    cur.date = date; cur.updated_at = Date.now();
    S.days.set(date, cur); S.rev++; render();
    if (!S.db) throw {code:'no_db'};
    await S.db.doc('days/'+date).set(cur);
    S.rev++;
  };
  const p = (queues[date]||Promise.resolve()).then(run, run);
  queues[date] = p.catch(()=>{});
  return p.catch(e => { toast(e?.code==='no_db' ? 'Not saved: sign in first.' : 'Couldn’t save that change. Try again.'); });
}
let profQ = Promise.resolve();
function saveProfile(p){
  S.profile = p; S.rev++; render();
  if (!S.db) { toast('Not saved: sign in first.'); return; }
  profQ = profQ.then(() => S.db.doc('profile/me').set(p)).catch(() => toast('Couldn’t save your profile. Try again.'));
  return profQ;
}

/* ---------- derived numbers ---------- */
function dayTotals(day){
  const t = {kcal:0,protein:0,carbs:0,fat:0,fiber:0,sugar:0,micros:{}};
  MICROS.forEach(m => t.micros[m.key]=0);
  for (const sp of day.supplements||[]) for (const m of MICROS) t.micros[m.key]+= (sp.micros&&sp.micros[m.key])||0;
  for (const f of day.foods||[]) {
    t.kcal+=f.kcal||0; t.protein+=f.protein||0; t.carbs+=f.carbs||0; t.fat+=f.fat||0; t.fiber+=f.fiber||0; t.sugar+=addedSugar(f); t.sugar_all=(t.sugar_all||0)+(f.sugar||0);
    for (const m of MICROS) t.micros[m.key]+= (f.micros&&f.micros[m.key])||0;
  }
  t.alcohol = (day.foods||[]).reduce((s,f)=>s+(f.alcohol||0),0);
  // Fat from foods that say how much of it is saturated (restaurant menus often don't).
  t.fat_split = (day.foods||[]).reduce((s,f)=>s+(f.no_fat_split?0:(f.fat||0)),0);
  t.water = (day.water||[]).reduce((s,w)=>s+(w.ml||0),0);
  t.gym = (day.exercises||[]).reduce((s,e)=>s+(e.kcal||0),0);
  t.sport = (day.sports||[]).reduce((s,e)=>s+(e.kcal||0),0);
  t.burned = t.gym + t.sport;
  return t;
}
/* Net calories for one logged exercise (what it adds on top of resting).
   Cardio: heart rate (Keytel) > pace (ACSM) > MET, via calc.js.
   Lifting: Compendium METs over the session time (sets × ~2.5 min incl. rest);
   heavy sets (≤6 reps) are the vigorous 5.0, the rest 3.5. */
function exerciseKcal(ex, date){
  const w = who(date||S.date);
  if (ex.muscle_group==='cardio') {
    const name = String(ex.name||'').toLowerCase();
    // With a distance, walking and running use the ACSM pace equations; otherwise the MET.
    const activity = ex.distance_km>0 ? (/run|jog/.test(name) ? 'treadmill' : /walk|treadmill/.test(name) ? 'walk' : null) : null;
    const minutes = ex.duration_min>0 ? ex.duration_min : 0;
    if (minutes) {
      const e = Calc.workoutEnergy({activity, met:ex.met||(/run|jog/.test(name)?9.8:/walk/.test(name)?3.5:6), minutes, distanceKm:ex.distance_km, inclinePct:ex.incline_pct, avgHr:ex.avg_hr}, w);
      if (!activity && !ex.avg_hr && !ex.met && ex.kcal_hint>0) { ex.method='Estimated by AI'; ex.kcal_gross=ex.kcal_hint; return Math.round(Math.max(0, ex.kcal_hint - w.bmrKcal/1440*minutes)); }
      ex.method = e.method; ex.kcal_gross = Math.round(e.gross); return Math.round(e.net);
    }
    if (ex.kcal_hint>0) { ex.method='Estimated by AI'; return Math.round(ex.kcal_hint); }
    return 0;
  }
  const sets = ex.sets||[];
  const minutes = ex.duration_min>0 ? ex.duration_min : Math.max(3, sets.length*2.5);
  const heavy = sets.length && sets.filter(s=>s.reps<=6).length >= sets.length/2;
  const met = heavy ? 5.0 : 3.5;
  const e = Calc.netKcalFromMet(met, w.kg, minutes, w.bmrKcal);
  ex.method = `MET ${met} × ${n0(minutes)} min`; ex.kcal_gross = Math.round(e.gross);
  return Math.round(e.net);
}
const SPORTS = ['badminton','cricket','football','running','cycling','swimming','tennis','other'];
function sportKcal(a, date){
  const W = who(date||S.date); const k = (met,min) => Calc.netKcalFromMet(met, W.kg, min, W.bmrKcal).net;
  if (a.sport==='badminton') return Math.round(k(a.format==='singles'?7:a.intensity==='light'?4.5:5.5, a.minutes||0));
  if (a.sport==='cricket') {
    const match = a.session==='match'; let kc=0, used=0;
    if (a.balls_bowled) { const met={pace:6.5,medium:5.5,spin:4.5}[a.bowling_style]||5.5; const min=a.balls_bowled*(match?0.67:1); kc+=k(met,min); used+=min; }
    const bat = a.minutes_batted || (a.balls_faced ? a.balls_faced*(match?0.6:0.4) : 0);
    if (bat) { kc+=k(match?5.5:4.5, bat); used+=bat; }
    if (a.overs_fielded) { const min=a.overs_fielded*4; kc+=k(3.5,min); used+=min; }
    if (a.minutes && a.minutes>used) kc += k(used?(match?3.5:2.5):4.8, a.minutes-used);
    return Math.round(kc);
  }
  return Math.round(k(a.met||6, a.minutes||0));
}
function sportLine(a){
  const bits=[];
  if (a.format) bits.push(a.format);
  if (a.minutes) bits.push(`${n0(a.minutes)} min`);
  if (a.balls_bowled) bits.push(`bowled ${a.balls_bowled%6===0?`${a.balls_bowled/6} overs`:`${a.balls_bowled} balls`}${a.bowling_style?` (${a.bowling_style})`:''}`);
  if (a.balls_faced) bits.push(`faced ${a.balls_faced} balls`);
  if (a.minutes_batted) bits.push(`batted ${n0(a.minutes_batted)} min`);
  if (a.overs_fielded) bits.push(`fielded ${a.overs_fielded} overs`);
  return bits.join(' · ');
}
const sportTitle = a => titleCase(a.sport==='other'&&a.name?a.name:a.sport) + (a.session&&a.sport==='cricket'?` ${a.session}`:'');
/* Calories burned by moving: logged training and sports, plus walking.
   Resting burn (breathing, digestion) is left out on purpose.
   With Apple Health active energy, that already covers steps (and workouts
   when the Watch recorded them); otherwise steps are estimated. */
// Walking: stride ≈ 41.5% of height; net cost ≈ 0.5 kcal per kg per km above resting.
const stepsKcal = (steps, w) => Math.round((Number(steps)||0) * (w.cm*0.415/100) / 1000 * 0.5 * w.kg);
function burnedTotal(day){
  const p=prof(), H=day.health||{}, t=dayTotals(day), w=who(day.date);
  const training = Math.round(t.burned||0);
  if (H.active_kcal) {
    const moving = Math.round(H.active_kcal);
    // Watch records workouts: its active energy already has them, but never show less than
    // logged training + steps (a session the watch missed still counts).
    if (p.watch_workouts) { const floor = training + stepsKcal(H.steps, w); return {total:Math.max(moving, floor), training, moving, fromHealth:true, watch:true, floor}; }
    return {total:moving+training, training, moving, fromHealth:true};
  }
  const moving = stepsKcal(H.steps, w);
  return {total:training+moving, training, moving, fromHealth:false};
}
const burnTip = B => B.fromHealth ? (B.watch ? `Apple Health active energy ${n0(B.moving)} kcal (your watch includes workouts), or logged training + steps ${n0(B.floor)} kcal, whichever is higher` : `Active energy from Apple Health ${n0(B.moving)} + logged training ${n0(B.training)} kcal`) : `Training & sports ${n0(B.training)} + steps ${n0(B.moving)} kcal`;
// Epley; sets above 12 reps are scored as 12 (estimates past that are unreliable).
const e1rm = s => s.weight>0 ? Calc.e1rm(s.weight, Math.min(s.reps,12)) || 0 : 0;

// sessions per exercise, oldest first
function buildSessions(){
  if (S._bs && S._bsDays===S.days && S._bsRev===S.rev) return S._bs;
  const map = buildSessionsNow(); S._bs = map; S._bsDays = S.days; S._bsRev = S.rev; return map;
}
function buildSessionsNow(){
  const map = new Map();
  const dates = [...S.days.keys()].sort();
  for (const date of dates) {
    const day = S.days.get(date);
    const perDay = new Map();
    for (const ex of day.exercises||[]) {
      if (ex.muscle_group==='cardio' && !(ex.sets||[]).length) continue;
      const k = exKey(ex.name);
      if (!perDay.has(k)) perDay.set(k,{name:ex.name,group:ex.muscle_group,sets:[]});
      perDay.get(k).sets.push(...(ex.sets||[]).filter(x=>x.type!=='warmup'));
    }
    for (const [k,s] of perDay) {
      if (!s.sets.length) continue;
      const bw = s.sets.every(x=>!(x.weight>0));
      const sess = {date, sets:s.sets, bodyweight:bw,
        best: bw ? Math.max(...s.sets.map(x=>x.reps)) : Math.max(...s.sets.map(e1rm)),
        top: Math.max(...s.sets.map(x=>x.weight||0)),
        volume: s.sets.reduce((a,x)=>a+(x.weight||0)*(x.reps||0),0),
        reps: s.sets.reduce((a,x)=>a+(x.reps||0),0)};
      if (!map.has(k)) map.set(k,{key:k,name:s.name,group:s.group,sessions:[]});
      const e = map.get(k); e.name = s.name; e.group = s.group || e.group; e.sessions.push(sess);
    }
  }
  return map;
}
function periodRanges(date, period){
  if (period==='week') { const s=weekStart(date); return {cur:[s,date], prev:[addDays(s,-7),addDays(s,-1)], label:'last week'}; }
  const s=monthStart(date); const pe=addDays(s,-1); return {cur:[s,date], prev:[monthStart(pe),pe], label:'last month'};
}
function periodStats(a,b){
  let days=0, sets=0, volume=0, kcal=0; const sp = {};
  for (const [date,day] of S.days) {
    if (date<a||date>b) continue;
    const ex = day.exercises||[], sports = day.sports||[]; if (!ex.length && !sports.length) continue;
    days++; for (const e of ex){ const ws=(e.sets||[]).filter(x=>x.type!=='warmup'); sets+=ws.length; volume+=ws.reduce((s,x)=>s+(x.weight||0)*(x.reps||0),0); kcal+=e.kcal||0; }
    for (const x of sports) { kcal+=x.kcal||0; const k = x.v===2 ? x.sport : sportTitle({...x, session:null});
      if (x.v===2) { const r = sp[k] ||= {name:k, sessions:0, minutes:0, kcal:0, bowled:0, faced:0}; r.sessions++; r.minutes+=x.minutes||0; r.kcal+=x.kcal||0; r.bowled+=(x.stats||{}).balls_bowled||0; r.faced+=(x.stats||{}).balls_faced||0; continue; }
      const r = sp[k] ||= {name:k, sessions:0, minutes:0, kcal:0, bowled:0, faced:0};
      r.sessions++; r.minutes += x.minutes || ((x.balls_bowled||0)*(x.session==='match'?0.67:1) + (x.minutes_batted||(x.balls_faced||0)*0.5) + (x.overs_fielded||0)*4);
      r.kcal += x.kcal||0; r.bowled += x.balls_bowled||0; r.faced += x.balls_faced||0; }
  }
  return {days,sets,volume,kcal,sp};
}

/* ---------- AI logging ---------- */
function buildPrompt(text, hasPhoto){
  const p = prof();
  const known = [...buildSessions().values()].map(e=>e.name).slice(0,80);
  const microSpec = MICROS.map(m=>`"${m.key}":0`).join(',');
  const W = who(S.date);
  return `You log food, water, supplements, training and health data for one person in India. Date ${S.date}, entry made at ${nowTime()}. Person: ${p.sex}, ${W.age} y, ${n1(W.kg)} kg, ${W.cm} cm.
Read the entry${hasPhoto?' and the attached photo of the food':''} and reply with ONLY one JSON object in exactly this shape:
{"foods":[{"name":"Paneer bhurji","quantity":"150 g","grams":150,"meal":"lunch","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"added_sugar_g":0,"alcohol_g":0,${microSpec},"confidence":"high"}],
"water_ml":0,
"supplements":[{"name":"Vitamin D3","dose":"60,000 IU",${microSpec}}],
"activities":[{"sport":"Cricket","entry":"played a T20 match, bowled 4 overs"}],
"exercises":[{"name":"Barbell Bench Press","muscle_group":"chest","sets":[{"weight_kg":60,"reps":8}],"duration_min":null,"distance_km":null,"incline_pct":null,"avg_hr":null,"met":null,"kcal_estimate":null}],
"gym_recovery":null,
"body_weight_kg":null,
"health":{"steps":null,"sleep_minutes":null,"bed_time":null,"wake_time":null,"active_kcal":null,"resting_kcal":null},
"notes":""}
Rules:
- One entry per distinct food. Every nutrient number is the TOTAL for that portion, not per 100 g. Use realistic values from standard food composition data (IFCT 2017 for Indian foods, USDA otherwise).
- Check each food: kcal must match 4 × protein + 4 × carbs + 9 × fat + 7 × alcohol within about 10%. Alcoholic drinks: put the grams of alcohol in alcohol_g (a 330 ml beer at 5% has about 13 g).
- sugar_g is all sugars. added_sugar_g is only sugar that was added: sugar, jaggery, honey, syrups, sweets and desserts, ice cream, cakes, biscuits, chocolate, sweetened drinks, fruit juices and sweetened milk drinks, and dates, raisins or grapes used to sweeten a dish. Sugar naturally in whole fruit, vegetables, plain milk, plain curd, eggs, rotis, rice, dal, meat and nuts is 0 added sugar.
- Weights the person gives are as eaten (cooked) unless they say raw, dry or uncooked.
- No weight given: assume a typical Indian home portion (1 roti ≈ 40 g, 1 katori dal ≈ 150 g, 1 cup cooked rice ≈ 160 g, 1 egg ≈ 50 g) and set confidence "medium".
- From a photo: name each item, estimate the portion from visual cues (a dinner plate is about 25 cm), set confidence "medium" or "low".
- Packaged or branded items: use their label values. Include cooking oil or ghee a dish normally contains.
- meal is one of breakfast, lunch, snack, dinner: from the entry, otherwise from the time.
- Plain water goes only in water_ml (1 glass ≈ 250 ml, 1 bottle ≈ 1000 ml). Other drinks (milk, tea, coffee, juice, shakes) are foods.
- Supplements (creatine, vitamins, minerals, fish oil, ashwagandha, electrolytes, pre-workout) go in "supplements" with the dose taken and the micronutrients that dose adds, converting units (vitamin D 1,000 IU = 25 mcg; a 1 g fish oil capsule has about 0.3 g omega-3 unless EPA/DHA are given). Leave nutrients the supplement doesn't contain at 0. Protein powders, mass gainers and protein bars have real calories, so they go in "foods" instead.
- Gym: "bench 60kg 3x8" means 3 sets of 8 reps at 60 kg; "60x8, 65x6" are separate sets of weight x reps; "22.5 x10 x10 x8" is three sets at 22.5 kg. Dumbbell weight is per dumbbell. Bodyweight moves use weight_kg 0 (or the added weight).
- Reuse one of these existing exercise names when it is the same movement: ${known.length?known.join('; '):'(none yet)'}. Otherwise use a clear standard name, e.g. "Incline Dumbbell Press".
- muscle_group is one of: ${MUSCLES.join(', ')}.
- Sports and other physical activities (badminton, cricket matches or nets, football, running outdoors, swimming, yoga, hiking…) go in "activities": the sport's plain name and the exact words from the entry about it. Do not estimate calories or fill details for them; a coach step handles that.
- When gym exercises are logged, set "gym_recovery" to {"muscles":["chest","triceps"],"hours":48,"summary":"one sentence on how long these muscles need before being trained hard again","tips":["2-3 short concrete tips"]} using the sets and reps logged. Otherwise null.
- Cardio (treadmill, cycling, rowing, skipping): muscle_group "cardio", sets [], duration_min, plus distance_km, incline_pct and avg_hr only when the entry gives them, and met: the Compendium of Physical Activities MET for that machine and intensity. The app works out calories from these; kcal_estimate is only a fallback.
- A body weight like "weight 72.5" or "weighed 72.5kg" goes in body_weight_kg.
- Apple Health data goes in "health": a line starting "health:", a screenshot of the Health app, or statements like "slept 6h 50m" or "8400 steps today". sleep_minutes is time actually asleep (not time in bed); if a sleep number over 1440 is given it is seconds, so divide by 60. bed_time and wake_time are "HH:MM" when known. active_kcal is Active Energy, resting_kcal is Resting Energy. Leave any value you don't see as null. If the photo is a Health screenshot, it is not food.
- Leave out anything that is not food, water, supplements, gym, activities, health data or body weight and say so briefly in notes. Put any important assumption in notes, in one short sentence. Use empty arrays when there is nothing.
${S.view==='gym' ? '- This entry is from the TRAINING page: fill only exercises, activities, gym_recovery and body_weight_kg. Leave foods, supplements, water and health empty; if the entry has food, say in notes "Log food on the Today page".' : '- This entry is from the FOOD page: leave exercises and activities empty and gym_recovery null. If the entry has gym sets or a sport, say in notes "Log training in Train".'}
Entry: """${text || '(no text, photo only)'}"""`;
}
function normalize(res, date){
  const foods = (Array.isArray(res?.foods)?res.foods:[]).map(f => {
    const micros = {}; for (const m of MICROS) micros[m.key] = num(f[m.key]);
    const meal = MEALS.includes(f.meal) ? f.meal : guessMeal();
    const x = {id:uid(), name:titleCase(f.name)||'Food', quantity:String(f.quantity||'').slice(0,40), grams:num(f.grams,5000), meal,
      time:nowTime(), kcal:num(f.kcal,5000), protein:num(f.protein_g,500), carbs:num(f.carbs_g,1000), fat:num(f.fat_g,500),
      fiber:num(f.fiber_g,200), sugar:num(f.sugar_g,500), added_sugar: f.added_sugar_g != null ? num(f.added_sugar_g,500) : (sweetName(f.name) ? num(f.sugar_g,500) : 0), alcohol:num(f.alcohol_g,300), micros, confidence:['high','medium','low'].includes(f.confidence)?f.confidence:'medium', source:S.photo?'photo':'text'};
    // Flag estimates whose calories don't add up from their macros.
    if (x.kcal>30 && Calc.atwaterMismatch(x.kcal, x.protein, x.carbs, x.fat, x.fiber, x.alcohol) > 0.15) x.check = true;
    return x;
  }).filter(f => f.name && (f.kcal>0 || f.grams>0));
  const supplements = (Array.isArray(res?.supplements)?res.supplements:[]).slice(0,20).map(x => {
    const micros = {}; for (const m of MICROS) micros[m.key] = num(x[m.key]);
    return {id:uid(), name:titleCase(x.name)||'Supplement', dose:String(x.dose||'').slice(0,40), micros, time:nowTime()};
  }).filter(x => x.name);
  const exercises = (Array.isArray(res?.exercises)?res.exercises:[]).map(e => {
    const sets = (Array.isArray(e.sets)?e.sets:[]).slice(0,30).map(s => ({weight:Math.round(num(s.weight_kg,1000)*100)/100, reps:Math.round(num(s.reps,1000))})).filter(s=>s.reps>0);
    const ex = {id:uid(), name:titleCase(e.name)||'Exercise', muscle_group:MUSCLES.includes(e.muscle_group)?e.muscle_group:'full body',
      sets, duration_min:num(e.duration_min,600)||null, distance_km:num(e.distance_km,300)||null, incline_pct:num(e.incline_pct,40)||null,
      avg_hr:Math.round(num(e.avg_hr,230))||null, met:num(e.met,20)||null, kcal_hint:num(e.kcal_estimate,3000)||null, time:nowTime()};
    ex.kcal = exerciseKcal(ex, date);
    return ex;
  }).filter(e => e.sets.length || e.duration_min);
  const h = res?.health||{}; const hm = s => (typeof s==='string' && /^\d{1,2}:\d{2}$/.test(s)) ? s.padStart(5,'0') : null;
  let sleep = num(h.sleep_minutes,100000); if (sleep>1440) sleep = sleep/60; if (sleep>1440) sleep = 0;
  const health = {steps:Math.round(num(h.steps,200000))||null, sleep_min:Math.round(sleep)||null, bed_time:hm(h.bed_time), wake_time:hm(h.wake_time),
    active_kcal:Math.round(num(h.active_kcal,10000))||null, resting_kcal:Math.round(num(h.resting_kcal,6000))||null};
  const hasHealth = Object.values(health).some(v=>v!==null);
  const activities = (Array.isArray(res?.activities)?res.activities:[]).slice(0,6).map(a => ({sport:titleCase(a.sport)||'Activity', entry:String(a.entry||'').slice(0,400)})).filter(a=>a.sport);
  const gr = res?.gym_recovery; const gym_recovery = gr && num(gr.hours,240) ? {muscles:(Array.isArray(gr.muscles)?gr.muscles:[]).slice(0,8).map(String), hours:num(gr.hours,240), summary:String(gr.summary||'').slice(0,300), tips:(Array.isArray(gr.tips)?gr.tips:[]).slice(0,4).map(x=>String(x).slice(0,160))} : null;
  return {foods, supplements, activities, gym_recovery, exercises, water_ml:Math.round(num(res?.water_ml,10000)), body_weight_kg:num(res?.body_weight_kg,400)||null, health: hasHealth?health:null, notes:String(res?.notes||'').slice(0,300)};
}
const fmtSleep = m => `${Math.floor(m/60)}h ${pad(Math.round(m%60))}m`;
function sleepVerdict(min, age){
  const [lo,hi] = age<18 ? [480,600] : age>=65 ? [420,480] : [420,540];
  const h = n => n/60;
  if (min < lo-60) return {cls:'bad', label:'Too little', note:`About ${n1(h(lo-min))} h short of the ${h(lo)}–${h(hi)} h adults need. Expect lower energy in training and more hunger today. An earlier night will help recovery.`};
  if (min < lo) return {cls:'warn', label:'A little short', note:`Just under the ${h(lo)}–${h(hi)} h range. Fine for one night; try not to stack several.`};
  if (min <= hi+30) return {cls:'good', label:'Enough', note:`Inside the ${h(lo)}–${h(hi)} h range recommended for your age. Good for recovery and muscle growth.`};
  return {cls:'warn', label:'Long night', note:`More than ${h(hi)} h. Fine after a hard week or a match; if it happens often and you still feel tired, it's worth looking into.`};
}
const findStack = name => (prof().stack||[]).find(x => exKey(x.name)===exKey(name));
/* How often a supplement is taken: {type:'daily'}, {type:'days', days:[0..6]} (0 = Sunday),
   or {type:'every', n, start}. Older items without one are daily. */
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
function suppDue(st, date){
  const f = st.freq || {type:'daily'};
  if (f.type==='days') return (f.days||[]).includes(new Date(date+'T12:00:00').getDay());
  if (f.type==='every') { const n = Math.max(1, f.n||1), d = Math.round((Date.parse(date+'T12:00:00') - Date.parse((f.start||date)+'T12:00:00'))/864e5); return d >= 0 && d % n === 0; }
  return true;
}
function freqText(f){
  f = f || {type:'daily'};
  if (f.type==='days') { const d = [...(f.days||[])].sort(); return d.length===7 ? 'Every day' : d.length===1 ? `Weekly on ${WD[d[0]]}` : d.map(x=>WD[x]).join(' · '); }
  if (f.type==='every') return f.n===1 ? 'Every day' : f.n===7 ? `Weekly (every 7 days)` : `Every ${f.n} days`;
  return 'Every day';
}
function supplementsPanel(day){
  const stack = (prof().stack||[]).filter(st => suppDue(st, day.date) || (day.supplements||[]).some(x=>x.stack_id===st.id)); const taken = day.supplements||[];
  const takenIds = new Set(taken.map(x=>x.stack_id).filter(Boolean));
  const extra = taken.filter(x => !x.stack_id);
  let h = '';
  if (stack.length) h += `<div class="stack">${stack.map(st => { const on = takenIds.has(st.id);
    return `<button class="stk${on?' on':''}" data-action="toggleStack" data-id="${st.id}" aria-pressed="${on}"><span class="box">${on?'✓':''}</span><span><b>${esc(st.name)}</b><span class="muted small"> ${esc(st.dose)}</span></span></button>`; }).join('')}</div>`;
  else h += `<div class="empty">Nothing due today.</div>`;
  if (extra.length) h += extra.map(x => `<div class="item"><div><div class="nm">${esc(x.name)}</div><div class="sub">${esc(x.dose)}${x.time?' · '+esc(x.time):''}</div></div>
    <button class="linkbtn" data-action="addStack" data-id="${x.id}">Add to daily list</button>
    <div class="acts"><button data-action="delSupp" data-id="${x.id}" aria-label="Delete ${esc(x.name)}">✕</button></div></div>`).join('');
  return h;
}
function guessMeal(){ const h=new Date().getHours(); return h<11?'breakfast':h<16?'lunch':h<19?'snack':'dinner'; }
const AI_ERR = {
  session_expired:'You’ve been signed out. Sign in again, then log this entry.',
  daily_cap:'AI limit reached: you’ve used your 30 AI uses for today. Foods, gym sets, food search and barcodes still work without AI; AI is back tomorrow.',
  ai_day_limit:'AI limit reached for today: the free AI allowance shared by everyone on this app is used up. It resets once a day (early afternoon India time). Foods, gym sets, food search and barcodes still work without AI.',
  not_invited:'AI features are invite-only on this app. Ask the owner to add your email.',
  not_approved:'Your account is waiting for the owner’s approval.',
  server_config:'The app’s AI key isn’t set up correctly. The owner needs to check the GEMINI_API_KEY or ANTHROPIC_API_KEY secret.',
  unavailable:'Couldn’t reach AI. Your entry is still here; try again.',
  busy:'The AI is busy right now (Google’s free service is overloaded). Your entry is still here; try again in a minute.',
  offline:'You’re offline. Food-table items still log; try AI again when you’re back online.',
  rate_limited:'Too many AI requests in the last minute. Try again in a minute.',
  image_rejected:'That file couldn’t be read. Try a JPEG, PNG or PDF under 20 MB.',
  refused:'AI couldn’t process that entry. Try describing it differently.',
  invalid_json:'Couldn’t turn that into a log entry. Try rephrasing, e.g. “150 g paneer, 2 rotis”.',
  empty_completion:'Couldn’t turn that into a log entry. Try rephrasing, e.g. “150 g paneer, 2 rotis”.',
  prompt_too_large:'That entry is too long. Split it into smaller entries.',
  bad_request:'AI couldn’t read that request. Try again.',
};
async function toJpeg(file){
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600/Math.max(bmp.width,bmp.height));
    const c = document.createElement('canvas'); c.width=Math.round(bmp.width*scale); c.height=Math.round(bmp.height*scale);
    c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    return await new Promise(r => c.toBlob(b => r(b||file), 'image/jpeg', 0.85));
  } catch { return file; }
}

/* ---------- built-in food table (foods.js, checked by calc.test.js) ---------- */
const { FOOD_MICRO_ORDER, FOOD_ROWS, FOOD_ALCOHOL, FOOD_ADDED_SUGAR } = window;
/* Only added sugar counts toward the sugar limit: sugar, jaggery, honey, syrups, sweets,
   desserts, sweetened drinks and juices, and dates or raisins used to sweeten a dish.
   Sugar that is naturally in fruit, vegetables, milk, curd, eggs, rotis or dal doesn't. */
const SWEET_RE = /\b(sugar|sweet(?!\s*(potato|corn))|sweetened|dessert|ice ?cream|kulfi|cake|pastry|cookies?|biscuits?|brownie|muffin|dough?nut|chocolate|choco|candy|toffee|jam|jelly|honey|jaggery|gur|syrup|halwa|kheer|payasam|gulab|jamun|jalebi|lad(d)?oo|laddu|barfi|burfi|rasgulla|rasmalai|mithai|peda|sandesh|soda|cola|coke|pepsi|sprite|fanta|soft drink|energy drink|juice|milkshake|(mango|banana|strawberry|chikoo|chocolate|oreo|kitkat|dates?|butterscotch|vanilla) shake|smoothie|frooti|maaza|mango lassi|sweet lassi|cold coffee|frappe|mocha|cereal|granola|muesli|protein bar|pie|tart|waffle|pancakes?|custard|pudding|mousse|cheesecake|nutella|ketchup|shrikhand|basundi|rabri|payasa|modak|chikki|dates? (shake|smoothie|balls?|bar|roll|ladoo|halwa)|raisin)\b/i;
const NOT_SWEET_RE = /\b(sugar[- ]?free|no (added )?sugar|unsweetened|zero|diet)\b/i;
const sweetName = n => SWEET_RE.test(n||'') && !NOT_SWEET_RE.test(n||'');
// Added sugar per 100 g of a food from any source.
function addedPer100(f){
  const per = f.per || {};
  if (per.added_sugar != null) return per.added_sugar;
  if (f.src==='indb') return per.sugar || 0;                                  // INDB records free (added) sugar
  if (FOOD_ADDED_SUGAR && f.name in FOOD_ADDED_SUGAR) return FOOD_ADDED_SUGAR[f.name];
  if (f.src==='usda') return (/^(Sweets|Baked Products|Breakfast Cereals|Snacks|Fast Foods|Beverages)$/.test(f.cat||'') || sweetName(f.name) || sweetName((f.aliases||[])[0])) && !NOT_SWEET_RE.test(f.name) ? (per.sugar||0) : 0;
  if (f.src==='off') return per.sugar || 0;                                    // set from the label in offToFood
  if (!f.src || f.src==='builtin') return 0;                                   // built-in foods not in the table have none
  return sweetName(f.name) ? (per.sugar||0) : 0;
}
// Added sugar of a logged food; older entries without it are judged by name.
function addedSugar(f){
  if (f.added_sugar != null) return f.added_sugar;
  if (FOOD_ADDED_SUGAR && f.name in FOOD_ADDED_SUGAR) return (FOOD_ADDED_SUGAR[f.name]||0) * (f.grams||0) / 100;
  return sweetName(f.name) ? (f.sugar||0) : 0;
}
const FOODS = FOOD_ROWS.map(r => {
  const [name, aliases, units, kcal, protein, carbs, fat, fiber, sugar, ...m] = r;
  const micros = {}; FOOD_MICRO_ORDER.forEach((k,i)=>micros[k]=m[i]||0);
  return {name, aliases:aliases.split('|'), units, per:{kcal,protein,carbs,fat,fiber,sugar,micros}, src:'db'};
});
const GENERIC_UNITS = {katori:150, bowl:200, cup:200, glass:250, plate:250, tbsp:15, tsp:5, handful:30, slice:30, scoop:30, piece:100, serving:150, packet:50, can:330, bottle:500, bar:40, portion:150, cube:20};
const UNIT_WORDS = {g:'g',gm:'g',gms:'g',gram:'g',grams:'g',gr:'g',kg:'kg',ml:'ml',l:'l',ltr:'l',litre:'l',liter:'l',litres:'l',
  katori:'katori',katoris:'katori',bowl:'bowl',bowls:'bowl',cup:'cup',cups:'cup',glass:'glass',glasses:'glass',plate:'plate',plates:'plate',
  tbsp:'tbsp',tablespoon:'tbsp',tablespoons:'tbsp',tsp:'tsp',teaspoon:'tsp',teaspoons:'tsp',spoon:'tsp',spoons:'tsp',handful:'handful',handfuls:'handful',
  slice:'slice',slices:'slice',scoop:'scoop',scoops:'scoop',piece:'piece',pieces:'piece',pc:'piece',pcs:'piece',nos:'piece',no:'piece',
  serving:'serving',servings:'serving',packet:'packet',packets:'packet',pack:'packet',can:'can',cans:'can',bottle:'bottle',bottles:'bottle',bar:'bar',bars:'bar',cube:'cube',cubes:'cube',portion:'portion'};
const NUM_WORDS = {a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,half:0.5,quarter:0.25,couple:2,few:3};
const FILLER = new Set(['cooked','boiled','plain','fresh','homemade','home','made','small','medium','large','big','my','the','some','hot','cold','warm','raw','cup','bowl','full','whole','little','extra','x']);
const normFood = s => String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const singular = w => w.length>3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0,-2) : w.length>3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0,-1) : w;
/* ---------- INDB import (1,014 Indian recipes) ---------- */
function rowToFood(r, src){
  const [name, aliases, units, kcal, protein, carbs, fat, fiber, sugar, ...m] = r;
  const micros = {}; FOOD_MICRO_ORDER.forEach((k,i)=>micros[k]=m[i]||0);
  return {name, aliases:String(aliases||'').split('|').filter(Boolean), units:units||{}, per:{kcal,protein,carbs,fat,fiber,sugar,micros}, src};
}
function indbAliases(name){
  const out = new Set(); const n = String(name||'').trim();
  const base = n.replace(/\([^)]*\)/g,' ').replace(/\s+/g,' ').trim();
  out.add(normFood(n)); out.add(normFood(base));
  for (const m of n.matchAll(/\(([^)]*)\)/g)) for (const piece of m[1].split(/[\/,]| or /)) out.add(normFood(piece));
  for (const piece of base.split('/')) out.add(normFood(piece));
  return [...out].filter(a => a && a.length>=3).slice(0,8).join('|');
}
async function importIndb(file){
  if (!file) { $('#indbInput').click(); return; }
  S.libBusy=true; S.libStatus='Reading the spreadsheet…'; render();
  try {
    await loadXlsx();
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), {type:'array'}); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:null});
    const v = (r,k) => { const x = Number(r[k]); return Number.isFinite(x) && x>0 ? x : 0; };
    const out = [];
    for (const r of rows) {
      const name = String(r.food_name||'').trim(); const kcal = v(r,'energy_kcal'); if (!name || !kcal) continue;
      const servKcal = v(r,'unit_serving_energy_kcal'); const servG = servKcal ? Math.round(servKcal/kcal*100) : 0;
      const unitWord = UNIT_WORDS[normFood(r.servings_unit||'').split(' ').pop()] || null;
      const units = servG>0 && servG<2000 ? {[unitWord && !['g','kg','ml','l'].includes(unitWord) ? unitWord : 'serving']:servG} : {serving:100};
      const d = v(r,'vitd2_ug') + v(r,'vitd3_ug');
      const rd = x => Math.round(x*100)/100;
      out.push([titleCase(name).slice(0,70), indbAliases(name), units, rd(kcal), rd(v(r,'protein_g')), rd(v(r,'carb_g')), rd(v(r,'fat_g')), rd(v(r,'fibre_g')), rd(v(r,'freesugar_g')),
        rd(v(r,'sfa_mg')/1000), rd(v(r,'cholesterol_mg')), rd(v(r,'sodium_mg')), rd(v(r,'potassium_mg')), rd(v(r,'calcium_mg')), rd(v(r,'iron_mg')), rd(v(r,'magnesium_mg')), rd(v(r,'zinc_mg')),
        rd(v(r,'vita_ug')), rd(v(r,'vitc_mg')), rd(d), 0, rd(v(r,'folate_ug')), 0]);
    }
    if (out.length < 50) throw {msg:`Only ${out.length} recipes could be read. Is this the INDB spreadsheet (INDB.xlsx)?`};
    S.libStatus=`Saving ${out.length} recipes…`; render();
    const size = 200; const chunks = Math.ceil(out.length/size);
    for (let i=0;i<chunks;i++) await S.db.doc('foodlib/indb-'+String(i).padStart(2,'0')).set({src:'INDB 2024', part:i, of:chunks, rows:JSON.stringify(out.slice(i*size,(i+1)*size)), saved:Date.now()});
    S.libFoods = out.map(r=>rowToFood(r,'indb')); S.myFoodsVer=(S.myFoodsVer||0)+1;
    S.libStatus=`Added ${out.length} Indian recipes from INDB. They now log instantly without AI.`;
  } catch(e) {
    S.libStatus = e?.msg || 'Couldn’t read that file. Make sure it’s INDB.xlsx and try again.';
  } finally { S.libBusy=false; render(); }
}
function foodIndex(){
  if (S._fidx && S._fidxVer===S.myFoodsVer) return S._fidx;
  const idx = [];
  for (const f of Object.values(S.myFoods||{})) for (const a of [f.name, ...(f.aliases||[])]) { const k=normFood(a); if (k) idx.push({k, f, mine:true}); }
  for (const f of FOODS) for (const a of [f.name, ...f.aliases]) { const k=normFood(a); if (k) idx.push({k, f, pr:2}); }
  for (const f of (S.libFoods||[])) for (const a of [f.name, ...f.aliases]) { const k=normFood(a); if (k && k.length>=3) idx.push({k, f, pr:1}); }
  for (const e of idx) if (e.mine) e.pr = 3;
  idx.sort((a,b)=> (b.k.length-a.k.length) || (b.pr-a.pr));
  S._fidx = idx; S._fidxVer = S.myFoodsVer; return idx;
}
function matchFood(text){
  const t = ' '+normFood(text).split(' ').map(singular).join(' ')+' ';
  const t2 = ' '+normFood(text)+' ';
  for (const e of foodIndex()) { const k=' '+e.k+' ', ks=' '+e.k.split(' ').map(singular).join(' ')+' ';
    if (t2.includes(k) || t.includes(ks)) return e; }
  return null;
}
const WATER_RE = /^(?:(\d+(?:\.\d+)?)\s*(ml|l|ltr|litres?|liters?|glass(?:es)?|bottles?)\s*(?:of\s+)?water|water\s*(\d+(?:\.\d+)?)\s*(ml|l|ltr|litres?|liters?|glass(?:es)?|bottles?)|(\d+|a|one|two|three|four)\s+(glass(?:es)?|bottles?)\s+(?:of\s+)?water)$/;
const NON_FOOD_RE = /\b(\d+\s*x\s*\d+|sets?|reps?|bench|squat|deadlift|press|curl|row|pull ?ups?|push ?ups?|lat|gym|workout|nets|match|bowled|overs?|batted|badminton|cricket|football|run|ran|running|walk|walked|cycling|swim|yoga|steps|slept|sleep|weight\s*\d|weighed|health:|creatine|vitamin|supplement|capsule|tablet|fish oil|omega|multivitamin|ashwagandha|electrolyte|pre-?workout|zinc|magnesium)\b/;
// "Yoga Bar" is a food brand, not yoga the activity.
const YOGA_BAR = /\byoga ?bar\b/gi;
function parseQty(s){
  s = s.replace(/½/g,' 0.5 ').replace(/¼/g,' 0.25 ').replace(/¾/g,' 0.75 ').trim();
  let m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*(.*)$/); if (m) return {q:+m[1]/+m[2], rest:m[3]};
  m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/); if (m) return {q:+m[1], rest:m[2]};
  const w = s.split(' ')[0]; if (w in NUM_WORDS) return {q:NUM_WORDS[w], rest:s.slice(w.length).trim()};
  return {q:null, rest:s};
}
function parsePart(raw){
  let s = normFood(raw.replace(/(\d)\s*(g|gm|gms|kg|ml|l)\b/gi,'$1 $2')).replace(/\b(of|some|about|around|approx|approximately|i ate|ate|had|have|having|for (breakfast|lunch|dinner|snack))\b/g,' ').replace(/\s+/g,' ').trim();
  if (!s) return {skip:true};
  const wm = s.match(WATER_RE);
  if (wm) { const q = parseQty((wm[1]||wm[3]||wm[5]||'1')).q || 1; const u = (wm[2]||wm[4]||wm[6]||'ml');
    const ml = /^l|ltr|litre|liter/.test(u) ? q*1000 : /glass/.test(u) ? q*250 : /bottle/.test(u) ? q*1000 : q; return {water:Math.round(ml)}; }
  if (NON_FOOD_RE.test(s.replace(YOGA_BAR,' '))) return null;
  // quantity + unit first ("2 roti", "150 g chicken"), or trailing ("chicken 150 g", "rice 2 cups")
  let {q, rest} = parseQty(s); let unit=null;
  let w = rest.split(' ')[0]; if (UNIT_WORDS[w]) { unit=UNIT_WORDS[w]; rest=rest.slice(w.length).trim(); }
  if (q===null) { const m = rest.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*([a-z]+)?$/); if (m && (!m[3] || UNIT_WORDS[m[3]])) { rest=m[1]; q=+m[2]; unit=m[3]?UNIT_WORDS[m[3]]:null; } }
  const e = matchFood(rest); if (!e) return null;
  // any unknown word left over (e.g. "mom's special chicken sukka") means it's not this food: let Claude read it
  const aw = new Set(e.k.split(' ').map(singular));
  const left = normFood(rest).split(' ').map(singular).filter(w => w && !aw.has(w) && !FILLER.has(w));
  if (left.length) return null;
  const f = e.f; const qty = q ?? 1;
  let grams;
  if (unit==='g' || unit==='ml') grams = qty; else if (unit==='kg' || unit==='l') grams = qty*1000;
  else { const units = f.units||{}; const u = unit || Object.keys(units)[0] || 'serving'; grams = qty * (units[u] ?? GENERIC_UNITS[u] ?? 100); }
  if (!(grams>0) || grams>5000) return null;
  const label = unit==='g'||unit==='ml' ? `${n0(grams)} ${unit}` : unit==='kg'||unit==='l' ? `${qty} ${unit}` : `${qty} ${unit || Object.keys(f.units||{})[0] || 'serving'}${qty>1&&!/s$/.test(unit||'')?'s':''}`;
  return {food:f, grams, label, mine:!!e.mine};
}
/* Gym entries the built-in exercise table can read (exercises.js), with the
   names this person already uses taking over the built-in ones. */
function gymIndex(){
  if (S._gidx && S._gidxRev===S.days && S._gidxLib===Gym.libVersion()) return S._gidx;
  const known = new Map();
  for (const [,d] of S.days) for (const e of d.exercises||[]) if (e.name && !known.has(exKey(e.name))) known.set(exKey(e.name), {name:e.name, group:e.muscle_group, met:e.met});
  S._gidx = Gym.buildIndex([...known.values()]); S._gidxRev = S.days; S._gidxLib = Gym.libVersion(); return S._gidx;
}
function gymPart(text, prev){
  if (typeof Gym==='undefined') return null;
  try { return Gym.parsePart(text, {index:gymIndex(), prev}); } catch { return null; }
}
function localParse(text, date){
  const meal = /breakfast/i.test(text)?'breakfast':/lunch/i.test(text)?'lunch':/dinner/i.test(text)?'dinner':/snack/i.test(text)?'snack':guessMeal();
  const foods=[], rest=[], exercises=[]; let water=0, prev=null;
  const gymHit = (p) => { const g = gymPart(p, prev); if (!g) return false;
    if (g.continued) g.exercise.sets.push(...g.sets);
    else { prev = {id:uid(), ...g.exercise, kcal_hint:null, time:nowTime()}; delete prev.kind; exercises.push(prev); prev.kind = g.exercise.kind; }
    return true; };
  // Commas and new lines separate entries; gym sets are read before "and"/"+" split them ("pull ups +10kg 3x8").
  const sports = [];
  // Restaurant meals ("CB peri peri chicken burrito, extra paneer"): the pieces after it belong to it.
  let chunks = text.split(/\s*(?:,|;|\n)\s*/).map(x=>x.trim()).filter(Boolean);
  if (typeof WeFit !== 'undefined') {
    // Once one dish is from WeFit, other dishes in the same entry are tried as theirs too.
    const any = chunks.some(c => WeFit.isWeFit(c));
    chunks = chunks.filter(c => { const r = WeFit.parseAll(c) || (any && !WeFit.isWeFit(c) ? WeFit.parseAll('wefit ' + c) : null);
      if (!r) return true; for (const x of r) foods.push(wefitFood(x.meal, x.qty, meal)); return false; });
  }
  if (typeof Restaurants !== 'undefined') {
    // Once one dish is from California Burrito, other dishes of theirs in the same entry are too.
    const cbAll = chunks.some(c => Restaurants.isCB(c)), DISH = /\b(bowl|burrito|salad|tacos?|quesadilla|nachos|snachos|tostada|popcorn (chicken|mushroom|potato))\b/i;
    const keep = [], queue = chunks.slice();
    while (queue.length) {
      const c = queue.shift();
      const cb = Restaurants.isCB(c) ? c : cbAll && DISH.test(c) ? 'cb ' + c : null;
      if (!cb) { keep.push(c); continue; }
      const sp = Restaurants.splitOrder(cb); let t = sp.order;
      if (!sp.rest.length) while (queue.length && Restaurants.isModifier(queue[0])) t += ' ' + queue.shift();
      const r = Restaurants.parse(t);
      if (r && !r.need) { foods.push(restaurantFood(r, meal)); queue.unshift(...sp.rest); } else keep.push(c);
    }
    chunks = keep;
  }
  for (const chunk of chunks) {
    if (gymHit(chunk)) continue;
    // "cricket nets 90 min, bowled 6 overs": details after a comma belong to the session before.
    const last = sports[sports.length-1];
    if (last && typeof Sports!=='undefined' && Sports.isDetail(chunk)) { const sp = sportFromText(last.entry+' '+chunk, date); if (sp) { sports[sports.length-1] = {...sp, entry:last.entry+', '+chunk}; continue; } }
    let foodText = chunk;
    if (typeof Sports!=='undefined' && Sports.ready() && !/\byoga ?bar\b/i.test(chunk)) {
      const {acts, rest:other} = Sports.split(chunk); const got = acts.map(t => [t, sportFromText(t, date)]);
      if (got.length && got.every(([,sp]) => sp)) { for (const [t,sp] of got) sports.push({...sp, entry:t}); prev = null; if (!other.length) continue; foodText = other.join(' and '); }
    }
    for (const p of foodText.split(/\s*(?:\+|&|\band\b|\bwith\b)\s*/i).map(x=>x.trim()).filter(Boolean)) {
      const r = parsePart(p);
      if (!r) { if (!gymHit(p)) { rest.push(p); prev = null; } continue; }
      prev = null; if (r.skip) continue; if (r.water) { water += r.water; continue; }
      const k = r.grams/100, per = r.food.per; const micros={}; for (const m of MICROS) micros[m.key] = (per.micros[m.key]||0)*k;
      foods.push({id:uid(), name:r.food.name, quantity:r.label, grams:Math.round(r.grams), meal, time:nowTime(), kcal:per.kcal*k, protein:per.protein*k, carbs:per.carbs*k, fat:per.fat*k,
        fiber:per.fiber*k, sugar:per.sugar*k, added_sugar:addedPer100(r.mine ? {...r.food, src:'mine'} : r.food)*k, alcohol:(FOOD_ALCOHOL[r.food.name]||0)*k, micros, confidence:'high', source:r.mine?'my-food':'food-db'});
    }
  }
  for (const e of exercises) { delete e.kind; e.source = 'exercise-db'; e.kcal = exerciseKcal(e, date); }
  return {foods, water, rest, exercises, sports};
}
function saveMyFood(f, extraAlias){
  if (!S.db || !(f.grams>0) || !f.name) return;
  const key = normFood(f.name).replace(/ /g,'-').slice(0,60); if (!key) return;
  const k = 100/f.grams; const micros={}; for (const m of MICROS) micros[m.key] = Math.round(((f.micros||{})[m.key]||0)*k*100)/100;
  const prev = (S.myFoods||{})[key];
  const aliases = [...new Set([...(prev?.aliases||[]), ...(extraAlias?[extraAlias]:[])].map(normFood).filter(Boolean))].slice(0,10);
  const doc = {name:f.name, aliases, units:{serving:Math.round(f.grams)}, per:{kcal:r1(f.kcal*k), protein:r1(f.protein*k), carbs:r1(f.carbs*k), fat:r1(f.fat*k), fiber:r1((f.fiber||0)*k), sugar:r1((f.sugar||0)*k), added_sugar:r1(addedSugar(f)*k), micros},
    src:'mine', verified:!!f.verified || !!prev?.verified, updated:Date.now()};
  if (prev && prev.verified && !f.verified) return; // never overwrite a food the person corrected with a fresh estimate
  S.myFoods = {...(S.myFoods||{}), [key]:doc}; S.myFoodsVer=(S.myFoodsVer||0)+1;
  S.db.doc('foods/'+key).set(doc).catch(()=>{});
}
const r1 = v => Math.round((Number(v)||0)*10)/10;

async function submitLog(){
  const ta = $('#logText'); const text = (ta?.value||'').trim();
  if (!text && !S.photo) { setStatus('Type what you ate, drank or lifted, or add a photo.', true); return; }
  const date = S.date; const p = prof();
  if (text && !S.photo) await Promise.race([loadActs(), new Promise(r => setTimeout(r, 3000))]);
  const local = (text && !S.photo) ? localParse(text, date) : {foods:[], water:0, rest:text?[text]:[], exercises:[], sports:[]};
  // Food is logged on Today, gym and sport in Train: the other kind is left out with a pointer.
  const train = S.view==='gym'; let elsewhere = '';
  if (train && (local.foods.length || local.water)) { elsewhere = ' Food goes on the Today page, so that part wasn’t logged.'; local.foods = []; local.water = 0; }
  if (!train && (local.exercises.length || local.sports.length)) { elsewhere = ' Gym and sport go in Train, so that part wasn’t logged.'; local.exercises = []; local.sports = []; }
  const localGym = local.exercises.length ? Gym.recovery(local.exercises) : null;
  const restText = local.rest.join(', ');
  const localActs = local.sports.map(sp => makeActivity({key:sp.key, name:sp.name, entry:sp.entry, date, time:nowTime(), qa:[]}, sp.res));
  const needAI = !!S.photo || restText.length > 0;
  if (needAI && !S.sample) {
    if (local.foods.length || local.water || local.exercises.length || localActs.length) { await saveEntry(date, {foods:local.foods, water_ml:local.water, exercises:local.exercises, gym_recovery:localGym, sportsLocal:localActs}); if ($('#logText')) $('#logText').value = restText; setStatus(`Logged what’s in the built-in tables. AI isn’t set up yet, so this part wasn’t read: “${restText}”.`, true); }
    else setStatus('That isn’t in the built-in food or exercise tables, and AI isn’t set up for this app yet (see SETUP.md).', true);
    return;
  }
  S.busy = true; S.ctl = new AbortController();
  const slow1 = setTimeout(() => { if (S.busy) setStatus('Google’s AI is slow right now; trying another model…'); }, 12000);
  const slow2 = setTimeout(() => { if (S.busy) setStatus('Still trying other AI models… You can tap Stop and log it later.'); }, 45000);
  const nLocal = local.foods.length + local.exercises.length + local.sports.length;
  if (needAI) { setStatus(S.photo ? 'Looking at your photo…' : nLocal ? `Found ${nLocal} in the built-in tables; reading the rest…` : 'Reading your entry…'); render(); }
  try {
    let r = {foods:[], supplements:[], activities:[], gym_recovery:null, exercises:[], water_ml:0, body_weight_kg:null, health:null, notes:''};
    if (needAI) {
      const opts = {signal:S.ctl.signal, task:'log'};
      if (S.photo) opts.images = [await toJpeg(S.photo)];
      r = normalize(await S.sample.json(buildPrompt(S.photo ? text : restText, !!S.photo), opts), date);
      if (train && (r.foods.length || r.water_ml || r.supplements.length)) { elsewhere = ' Food goes on the Today page, so that part wasn’t logged.'; r.foods = []; r.water_ml = 0; r.supplements = []; r.health = null; }
      if (!train && (r.exercises.length || r.activities.length)) { elsewhere = ' Gym and sport go in Train, so that part wasn’t logged.'; r.exercises = []; r.activities = []; r.gym_recovery = null; }
      // learn what Claude read so the next time is instant
      const alias = local.rest.length===1 && r.foods.length===1 ? (()=>{ let t=parseQty(normFood(local.rest[0])).rest; const w=t.split(' ')[0]; if (UNIT_WORDS[w]) t=t.slice(w.length).trim(); return t; })() : null;
      for (const f of r.foods) if (f.source!=='photo' && f.confidence!=='low') saveMyFood(f, alias);
    }
    const aiFoods = r.foods.length;
    r.foods = [...local.foods, ...r.foods]; r.water_ml = (r.water_ml||0) + local.water;
    // Activities the AI picked out (from a photo or a long entry): use the Compendium when it knows the sport.
    const aiActs = []; r.activities = r.activities.filter(a => { const sp = sportFromText(a.entry || a.sport, date) || sportFromText(a.entry || '', date, sportKey(a.sport));
      if (!sp) return true; aiActs.push(makeActivity({key:sp.key, name:sp.name, entry:a.entry||a.sport, date, time:nowTime(), qa:[]}, sp.res)); return false; });
    localActs.push(...aiActs);
    r.exercises = [...local.exercises, ...r.exercises]; r.sportsLocal = localActs;
    if (local.exercises.length) r.gym_recovery = Gym.recovery(r.exercises) || r.gym_recovery;
    if (!r.foods.length && !r.exercises.length && !r.water_ml && !r.body_weight_kg && !r.health && !r.supplements.length && !r.activities.length && !localActs.length) {
      setStatus(elsewhere ? (train ? 'That looks like food. Log food on the Today page.' : 'That looks like training. Log gym sets and sport in Train.') : (r.notes || 'Nothing to log was found in that entry.'), true);
    } else {
      await saveEntry(date, r);
      const bits = [];
      if (r.foods.length) bits.push(`${r.foods.length} food${r.foods.length>1?'s':''} · ${n0(r.foods.reduce((s,f)=>s+f.kcal,0))} kcal`);
      if (r.water_ml) bits.push(`${n0(r.water_ml)} ml water`);
      if (r.exercises.length) bits.push(`${r.exercises.length} exercise${r.exercises.length>1?'s':''}`);
      for (const a of localActs) bits.push(`${a.title} ${n0(a.minutes)} min · ${n0(a.kcal)} kcal`);
      if (r.body_weight_kg) bits.push(`weight ${n1(r.body_weight_kg)} kg`);
      if (r.supplements.length) bits.push(r.supplements.map(x=>x.name).join(', '));
      if (r.health) bits.push('Health data'+(r.health.steps?` (${n0(r.health.steps)} steps`:' (')+(r.health.sleep_min?`${r.health.steps?', ':''}${fmtSleep(r.health.sleep_min)} sleep`:'')+')');
      for (const a of r.activities) enqueueActivity(a, date);
      const how = !needAI ? ' From the built-in tables, no AI used.' : nLocal ? ` ${nLocal} from the built-in tables, the rest read by AI.` : aiFoods ? ' Saved to your food list, so next time it’s instant.' : r.exercises.length ? ' New exercises are remembered, so next time they’re instant.' : '';
      const newPrs = r.exercises.length ? [...prsOn(date).values()].filter(x => r.exercises.some(e => exKey(e.name)===exKey(x.name))) : [];
      setStatus((newPrs.length ? `New personal record: ${newPrs.map(x=>`${x.name}, ${x.text}`).join('; ')}! ` : '') + (bits.length ? 'Logged ' + bits.join(', ') + '.' + how + (r.notes && !/Log (food|training) (on|in)/.test(r.notes) ? ' ' + r.notes : '') : (r.notes||'')) + elsewhere);
      if (date===localDate() && r.exercises.some(e => (e.sets||[]).length)) startRest();
      if ($('#logText')) $('#logText').value = ''; clearPhoto();
    }
  } catch (e) {
    if (e?.code === 'cancelled') setStatus('Stopped. Nothing was logged.');
    else {
      // Keep whatever the food table understood, even when Claude can't be reached.
      if (local.foods.length || local.water || local.exercises.length || localActs.length) { await saveEntry(date, {foods:local.foods, water_ml:local.water, exercises:local.exercises, gym_recovery:localGym, sportsLocal:localActs}); if ($('#logText')) $('#logText').value = restText; }
      setStatus((local.foods.length||local.water||local.exercises.length||localActs.length ? 'Logged what the built-in tables know. ' : '') + (AI_ERR[e?.code] || AI_ERR.unavailable), true);
    }
  } finally { clearTimeout(slow1); clearTimeout(slow2); S.busy=false; S.ctl=null; render(); }
  if (S.queue.length) runQueue();
}
async function saveEntry(date, r){
  await writeDay(date, d => {
    if ((r.sportsLocal||[]).length) d.sports = [...(d.sports||[]), ...r.sportsLocal];
    d.foods.push(...(r.foods||[])); d.exercises.push(...(r.exercises||[]));
    if (r.gym_recovery) d.gym_recovery = {...r.gym_recovery, ready_at:new Date(Date.now()+r.gym_recovery.hours*3600e3).toISOString()};
    if (r.water_ml) d.water.push({id:uid(), ml:r.water_ml, time:nowTime()});
    if (r.body_weight_kg) d.weight_kg = r.body_weight_kg;
    if ((r.supplements||[]).length) d.supplements = [...(d.supplements||[]), ...r.supplements.map(x => { const st = findStack(x.name); return st ? {...x, stack_id:st.id} : x; })];
    if (r.health) { d.health = {...(d.health||{})}; for (const [k,v] of Object.entries(r.health)) if (v!==null) d.health[k]=v; }
  });
  if (r.body_weight_kg && date >= latestWeightDate()) saveProfile({...prof(), weight_kg:r.body_weight_kg});
}

/* ---------- sport profiles + coach ---------- */
const FREQ = ['Once a week or less','2–3 times a week','4+ times a week'];
const SPORT_Q = {
  cricket: [
    {id:'role', text:'What is your role in the team?', type:'choice', options:['Batter','Fast bowler','Medium pacer','Spinner','All-rounder (pace)','All-rounder (spin)','Wicketkeeper-batter']},
    {id:'runup', text:'If you bowl pace, how long is your run-up?', type:'choice', options:['Short (under 10 steps)','Medium (10–15 steps)','Long (15+ steps)','I don’t bowl pace']},
    {id:'ball', text:'What cricket do you usually play?', type:'choice', options:['Leather ball','Tennis ball','Both','Box cricket']},
    {id:'format', text:'Usual match format', type:'choice', options:['T10 / box','T20','30–40 overs','One-day (50 overs)']},
    {id:'level', text:'Level you play at', type:'choice', options:['Casual with friends','Club / league','Academy / competitive']},
    {id:'field', text:'Where do you usually field?', type:'choice', options:['Close-in / slips','Inner ring','Outfield / boundary','Varies']},
    {id:'nets_min', text:'Typical nets session length', type:'number', unit:'min'},
    {id:'nets_overs', text:'Overs you usually bowl in nets', type:'number', unit:'overs'},
    {id:'freq', text:'How often do you play (nets + matches)?', type:'choice', options:FREQ},
  ],
  badminton: [
    {id:'level', text:'Your level', type:'choice', options:['Beginner','Intermediate','Advanced','Tournament player']},
    {id:'format', text:'What do you mostly play?', type:'choice', options:['Mostly singles','Mostly doubles','Both equally']},
    {id:'style', text:'What are your sessions usually like?', type:'choice', options:['Casual rallies','Competitive games','Coaching / drills','A mix']},
    {id:'length', text:'Typical session length', type:'number', unit:'min'},
    {id:'freq', text:'How often do you play?', type:'choice', options:FREQ},
  ],
  gym: [
    {id:'exp', text:'How long have you been lifting?', type:'choice', options:['Under 6 months','6–24 months','2–5 years','5+ years']},
    {id:'split', text:'How do you split your training?', type:'choice', options:['Full body','Upper / lower','Push / pull / legs','One muscle group a day','It varies']},
    {id:'days', text:'Gym days per week', type:'number', unit:'days'},
    {id:'session', text:'Typical session length', type:'number', unit:'min'},
    {id:'focus', text:'Main focus', type:'choice', options:['Strength','Muscle size','Fat loss','General fitness','Sport performance']},
  ],
};
const SPORT_CHOICES = [['cricket','Cricket'],['badminton','Badminton'],['gym','Gym / weights'],['football','Football'],['running','Running'],['swimming','Swimming'],['tennis','Tennis'],['cycling','Cycling'],['yoga','Yoga']];
function sportKey(name){
  const k = String(name||'').trim().toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,'-');
  if (/badminton|shuttle/.test(k)) return 'badminton';
  if (/cricket|nets|bowling/.test(k)) return 'cricket';
  if (/^gym|weight|lifting/.test(k)) return 'gym';
  if (/football|soccer/.test(k)) return 'football';
  if (/run|jog/.test(k)) return 'running';
  return k.slice(0,40) || 'activity';
}
const sportName = key => (SPORT_CHOICES.find(x=>x[0]===key)||[])[1] || titleCase(key.replace(/-/g,' '));
function sportProfileText(key){
  const sp = (prof().sports||{})[key];
  if (!sp || !sp.answers || !sp.answers.length) return 'No profile for this sport yet.';
  return sp.answers.filter(a=>a.a!==''&&a.a!=null).map(a=>`${a.q}: ${a.a}`).join('\n');
}
function dayContext(date){
  const d = getDay(date), t = dayTotals(d), T = dayTargets(d), H = d.health||{};
  const lines = [];
  lines.push(`Sleep last night: ${H.sleep_min?fmtSleep(H.sleep_min):'not logged'}`);
  lines.push(`Steps so far: ${H.steps?n0(H.steps):'not logged'}`);
  lines.push(`Eaten so far: ${n0(t.kcal)} of ${n0(T.kcal)} kcal, protein ${n0(t.protein)} of ${n0(T.protein)} g, carbs ${n0(t.carbs)} g, water ${n1(t.water/1000)} L`);
  if ((d.exercises||[]).length) lines.push(`Gym today: ${d.exercises.map(e=>`${e.name} ${(e.sets||[]).length} sets`).join(', ')}`);
  if ((d.sports||[]).length) lines.push(`Other activity today: ${d.sports.map(a=>`${actTitle(a)}${a.minutes?' '+n0(a.minutes)+' min':''}${a.rpe?' effort '+a.rpe+'/10':''}`).join('; ')}`);
  for (let i=1;i<=3;i++){ const dd=S.days.get(addDays(date,-i)); if(!dd) continue; const bits=[];
    if ((dd.exercises||[]).length) bits.push('gym: '+[...new Set(dd.exercises.map(e=>e.muscle_group))].join('/'));
    for (const a of dd.sports||[]) bits.push(`${actTitle(a)}${a.minutes?' '+n0(a.minutes)+' min':''}${a.rpe?' effort '+a.rpe+'/10':''}${a.stats&&a.stats.balls_bowled?' '+a.stats.balls_bowled+' balls bowled':''}`);
    if (dd.health&&dd.health.sleep_min) bits.push('slept '+fmtSleep(dd.health.sleep_min));
    if (bits.length) lines.push(`${i} day${i>1?'s':''} ago: ${bits.join('; ')}`); }
  return lines.join('\n');
}
function coachPrompt(item, allowQuestions){
  const p = prof(), W = who(item.date);
  const qa = (item.qa||[]).map(x=>`Q: ${x.q}\nA: ${x.a}`).join('\n');
  return `You are a sports scientist and coach estimating energy use and recovery for one amateur athlete in India.
Athlete: ${p.sex}, ${W.age} y, ${W.cm} cm, ${n1(W.kg)} kg, goal: ${(GOALS[p.goal]||{}).label||p.goal}.
How they play ${item.name}:
${sportProfileText(item.key)}
Their day so far and recent training:
${dayContext(item.date)}
What they logged (${item.date}, ${item.time}): "${item.entry}"
${qa?`Their answers to your questions:\n${qa}\n`:''}
${allowQuestions ? `If a missing detail would change the calories or the recovery advice a lot, ask about it instead of guessing. Use their profile so you don't ask what you already know (for example, don't ask a fast bowler what they bowl). Ask at most 4 short questions, prefer multiple choice with 3-5 options, and include an option like "Not sure" where useful. Reply with ONLY:
{"status":"questions","questions":[{"id":"overs","text":"How many overs did you bowl?","type":"number","unit":"overs"},{"id":"fielding","text":"How much fielding did you do?","type":"choice","options":["Whole innings in the outfield","Half the innings","Very little"]}]}
If you already have enough, skip the questions and give the result below.` : `Do not ask questions. Where a detail is missing, use what is typical for this athlete's profile and say so in assumptions.`}
The result is ONLY this JSON:
{"status":"done","title":"Cricket match (T20)","summary":"4 overs of fast bowling, 18 balls batting, fielded the full innings","minutes":190,
"components":[{"part":"Fast bowling, 4 overs with long run-up","minutes":20,"met":7.5},{"part":"Fielding 20 overs, outfield","minutes":80,"met":3.5}],
"rpe":7,"stats":{"balls_bowled":24,"balls_faced":18,"overs_fielded":20,"minutes_batted":15},
"recovery":{"hours":36,"level":"hard","summary":"Two sentences on how hard this was for them today and when they can train hard again.","tips":["3-4 short, specific actions: sleep, food with grams, what to avoid tomorrow, body areas to look after"]},
"assumptions":"one short sentence"}
Rules for the result:
- Split the whole session into components whose minutes add up to the session length, including waiting, walking back, drinks breaks and time on the bench (MET 1.5-2.5). Use MET values from the Compendium of Physical Activities (2024 edition), adjusted for their role, run-up, intensity, format and level. Fast bowling with a long run-up is roughly 7-8 MET while bowling; spin about 4.5. Give gross METs; the app subtracts this person's own resting burn.
- rpe is session effort from 1 to 10. stats uses only numbers that apply (null otherwise).
- recovery.hours is the time until they're ready for another hard session of this kind. Base it on this session's load plus last night's sleep, food and protein eaten so far versus their targets, and training in the last 3 days. For fast bowlers, mention bowling workload (overs this week) when relevant. level is "light", "moderate" or "hard".`;
}
function qHtml(questions, answers, ns){
  return questions.map(q => {
    const v = answers[q.id];
    if (q.type==='choice' && Array.isArray(q.options)) return `<div class="q"><div class="qt">${esc(q.text)}</div><div class="opts">${q.options.map(o=>`<button type="button" class="opt" data-action="ans" data-ns="${ns}" data-q="${esc(q.id)}" data-v="${esc(o)}" aria-pressed="${v===o}">${esc(o)}</button>`).join('')}</div></div>`;
    return `<label class="q"><span class="qt">${esc(q.text)}</span><span class="row"><input class="qin" ${q.type==='number'?'type="number" min="0" step="any" inputmode="decimal"':'type="text"'} data-bind="${ns}.${esc(q.id)}" value="${esc(v??'')}" style="max-width:${q.type==='number'?'140px':'100%'}">${q.unit?`<span class="muted small">${esc(q.unit)}</span>`:''}</span></label>`;
  }).join('');
}
function cleanQuestions(qs){
  return (Array.isArray(qs)?qs:[]).slice(0,6).map((q,i)=>({id:String(q.id||('q'+i)).replace(/[^\w-]/g,'').slice(0,30)||('q'+i), text:String(q.text||'').slice(0,200),
    type:['choice','number','text'].includes(q.type)?q.type:(Array.isArray(q.options)?'choice':'text'), options:Array.isArray(q.options)?q.options.slice(0,6).map(o=>String(o).slice(0,60)):undefined, unit:q.unit?String(q.unit).slice(0,16):undefined})).filter(q=>q.text);
}
function enqueueActivity(a, date){
  const key = sportKey(a.sport); const has = (prof().sports||{})[key];
  if (!has && !S.queue.some(x=>x.type==='profile'&&x.key===key)) S.queue.push({type:'profile', key, name:sportName(key), questions:SPORT_Q[key]||null, answers:{}, isNew:true});
  S.queue.push({type:'coach', key, name:sportName(key), entry:a.entry||a.sport, date, time:nowTime(), questions:null, answers:{}, qa:[]});
}
async function runQueue(){
  if (S.qBusy) return;
  while (S.queue.length) {
    const it = S.queue[0];
    if (it.type==='profile') {
      if (!it.questions) { S.qBusy=true; S.qStatus=`Preparing a few questions about ${it.name}…`; render();
        try { it.questions = cleanQuestions(await S.sample.json(`Write 4 to 6 short questions that profile how an amateur athlete in India does "${it.name}", so a coach can later estimate calories burned and recovery from a short description of a session. Cover role or position, level, usual session format and length, intensity, and how often. Prefer multiple choice with 3-5 options. Reply with ONLY a JSON array like [{"id":"level","text":"Your level","type":"choice","options":["Beginner","Intermediate","Advanced"]},{"id":"length","text":"Typical session length","type":"number","unit":"min"}]`, {task:'questions'})); }
        catch(e){ it.questions = []; }
        if (!it.questions.length) it.questions = [{id:'about', text:`Describe how you usually do ${it.name}: level, intensity, typical session length and how often.`, type:'text'}];
        S.qBusy=false; S.qStatus='';
      }
      render(); return; // wait for the person
    }
    if (it.type==='coach') {
      if (it.questions && !it.submitted) { render(); return; }
      S.qBusy=true; it.failed=false; S.qStatus = it.submitted ? `Working out your ${it.name} session…` : `Looking at your ${it.name} session…`; render();
      try {
        const res = await S.sample.json(coachPrompt(it, !it.submitted), {task:'coach'});
        if (res && res.status==='questions' && !it.submitted && cleanQuestions(res.questions).length) {
          it.questions = cleanQuestions(res.questions); S.qBusy=false; S.qStatus=''; render(); return;
        }
        await saveActivity(it, res); S.queue.shift();
      } catch(e) {
        S.qBusy=false; S.qStatus = (AI_ERR[e?.code]||`Couldn’t work out the ${it.name} session.`) + ' Tap Try again, or Discard to drop it.'; it.failed=true; render(); return;
      }
      S.qBusy=false; S.qStatus='';
    }
  }
  render();
}
async function saveActivity(it, res){
  const act = makeActivity(it, res);
  await writeDay(it.date, d => { d.sports = [...(d.sports||[]), act]; });
  setStatus(`${act.title}: about ${n0(act.kcal)} kcal on top of resting, over ${n0(act.minutes)} min.${act.recovery?` Recovery about ${Math.round(act.recovery.hours)} h.`:''}${act.local?' Estimated without AI.':''}`);
}
function makeActivity(it, res){
  const W = who(it.date);
  const comps = (Array.isArray(res?.components)?res.components:[]).slice(0,12).map(c=>({part:String(c.part||'').slice(0,90), minutes:num(c.minutes,600), met:Math.min(Math.max(Number(c.met)||0,1),16)})).filter(c=>c.minutes>0);
  const minutes = comps.reduce((a,c)=>a+c.minutes,0) || num(res?.minutes,1440);
  // Net of resting burn: resting is already counted in your daily maintenance.
  const kcal = Math.round(comps.reduce((a,c)=>a+Calc.netKcalFromMet(c.met, W.kg, c.minutes, W.bmrKcal).net,0));
  const kcal_gross = Math.round(comps.reduce((a,c)=>a+Calc.netKcalFromMet(c.met, W.kg, c.minutes, W.bmrKcal).gross,0));
  const rc = res?.recovery||{}; const hours = num(rc.hours,240)||null;
  const st = res?.stats||{}; const stats = {}; for (const k of ['balls_bowled','balls_faced','overs_fielded','minutes_batted']) { const v=num(st[k],1000); if (v) stats[k]=Math.round(v); }
  const base = it.date===localDate() ? new Date() : new Date(it.date+'T'+(it.time||'18:00')+':00');
  const act = {id:uid(), v:2, key:it.key, sport:it.name, title:String(res?.title||it.name).slice(0,60), summary:String(res?.summary||'').slice(0,200), entry:it.entry,
    minutes:Math.round(minutes), components:comps, kcal, kcal_gross, rpe:Math.min(10,Math.max(1,Math.round(Number(res?.rpe)||5))), stats,
    recovery: hours ? {hours, level:['light','moderate','hard'].includes(rc.level)?rc.level:'moderate', summary:String(rc.summary||'').slice(0,400), tips:(Array.isArray(rc.tips)?rc.tips:[]).slice(0,5).map(x=>String(x).slice(0,200)), ready_at:new Date(base.getTime()+hours*3600e3).toISOString()} : null,
    assumptions:String(res?.assumptions||'').slice(0,240), qa:it.qa, time:it.time, ...(res?.local?{local:true}:{})};
  return act;
}
/* ---------- sports without AI (sports.js + data/activities.json) ----------
   The 2024 Adult Compendium of Physical Activities gives each activity a MET. Calories:
   MET × weight × time, minus what you'd have burned resting anyway (your BMR, from height,
   weight, age and sex), because resting is already counted in your maintenance. */
let actsP = null;
const loadActs = () => actsP ||= fetch(`data/activities.json?v=${DATA_VER}`).then(r => r.ok ? r.json() : null).then(t => { if (t) Sports.setTable(t); else actsP = null; }).catch(() => { actsP = null; });
function sportProfile(key){
  const ans = ((prof().sports||{})[key]||{}).answers||[];
  const len = ans.find(a => /^(length|session|nets_min)$/.test(a.id) && Number(a.a) > 0);
  return {text: ans.map(a => String(a.a||'')).join(' '), minutes: len ? Math.min(Number(len.a), 480) : 0};
}
function sportFromText(text, date, famKey, effort){
  if (typeof Sports === 'undefined' || !Sports.ready()) return null;
  let sp = Sports.read(text, {effort});
  if (!sp && famKey) { const f = Sports.family(famKey); if (f) sp = Sports.read(`${f[1]} session ${text}`, {effort}); }
  if (!sp) return null;
  sp = Sports.read(sp.text, {profile: sportProfile(sp.key), effort}) || sp;
  const hours = sp.met >= 7 && sp.minutes >= 60 ? 36 : sp.met >= 5 && sp.minutes >= 45 ? 24 : 12;
  const rpe = sp.met < 3 ? 3 : sp.met < 4.5 ? 4 : sp.met < 6 ? 5 : sp.met < 8 ? 6 : sp.met < 10 ? 7 : 8;
  return {key:sp.key, name:sp.name, minutes:sp.minutes, res:{local:true, title:sp.name, summary:`${n0(sp.minutes)} min${sp.km?`, ${n1(sp.km)} km`:''}, ${sp.level} effort`, minutes:sp.minutes,
    components:[{part:sp.desc, minutes:sp.minutes, met:sp.met}], rpe, stats:sp.stats,
    recovery:{hours, level:hours>=36?'hard':hours>=24?'moderate':'light', summary:`About ${hours} hours before another hard ${sp.name.toLowerCase()} session.`, tips:['Drink water with a pinch of salt if you sweated a lot.','Eat a meal with protein and carbs within a couple of hours.']},
    assumptions:`${sp.assumed ? sp.assumed + ' ' : ''}Compendium ${sp.code}: ${sp.desc} (MET ${n1(sp.met)}). Add words like casual, singles, competitive or a distance to adjust.`}};
}
/* About how much a sport burns in an hour for this person, over resting. */
function sportKcalPerHour(key, date){
  if (typeof Sports === 'undefined' || !Sports.ready()) return null;
  const f = Sports.family(key); if (!f) return null;
  const sp = Sports.read(`${f[1]} 60 min`, {profile: sportProfile(key)}); if (!sp) return null;
  const W = who(date||localDate());
  return {kcal:Math.round(Calc.netKcalFromMet(sp.met, W.kg, 60, W.bmrKcal).net), met:sp.met, desc:sp.desc};
}
function queueCard(){
  const it = S.queue[0]; if (!it) return '';
  if (S.qBusy) return `<div class="qcard"><div class="qhead">${esc(S.qStatus||'Working…')}</div></div>`;
  if (it.type==='coach' && it.failed) { const est = sportFromText(it.entry, it.date, sportKey(it.name));
    const pick = !est && typeof Sports!=='undefined' && Sports.ready() ? `<label class="q"><span class="qt">Not in the activity table. Log it as the closest one:</span><select id="qSimilar">${Sports.families().map(f=>`<option value="${f.key}">${esc(f.name)}</option>`).join('')}</select></label>` : '';
    return `<div class="qcard"><div class="qhead">${esc(it.name)}</div><div class="status err">${esc(S.qStatus)}</div>${pick}
    <div class="row"><button class="btn ghost sm" data-action="qDiscard">Discard</button>${est||pick?`<button class="btn ghost sm" data-action="qLocal">${est?'Log an estimate without AI':'Log as this activity'}</button>`:''}<span class="spacer"></span><button class="btn sm" data-action="qRetry">Try again</button></div></div>`; }
  if (it.type==='profile') return `<div class="qcard"><div class="qhead">${it.isNew?`New sport: ${esc(it.name)}. Tell me how you play and I’ll remember it.`:`Update how you play ${esc(it.name)}`}</div>
    <div class="qs">${qHtml(it.questions||[], it.answers, 'q')}</div>
    <div class="row"><button class="btn ghost sm" data-action="qSkipProfile">Skip for now</button><span class="spacer"></span><button class="btn sm" data-action="qSaveProfile">Save${S.queue[1]?' and continue':''}</button></div></div>`;
  if (it.type==='coach' && it.questions) return `<div class="qcard"><div class="qhead">${esc(it.name)}: a few details so I can get this right</div>
    <div class="muted small">“${esc(it.entry)}”</div>
    <div class="qs">${qHtml(it.questions, it.answers, 'q')}</div>
    <div class="row"><button class="btn ghost sm" data-action="qDiscard">Discard</button><button class="btn ghost sm" data-action="qSkip">Skip, use typical</button><span class="spacer"></span><button class="btn sm" data-action="qSubmit">Calculate</button></div></div>`;
  return '';
}
function saveSportProfile(key, name, questions, answers){
  const p = prof(); const sports = {...(p.sports||{})};
  sports[key] = {name, answers:questions.map(q=>({id:q.id, q:q.text, a:answers[q.id]??''})), updated:localDate()};
  return saveProfile({...p, sports});
}
const actTitle = a => a.v===2 ? a.title : sportTitle(a);
const actLine = a => a.v===2 ? (a.summary || (a.components||[]).map(c=>c.part).join(' · ')) : sportLine(a);


/* ---------- activity panel + setup ---------- */
function activityPanel(day){
  const acts = day.sports||[], ex = day.exercises||[], t = dayTotals(day);
  let h = '';
  if (!acts.length && !ex.length) h += `<div class="empty">Nothing yet. Start a workout above, or add a sport like badminton or a run.</div>`;
  for (const a of acts) {
    h += `<div class="act"><div class="act-h"><div><div class="nm">${esc(actTitle(a))}${a.rpe?` <span class="tag">effort ${a.rpe}/10</span>`:''}</div><div class="sub">${esc(actLine(a))}${a.minutes?` · ${n0(a.minutes)} min`:''}</div></div>
      <div class="kc">${n0(a.kcal)}<span class="muted small"> kcal</span></div>
      <div class="acts"><button data-action="editSport" data-id="${a.id}" aria-label="Edit ${esc(actTitle(a))}">Edit</button><button data-action="delSport" data-id="${a.id}" aria-label="Delete ${esc(actTitle(a))}">✕</button></div></div>
      ${a.v===2 && (a.components||[]).length ? `<details class="how"><summary>How this was worked out</summary><ul>${a.components.map(c=>`<li>${esc(c.part)} · ${n0(c.minutes)} min · MET ${n1(c.met)}</li>`).join('')}</ul><div class="muted small">${a.kcal_gross?`${n0(a.kcal_gross)} kcal in total, minus your resting burn for those minutes = ${n0(a.kcal)} kcal extra. `:''}${esc(a.assumptions||'')}</div></details>`:''}
    </div>`;
  }
  if (ex.length) {
    h += `<div class="act"><div class="act-h"><div><div class="nm">Gym session</div><div class="sub">${ex.length} exercise${ex.length>1?'s':''}${day.gym_recovery&&day.gym_recovery.muscles?.length?` · ${esc(day.gym_recovery.muscles.join(', '))}`:''}</div></div><div class="kc">${n0(t.gym)}<span class="muted small"> kcal</span></div><span></span></div>
      ${exerciseList(day)}</div>`;
  }
  return h;
}
function staleSports(){
  const cutoff = addDays(localDate(), -90);
  return Object.entries(prof().sports||{}).filter(([k,v]) => v.updated && v.updated < cutoff && v.checked !== localDate().slice(0,7));
}
// Monthly: after two weeks of logs with no backup, or 30 days since the last one; "Later" waits a week.
function backupDue(){
  if (!S.profile || S.date!==localDate()) return false;
  let later = 0; try { later = +localStorage.getItem('mt:backup-later')||0; } catch {}
  if (Date.now() - later < 7*864e5) return false;
  const last = prof().last_backup;
  if (last) return last <= addDays(localDate(), -30);
  const logged = [...S.days.values()].filter(d => (d.foods||[]).length || (d.exercises||[]).length).length;
  return logged >= 14;
}
function todayBanners(){
  let h='';
  const waiting = S.isAdmin ? (S.members||[]).filter(x=>x.status==='pending').length : 0;
  let later = false; try { later = !!localStorage.getItem('mt:faceid-later:'+(S.user?.id||'')); } catch {}
  if (S.bioOK && S.passkeys && !S.passkeys.length && !later) h += `<div class="banner" style="margin-bottom:16px;border-left-color:var(--accent)"><b>Sign in with ${bioName()} next time.</b> No password needed after this. <button class="linkbtn" data-action="faceIdSetup" ${S.pkBusy?'disabled':''}>Turn it on</button><button class="linkbtn" data-action="faceIdLater" style="color:var(--ink-3)">Not now</button></div>`;
  if (waiting) h += `<div class="banner" style="margin-bottom:16px;border-left-color:var(--accent)">${waiting} ${waiting===1?'person is':'people are'} waiting for you to approve them. <button class="linkbtn" data-action="reviewPeople">Review</button></div>`;
  if (S.profile && !Object.keys(S.profile.sports||{}).length) h += `<div class="banner" style="margin-bottom:16px">Tell me which sports you play and how, so calories and recovery fit you. <button class="linkbtn" data-action="startSetup" data-step="sports">Set up my sports</button></div>`;
  if (backupDue()) h += `<div class="banner" style="margin-bottom:16px">${prof().last_backup ? `Your last backup was on ${esc(fmtDate(prof().last_backup,{day:'numeric',month:'short'}))}.` : 'You haven’t downloaded a backup yet.'} The free database has no backups of its own, so keep a copy on your phone. <button class="linkbtn" data-action="backupNow">Download backup</button><button class="linkbtn" data-action="backupLater" style="color:var(--ink-3)">Later</button></div>`;
  for (const [k,v] of staleSports()) h += `<div class="banner" style="margin-bottom:16px">Your ${esc(v.name)} details are from ${esc(fmtDate(v.updated,{day:'numeric',month:'short',year:'numeric'}))}. Still how you play? <button class="linkbtn" data-action="updSport" data-key="${esc(k)}">Update</button><button class="linkbtn" data-action="stillRight" data-key="${esc(k)}">Still right</button></div>`;
  return h;
}

// first-run interview
function startSetup(step){
  const p = prof();
  const keys = Object.keys(p.sports||{});
  const fresh = !S.profile; // first time: no made-up defaults for the required details
  S.setup = {step: step||'about', about:{name:p.name||'', sex:fresh?'':p.sex, birth:p.birth||'', height_cm:fresh?'':p.height_cm, weight_kg:fresh?'':p.weight_kg, goal:fresh?'':p.goal, goal_rate:p.goal_rate, activity:p.activity, watch_workouts:!!p.watch_workouts},
    withPw:needsPw(), sports:keys, other:'', answers:Object.fromEntries(keys.map(k=>[k, Object.fromEntries(((p.sports[k]||{}).answers||[]).map(a=>[a.id,a.a]))])), qs:{}};
  S.view='setup'; render(); window.scrollTo({top:0});
}
// Accounts made by "Request access" have no password until they choose one here.
const needsPw = () => !!S.user?.user_metadata?.needs_password;
function setupSteps(){ return ['about', ...(S.setup.withPw?['password']:[]), 'sports', ...S.setup.sports.map(k=>'sport:'+k), 'done']; }
function viewSetup(){
  const su = S.setup, steps = setupSteps(), idx = steps.indexOf(su.step), a = su.about;
  const head = `<div class="panel-head"><h2>Set up</h2><span class="muted small">Step ${idx+1} of ${steps.length}</span></div>`;
  const optional = idx > steps.indexOf(su.withPw ? 'password' : 'about') && su.step!=='done';
  const nav = (next='Next') => `<div class="row"><button class="btn ghost" data-action="setupBack" ${idx===0||su.step==='password'||(su.withPw&&su.step==='sports')?'hidden':''}>Back</button><span class="spacer"></span>${idx===0&&S.profile&&!su.withPw?`<button class="linkbtn" data-action="setupSkip">Skip for now</button>`:''}${optional?`<button class="linkbtn" data-action="setupFinish">Skip the rest</button>`:''}<button class="btn" data-action="setupNext" ${su.step==='password'&&!su.pwSaved?'disabled':''}>${next}</button></div>`;
  const sel = (key, obj) => Object.entries(obj).map(([k,v])=>`<option value="${k}" ${String(a[key])===k?'selected':''}>${esc(v.label||v)}</option>`).join('');
  if (su.step==='about') return `<section class="panel setup">${head}
    <h3>About you</h3><p class="muted small">This sets your calorie, protein, water and nutrient targets.${S.profile?'':' Name, date of birth, height, weight, sex and goal are needed to start.'}</p>
    <div class="form">
      <label class="field full">Your name<input type="text" maxlength="40" autocomplete="given-name" data-bind="about.name" placeholder="What should the app call you?" value="${esc(a.name||'')}"></label>
      <label class="field">Sex<select data-bind="about.sex">${a.sex?'':'<option value="" selected>Choose…</option>'}${sel('sex',{male:'Male',female:'Female'})}</select></label>
      <label class="field">Date of birth<input type="date" data-bind="about.birth" max="${localDate()}" value="${esc(a.birth)}"></label>
      <label class="field">Height (cm)<input type="number" step="0.5" data-bind="about.height_cm" value="${esc(a.height_cm)}"></label>
      <label class="field">Weight (kg)<input type="number" step="0.1" data-bind="about.weight_kg" value="${esc(a.weight_kg)}"></label>
      <label class="field full">Daily life, not counting gym and sport<select data-bind="about.activity">${sel('activity',ACTIVITY)}</select><span class="hint">Logged training is added on the day you do it.</span></label>
      <label class="field">Goal<select data-bind="about.goal">${a.goal?'':'<option value="" selected>Choose…</option>'}${sel('goal',GOALS)}</select></label>
      <label class="field">Rate (kg / week)<select data-bind="about.goal_rate">${sel('goal_rate',{'0.25':'0.25','0.5':'0.5','0.75':'0.75','1':'1'})}</select></label>
      <label class="check full"><input type="checkbox" data-bind="about.watch_workouts" ${a.watch_workouts?'checked':''}> I record gym and sport sessions on an Apple Watch</label>
    </div>${nav()}</section>`;
  if (su.step==='password') return `<section class="panel setup">${head}
    <h3>Choose a password</h3><p class="muted small">You’ll sign in with your email and this password${window.PublicKeyCredential?`, or with ${bioName()} once it’s turned on`:''}.</p>
    ${su.pwSaved ? `<div class="banner" style="border-left-color:var(--good)">Password saved.</div>
      ${window.PublicKeyCredential && S.bioOK!==false && !(S.passkeys||[]).length ? `<div class="banner" style="border-left-color:var(--accent)"><b>Sign in with ${bioName()} next time?</b> Quicker than typing your password. <button class="linkbtn" data-action="faceIdSetup" ${S.pkBusy?'disabled':''}>Turn it on</button></div>` : (S.passkeys||[]).length ? `<div class="muted small">${bioName()} is on for this device.</div>` : ''}`
    : `<div class="form">
      <label class="field full">Password<input id="suPass" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label>
      <label class="field full">Type it again<input id="suPass2" type="password" autocomplete="new-password" minlength="8"></label>
    </div>
    <div class="row"><span class="spacer"></span><button class="btn" data-action="setupPassword" ${su.pwBusy?'disabled':''}>${su.pwBusy?'Saving…':'Save password'}</button></div>`}
    ${su.pwMsg?`<div class="status err">${esc(su.pwMsg)}</div>`:''}
    ${nav()}</section>`;
  if (su.step==='sports') return `<section class="panel setup">${head}
    <h3>What do you play or train?</h3><p class="muted small">Pick everything you do regularly and I’ll ask a few questions about each one. You can skip this and add sports later in Profile.</p>
    <div class="opts">${SPORT_CHOICES.map(([k,l])=>`<button class="opt" data-action="setupSport" data-key="${k}" aria-pressed="${su.sports.includes(k)}">${esc(l)}</button>`).join('')}
      ${su.sports.filter(k=>!SPORT_CHOICES.some(c=>c[0]===k)).map(k=>`<button class="opt" data-action="setupSport" data-key="${esc(k)}" aria-pressed="true">${esc(sportName(k))}</button>`).join('')}</div>
    <div class="row"><input id="setupOther" type="text" placeholder="Something else, e.g. kabaddi" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--bg);padding:9px 10px"><button class="btn ghost sm" data-action="setupAddOther">Add</button></div>
    ${nav()}</section>`;
  if (su.step.startsWith('sport:')) {
    const k = su.step.slice(6); const qs = SPORT_Q[k] || su.qs[k];
    su.answers[k] ||= {};
    return `<section class="panel setup">${head}<h3>${esc(sportName(k))}</h3><p class="muted small">So I can tell a hard session from an easy one without asking every time. You can change these later in Profile.</p>
      ${qs ? `<div class="qs">${qHtml(qs, su.answers[k], 'setup.'+k)}</div>` : `<div class="empty">Preparing questions…</div>`}
      ${nav()}</section>`;
  }
  return `<section class="panel setup">${head}<h3>All set</h3>
    <p>Targets and sport details are saved. From now on, just tell the log box what you ate or did. When a session needs more detail, I’ll ask, then show calories burned and how long you need to recover.</p>
    ${nav('Save and start')}</section>`;
}
async function setupLoadQuestions(k){
  if (SPORT_Q[k] || S.setup.qs[k] || !S.sample) { if (!SPORT_Q[k] && !S.setup.qs[k]) S.setup.qs[k]=[{id:'about', text:`Describe how you usually do ${sportName(k)}: level, intensity, typical session length and how often.`, type:'text'}]; return; }
  try { S.setup.qs[k] = cleanQuestions(await S.sample.json(`Write 4 to 6 short questions that profile how an amateur athlete in India does "${sportName(k)}", so a coach can later estimate calories burned and recovery from a short description of a session. Cover role or position, level, usual session format and length, intensity, and how often. Prefer multiple choice with 3-5 options. Reply with ONLY a JSON array like [{"id":"level","text":"Your level","type":"choice","options":["Beginner","Intermediate","Advanced"]}]`, {task:'questions'})); }
  catch { S.setup.qs[k] = []; }
  if (!S.setup.qs[k].length) S.setup.qs[k] = [{id:'about', text:`Describe how you usually do ${sportName(k)}: level, intensity, typical session length and how often.`, type:'text'}];
  if (S.view==='setup') render();
}
// Step 1 is required; it's saved straight away so the rest can be skipped.
async function saveAbout(){
  const a = S.setup.about, p = prof();
  const miss = [!String(a.name||'').trim()&&'your name', !(/^\d{4}-\d{2}-\d{2}$/.test(a.birth||'') && Calc.ageOn(a.birth, localDate())>=13)&&'your date of birth', !num(a.height_cm,250)&&'your height', !num(a.weight_kg,300)&&'your weight', !a.sex&&'your sex', !a.goal&&'your goal'].filter(Boolean);
  if (miss.length) { toast(`Add ${miss.join(', ')} to continue.`); return false; }
  await saveProfile({...p, name:String(a.name).trim().slice(0,40), sex:a.sex, birth:a.birth, age:Calc.ageOn(a.birth, localDate()), height_cm:num(a.height_cm,250), weight_kg:num(a.weight_kg,300), activity:actId(a.activity), goal:a.goal, goal_rate:Number(a.goal_rate)||0.5, watch_workouts:!!a.watch_workouts});
  if (!getDay(localDate()).weight_kg) writeDay(localDate(), d => { d.weight_kg = num(a.weight_kg,300); });
  return true;
}
async function setupPassword(){
  const su = S.setup, pw = $('#suPass')?.value||'', pw2 = $('#suPass2')?.value||'';
  su.pwMsg = pw.length<8 ? 'Choose a password of at least 8 characters.' : pw!==pw2 ? 'The two passwords don’t match.' : '';
  if (su.pwMsg) { render(); return; }
  su.pwBusy = true; render();
  if (await pwnedPassword(pw)) { su.pwBusy=false; su.pwMsg=PWNED_MSG; render(); return; }
  const { data, error } = await SB.auth.updateUser({ password:pw, data:{ needs_password:false } });
  su.pwBusy = false;
  if (error) { su.pwMsg = authErrMsg(error, 'Couldn’t save the password. Try again.'); render(); return; }
  if (data?.user) S.user = data.user;
  su.pwSaved = true; render();
}
async function setupGo(dir){
  const su = S.setup, steps = setupSteps(); let i = steps.indexOf(su.step) + dir;
  if (dir>0 && su.step==='about') { if (!(await saveAbout())) return; }
  if (dir>0 && su.step==='password' && !su.pwSaved) return;
  if (dir>0 && su.step==='done') {
    const p = prof(); const a = su.about; const sports = {};
    for (const k of su.sports) { const qs = SPORT_Q[k] || su.qs[k] || []; const prev = (p.sports||{})[k];
      sports[k] = {name:sportName(k), answers:qs.map(q=>({id:q.id, q:q.text, a:(su.answers[k]||{})[q.id]??''})), updated:localDate()}; if (prev && JSON.stringify(prev.answers)===JSON.stringify(sports[k].answers)) sports[k].updated = prev.updated; }
    const birthOk = /^\d{4}-\d{2}-\d{2}$/.test(a.birth||'') && Calc.ageOn(a.birth, localDate())>=13;
    if (!birthOk) { toast('Add your date of birth on step 1: targets depend on age.'); su.step='about'; render(); return; }
    await saveProfile({...p, name:String(a.name||'').trim().slice(0,40), sex:a.sex, birth:a.birth, age:Calc.ageOn(a.birth, localDate()), height_cm:num(a.height_cm,250)||170, weight_kg:num(a.weight_kg,300)||70, activity:actId(a.activity), goal:a.goal, goal_rate:Number(a.goal_rate)||0.5, watch_workouts:!!a.watch_workouts, sports});
    if (num(a.weight_kg,300) && !getDay(localDate()).weight_kg) writeDay(localDate(), d => { d.weight_kg = num(a.weight_kg,300); });
    S.setup=null; S.view='today'; toast('Saved. Your targets and sport details are set.'); render(); window.scrollTo({top:0}); return;
  }
  i = Math.max(0, Math.min(steps.length-1, i)); su.step = steps[i];
  if (su.step.startsWith('sport:')) setupLoadQuestions(su.step.slice(6));
  render(); window.scrollTo({top:0});
}
function sportsProfileHtml(){
  const sp = prof().sports||{};
  const rows = Object.entries(sp).map(([k,v]) => `<div class="item"><div><div class="nm">${esc(v.name||sportName(k))}</div><div class="sub">${esc((v.answers||[]).filter(a=>a.a!==''&&a.a!=null).map(a=>a.a).join(' · ')||'No details yet')}</div><div class="sub">Updated ${esc(v.updated?fmtDate(v.updated,{day:'numeric',month:'short',year:'numeric'}):'—')}</div></div><span></span>
    <div class="acts"><button data-action="updSport" data-key="${esc(k)}">Update</button><button data-action="rmSport" data-key="${esc(k)}" aria-label="Remove ${esc(v.name)}">✕</button></div></div>`).join('');
  return `${rows || '<div class="muted small">No sports set up yet.</div>'}<div class="row"><button class="btn ghost sm" data-action="startSetup" data-step="sports">Add or change sports</button><button class="btn ghost sm" data-action="startSetup" data-step="about">Redo full setup</button></div>${kcalTableHtml()}`;
}
/* Calories an hour for this person, from the Compendium: light / usual / hard rows. */
function kcalTableHtml(){
  if (typeof Sports === 'undefined' || !Sports.ready()) { loadActs().then(() => { if (S.view==='profile') render(); }); return ''; }
  const W = who(localDate()); if (!(W.kg > 0)) return '';
  const mine = Object.keys(prof().sports||{});
  const keys = [...new Set([...mine, 'badminton','cricket','running','swimming','tennis','football','cycling','walking','table-tennis','yoga'])].filter(k => Sports.family(k));
  const kc = t => { const sp = Sports.read(t); return sp ? Math.round(Calc.netKcalFromMet(sp.met, W.kg, 60, W.bmrKcal).net) : null; };
  const cell = v => `<td class="num">${v==null?'—':n0(v)}</td>`;
  // Pace sports by speed (km in an hour); the rest by casual / usual / competitive play.
  const PACE = {running:[8,10,12], jogging:[7,8,9], walking:[4,5,6.5], cycling:[15,20,25]};
  const rows = keys.map(k => { const n = Sports.family(k)[1];
    const [lo, mid, hi] = PACE[k] ? PACE[k].map(v => kc(`${n} ${v} km in 60 min`)) : k==='swimming' ? ['swimming leisurely 60 min','swimming 60 min','swimming laps fast 60 min'].map(kc) : [`${n} casual 60 min`, `${n} 60 min`, `${n} competitive 60 min`].map(kc);
    return `<tr><td>${esc(n)}</td>${cell(lo===mid?null:lo)}${cell(mid)}${cell(hi===mid?null:hi)}</tr>`; }).join('');
  return `<details class="howfold" style="margin-top:12px"><summary>Calories an hour for you</summary>
    <table class="ktab"><thead><tr><th>Activity</th><th class="num">Casual</th><th class="num">Usual</th><th class="num">Hard</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="muted small">A dash means the Compendium has one value for that effort, so it’s the same as Usual. Running, walking and cycling columns are 8 / 10 / 12, 4 / 5 / 6.5 and 15 / 20 / 25 km/h. kcal per hour on top of resting, for ${n1(W.kg)} kg${W.cm?`, ${n0(W.cm)} cm`:''}${W.age?`, ${W.age} years`:''}. From the 2024 Adult Compendium of Physical Activities: MET × your weight × time, minus your own resting burn (from your height, weight, age and sex). Log a distance and your pace is used.</div></details>`;
}


/* ---------- health reports ---------- */
function recentDiet(days=7){
  const rows=[]; for (let i=0;i<days;i++){ const d=S.days.get(addDays(localDate(),-i)); if (d && (d.foods||[]).length) rows.push(dayTotals(d)); }
  if (!rows.length) return 'No food logged in the last week.';
  const avg = k => rows.reduce((s,r)=>s+(k in r ? r[k] : r.micros[k]||0),0)/rows.length;
  return `Average over ${rows.length} logged days: ${n0(avg('kcal'))} kcal, protein ${n0(avg('protein'))} g, carbs ${n0(avg('carbs'))} g, fat ${n0(avg('fat'))} g, saturated fat ${n0(avg('sat_fat_g'))} g, fibre ${n0(avg('fiber'))} g, sugar ${n0(avg('sugar'))} g, sodium ${n0(avg('sodium_mg'))} mg, cholesterol ${n0(avg('cholesterol_mg'))} mg.`;
}
function reportPrompt(nImages, total, isPdf){
  const p = prof(), W = who(localDate());
  return `You are a doctor-informed sports nutritionist in India. ${isPdf ? 'The attached PDF is one blood test / lab report.' : `The ${nImages} attached image${nImages>1?'s are pages':' is a page'} of one blood test / lab report.`}
Person: ${p.sex}, ${W.age} y, ${W.cm} cm, ${n1(W.kg)} kg, goal: ${(GOALS[p.goal]||{}).label}. Sports: ${Object.values(p.sports||{}).map(s=>s.name).join(', ')||'not set'}.
Their recent eating: ${recentDiet()}
Read every test result on the pages and reply with ONLY this JSON:
{"report_date":"YYYY-MM-DD","lab":"lab name or empty",
"markers":[{"key":"ldl_cholesterol","name":"LDL cholesterol","value":132,"value_text":null,"unit":"mg/dL","ref":"< 100","status":"high","category":"Lipids"}],
"summary":"2-3 plain sentences on the overall picture",
"findings":[{"title":"LDL cholesterol is high","detail":"what it means for this person, in plain words","severity":"watch"}],
"eating":["specific changes with Indian foods and amounts"],"training":["specific changes to training or sport"],"lifestyle":["sleep, sun, stress, alcohol, smoking etc."],
"retest":"which tests to repeat and when",
"see_doctor":false,
"target_adjustments":{"sat_fat_pct":null,"cholesterol_mg":null,"sugar_pct":null,"sodium_mg":null,"fiber_g":null,"micro_targets":{},"focus":[],"reasons":[]}}
Rules:
- key is a stable snake_case name so the same test matches across reports: total_cholesterol, ldl_cholesterol, hdl_cholesterol, triglycerides, vldl, non_hdl, hba1c, fasting_glucose, pp_glucose, fasting_insulin, hemoglobin, rbc, wbc, platelets, ferritin, serum_iron, tibc, vitamin_d, vitamin_b12, folate, tsh, t3, t4, alt, ast, alp, ggt, bilirubin, albumin, creatinine, urea, bun, egfr, uric_acid, sodium, potassium, calcium, crp, testosterone, etc.
- value is a number in the report's unit; for non-numeric results use null and put the text in value_text. ref is the reference range as printed. status is low, high, borderline or normal, judged against the printed range (or standard adult ranges if none is printed).
- findings: only the results that matter (skip normal ones unless reassuring context helps), severity "good", "watch" or "see_doctor". Set see_doctor true if anything needs a doctor soon.
- eating / training / lifestyle: 2-5 items each, concrete and tailored to this person's results, goal, sports and current eating.
- target_adjustments: only change what the results justify, and give one reason per change. sat_fat_pct 5-10 (percent of calories), cholesterol_mg 150-300, sugar_pct 3-10, sodium_mg 1200-2300, fiber_g 25-50. micro_targets may raise targets for vitamin_d_mcg, vitamin_b12_mcg, iron_mg, folate_mcg, calcium_mg, magnesium_mg, potassium_mg, zinc_mg, omega3_g. focus lists nutrient keys from ${MICROS.map(m=>m.key).join(', ')} to highlight. Leave everything null/empty if no change is needed.
- This is guidance, not a diagnosis; never suggest prescription medicine doses.`;
}
async function onReportFiles(files){
  if (!files.length) return;
  if (!S.sample) { S.repStatus='Reading reports needs AI, which isn’t set up for this app yet.'; render(); return; }
  const max = 5;
  S.repBusy=true; S.repStatus='Preparing the report…'; render();
  try {
    // PDFs go to Claude as documents (it reads the text layer and the page
    // images, which is more accurate than photos); photos are sent as images.
    let images=[], documents=[], total=0;
    for (const f of files) {
      if (f.type==='application/pdf' || /\.pdf$/i.test(f.name)) { if (!documents.length) { documents.push(f); total++; } }
      else if (images.length<max) { images.push(await toJpeg(f)); total++; }
    }
    if (!documents.length && !images.length) throw {code:'no_markers'};
    const parts = documents.length ? 'the PDF' : `${images.length} page${images.length>1?'s':''}`;
    S.repStatus = `Reading ${parts}… this can take a minute.`; render();
    const res = await S.sample.json(reportPrompt(documents.length ? 0 : images.length, total, !!documents.length), {images, documents, task:'report'});
    const rep = normalizeReport(res);
    if (!rep.markers.length) throw {code:'no_markers'};
    if (S.db) await S.db.doc('reports/'+rep.id).set(rep);
    S.reports = [rep, ...S.reports.filter(r=>r.id!==rep.id)].sort((a,b)=>b.report_date.localeCompare(a.report_date));
    S.repSel = rep.id;
    S.repStatus = `Read ${rep.markers.length} results from ${fmtDate(rep.report_date,{day:'numeric',month:'short',year:'numeric'})}.`;
  } catch(e) {
    S.repStatus = e?.code==='pdf_failed' ? 'Couldn’t open that PDF here. Take screenshots of the pages and upload those instead.'
      : e?.code==='no_markers' ? 'No test results were found in that file. Make sure the pages with the result tables are included.'
      : (AI_ERR[e?.code] || 'Couldn’t read the report. Try again, or upload clear photos of the result pages.');
  } finally { S.repBusy=false; render(); }
}
function normalizeReport(res){
  const st = ['low','high','borderline','normal'];
  const markers = (Array.isArray(res?.markers)?res.markers:[]).slice(0,120).map(m=>({key:String(m.key||m.name||'').toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,40), name:String(m.name||m.key||'').slice(0,60),
    value: Number.isFinite(Number(m.value)) && m.value!==null && m.value!=='' ? Number(m.value) : null, value_text:m.value_text?String(m.value_text).slice(0,60):null,
    unit:String(m.unit||'').slice(0,20), ref:String(m.ref||'').slice(0,40), status:st.includes(m.status)?m.status:'normal', category:String(m.category||'Other').slice(0,30)})).filter(m=>m.key&&m.name);
  const ta = res?.target_adjustments||{}; const clamp=(v,a,b)=>{ const n=Number(v); return Number.isFinite(n)&&n>0 ? Math.min(b,Math.max(a,n)) : null; };
  const mt = {}; for (const [k,v] of Object.entries(ta.micro_targets||{})) if (MICROS.some(m=>m.key===k) && Number(v)>0) mt[k]=Number(v);
  const adjust = {sat_fat_pct:clamp(ta.sat_fat_pct,5,10), cholesterol_mg:clamp(ta.cholesterol_mg,150,300), sugar_pct:clamp(ta.sugar_pct,3,10), sodium_mg:clamp(ta.sodium_mg,1200,2300), fiber_g:clamp(ta.fiber_g,25,50),
    micro_targets:mt, focus:(Array.isArray(ta.focus)?ta.focus:[]).filter(k=>MICROS.some(m=>m.key===k)), reasons:(Array.isArray(ta.reasons)?ta.reasons:[]).slice(0,8).map(x=>String(x).slice(0,200))};
  const list = x => (Array.isArray(x)?x:[]).slice(0,6).map(v=>String(v).slice(0,300));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(res?.report_date||'') ? res.report_date : localDate();
  return {id:uid(), report_date:date, lab:String(res?.lab||'').slice(0,60), markers, summary:String(res?.summary||'').slice(0,600),
    findings:(Array.isArray(res?.findings)?res.findings:[]).slice(0,10).map(f=>({title:String(f.title||'').slice(0,100), detail:String(f.detail||'').slice(0,400), severity:['good','watch','see_doctor'].includes(f.severity)?f.severity:'watch'})),
    eating:list(res?.eating), training:list(res?.training), lifestyle:list(res?.lifestyle), retest:String(res?.retest||'').slice(0,300), see_doctor:!!res?.see_doctor, adjust, created:Date.now()};
}
function adjustLines(a){
  const out=[]; if (!a) return out;
  if (a.sat_fat_pct) out.push(`Saturated fat limit: ${a.sat_fat_pct}% of calories`);
  if (a.cholesterol_mg) out.push(`Dietary cholesterol limit: ${a.cholesterol_mg} mg`);
  if (a.sugar_pct) out.push(`Added sugar limit: ${a.sugar_pct}% of calories`);
  if (a.sodium_mg) out.push(`Sodium limit: ${n0(a.sodium_mg)} mg`);
  if (a.fiber_g) out.push(`Fibre target: ${a.fiber_g} g`);
  for (const [k,v] of Object.entries(a.micro_targets||{})) { const m=MICROS.find(x=>x.key===k); if (m) out.push(`${m.label} target: ${fmtAmt(v,m.unit)} ${m.unit}`); }
  return out;
}
const sevPill = s => s==='see_doctor'?'bad':s==='good'?'good':'warn';
const sevLabel = s => s==='see_doctor'?'See a doctor':s==='good'?'Good':'Watch';
const statusPill = s => s==='high'||s==='low' ? `<span class="pill bad">${s}</span>` : s==='borderline' ? '<span class="pill warn">borderline</span>' : '<span class="pill good">normal</span>';
function viewHealth(){
  const reps = S.reports||[]; const sel = reps.find(r=>r.id===S.repSel) || reps[0]; const p = prof(); const applied = p.report_adjust;
  let h = `<div class="grid">
    <section class="panel" id="reports"><div class="panel-head"><h2>Blood tests</h2><span class="muted small">${reps.length} report${reps.length===1?'':'s'}</span></div>
      <div class="small">Upload a lab report (PDF, or photos or screenshots of the pages). AI reads each result, explains what’s out of range, and suggests changes to your eating and training that you can apply to your targets.</div>
      <div class="row"><button class="btn" data-action="pickReport" ${S.repBusy||S.aiState==='off'?'disabled':''}>${S.repBusy?'Working…':'Add a report'}</button><span class="status${/Couldn|No test|needs|can’t/.test(S.repStatus||'')?' err':''}" aria-live="polite">${esc(S.repStatus||'')}</span></div>
      ${applied ? `<div class="banner">Your targets include changes from your ${esc(fmtDate(applied.from_date||localDate(),{day:'numeric',month:'short',year:'numeric'}))} report: ${esc(adjustLines(applied).join('; ')||'highlighted nutrients')}. <button class="linkbtn" data-action="unapplyReport">Remove these changes</button></div>`:''}
    </section>`;
  if (!sel) return h + `<section class="panel"><div class="empty">No reports yet. A lipid profile, HbA1c, vitamin D, B12, iron studies, thyroid, liver and kidney tests are the most useful for someone who trains and plays sport.</div></section></div>`;
  const cats = [...new Set(sel.markers.map(m=>m.category))];
  const flagged = sel.markers.filter(m=>m.status!=='normal');
  h += `<section class="panel"><div class="panel-head"><h2>${esc(fmtDate(sel.report_date,{day:'numeric',month:'long',year:'numeric'}))}</h2><span class="muted small">${esc(sel.lab||'')} · ${sel.markers.length} results · ${flagged.length} flagged</span></div>
    ${reps.length>1?`<div class="opts">${reps.map(r=>`<button class="opt" data-action="pickRep" data-id="${r.id}" aria-pressed="${r.id===sel.id}">${esc(fmtDate(r.report_date,{day:'numeric',month:'short',year:'numeric'}))}</button>`).join('')}</div>`:''}
    ${sel.see_doctor?`<div class="banner" style="border-left-color:var(--bad)">Some results here should be discussed with a doctor soon.</div>`:''}
    <div>${esc(sel.summary)}</div>
    ${sel.findings.length?`<div class="findings">${sel.findings.map(f=>`<div class="finding"><span class="pill ${sevPill(f.severity)}">${sevLabel(f.severity)}</span><div><b>${esc(f.title)}</b><div class="small">${esc(f.detail)}</div></div></div>`).join('')}</div>`:''}
  </section>
  <div class="grid two">
    ${[['Eating','eating'],['Training','training'],['Lifestyle','lifestyle']].map(([l,k])=>sel[k].length?`<section class="panel"><h3>${l}</h3><ul class="tips">${sel[k].map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:'').join('')}
    <section class="panel"><h3>Changes to your targets</h3>
      ${adjustLines(sel.adjust).length||sel.adjust.focus.length ? `<ul class="tips">${adjustLines(sel.adjust).map(x=>`<li>${esc(x)}</li>`).join('')}${sel.adjust.focus.length?`<li>Highlight: ${esc(sel.adjust.focus.map(k=>MICROS.find(m=>m.key===k)?.label).join(', '))}</li>`:''}</ul>
        ${sel.adjust.reasons.length?`<div class="muted small">${esc(sel.adjust.reasons.join(' '))}</div>`:''}
        <div class="row">${applied && applied.from===sel.id ? '<span class="pill good">Applied</span>' : `<button class="btn sm" data-action="applyReport" data-id="${sel.id}">Apply to my targets</button>`}</div>`
        : '<div class="muted small">No changes needed from this report.</div>'}
      ${sel.retest?`<div class="small"><b>Retest:</b> ${esc(sel.retest)}</div>`:''}
    </section>
  </div>
  <section class="panel"><div class="panel-head"><h2>All results</h2><button class="linkbtn" data-action="delReport" data-id="${sel.id}">Delete this report</button></div>
    <div class="tablewrap" tabindex="0"><table><thead><tr><th class="l">Test</th><th class="r">Result</th><th>Range</th><th>Status</th>${reps.length>1?'<th class="r">Previous</th>':''}</tr></thead><tbody>
    ${cats.map(c=>`<tr><td colspan="${reps.length>1?5:4}" class="l" style="font-weight:700;color:var(--ink-3);font-size:12px;text-transform:uppercase;letter-spacing:.07em">${esc(c)}</td></tr>`+sel.markers.filter(m=>m.category===c).map(m=>{
      const prev = reps.filter(r=>r.report_date<sel.report_date).map(r=>r.markers.find(x=>x.key===m.key)).find(Boolean);
      return `<tr class="click" data-action="pickMarker" data-key="${esc(m.key)}"><td class="l">${esc(m.name)}</td><td class="r"><b>${m.value!==null?esc(String(m.value)):esc(m.value_text||'—')}</b> <span class="muted small">${esc(m.unit)}</span></td><td class="muted small">${esc(m.ref)}</td><td>${statusPill(m.status)}</td>${reps.length>1?`<td class="r muted">${prev&&prev.value!==null?esc(String(prev.value)):'—'}</td>`:''}</tr>`; }).join('')).join('')}
    </tbody></table></div>
    ${markerTrend(reps)}
  </section>
  <div class="muted small">This reads and explains your report; it isn’t a diagnosis. Take flagged results to your doctor, especially anything marked “See a doctor”.</div>
  </div>`;
  return h;
}
function markerTrend(reps){
  if (reps.length<2) return '<div class="muted small">Add another report later and each result will be charted over time.</div>';
  const key = S.repMarker || (reps[0].markers.find(m=>m.status!=='normal')||reps[0].markers[0]||{}).key;
  const pts = reps.slice().reverse().map(r=>({r, m:r.markers.find(x=>x.key===key)})).filter(x=>x.m&&x.m.value!==null).map(x=>({date:x.r.report_date, v:x.m.value, tip:`${x.m.value} ${x.m.unit} (${x.m.status})`}));
  const name = (reps[0].markers.find(m=>m.key===key)||{}).name || key;
  if (pts.length<2) return `<div class="muted small">${esc(name)} appears in only one report. Tap another test to see its trend.</div>`;
  return `<h3>${esc(name)} over time</h3>${lineChart({pts, unit:(reps[0].markers.find(m=>m.key===key)||{}).unit||'', color:'var(--fat)', wide:true})}`;
}

/* ---------- weekly review ---------- */
function weekDigest(){
  const lines=[]; const T=targets();
  for (let i=6;i>=0;i--){ const date=addDays(localDate(),-i); const d=S.days.get(date); if(!d) { lines.push(`${date}: nothing logged`); continue; }
    const t=dayTotals(d), H=d.health||{};
    lines.push(`${date}: ${n0(t.kcal)} kcal, P ${n0(t.protein)} C ${n0(t.carbs)} F ${n0(t.fat)} g, sat fat ${n0(t.micros.sat_fat_g)} g, fibre ${n0(t.fiber)} g, sugar ${n0(t.sugar)} g, sodium ${n0(t.micros.sodium_mg)} mg, water ${n1(t.water/1000)} L${H.sleep_min?`, slept ${fmtSleep(H.sleep_min)}`:''}${H.steps?`, ${n0(H.steps)} steps`:''}${d.weight_kg?`, weight ${n1(d.weight_kg)} kg`:''}; foods: ${(d.foods||[]).map(f=>f.name).slice(0,12).join(', ')||'none'}; training: ${[...(d.sports||[]).map(a=>`${actTitle(a)} ${n0(a.minutes||0)} min effort ${a.rpe||'?'}`), ...((d.exercises||[]).length?[`gym ${[...new Set(d.exercises.map(e=>e.muscle_group))].join('/')} ${d.exercises.reduce((s,e)=>s+(e.sets||[]).length,0)} sets`]:[])].join('; ')||'rest'}; supplements: ${(d.supplements||[]).map(x=>x.name).join(', ')||'none'}`); }
  // micronutrient gaps
  const rows=[]; for (let i=0;i<7;i++){ const d=S.days.get(addDays(localDate(),-i)); if (d&&(d.foods||[]).length) rows.push(dayTotals(d)); }
  const gaps = rows.length ? MICROS.filter(m=>m.kind!=='limit').map(m=>({m, p:rows.reduce((s,r)=>s+r.micros[m.key],0)/rows.length/(T.micros[m.key]||1)*100})).sort((a,b)=>a.p-b.p).slice(0,5).map(x=>`${x.m.label} ${Math.round(x.p)}%`).join(', ') : 'n/a';
  return {lines, gaps};
}
async function runReview(){
  if (!S.sample) return;
  S.revBusy=true; S.revStatus='Reviewing your week… this can take a minute.'; render();
  const p=prof(), T=targets(), {lines,gaps}=weekDigest(), rep=(S.reports||[])[0];
  const prompt = `You are a sports nutritionist and strength & conditioning coach in India reviewing one athlete's last 7 days.
Athlete: ${p.sex}, ${who(localDate()).age} y, ${p.height_cm} cm, ${n1(who(localDate()).kg)} kg (weight trend), goal ${(GOALS[p.goal]||{}).label}${p.goal!=='maintain'?` at ${p.goal_rate} kg/week`:''}.
${T.adaptive.ready?`Measured maintenance from their own logs: ${n0(T.adaptive.tdee)} kcal/day; weight trend ${n1(T.adaptive.kgPerWeek)} kg/week.`:''}
Daily targets (before training days' extra): ${T.kcal} kcal, protein ${T.protein} g, carbs ${T.carbs} g, fat ${T.fat} g, fibre ${T.fiber} g, water ${n1(T.water_ml/1000)} L, sleep 7-9 h, steps ${n0(p.steps_goal||10000)}.
Sports: ${Object.values(p.sports||{}).map(s=>`${s.name} (${(s.answers||[]).filter(a=>a.a).map(a=>a.a).join(', ')})`).join('; ')||'not set'}.
${rep?`Latest blood test (${rep.report_date}): ${rep.markers.filter(m=>m.status!=='normal').map(m=>`${m.name} ${m.value??m.value_text} ${m.unit} (${m.status})`).join(', ')||'all normal'}.`:'No blood test on file.'}
Lowest micronutrients this week (average % of target): ${gaps}.
Day by day:
${lines.join('\n')}
Reply with ONLY this JSON:
{"headline":"one sentence verdict on the week","going_well":["2-3 short points"],
"eating":[{"change":"what to change","why":"tied to their numbers","how":"specific Indian foods, amounts or swaps"}],
"training":[{"change":"","why":"","how":""}],
"recovery":[{"change":"","why":"","how":""}],
"sample_day":[{"meal":"Breakfast","foods":"specific foods with amounts","kcal":0,"protein_g":0}],
"focus":"the single most important thing for next week"}
Give 2-4 items for eating, 1-3 for training, 1-3 for recovery. The sample day must hit their calorie and protein targets and fix the biggest nutrient gaps, using everyday Indian food. If little was logged, say so in the headline and base advice on what exists.`;
  try {
    const res = await S.sample.json(prompt, {task:'review'});
    const L = x => (Array.isArray(x)?x:[]).slice(0,5).map(i=>({change:String(i.change||'').slice(0,200), why:String(i.why||'').slice(0,300), how:String(i.how||'').slice(0,400)}));
    const rev = {id:localDate(), date:localDate(), headline:String(res?.headline||'').slice(0,300), going_well:(Array.isArray(res?.going_well)?res.going_well:[]).slice(0,4).map(x=>String(x).slice(0,200)),
      eating:L(res?.eating), training:L(res?.training), recovery:L(res?.recovery), focus:String(res?.focus||'').slice(0,300),
      sample_day:(Array.isArray(res?.sample_day)?res.sample_day:[]).slice(0,7).map(m=>({meal:String(m.meal||'').slice(0,30), foods:String(m.foods||'').slice(0,300), kcal:num(m.kcal,3000), protein:num(m.protein_g,300)})), created:Date.now()};
    if (S.db) await S.db.doc('reviews/'+rev.id).set(rev);
    S.reviews = [rev, ...(S.reviews||[]).filter(r=>r.id!==rev.id)];
    S.revStatus='';
  } catch(e) { S.revStatus = AI_ERR[e?.code] || 'Couldn’t finish the review. Try again.'; }
  finally { S.revBusy=false; render(); }
}
function reviewPanel(){
  const r = (S.reviews||[])[0];
  const items = (l) => l.map(i=>`<li><b>${esc(i.change)}</b>${i.why?` <span class="muted">${esc(i.why)}</span>`:''}${i.how?`<div class="small">${esc(i.how)}</div>`:''}</li>`).join('');
  return `<section class="panel"><div class="panel-head"><h2>Coach review</h2>${r?`<span class="muted small">${esc(fmtDate(r.date,{day:'numeric',month:'short'}))}</span>`:''}</div>
    <div class="row"><button class="btn sm" data-action="review" ${S.revBusy||S.aiState==='off'?'disabled':''}>${S.revBusy?'Reviewing…':r?'Review my last 7 days again':'Review my last 7 days'}</button><span class="status" aria-live="polite">${esc(S.revStatus||'')}</span></div>
    ${r?`<div class="rev-head">${esc(r.headline)}</div>
      ${r.focus?`<div class="banner" style="border-left-color:var(--good)"><b>Focus next week:</b> ${esc(r.focus)}</div>`:''}
      ${r.going_well.length?`<h3>Going well</h3><ul class="tips">${r.going_well.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
      <div class="grid two">${[['Eating','eating'],['Training','training'],['Recovery','recovery']].map(([l,k])=>r[k].length?`<div><h3>${l}</h3><ul class="tips">${items(r[k])}</ul></div>`:'').join('')}</div>
      ${r.sample_day.length?`<h3>A day that fits your targets</h3><div class="tablewrap" tabindex="0"><table><tbody>${r.sample_day.map(m=>`<tr><td class="l"><b>${esc(m.meal)}</b></td><td class="l">${esc(m.foods)}</td><td class="r">${n0(m.kcal)} kcal</td><td class="r">${n0(m.protein)} g P</td></tr>`).join('')}
        <tr><td class="l"><b>Total</b></td><td></td><td class="r"><b>${n0(r.sample_day.reduce((s,m)=>s+m.kcal,0))}</b></td><td class="r"><b>${n0(r.sample_day.reduce((s,m)=>s+m.protein,0))} g</b></td></tr></tbody></table></div>`:''}`
      :'<div class="muted small">Looks at your food, nutrient gaps, sleep, training load, weight trend and any blood-test flags, then tells you what to change next week.</div>'}
  </section>`;
}

/* ---------- foods logged before, offered while typing in the Today box ---------- */
function pastFoods(){
  if (S._pf && S._pfRev===S.rev) return S._pf;
  const m = new Map();
  for (const [date,d] of S.days) for (const f of d.foods||[]) { if (!f.name) continue;
    const k = exKey(f.name)+'|'+exKey(f.quantity||f.grams||''), e = m.get(k);
    if (e) { e.n++; if (date > e.date) { e.f = f; e.date = date; } } else m.set(k, {f, n:1, date}); }
  S._pf = [...m.values()]; S._pfRev = S.rev; return S._pf;
}
// The part being typed now: after the last comma or new line, without a leading amount ("2 ", "150 g ").
const LEAD_QTY = /^(?:[\d.½¼¾\/]+\s*(?:g|gm|gms|kg|ml|l|cups?|katori|pieces?|pcs?|slices?|tbsp|tsp|bowls?|plates?|glass(?:es)?|scoops?)?\s+|(?:a|an|one|two|three|half)\s+)/i;
function foodSugg(){
  const box = $('#fsugg'), ta = $('#logText'); if (!box || !ta) return;
  const seg = (ta.value.split(/[,;\n]/).pop()||'').trim().replace(LEAD_QTY,'');
  const q = normFood(seg).split(' ').filter(Boolean);
  S.fsugg = seg.length>=2 && q.length ? pastFoods().filter(x => { const w = normFood(x.f.name).split(' '); return q.every(t => w.some(n => n.startsWith(t))); })
    .sort((a,b)=> b.n-a.n || b.date.localeCompare(a.date)).slice(0,6) : [];
  box.hidden = !S.fsugg.length;
  // Only redraw when the list changes: leaving the box fires a change event mid-tap, and a
  // redraw then would swallow the tap.
  const html = S.fsugg.map((x,i)=>`<button class="exrow" data-action="suggFood" data-i="${i}"><span>${esc(x.f.name)}<span class="muted small"> · ${esc(x.f.quantity||(x.f.grams?n0(x.f.grams)+' g':''))}</span></span><span class="tag">${n0(x.f.kcal)} kcal</span></button>`).join('');
  if (box.innerHTML !== html) box.innerHTML = html;
}

/* ---------- recent foods ---------- */
// The foods you log most often in the last 30 days (latest portion of each), most frequent first.
function recentFoods(){
  const seen=new Map();
  for (let i=0;i<30;i++){ const d=S.days.get(addDays(localDate(),-i)); if(!d) continue;
    (d.foods||[]).slice().reverse().forEach((f,j) => { const k=exKey(f.name)+'|'+exKey(f.quantity||f.grams); const e=seen.get(k);
      if (e) e.n++; else seen.set(k, {f, n:1, order:i*1000+j}); }); }
  return [...seen.values()].sort((a,b)=>b.n-a.n || a.order-b.order).slice(0,5).map(x=>x.f);
}

function waterTarget(day, T){
  let min = (day.sports||[]).reduce((s,a)=>s+(a.minutes||0),0);
  const sets = (day.exercises||[]).reduce((s,e)=>s+(e.sets||[]).length,0); if (sets) min += sets*2.5+10;
  return T.water_ml + Math.round(min/60*500/250)*250;
}


/* ---------- an exercise's standard ----------
   An exercise's "standard": what this person did last time (their top working
   weight, its reps and how many sets), or what they last set in a plan, whichever
   is newer. New plans start from it. */
function exStandard(name){
  const key = exKey(name);
  const e = buildSessions().get(key); const last = e && e.sessions[e.sessions.length-1];
  let fromLog = null;
  if (last) {
    const top = last.top, work = last.sets.filter(x => top>0 ? (x.weight||0) >= top*0.9 : true);
    const counts = {}; for (const x of work) counts[x.reps] = (counts[x.reps]||0)+1;
    const reps = +Object.entries(counts).sort((a,b)=>b[1]-a[1] || b[0]-a[0])[0][0];
    fromLog = {sets:work.length, reps:String(reps), kg:top>0?top:0, date:last.date, from:'log', sets_text:last.sets.map(x=>x.weight>0?`${n1(x.weight)}×${x.reps}`:`${x.reps}`).join(', ')};
  }
  const saved = (prof().ex_std||{})[key];
  if (saved && (!fromLog || saved.date >= fromLog.date)) return {...saved, from:'plan', sets_text:fromLog?.sets_text||''};
  return fromLog;
}
function saveStandard(name, sets, reps, kg){
  const p = prof(); const std = {...(p.ex_std||{})};
  std[exKey(name)] = {sets:sets||null, reps:String(reps||''), kg:kg>0?kg:0, date:localDate()};
  // Keep the 150 most recent.
  const keep = Object.entries(std).sort((a,b)=>b[1].date.localeCompare(a[1].date)).slice(0,150);
  saveProfile({...p, ex_std:Object.fromEntries(keep)});
}

function latestWeightDate(){ let d=''; for (const [k,v] of S.days) if (v.weight_kg && k>d) d=k; return d; }
function setStatus(msg, err=false){ S.status=msg; S.statusErr=err; const el=$('#logStatus'); if (el){ el.textContent=msg; el.classList.toggle('err',err);} }
function clearPhoto(){ if (S.photoUrl) URL.revokeObjectURL(S.photoUrl); S.photo=null; S.photoUrl=null; }

/* ---------- notifications (web push, see supabase/functions/push) ----------
   Off until turned on, one by one, in Settings → Notifications, and only in the
   app opened from the Home Screen (iPhone needs that, and iOS 16.4+). The server
   sends them at set local times using the numbers this app sends it (push_state);
   the rest timer sends its end time (push_jobs) so the alert comes even with the
   phone locked. */
const PUSH_KINDS = [['rest','Rest timer','when your rest is over'],['water','Water','9 am, 12, 3, 6 and 9 pm'],['protein','Protein','4 pm and 7 pm, if under target'],['fiber','Fibre','4 pm and 7 pm, if under target'],['steps','Steps','3 pm and 8 pm, if under your goal'],['kcal','Calories eaten','2 pm and 8 pm']];
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const pushReady = () => standalone() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const pushKey = () => 'mt:push:' + (S.user?.id||'');
function pushPrefs(){ try { return JSON.parse(localStorage.getItem(pushKey())||'{}') || {}; } catch { return {}; } }
const pushAny = (pr = pushPrefs()) => PUSH_KINDS.some(([k]) => pr[k]);
const b64u = s => { s = s.replace(/-/g,'+').replace(/_/g,'/'); const r = atob(s + '='.repeat((4 - s.length % 4) % 4)); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; } catch { return 'Asia/Kolkata'; } };
async function pushSave(sub, prefs){
  const j = sub.toJSON();
  const { error } = await SB.from('push_subs').upsert({ endpoint:j.endpoint, user_id:S.user.id, p256dh:j.keys.p256dh, auth:j.keys.auth, tz:myTz().slice(0,63), prefs, updated_at:new Date().toISOString() });
  if (error) throw error;
}
function notifyFold(){
  if (!standalone()) return `<div class="muted small">Add MaxxTempo to your Home Screen and open it from there to turn on notifications.${/iPhone|iPad/.test(navigator.userAgent)?' In Safari: Share → Add to Home Screen.':''}</div>`;
  if (!pushReady()) return `<div class="muted small">This phone can’t show notifications from web apps.${/iPhone|iPad/.test(navigator.userAgent)?' Update to iOS 16.4 or later.':''}</div>`;
  const pr = pushPrefs(), denied = Notification.permission === 'denied';
  return `${denied ? `<div class="banner">Notifications are blocked. Turn them on in your phone’s Settings → Notifications → MaxxTempo.</div>` : ''}
    ${PUSH_KINDS.map(([k,l,sub]) => `<label class="check"><input type="checkbox" data-action="pushToggle" data-k="${k}" ${pr[k]?'checked':''} ${S.pushBusy||denied?'disabled':''}><span><b>${l}</b> <span class="muted small">${sub}</span></span></label>`).join('')}
    ${pushAny(pr) && !denied ? `<div class="row"><button class="btn ghost sm" data-action="pushTest" ${S.pushBusy?'disabled':''}>Send a test</button></div>` : ''}
    <div class="status${S.pushErr?' err':''}" role="status">${esc(S.pushMsg||'')}</div>`;
}
const notifySub = () => { if (!standalone()) return 'Home Screen app only'; const n = PUSH_KINDS.filter(([k]) => pushPrefs()[k]).length; return n ? `${n} on` : 'off'; };
async function pushToggle(kind, on, box){
  const prefs = {...pushPrefs(), [kind]:on};
  S.pushBusy = true; S.pushMsg = ''; S.pushErr = false;
  try {
    // Asked first, straight from the tap: iPhone only shows the question then.
    if (on && Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') throw {code:'denied'};
    render();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!pushAny(prefs)) {
      if (sub) { await SB.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe().catch(()=>{}); }
      await SB.from('push_jobs').delete().eq('user_id', S.user.id);
    } else {
      if (!sub) { const { key } = await fnCall('push', 'key'); sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64u(key) }); }
      await pushSave(sub, prefs);
    }
    try { localStorage.setItem(pushKey(), JSON.stringify(prefs)); } catch {}
    if (on) { pushStateLast = ''; pushState(true); }
    S.pushMsg = on ? `${PUSH_KINDS.find(([k])=>k===kind)[1]} reminders on.` : 'Turned off.';
  } catch (e) {
    if (box) box.checked = !on;
    S.pushErr = true;
    S.pushMsg = e?.code==='denied' ? 'Notifications weren’t allowed. To allow them: phone Settings → Notifications → MaxxTempo.' : e?.code==='offline' ? 'You’re offline. Try again when connected.' : 'Couldn’t change notifications. Try again.';
  }
  S.pushBusy = false; render();
}
async function pushTest(){
  S.pushBusy = true; S.pushMsg = ''; S.pushErr = false; render();
  try { await fnCall('push', 'test'); S.pushMsg = 'Sent. It should arrive in a few seconds.'; }
  catch (e) { S.pushErr = true; S.pushMsg = e?.code==='offline' ? 'You’re offline.' : e?.code==='no_subscription' ? 'This phone isn’t signed up. Turn a reminder off and on again.' : 'Couldn’t send a test. Try again.'; }
  S.pushBusy = false; render();
}
// On opening: keep this phone's sign-up current (time zone, choices, a renewed address).
async function pushResync(){
  if (!pushReady() || !pushAny() || !S.user) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub && Notification.permission === 'granted') { const { key } = await fnCall('push', 'key'); sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64u(key) }); }
    if (!sub) { try { localStorage.removeItem(pushKey()); } catch {} render(); return; }
    await pushSave(sub, pushPrefs());
  } catch {}
}
// Today's numbers for the reminders (sent a few seconds after they change).
let pushStateT = null, pushStateLast = '';
function pushState(now){
  if (!S.dbReady || !S.user || !SB) return;
  const pr = pushPrefs(); if (!['water','protein','fiber','steps','kcal'].some(k => pr[k])) return;
  clearTimeout(pushStateT);
  pushStateT = setTimeout(async () => {
    const date = localDate(), day = getDay(date), t = dayTotals(day), TT = dayTargets(day), H = day.health || {};
    const r = Math.round;
    const row = { user_id:S.user.id, date, kcal:r(t.kcal), kcal_t:r(TT.kcal), protein:r(t.protein), protein_t:r(TT.protein), fiber:r(t.fiber), fiber_t:r(TT.fiber),
      steps:r(H.steps||0), steps_t:r(Number(prof().steps_goal)||10000), water:r(t.water), water_t:r(waterTarget(day, targets(date))) };
    const key = JSON.stringify(row); if (key === pushStateLast) return;
    const { error } = await SB.from('push_state').upsert({ ...row, updated_at:new Date().toISOString() }).then(x => x, e => ({ error:e }));
    if (!error) pushStateLast = key;
  }, now ? 0 : 3000);
}
// The rest timer's end, so the server can send "Rest over" with the phone locked.
let pushRestT = null;
function pushRest(cancel){
  if (!S.user || !SB || !pushPrefs().rest) return;
  clearTimeout(pushRestT);
  pushRestT = setTimeout(() => {
    const end = !cancel && S.rest && S.rest.end;
    (end ? SB.from('push_jobs').upsert({ user_id:S.user.id, send_at:new Date(end).toISOString() }) : SB.from('push_jobs').delete().eq('user_id', S.user.id)).then(()=>{}, ()=>{});
  }, 250);
}

/* ---------- rest timer (after logging sets) ---------- */
let restT = null;
const restOn = () => prof().rest_timer !== false;
function startRest(sec){
  if (!restOn()) return;
  sec = sec || Number(prof().rest_default) || 90;
  S.rest = {end: Date.now() + sec*1000, total: sec}; tickRest(); pushRest();
}
// +15 / +30 / +60 add to the time that's left (and back to a full bar if it had run out).
function addRest(sec){
  if (!S.rest) return startRest(sec);
  const left = Math.max(0, S.rest.end - Date.now());
  S.rest = {end: Date.now() + left + sec*1000, total: Math.max(S.rest.total, Math.round(left/1000) + sec)}; tickRest(); pushRest();
}
function stopRest(){ if (S.rest && S.rest.end > Date.now()) pushRest(true); S.rest = null; clearInterval(restT); restT = null; const el = $('#restbar'); if (el) { el.hidden = true; el.dataset.mode = ''; } document.body.classList.remove('resting'); }
// The bar is built once per state (counting / over) and only its text and progress change
// while it counts: rebuilding the buttons every tick swallowed taps on phones.
function tickRest(){
  const el = $('#restbar'); if (!el || !S.rest) return;
  clearInterval(restT);
  const draw = () => {
    if (!S.rest) return;
    const left = Math.max(0, Math.round((S.rest.end - Date.now())/1000)), mode = left > 0 ? 'run' : 'over';
    el.hidden = false; document.body.classList.add('resting');
    if (el.dataset.mode !== mode) {
      el.dataset.mode = mode;
      el.innerHTML = mode === 'run'
        ? `<span class="rt" aria-live="off">Rest <b class="rtime"></b></span><span class="rtbar"><i></i></span>${[15,30,60].map(v=>`<button data-action="restAdd" data-s="${v}" aria-label="Add ${v} seconds">+${v}s</button>`).join('')}<button data-action="restStop" aria-label="Stop the rest timer">✕</button>`
        : `<span class="rt" role="status"><b>Rest over</b>: next set!</span><span class="spacer"></span><button data-action="restAdd" data-s="30" aria-label="Add 30 seconds">+30s</button><button data-action="restStop">OK</button>`;
    }
    if (mode === 'run') { el.querySelector('.rtime').textContent = `${Math.floor(left/60)}:${pad(left%60)}`; el.querySelector('.rtbar i').style.width = `${(1-left/S.rest.total)*100}%`; }
    else { clearInterval(restT); restT = null; restDone(); }
  };
  draw(); restT = setInterval(draw, 500);
}
function restDone(){
  if (navigator.vibrate) navigator.vibrate([250,120,250]);
  try { const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6); } catch {}
  setTimeout(() => { if (S.rest && Date.now() >= S.rest.end) stopRest(); }, 15000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState==='visible' && S.rest) tickRest(); });
// While typing, the phone keyboard pushes the box up to where the rest bar sits: move the bar to the top.
const isField = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]),select,textarea');
document.addEventListener('focusin', ev => { if (isField(ev.target)) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove('typing'); }, 50));
function workoutFold(){
  const p = prof();
  return `<label class="check"><input type="checkbox" data-action="restToggle" ${restOn()?'checked':''}> Show a rest timer after I log sets</label>
    <label class="field">Default rest<select data-action="restDefault">${[45,60,90,120,150,180].map(v=>`<option value="${v}" ${Number(p.rest_default||90)===v?'selected':''}>${v<60?v+' s':`${Math.floor(v/60)}:${pad(v%60)} min`}</option>`).join('')}</select></label>
`;
}

/* ---------- UI bits ---------- */
let toastTimer;
function toast(msg, undo, ms=6000){
  const t=$('#toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (undo?'<button id="undoBtn">Undo</button>':'');
  t.hidden=false; clearTimeout(toastTimer);
  if (undo) $('#undoBtn').onclick = () => { t.hidden=true; undo(); };
  toastTimer = setTimeout(()=>{t.hidden=true;}, ms);
}
const pct = (v,t) => t>0 ? Math.min(100, v/t*100) : 0;
function meter(v,t,color,limit=false){
  const over = limit ? v>t : false;
  return `<div class="meter${over?' over':''}" role="img" aria-label="${n0(v)} of ${n0(t)}"><i style="width:${pct(v,t)}%;${over?'':`background:${color}`}"></i></div>`;
}
function delta(cur, prev, unit=''){
  if (!prev) return cur ? '<span class="delta flat">new this period</span>' : '<span class="delta flat">&nbsp;</span>';
  const ch = (cur-prev)/prev*100;
  const cls = Math.abs(ch)<0.5?'flat':ch>0?'up':'down';
  return `<span class="delta ${cls}">${ch>0?'+':''}${n1(ch)}%${unit}</span>`;
}

/* ---------- charts ---------- */
function chartW(wide){ const vw=(window.innerWidth||640)-64; return Math.round(Math.max(320, Math.min(wide?1000:560, vw))); }
function niceMax(v){ if (v<=0) return 1; const p=10**Math.floor(Math.log10(v)); const m=v/p; return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p; }
function barChart({rows, target, color, unit, label, wide, xfmt}){
  const W=chartW(wide),H=200,m={l:44,r:12,t:16,b:26};
  const iw=W-m.l-m.r, ih=H-m.t-m.b;
  const max = niceMax(Math.max(target||0, ...rows.map(r=>r.v))*1.08);
  const y = v => m.t + ih*(1-v/max);
  const bw = iw/rows.length; const gap = Math.min(2, bw*0.2); const w = Math.max(1, bw-gap);
  let g = '';
  for (const t of [0, max/2, max]) g += `<line class="grid-l" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-6}" y="${y(t)+4}" text-anchor="end">${n0(t)}</text>`;
  let bars='';
  rows.forEach((r,i) => {
    const x = m.l + i*bw + gap/2; const yv=y(r.v); const h = m.t+ih-yv;
    if (h>0.5) { const rr=Math.min(4,w/2,h); bars += `<path fill="${color}" d="M${x},${m.t+ih} V${yv+rr} Q${x},${yv} ${x+rr},${yv} H${x+w-rr} Q${x+w},${yv} ${x+w},${yv+rr} V${m.t+ih} Z"/>`; }
    bars += `<rect x="${m.l+i*bw}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent" data-tip="${esc((xfmt?xfmt(r.date):fmtDate(r.date))+'\n'+label+': '+n0(r.v)+' '+unit+(target?'\nTarget: '+n0(target)+' '+unit:''))}"/>`;
  });
  const idx = [0, Math.floor((rows.length-1)/2), rows.length-1];
  let xl=''; [...new Set(idx)].forEach(i => { const anchor = i===0?'start':i===rows.length-1?'end':'middle'; const x = i===0?m.l: i===rows.length-1? W-m.r : m.l+i*bw+bw/2; xl += `<text x="${x}" y="${H-8}" text-anchor="${anchor}">${esc(xfmt?xfmt(rows[i].date):fmtDate(rows[i].date,{day:'numeric',month:'short'}))}</text>`; });
  let ref='';
  if (target) ref = `<line class="ref" x1="${m.l}" x2="${W-m.r}" y1="${y(target)}" y2="${y(target)}"/><text class="ref-t" x="${W-m.r}" y="${y(target)-5}" text-anchor="end">Target ${n0(target)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} per day">${g}${bars}${ref}${xl}</svg>`;
}
function lineChart({pts, unit, color, wide}){
  const W=chartW(wide),H=220,m={l:44,r:40,t:20,b:26}; const iw=W-m.l-m.r, ih=H-m.t-m.b;
  const vals = pts.flatMap(p=>p.raw!=null?[p.v,p.raw]:[p.v]); let lo=Math.min(...vals), hi=Math.max(...vals);
  if (hi===lo){ hi+=Math.max(1,hi*0.05); lo=Math.max(0,lo-Math.max(1,lo*0.05)); }
  const padv=(hi-lo)*0.12; lo=Math.max(0,lo-padv); hi=hi+padv;
  const x = i => pts.length===1 ? m.l+iw/2 : m.l + iw*i/(pts.length-1);
  const y = v => m.t + ih*(1-(v-lo)/(hi-lo));
  let g=''; for (const t of [lo,(lo+hi)/2,hi]) g+=`<line class="grid-l" x1="${m.l}" x2="${W-m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l-6}" y="${y(t)+4}" text-anchor="end">${n1(t)}</text>`;
  const d = pts.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p.v)}`).join(' ');
  const area = pts.length>1 ? `<path d="${d} L${x(pts.length-1)},${m.t+ih} L${x(0)},${m.t+ih} Z" fill="${color}" opacity=".10"/>` : '';
  let dots=''; pts.forEach((p,i)=>{ const last=i===pts.length-1; if (p.raw!=null) dots+=`<circle cx="${x(i)}" cy="${y(p.raw)}" r="3" fill="var(--ink-3)"/>`; dots+=`<circle cx="${x(i)}" cy="${y(p.v)}" r="${last?5:3.5}" fill="${last?color:'var(--surface)'}" stroke="${color}" stroke-width="2"/>`;
    dots+=`<rect x="${x(i)-Math.max(8,iw/pts.length/2)}" y="${m.t}" width="${Math.max(16,iw/pts.length)}" height="${ih}" fill="transparent" data-tip="${esc(fmtDate(p.date)+'\n'+p.tip)}"/>`; });
  const lp=pts[pts.length-1];
  const endLbl = `<text x="${Math.min(x(pts.length-1)+8,W-4)}" y="${y(lp.v)-9}" text-anchor="end" style="fill:var(--ink);font-weight:700">${n1(lp.v)} ${unit}</text>`;
  let xl=`<text x="${x(0)}" y="${H-8}" text-anchor="${pts.length===1?'middle':'start'}">${esc(fmtDate(pts[0].date,{day:'numeric',month:'short'}))}</text>`;
  if (pts.length>1) xl+=`<text x="${x(pts.length-1)}" y="${H-8}" text-anchor="end">${esc(fmtDate(lp.date,{day:'numeric',month:'short'}))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress chart">${g}${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}${endLbl}${xl}</svg>`;
}

/* ---------- views ---------- */
function loggerHtml(kind){
  const ph = kind==='gym' ? 'e.g. bench 60kg 3x8, lat pulldown 50x12 x10 x10 · badminton doubles 1 hr · cricket nets 90 min, bowled 6 overs, faced 40 balls' : 'e.g. 150g chicken breast, 200g cooked rice, 1 tbsp ghee · 500ml water';
  if (S.aiState==='off') return `<div class="banner">AI isn’t set up for this app yet, so typed entries only log foods from the food table. Water, editing and everything else work. See SETUP.md to connect one.</div>`;
  return `<section class="panel logger span2" aria-label="Log an entry">
    <div class="panel-head"><h2>${kind==='gym'?'Log training':'Log food'}</h2><span class="muted small">${esc(fmtDate(S.date,{weekday:'long',day:'numeric',month:'long'}))}</span></div>
    ${kind==='gym' ? queueCard() : ''}
    <textarea id="logText" placeholder="${esc(ph)}" ${S.busy?'disabled':''}></textarea>
    ${kind!=='gym' ? '<div id="fsugg" class="exres fsugg" aria-label="Foods you’ve logged before" hidden></div>' : ''}
    <div class="row">
      ${S.canPhoto && kind!=='gym' ? `<button class="btn ghost sm" data-action="pickPhoto" ${S.busy?'disabled':''}>Add photo</button>` : ''}
      ${kind!=='gym' ? `<button class="btn ghost sm" data-action="foodSearch" ${S.busy?'disabled':''}>Find food</button><button class="btn ghost sm" data-action="scan" ${S.busy?'disabled':''} aria-label="Scan a barcode">Scan</button>` : ''}
      ${S.photo ? `<span class="photo-pill"><img src="${S.photoUrl}" alt="Selected food photo">${esc(S.photo.name||'photo')}<button class="linkbtn" data-action="clearPhoto" aria-label="Remove photo">Remove</button></span>`:''}
      <span class="spacer"></span>
      ${S.busy ? `<button class="btn ghost sm" data-action="stop">Stop</button>` : ''}
      <button class="btn" data-action="log" ${S.busy?'disabled':''}>${S.busy?'Working…':'Log'}</button>
    </div>
    <div class="status${S.statusErr?' err':''}" id="logStatus" aria-live="polite">${esc(S.status)}</div>
    ${kind!=='gym'&&recentFoods().length?fold('d-quick', 'Quick add', `${recentFoods().length} foods you eat often`, `<div class="chips" aria-label="Frequent foods">${recentFoods().map(f=>`<button class="chip" style="border-style:solid" data-action="relog" data-id="${f.id}">${esc(f.name)}${f.quantity?' · '+esc(f.quantity):''}</button>`).join('')}</div>`, 'inline'):''}
    ${kind!=='gym'&&!recentFoods().length?`<div class="chips" aria-label="Examples"><span class="muted small" style="align-self:center">Try:</span>${EXAMPLES.slice(0,4).map(x=>`<button class="chip" data-action="example" data-text="${esc(x)}">${esc(x)}</button>`).join('')}</div>`:''}
  </section>`;
}
function healthPanel(H){
  const p = prof(); const goal = Number(p.steps_goal)||10000;
  if (!H.steps && !H.sleep_min && !H.active_kcal && !H.resting_kcal) return `<div class="empty">No Health data for this day yet. Type something like “slept 6h 50m, 8400 steps”, add a screenshot of the Health app, or <button class="linkbtn" data-action="goto" data-view="profile">set up automatic sync</button> (iPhone).</div>`;
  const v = H.sleep_min ? sleepVerdict(H.sleep_min, who(S.date).age) : null;
  return `<div class="hgrid">
    <div><div class="l">Sleep</div><div class="big" style="font-size:36px">${H.sleep_min?fmtSleep(H.sleep_min):'—'}</div>
      ${v?`<span class="pill ${v.cls}">${v.label}</span>`:''}${H.bed_time&&H.wake_time?` <span class="muted small">${H.bed_time}–${H.wake_time}</span>`:''}</div>
    <div><div class="l">Steps</div><div class="big" style="font-size:36px">${H.steps?n0(H.steps):'—'}</div>
      ${H.steps?`${meter(H.steps,goal,'var(--water)')}<span class="muted small">${Math.round(H.steps/goal*100)}% of ${n0(goal)}</span>`:''}</div>
  </div>
  ${v?`<div class="small">${esc(v.note)}</div>`:''}
  ${(()=>{ const xs=[]; for(let i=0;i<7;i++){ const d=S.days.get(addDays(S.date,-i)); if(d&&d.health&&d.health.sleep_min) xs.push(d.health.sleep_min); }
     return xs.length>=3 ? `<div class="muted small">7-night average: <b>${fmtSleep(xs.reduce((a,b)=>a+b,0)/xs.length)}</b> over ${xs.length} nights logged.</div>` : ''; })()}
  ${(H.active_kcal||H.resting_kcal)?`<div class="kv"><span>Active energy</span><b>${H.active_kcal?n0(H.active_kcal)+' kcal':'—'}</b><span>Resting energy</span><b>${H.resting_kcal?n0(H.resting_kcal)+' kcal':'—'}</b></div>
  <div class="muted small">Gym sessions count in active energy only if your Apple Watch recorded them.</div>`:''}`;
}
function sportList(day){
  const a = day.sports||[];
  if (!a.length) return `<div class="empty">No sport logged. Try “cricket nets 90 min, bowled 6 overs pace, faced 40 balls” or “badminton doubles 1 hr”.</div>`;
  return a.map(x=>`<div class="item"><div><div class="nm">${esc(sportTitle(x))}</div><div class="sub">${esc(sportLine(x))}</div></div>
    <div class="kc">${n0(x.kcal)}<span class="muted small"> kcal</span></div>
    <div class="acts"><button data-action="editSport" data-id="${x.id}" aria-label="Edit ${esc(sportTitle(x))}">Edit</button><button data-action="delSport" data-id="${x.id}" aria-label="Delete ${esc(sportTitle(x))}">✕</button></div></div>`).join('');
}
function exerciseList(day){
  const ex = day.exercises||[];
  if (!ex.length) return `<div class="empty">No training logged. Try “squat 80x5, 85x5, 90x3”.</div>`;
  const prs = prsOn(day.date); const seenPr = new Set();
  const prTag = e => { const k = exKey(e.name), pr = prs.get(k); if (!pr || seenPr.has(k)) return ''; seenPr.add(k); return ` <span class="prbadge" title="${esc('New personal record: '+pr.text)}">PR</span>`; };
  return ex.map(e=>`<div class="item"><div><div class="nm">${esc(e.name)}${prTag(e)} <span class="tag">${esc(e.muscle_group)}</span></div>
    <div class="sub">${(e.sets||[]).length ? e.sets.map(s=>(s.type&&SET_TYPE[s.type]?SET_TYPE[s.type]+' ':'')+(s.weight>0?`${n1(s.weight)} × ${s.reps}`:`${s.reps} reps`)+(s.rpe?` @${s.rpe}`:'')).join(' · ') : ''}${e.duration_min?`${(e.sets||[]).length?' · ':''}${n0(e.duration_min)} min`:''}</div></div>
    <div class="kc">${n0(e.kcal)}<span class="muted small"> kcal</span></div>
    <div class="acts"><button data-action="editEx" data-id="${e.id}" aria-label="Edit ${esc(e.name)}">Edit</button><button data-action="delEx" data-id="${e.id}" aria-label="Delete ${esc(e.name)}">✕</button></div>
    <div class="howwrap">${howtoFold(e.name)}</div></div>`).join('');
}
function sportSummary(a,b,label){
  const names = [...new Set([...Object.keys(a.sp), ...Object.keys(b.sp)])];
  if (!names.length) return `<section class="panel" aria-label="Sport"><div class="panel-head"><h2>Sport</h2></div><div class="empty">No badminton or cricket logged in this period or ${esc(label)}. Log a session above, e.g. “badminton singles 45 min”.</div></section>`;
  const hm = m => m>=60 ? `${Math.floor(m/60)}h ${pad(Math.round(m%60))}m` : `${Math.round(m)} min`;
  return `<section class="panel" aria-label="Sport"><div class="panel-head"><h2>Sport</h2><span class="muted small">compared with ${esc(label)}</span></div>
    <div class="tablewrap" tabindex="0"><table><thead><tr><th class="l">Sport</th><th class="r">Sessions</th><th class="r">Time</th><th class="r">kcal</th><th class="r">Balls bowled</th><th class="r">Balls faced</th></tr></thead><tbody>
    ${names.map(n => { const c=a.sp[n]||{sessions:0,minutes:0,kcal:0,bowled:0,faced:0}, p=b.sp[n]||{sessions:0,minutes:0,kcal:0,bowled:0,faced:0};
      const cell = (cv,pv,f) => `${f(cv)}<br>${delta(cv,pv)}`;
      return `<tr><td class="l"><b>${esc(n)}</b></td><td class="r">${cell(c.sessions,p.sessions,n0)}</td><td class="r">${cell(c.minutes,p.minutes,hm)}</td><td class="r">${cell(c.kcal,p.kcal,n0)}</td>
        <td class="r">${c.bowled||p.bowled?cell(c.bowled,p.bowled,n0):'—'}</td><td class="r">${c.faced||p.faced?cell(c.faced,p.faced,n0):'—'}</td></tr>`; }).join('')}
    </tbody></table></div></section>`;
}
function exerciseDetail(r){
  const ss = r.e.sessions.slice(-40);
  const bw = r.bw;
  const pts = ss.map(s=>({date:s.date, v: s.best, tip: s.sets.map(x=>x.weight>0?`${n1(x.weight)} × ${x.reps}`:`${x.reps} reps`).join(', ') + (bw?'':`\nBest est. 1RM ${n1(s.best)} kg`)}));
  const first = ss[0].best, last = ss[ss.length-1].best;
  return `<section class="panel" aria-label="${esc(r.e.name)} progress">
    <div class="panel-head"><h2>${esc(r.e.name)}</h2><span class="muted small">${bw?'Most reps in a set':'Best estimated one-rep max per session'}</span></div>
    ${pts.length>1 ? lineChart({pts, unit:bw?'reps':'kg', color:'var(--protein)', wide:true}) : `<div class="empty">One session so far. The chart appears after your next ${esc(r.e.name)} session.</div>`}
    <div class="kv" style="max-width:420px">
      <span>Sessions logged</span><b>${r.e.sessions.length}</b>
      <span>Heaviest set</span><b>${bw?'Bodyweight':n1(Math.max(...r.e.sessions.map(s=>s.top)))+' kg'}</b>
      ${ss.length>1?`<span>Change since ${esc(fmtDate(ss[0].date,{day:'numeric',month:'short'}))}</span><b>${delta(last,first)}</b>`:''}
    </div>
    <div class="muted small">${bw?'':'Estimated 1RM uses the Epley formula: weight × (1 + reps ÷ 30). It lets sets with different reps be compared.'}</div>
  </section>`;
}
/* ---------- shared bits for the new layout ---------- */
// How a value sits against its target, and the colour for it.
//   'range': aim for the target (calories, carbs): under → orange, within 10% → violet, over → red
//   'more' : more is fine (protein, fibre, water, steps, sleep, vitamins): over → blue instead of red
//   'limit': stay under (sugar, sodium, saturated fat…): up to the limit → violet, over → red
function goalState(v, target, kind){
  if (!(target>0)) return 'plus';
  const r = v/target;
  if (kind==='limit') return r<=1 ? 'at' : 'over';
  if (r<0.9) return 'under';
  if (r<=1.1) return 'at';
  return kind==='more' ? 'plus' : 'over';
}
const stBar = st => `var(--st-${st})`, stText = st => `var(--st-${st}-t)`;
function stateKey(){ return `<div class="stkey"><span><i style="background:var(--st-under)"></i>below target</span><span><i style="background:var(--st-at)"></i>on target</span><span><i style="background:var(--st-over)"></i>over</span><span><i style="background:var(--st-plus)"></i>over, and that’s fine</span></div>`; }
// A row that folds open. Open state survives re-renders (S.openFolds).
// Hide / show a whole panel; remembered on this device.
const isHidden = k => S.hidden.has(k);
const hideBtn = (k, what) => `<button class="linkbtn hidebtn" data-action="toggleHide" data-key="${esc(k)}" aria-expanded="${!isHidden(k)}" aria-label="${isHidden(k)?'Show':'Hide'} ${esc(what)}">${isHidden(k)?'Show':'Hide'}</button>`;
function fold(key, title, sub, body, cls=''){
  return `<details class="fold${cls?' '+cls:''}" data-fold="${esc(key)}" ${S.openFolds.has(key)?'open':''}><summary><span class="ttl">${title}</span>${sub?`<span class="muted small sub">${sub}</span>`:''}</summary><div class="fold-body">${body}</div></details>`;
}
function spark(vals, color){
  const v = vals.filter(x=>Number.isFinite(x)); if (v.length<2) return '';
  const W=90, H=26, lo=Math.min(...v), hi=Math.max(...v), r=hi-lo||1;
  const pts = v.map((x,i)=>`${(i/(v.length-1)*(W-4)+2).toFixed(1)},${(H-3-(x-lo)/r*(H-6)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function dashCell(label, v, target, value, kind, hasData=true){
  const pctV = target>0 ? v/target*100 : 0, st = hasData ? goalState(v, target, kind) : null;
  return `<div class="dcell"><span class="l">${label}</span><span class="p"${st?` style="color:${stText(st)}"`:''}>${hasData?Math.round(pctV):'—'}${hasData?'<small>%</small>':''}</span>
    <div class="meter"><i style="width:${Math.min(100,pctV)}%;background:${st?stBar(st):'var(--ink-3)'}"></i></div><span class="val">${value}</span></div>`;
}


// Small tinted status tag, as in "On track" / "Low" / "Over".
const ST_LABEL = {under:'Low', at:'On track', over:'Over', plus:'Above goal'};
function statePill(st, label){ return st ? `<span class="spill" style="color:${stText(st)};background:color-mix(in srgb, ${stBar(st)} 15%, transparent)">${label||ST_LABEL[st]}</span>` : ''; }
function rings(arcs){
  // arcs: [{p:0-100+, color}] outermost first
  const C = 84, sw = 11, gap = 4;
  return `<svg class="rings" viewBox="0 0 ${C*2} ${C*2}" aria-hidden="true">${arcs.map((a,i)=>{ const r = C - sw/2 - i*(sw+gap), len = 2*Math.PI*r, f = Math.max(0, Math.min(1, a.p/100));
    return `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
      <circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="${a.color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(len*f).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${C} ${C})"/>`; }).join('')}</svg>`;
}
const ICONS = {
  water:'<path d="M12 3.2c3.2 4.1 6 7.3 6 10.6a6 6 0 0 1-12 0c0-3.3 2.8-6.5 6-10.6z"/>',
  steps:'<path d="M8.2 3.5c1.6 0 2.4 1.8 2.4 4s-.8 4-2.4 4-2.4-1.8-2.4-4 .8-4 2.4-4zM6 13.6h4.4v1.9a2.2 2.2 0 0 1-4.4 0zM15.8 7.3c1.6 0 2.4 1.8 2.4 4s-.8 4-2.4 4-2.4-1.8-2.4-4 .8-4 2.4-4zM13.6 17.4H18v1.9a2.2 2.2 0 0 1-4.4 0z"/>',
  sleep:'<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/>',
};
const icon = (k, color) => `<span class="gicon" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg></span>`;
function greeting(){ const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }

/* ---------- Today ---------- */
function viewToday(){
  const day = getDay(S.date), t = dayTotals(day), T = dayTargets(day);
  const H = day.health||{}; const B = burnedTotal(day);
  const sv = H.sleep_min ? sleepVerdict(H.sleep_min, who(S.date).age) : null;
  const byMeal = MEALS.map(m => ({m, items:(day.foods||[]).filter(f=>f.meal===m)})).filter(g=>g.items.length);
  const WT = waterTarget(day, T), goal = Number(prof().steps_goal)||10000;
  const P = (v,tg) => tg>0 ? v/tg*100 : 0;
  const hasTraining = (day.sports||[]).length || (day.exercises||[]).length;
  const hasFood = (day.foods||[]).length>0;
  // A past day with nothing logged: no burn estimate, it just looks like a workout that never happened.
  const emptyDay = S.date!==localDate() && !hasFood && !hasTraining && !Object.keys(H).length;
  return `${!S.profile ? `<div class="banner" style="margin-bottom:16px">Targets below use default numbers. <button class="linkbtn" data-action="goto" data-view="profile">Add your weight, height, age and goal</button> to set your own.</div>`:''}
  ${todayBanners()}
  <div class="grid">
    ${(()=>{ const name = (prof().name||'').trim().split(/\s+/)[0]; const left = T.kcal - t.kcal;
      const nudge = !hasFood ? (S.date===localDate() ? 'Log your first meal and the day fills in here.' : 'Nothing was logged on this day.')
        : left>=0 ? `${n0(left)} kcal and ${n0(Math.max(0,T.protein-t.protein))} g protein left ${S.date===localDate()?'today':'that day'}.` : `${n0(-left)} kcal over ${S.date===localDate()?'today’s':'that day’s'} target.`;
      return `<div class="hello">${S.date===localDate()?`<h1>${greeting()}${name?`, ${esc(name)}`:''}</h1>`:`<h1>${esc(fmtDate(S.date,{weekday:'long'}))}</h1>`}<p>${esc(nudge)}${S.date===localDate()&&t.water<WT*0.5&&new Date().getHours()>=14?' Drink some water too.':''}</p></div>`; })()}
    <section class="panel nring" aria-label="Nutrition today">
      ${(()=>{ const stK = hasFood ? goalState(t.kcal, T.kcal, 'range') : null;
        const rows = [
          ['Carbs', t.carbs, T.carbs, 'g', 'range', 'var(--carbs)'],
          ['Protein', t.protein, T.protein, 'g', 'more', 'var(--protein)'],
          ['Fat', t.fat, T.fat, 'g', 'range', 'var(--fat)'],
          ['Saturated', t.micros.sat_fat_g, T.micros.sat_fat_g, 'g', 'limit', 'var(--fat)', true],
          ['Unsaturated', Math.max(0, t.fat_split - t.micros.sat_fat_g), 0, 'g', 'info', 'var(--fat)', true],
          ['Fibre', t.fiber, T.fiber, 'g', 'more', 'var(--ink-3)'],
          ['Added sugar', t.sugar, T.sugar, 'g', 'limit', 'var(--ink-3)'],
        ];
        return `<div class="nring-top">
          <div class="ringwrap">${rings([{p:P(t.carbs,T.carbs), color:'var(--carbs)'}, {p:P(t.protein,T.protein), color:'var(--protein)'}, {p:P(t.fat,T.fat), color:'var(--fat)'}])}
            <div class="ringc"><b>${hasFood?Math.round(P(t.kcal,T.kcal)):0}%</b><span>of goal</span></div></div>
          <div class="nsum"><span class="muted small">You have eaten</span><div class="nbig"><b style="color:${stK?stText(stK):'var(--accent-text)'}">${n0(t.kcal)}</b> kcal</div><span class="muted small">of ${n0(T.kcal)} kcal</span>${statePill(stK)}</div>
        </div>
        <div class="mrows">${rows.map(([l,v,tg,u,kind,c,sub])=>{
          // Unsaturated has no target: show its share of the fat eaten instead.
          if (kind==='info') return `<div class="mrow sub"><span class="sw"></span><span class="ml">${l}</span><span class="mv">${n0(v)}<span class="muted"> g</span></span><span class="mp muted">${t.fat_split>0?Math.round(v/t.fat_split*100)+'%':''}</span><span class="muted small" title="${t.fat_split<t.fat-0.5?'Restaurant meals that don’t give a saturated / unsaturated split are left out':''}">${t.fat_split<t.fat-0.5?'of known fat':'of fat'}</span></div>`;
          const st = hasFood ? goalState(v,tg,kind) : null;
          return `<div class="mrow${sub?' sub':''}"><span class="sw" style="background:${c}"></span><span class="ml">${l}</span><span class="mv">${n0(v)}<span class="muted"> / ${kind==='limit'?'≤':''}${n0(tg)} ${u}</span></span><span class="mp" style="color:${st?stText(st):'var(--ink-3)'}">${hasFood?Math.round(P(v,tg)):0}%</span>${statePill(st)||'<span></span>'}</div>`; }).join('')}</div>
        <div class="stat3">
          <div data-tip="${esc(burnTip(B))}"><b style="color:${stText('plus')}">${emptyDay?'—':n0(B.total)}</b><span>kcal burned</span></div>
          <div><b>${emptyDay?'—':n0(B.training)}</b><span>training</span></div>
          <div><b>${emptyDay?'—':n0(B.moving)}</b><span>${B.fromHealth?'active (Health)':'steps'}</span></div>
        </div>`; })()}
    </section>
    ${loggerHtml('today')}
    <section class="panel folds" aria-label="What I ate">
      ${fold('d-food', 'What I ate today', (day.foods||[]).length?`${(day.foods||[]).length} item${(day.foods||[]).length===1?'':'s'} · ${n0(t.kcal)} kcal`:'nothing yet', `
      ${byMeal.length ? byMeal.map(g=>`<div class="meal"><div class="meal-h"><span>${g.m}</span><span class="num">${n0(g.items.reduce((s,f)=>s+f.kcal,0))} kcal</span></div>
        ${g.items.map(f=>`<div class="item"><div><div class="nm">${esc(f.name)} ${f.confidence!=='high'?`<span class="tag est" title="Estimated portion">est.</span>`:''}${f.source==='photo'?' <span class="tag">photo</span>':''}${f.check?' <span class="tag est" title="Calories don’t match the protein, carbs and fat. Tap Edit to check.">check</span>':''}</div>
          <div class="sub">${esc(f.quantity||(f.grams?n0(f.grams)+' g':''))} · P ${n0(f.protein)} · C ${n0(f.carbs)} · F ${n0(f.fat)}</div></div>
          <div class="kc">${n0(f.kcal)}</div>
          <div class="acts"><button data-action="editFood" data-id="${f.id}" aria-label="Edit ${esc(f.name)}">Edit</button><button data-action="delFood" data-id="${f.id}" aria-label="Delete ${esc(f.name)}">✕</button></div></div>`).join('')}</div>`).join('')
        : `<div class="empty">Nothing logged yet.</div>`}
      ${(day.foods||[]).length?`<label class="check muted small" style="margin-top:12px"><input type="checkbox" data-action="dayComplete" ${day.incomplete?'':'checked'}> I logged everything I ate this day</label>`:''}`)}
    </section>
    <section class="panel goals" aria-label="Today's goals">
      <div class="panel-head"><h2>Today’s goals</h2></div>
      ${(()=>{ const full = Math.floor(t.water/250), glasses = Math.min(12, Math.max(4, Math.ceil(WT/250), full));
        const stW = t.water>0 ? goalState(t.water, WT, 'more') : null, stS = H.steps ? goalState(H.steps, goal, 'more') : null, stZ = H.sleep_min ? goalState(H.sleep_min, 420, 'more') : null;
        const bar = (v, tg, st) => `<div class="meter"><i style="width:${Math.min(100,P(v,tg))}%;background:${st?stBar(st):'var(--ink-3)'}"></i></div>`;
        return `<div class="grow">${icon('water','var(--water)')}<div class="gt"><b>Water</b><span class="muted small">${fmtL(t.water)} of ${fmtL(WT)} L</span></div>${statePill(stW)}</div>
          <div class="glasses2">${Array.from({length:glasses},(_,i)=>`<button class="gl${i<full?' on':''}" ${i<full?'disabled':'data-action="water" data-ml="250"'} aria-label="${i<full?'Glass drunk':'Add a 250 ml glass'}"><svg viewBox="0 0 24 28" aria-hidden="true"><path class="cup" d="M4 3h16l-2 21a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path class="fill" d="M5.4 10h13.2l-1.4 14a1.4 1.4 0 0 1-1.4 1.3H8.2a1.4 1.4 0 0 1-1.4-1.3z"/></svg></button>`).join('')}</div>
          <div class="row">${[500,750].map(ml=>`<button class="btn ghost sm" data-action="water" data-ml="${ml}">+ ${ml} ml</button>`).join('')}${(day.water||[]).length?`<span class="spacer"></span><button class="linkbtn" data-action="undoWater">Undo</button>`:''}</div>
          <div class="grow">${icon('steps','var(--accent)')}<div class="gt"><b>Steps</b><span class="muted small">${H.steps?n0(H.steps):'0'} of ${n0(goal)}</span></div>${statePill(stS)}</div>${bar(H.steps||0, goal, stS)}
          <div class="grow">${icon('sleep','var(--fat)')}<div class="gt"><b>Sleep</b><span class="muted small">${H.sleep_min?`${fmtSleep(H.sleep_min)} · ${sv?sv.label.toLowerCase():''}`:'not logged'}</span></div>${statePill(stZ)}</div>${bar(H.sleep_min||0, 420, stZ)}`; })()}
    </section>
    ${microsPanel(day)}
  </div>`;
}

// Vitamins and minerals for the day (food + supplements), at the bottom of Today.
function microsPanel(day){
  const dt = dayTotals(day), DT = dayTargets(day);
  const low = MICROS.filter(m=>m.kind!=='limit'&&DT.micros[m.key]&&dt.micros[m.key]/DT.micros[m.key]<0.5).length;
  const logged = (day.foods||[]).length || (day.supplements||[]).length;
  return `<section class="panel span2" aria-label="Vitamins and minerals"><div class="panel-head"><h2>Vitamins &amp; minerals</h2><span class="headr">${low&&logged&&!isHidden('mic')?`<span class="muted small">${low} low</span>`:''}${hideBtn('mic','vitamins and minerals')}</span></div>
    ${isHidden('mic') ? '' : `<div class="facts"><div class="grid two" style="gap:0 24px">
      ${MICROS.map(m=>{ const v=dt.micros[m.key], tg=DT.micros[m.key]; const p=tg?v/tg*100:0; const lim=m.kind==='limit';
        const st = goalState(v, tg, lim?'limit':'more');
        return `<div class="fr"><b>${m.label}${lim?' <span class="muted small">(limit)</span>':''}${(DT.focus||[]).includes(m.key)?' <span class="tag est">blood test</span>':''}</b><span class="amt">${fmtAmt(v,m.unit)} ${m.unit}</span><span class="dv" style="color:${stText(st)}">${Math.round(p)}%</span>
          <div class="bar"><i style="width:${Math.min(100,p)}%;background:${stBar(st)}"></i></div></div>`; }).join('')}
      </div></div>`}
  </section>`;
}

/* ---------- Train ---------- */
function exerciseRows(){
  return [...buildSessions().values()].map(e => {
    const last = e.sessions[e.sessions.length-1];
    const cutoff = addDays(last.date, -28);
    const base = [...e.sessions].reverse().find(s=>s.date<=cutoff) || e.sessions[0];
    return {e, last, bw:last.bodyweight, allBest:Math.max(...e.sessions.map(s=>s.best)), base};
  }).sort((x,y)=> y.last.date.localeCompare(x.last.date) || x.e.name.localeCompare(y.e.name));
}
/* Personal records: a session that beats every earlier one for that exercise on
   heaviest weight, estimated 1-rep max, or (bodyweight moves) most reps in a set.
   The first time an exercise is logged doesn't count. */
function prsOn(date){
  const out = new Map();
  for (const [k,e] of buildSessions()) {
    const i = e.sessions.findIndex(x=>x.date===date); if (i<=0) continue;
    const s = e.sessions[i], before = e.sessions.slice(0,i);
    if (s.bodyweight) { const m = Math.max(...before.map(x=>x.best)); if (s.best > m) out.set(k, {name:e.name, text:`${n0(s.best)} reps (was ${n0(m)})`}); continue; }
    const topB = Math.max(...before.map(x=>x.top)), bestB = Math.max(...before.map(x=>x.best));
    if (s.top > topB) out.set(k, {name:e.name, text:`${n1(s.top)} kg heaviest (was ${n1(topB)})`});
    else if (s.best > bestB + 0.05) out.set(k, {name:e.name, text:`est. 1RM ${n1(s.best)} kg (was ${n1(bestB)})`});
  }
  return out;
}
function recentPrs(days=30){
  const since = addDays(localDate(), -days), out = [];
  for (const [date, d] of S.days) if (date >= since && (d.exercises||[]).length) for (const [k,v] of prsOn(date)) out.push({date, ...v});
  return out.sort((a,b)=>b.date.localeCompare(a.date));
}
function growthDash(rows){
  if (!rows.length) return `<section class="panel" aria-label="Gym progress"><div class="panel-head"><h2>Gym progress</h2></div>
    <div class="empty">Finish a workout and your exercises show here.</div></section>`;
  const shown = S.allEx ? rows : rows.slice(0,5);   // the 5 trained most recently
  const month = addDays(localDate(), -30);
  const prs = rows.filter(r => r.e.sessions.length>1 && r.last.date>=month && r.last.best>=r.allBest && r.last.best>Math.max(...r.e.sessions.slice(0,-1).map(s=>s.best))).length;
  const up = rows.filter(r => r.base!==r.last && r.last.best>r.base.best).length;
  return `<section class="panel" aria-label="Gym progress"><div class="panel-head"><h2>Gym progress</h2>${hideBtn('gp','gym progress')}</div>
    ${isHidden('gp') ? '' : `<div class="row"><span class="pill good">${up} getting stronger</span>${prs?`<span class="pill">${prs} new best${prs===1?'':'s'} this month</span>`:''}</div>
    <div class="exgrid">${shown.map(r => { const ch = r.base!==r.last && r.base.best ? (r.last.best-r.base.best)/r.base.best*100 : null;
      return `<button class="excell${r.e.key===S.gymEx?' sel':''}" data-action="pickEx" data-key="${esc(r.e.key)}">
        <span class="nm">${esc(r.e.name)}</span>
        <span class="v">${r.bw?`${n0(r.last.best)} <small>reps</small>`:`${n1(r.last.best)} <small>kg</small>`}</span>
        <span class="muted small">${r.bw?'most reps':'est. 1RM'} · ${esc(fmtDate(r.last.date,{day:'numeric',month:'short'}))}</span>
        <span class="delta ${ch===null?'flat':ch>0.5?'up':ch<-0.5?'down':'flat'}">${ch===null?'first session':`${ch>0?'+':''}${n1(ch)}% ${r.base.date<=addDays(r.last.date,-28)?'vs 4 wks ago':`since ${esc(fmtDate(r.base.date,{day:'numeric',month:'short'}))}`}`}</span>
        ${spark(r.e.sessions.slice(-10).map(s=>s.best), 'var(--protein)')}</button>`; }).join('')}</div>
    ${(()=>{ const pr = recentPrs(30); return pr.length ? `<div><h3>Personal records, last 30 days</h3>${pr.slice(0,5).map(x=>`<div class="item"><div><div class="nm"><span class="prbadge">PR</span> ${esc(x.name)}</div><div class="sub">${esc(x.text)}</div></div><span class="muted small">${esc(fmtDate(x.date,{day:'numeric',month:'short'}))}</span><span></span></div>`).join('')}</div>` : ''; })()}
    ${rows.length>5?`<button class="btn ghost sm" data-action="allEx" style="align-self:flex-start">${S.allEx?'Show fewer':`Show all ${rows.length} exercises`}</button>`:''}`}
  </section>`;
}
function viewGym(){
  const {cur,prev,label} = periodRanges(S.date, S.gymPeriod);
  const a = periodStats(...cur), b = periodStats(...prev);
  const rows = exerciseRows();
  if (S.gymEx && !rows.find(r=>r.e.key===S.gymEx)) S.gymEx=null;
  const sel = rows.find(r=>r.e.key===S.gymEx);
  const day = getDay(S.date), hasTraining = (day.sports||[]).length || (day.exercises||[]).length;
  return `<div class="grid">
    ${wkPanel()}
    ${queueCard() ? `<section class="panel span2" aria-label="Activity questions">${queueCard()}</section>` : ''}
    <section class="panel span2" aria-label="Training on this day"><div class="panel-head"><h2>${S.date===localDate()?'Today’s training':'Training on '+esc(fmtDate(S.date,{weekday:'long',day:'numeric',month:'short'}))}</h2><span class="headr">${hasTraining&&!isHidden('tt')?`<span class="muted small">${n0(dayTotals(day).burned)} kcal</span>`:''}${hideBtn('tt','today’s training')}</span></div>
      ${isHidden('tt') ? '' : `<div class="row"><button class="btn ghost sm" data-action="addSport">+ Add sport or activity</button></div>
      ${activityPanel(day)}`}</section>
    <h2 class="sect">Workout progress</h2>
    <div class="panel-head"><h2>${S.gymPeriod==='week'?'This week':'This month'}</h2>
      <div class="seg" role="group" aria-label="Period"><button data-action="gymPeriod" data-p="week" aria-pressed="${S.gymPeriod==='week'}">Week</button><button data-action="gymPeriod" data-p="month" aria-pressed="${S.gymPeriod==='month'}">Month</button></div></div>
    <div class="tiles">
      <div class="tile"><span class="l">Days trained</span><span class="v">${a.days}</span>${delta(a.days,b.days)}</div>
      <div class="tile"><span class="l">Working sets</span><span class="v">${a.sets}</span>${delta(a.sets,b.sets)}</div>
      <div class="tile"><span class="l">Volume lifted</span><span class="v">${n0(a.volume)}<span class="muted" style="font-size:16px"> kg</span></span>${delta(a.volume,b.volume)}</div>
      <div class="tile"><span class="l">Training kcal</span><span class="v">${n0(a.kcal)}</span>${delta(a.kcal,b.kcal)}</div>
    </div>
    ${growthDash(rows)}
    ${sel ? exerciseDetail(sel) : ''}
    <section class="panel folds" aria-label="Exercise library and settings">
      ${fold('g-lib', 'Exercise library', libCount() ? `${n0(libCount())} exercises with how-to` : 'loading…', libraryHtml())}
      ${fold('g-settings', 'Workout settings', restOn()?`rest timer ${Number(prof().rest_default||90)} s`:'rest timer off', workoutFold())}
    </section>
  </div>`;
}
/* ---------- live workout (start, tick sets off, finish) and routines ----------
   The workout in progress lives in S.workout and on this device (localStorage), so a
   closed tab or a lost signal loses nothing. Finishing writes the done sets into the day
   like any logged exercise; warm-up sets are kept but don't count as working sets. */
const WK_KEY = 'mt:workout';
const SET_TYPE = { normal:'', warmup:'W', drop:'D', failure:'F' };
const SET_TYPE_NAME = { normal:'Normal set', warmup:'Warm-up', drop:'Drop set', failure:'To failure' };
const RPES = ['', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
function wkLoad(){ try { S.workout = JSON.parse(localStorage.getItem(WK_KEY)||'null'); } catch { S.workout = null; } }
function wkSave(){ try { S.workout ? localStorage.setItem(WK_KEY, JSON.stringify(S.workout)) : localStorage.removeItem(WK_KEY); } catch {} }
const fmtDur = ms => { const s = Math.max(0, Math.floor(ms/1000)), h = Math.floor(s/3600), m = Math.floor(s%3600/60); return h ? `${h}h ${pad(m)}m` : `${m}:${pad(s%60)}`; };
function exGroup(name){
  const k = buildSessions().get(exKey(name)); if (k && k.group) return k.group;
  const hits = typeof Gym!=='undefined' ? Gym.search(name, 5) : [];
  const h = hits.find(x => exKey(x.name)===exKey(name)) || hits[0];
  return h && MUSCLES.includes(h.group) ? h.group : 'full body';
}
// Last time's working sets for an exercise (shown as "Previous").
function prevSets(name){ const e = buildSessions().get(exKey(name)); const s = e && e.sessions[e.sessions.length-1]; return s ? s.sets : []; }
const isBar = name => /barbell|squat|deadlift|bench|overhead press|\bohp\b|\brow\b|hip thrust|good morning|rdl|clean|snatch/i.test(name) && !/dumbbell|\bdb\b|machine|cable|smith|goblet|kettlebell/i.test(name);
const newSet = (o={}) => ({ id:uid(), type:'normal', weight:'', reps:'', rpe:'', done:false, ...o });
function wkExercise(name, group, o={}){
  const prev = prevSets(name).filter(s => s.type!=='warmup');
  const n = o.sets || Math.max(prev.length, 3);
  const sets = Array.from({length:n}, (_,i) => newSet({ weight: o.weight!=null&&o.weight!=='' ? String(o.weight) : '', reps: o.reps ? String(o.reps) : '' }));
  return { id:uid(), name, group: group || exGroup(name), superset: o.superset || null, rest: o.rest || null, sets };
}
function wkStart(routine){
  if (S.workout && !confirm('A workout is already in progress. Discard it and start a new one?')) return;
  const ex = (routine?.exercises||[]).map(r => { const e = wkExercise(r.name, r.group, r); if (r.warmups) e.sets.unshift(...warmupSets(r.weight || (prevSets(r.name)[0]||{}).weight, r.warmups)); return e; });
  S.workout = { id:uid(), name: routine ? routine.name : 'Workout', started: new Date().toISOString(), date: S.date < localDate() ? S.date : localDate(), routine_id: routine ? routine.id : null, exercises: ex };
  wkSave(); if (S.view!=='gym') setView('gym'); else render(); window.scrollTo({top:0});
}
// Warm-up ramp to a working weight: about 50% × 8, 70% × 5, 85% × 3, on the bar for light weights.
function warmupSets(work, n=3){
  const w = Number(work)||0, bar = 20, r = x => Math.max(bar, Math.round(x/2.5)*2.5);
  if (!(w > bar + 10)) return [newSet({type:'warmup', weight: w>0 ? String(bar) : '', reps:'10'})];
  const plan = [[0.5,8],[0.7,5],[0.85,3]].slice(3-Math.min(3,Math.max(1,n)));
  return [...new Set(plan.map(([p,reps]) => r(w*p)+'x'+reps))].map(s => { const [kg,reps] = s.split('x'); return newSet({type:'warmup', weight:kg, reps}); });
}
// Plates on each side of the bar for a total weight.
function platesFor(total, bar=20, plates=[25,20,15,10,5,2.5,1.25]){
  let side = (Number(total)-bar)/2; if (!(side > 0)) return {side:[], left:0};
  const out = []; for (const p of plates) while (side >= p - 1e-9) { out.push(p); side = Math.round((side-p)*1000)/1000; }
  return {side:out, left:Math.round(side*2*100)/100};
}
function openPlates(kg){
  const d = $('#dlg'); let bar = 20;
  const draw = () => { const w = num($('#pl_kg')?.value, 1000) || 0, r = platesFor(w, bar);
    $('#pl_out').innerHTML = w <= bar ? `<div class="muted">Just the bar (${bar} kg).</div>` : `<div class="plates">${r.side.map(p=>`<span class="plate p${String(p).replace('.','_')}">${p}</span>`).join('')}</div>
      <div><b>Each side:</b> ${r.side.join(' + ') || 'nothing'} kg${r.left?` <span class="muted small">(${r.left} kg can’t be made with these plates)</span>`:''}</div>`; };
  d.innerHTML = `<div class="form" style="gap:12px"><h2 class="full">Plate calculator</h2>
    <label class="field">Total weight (kg)<input id="pl_kg" type="number" step="0.5" inputmode="decimal" value="${esc(kg||'')}"></label>
    <label class="field">Bar<select id="pl_bar"><option value="20">20 kg (men’s)</option><option value="15">15 kg (women’s)</option><option value="10">10 kg (technique)</option></select></label>
    <div class="full" id="pl_out"></div>
    <div class="full muted small">Plates: 25, 20, 15, 10, 5, 2.5 and 1.25 kg.</div>
    <div class="full row"><span class="spacer"></span><button class="btn" id="pl_close">Done</button></div></div>`;
  if (!d.open) d.showModal();
  $('#pl_kg').oninput = draw; $('#pl_bar').onchange = ev => { bar = Number(ev.target.value); draw(); }; $('#pl_close').onclick = () => d.close(); draw();
}
// Pick an exercise: your own first, then the libraries.
// onBack: where Close (or Esc) returns to, e.g. the routine being edited; without it Close just closes.
function openExPicker(onPick, title='Add exercise', onBack=null){
  const d = $('#dlg'), mine = [...buildSessions().values()].sort((a,b)=>b.sessions.length-a.sessions.length).map(e=>({name:e.name, group:e.group}));
  const list = q => { const t = q.trim().toLowerCase();
    const a = (t ? mine.filter(e=>e.name.toLowerCase().includes(t)) : mine).slice(0,12).map(e=>({...e, mine:true}));
    const b = t && typeof Gym!=='undefined' ? Gym.search(t, 30).filter(x=>!a.some(y=>exKey(y.name)===exKey(x.name))) : [];
    return [...a, ...b].slice(0,40); };
  let rows = list('');
  const draw = () => { $('#xp_res').innerHTML = rows.length ? rows.map((x,i)=>`<button class="exrow" data-i="${i}"><span>${esc(x.name)}${x.mine?' <span class="muted small">· yours</span>':''}</span><span class="tag">${esc(x.group||'')}</span></button>`).join('')
      : `<div class="empty">Nothing found. <button class="linkbtn" id="xp_custom">Add “${esc($('#xp_q').value.trim())}” as your own exercise</button></div>`;
    const c = $('#xp_custom'); if (c) c.onclick = () => { const n = titleCase($('#xp_q').value.trim()); if (n) { done(); d.close(); onPick({name:n, group:exGroup(n)}); } }; };
  d.innerHTML = `<div class="fsearch"><h2>${esc(title)}</h2><label class="field full">Search<input id="xp_q" type="search" placeholder="e.g. bench, lat pulldown, squat" autocomplete="off"></label>
    <div id="xp_res" class="exres"></div><div class="row"><span class="spacer"></span><button class="btn ghost" id="xp_close">Close</button></div></div>`;
  const done = () => { d.oncancel = null; };
  const back = () => { done(); if (onBack) onBack(); else d.close(); };
  d.oncancel = ev => { if (onBack) { ev.preventDefault(); back(); } else done(); };
  if (!d.open) d.showModal();
  $('#xp_close').textContent = onBack ? 'Back' : 'Close';
  $('#xp_close').onclick = back;
  $('#xp_q').oninput = ev => { rows = list(ev.target.value); draw(); };
  $('#xp_res').onclick = ev => { const b = ev.target.closest('[data-i]'); if (!b) return; const x = rows[+b.dataset.i]; done(); d.close(); onPick({name:x.name, group:MUSCLES.includes(x.group)?x.group:exGroup(x.name)}); };
  draw(); setTimeout(() => $('#xp_q')?.focus(), 50);
}
const SS_LETTERS = 'ABCDEFGH';
// Above these a set is almost certainly a typo (the deadlift world record is about 500 kg).
const MAX_KG = 500, MAX_REPS = 300, LONG_WORKOUT_MIN = 240;
const setProblem = (kg, reps) => kg > MAX_KG ? `${n1(kg)} kg looks like a typo. Check it and tick again.` : reps > MAX_REPS ? `${n0(reps)} reps looks like a typo. Check it and tick again.` : kg < 0 || reps < 0 ? 'Weights and reps can’t be negative.' : '';
function wkPanel(){
  const w = S.workout;
  if (!w) {
    const rs = (S.routines||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    return `<section class="panel span2 wkstart" aria-label="Workout"><div class="panel-head"><h2>Workout</h2>${hideBtn('wk','workout')}</div>
      ${isHidden('wk') ? '' : `<div class="row"><button class="btn" data-action="wkStart">Start empty workout</button><button class="btn ghost" data-action="routineNew">New routine</button></div>
      ${S.date < localDate() ? `<div class="muted small">A workout you start now is saved to ${esc(fmtDate(S.date,{weekday:'long',day:'numeric',month:'short'}))}, the day you’re looking at.</div>` : ''}
      ${rs.length ? `<h3>My routines</h3><div class="routines">${rs.map(r=>`<div class="routine"><div><b>${esc(r.name)}</b><div class="muted small">${esc((r.exercises||[]).map(e=>e.name).join(' · ')||'No exercises yet')}</div></div>
        <div class="row"><button class="btn sm" data-action="wkStartRoutine" data-id="${esc(r.id)}">Start</button><button class="btn ghost sm" data-action="routineEdit" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">Edit</button></div></div>`).join('')}</div>`
        : ''}`}
    </section>`;
  }
  const doneSets = w.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done&&x.type!=='warmup').length,0);
  const vol = w.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done&&x.type!=='warmup').reduce((a,x)=>a+(Number(x.weight)||0)*(Number(x.reps)||0),0),0);
  return `<section class="panel span2 wklive" aria-label="Workout in progress">
    <div class="wkhead"><input class="wkname" data-wkname value="${esc(w.name)}" aria-label="Workout name">
      <div class="wkstats"><span><b id="wkClock">${fmtDur(Date.now()-Date.parse(w.started))}</b> time</span><span><b>${n0(vol)}</b> kg volume</span><span><b>${doneSets}</b> sets</span></div>
      ${w.date !== localDate() ? `<div class="muted small">Saving to ${esc(fmtDate(w.date,{weekday:'long',day:'numeric',month:'short'}))}</div>` : ''}
      <div class="row"><button class="btn ghost sm" data-action="wkDiscard">Discard</button><span class="spacer"></span><button class="btn sm" data-action="wkFinish">Finish</button></div></div>
    ${w.exercises.map((e,i)=>{
      const prev = prevSets(e.name).filter(s=>s.type!=='warmup'); let wi = 0, n = 0;
      const ss = e.superset, ssLast = ss && !(w.exercises[i+1] && w.exercises[i+1].superset===ss);
      return `<div class="wkex${ss?' ss':''}" data-ss="${esc(ss||'')}">
        ${ss && !(w.exercises[i-1] && w.exercises[i-1].superset===ss) ? `<div class="sslabel">Superset ${esc(ss)}</div>` : ''}
        <div class="wkex-h"><div><b>${esc(e.name)}</b> <span class="tag">${esc(e.group)}</span></div>
          <div class="wkex-tools">
            ${isBar(e.name)?`<button class="linkbtn" data-action="wkPlates" data-ex="${i}">Plates</button>`:''}
            <button class="linkbtn" data-action="wkWarmup" data-ex="${i}">Warm-up</button>
            <button class="linkbtn" data-action="wkSuperset" data-ex="${i}">${ss?'Unlink':'Superset'}</button>
            <button class="linkbtn" data-action="wkRemoveEx" data-ex="${i}" aria-label="Remove ${esc(e.name)}">Remove</button></div></div>
        <label class="wkrest muted small">Rest <select data-wkrest="${i}">${['', '0', '30', '60', '90', '120', '150', '180', '240'].map(v=>`<option value="${v}" ${String(e.rest||'')===v?'selected':''}>${v===''?'default':v==='0'?'off':v<60?v+' s':`${Math.floor(v/60)}:${pad(v%60)}`}</option>`).join('')}</select></label>
        <div class="wkgrid"><span>Set</span><span>Prev</span><span>kg</span><span>Reps</span><span>RPE</span><span></span>
        ${e.sets.map((s,j)=>{ const p = s.type==='warmup' ? null : prev[wi++]; if (s.type!=='warmup') n++;
          return `<button class="wtype t-${s.type}" data-action="wkType" data-ex="${i}" data-set="${j}" aria-label="${esc(SET_TYPE_NAME[s.type])}, tap to change">${SET_TYPE[s.type]||n}</button>
          <span class="wprev">${p ? (p.weight>0?`${n1(p.weight)} × ${p.reps}`:`${p.reps} reps`) : '—'}</span>
          <input class="wnum${s.done?' done':''}" data-wk="weight" data-ex="${i}" data-set="${j}" inputmode="decimal" value="${esc(s.weight)}" placeholder="${p&&p.weight>0?esc(n1(p.weight)):'–'}" aria-label="kg, set ${j+1}">
          <input class="wnum${s.done?' done':''}" data-wk="reps" data-ex="${i}" data-set="${j}" inputmode="numeric" value="${esc(s.reps)}" placeholder="${p?esc(p.reps):''}" aria-label="Reps, set ${j+1}">
          <select class="wrpe" data-wk="rpe" data-ex="${i}" data-set="${j}" aria-label="RPE, set ${j+1}">${RPES.map(r=>`<option ${String(s.rpe)===r?'selected':''}>${r}</option>`).join('')}</select>
          <button class="wdone${s.done?' on':''}${s.pr?' pr':''}" data-action="wkDone" data-ex="${i}" data-set="${j}" data-last="${ssLast||!ss?1:0}" aria-pressed="${!!s.done}" aria-label="Set ${j+1} done">${s.pr?'PR':'✓'}</button>`; }).join('')}
        </div>
        <div class="row"><button class="btn ghost sm" data-action="wkAddSet" data-ex="${i}">+ Add set</button>${e.sets.length>1?`<button class="linkbtn" data-action="wkDelSet" data-ex="${i}">Remove last set</button>`:''}<span class="spacer"></span>${howtoFold(e.name)}</div>
      </div>`; }).join('')}
    <div class="row"><button class="btn ghost" data-action="wkAddEx">+ Add exercise</button></div>
    
  </section>`;
}
function wkFinishNow(){
  const w = S.workout; if (!w) return;
  const ex = w.exercises.map(e => ({...e, sets:e.sets.filter(s=>s.done)})).filter(e=>e.sets.length);
  // A superset needs two exercises; one left on its own (the other had no sets done) is a normal exercise.
  for (const e of ex) if (e.superset && ex.filter(x=>x.superset===e.superset).length < 2) e.superset = null;
  if (!ex.length) { if (confirm('No sets are ticked off. Discard this workout?')) { S.workout = null; wkSave(); render(); } return; }
  const date = w.date || localDate(), time = new Date(w.started).toTimeString().slice(0,5);
  let minutes = Math.max(1, Math.round((Date.now()-Date.parse(w.started))/60000));
  // Left open for hours (forgot to tap Finish)? Ask how long the session really was.
  if (minutes > LONG_WORKOUT_MIN) {
    const guess = Math.min(120, Math.max(20, ex.reduce((a,e)=>a+e.sets.length,0) * 3));
    const ans = prompt(`This workout has been open for ${Math.floor(minutes/60)} h ${pad(minutes%60)} min. How many minutes did you actually train?`, String(guess));
    if (ans === null) return;
    minutes = Math.max(1, Math.min(LONG_WORKOUT_MIN, Math.round(Number(ans)) || guess));
  }
  const out = ex.map(e => { const x = {id:uid(), name:e.name, muscle_group:e.group, sets:e.sets.map(s=>({weight:Number(s.weight)||0, reps:Number(s.reps)||0, ...(s.type!=='normal'?{type:s.type}:{}), ...(s.rpe?{rpe:Number(s.rpe)}:{})})), time, source:'workout', workout_id:w.id, ...(e.superset?{superset:e.superset}:{})};
    x.kcal = exerciseKcal(x, date); return x; });
  const work = out.flatMap(e=>e.sets.filter(s=>s.type!=='warmup')), volume = work.reduce((a,s)=>a+s.weight*s.reps,0);
  const summary = {id:w.id, name:w.name, started:w.started, minutes, exercises:out.length, sets:work.length, volume:Math.round(volume), routine_id:w.routine_id||null};
  writeDay(date, d => { d.exercises = [...(d.exercises||[]), ...out]; d.workouts = [...(d.workouts||[]), summary];
    const rec = Gym.recovery(d.exercises.map(e=>({...e, sets:(e.sets||[]).filter(s=>s.type!=='warmup')}))); if (rec) d.gym_recovery = {...rec, ready_at:new Date(Date.now()+rec.hours*3600e3).toISOString()}; });
  const routine = (S.routines||[]).find(r=>r.id===w.routine_id);
  const prs = ex.flatMap(e => e.sets.filter(s=>s.pr).map(s => ({name:e.name, text: Number(s.weight)>0 ? `${n1(Number(s.weight))} kg × ${s.reps}` : `${s.reps} reps`})));
  S.workout = null; wkSave(); stopRest(); render();
  postWorkout(summary, out, date, prs);
  wkSummary(summary, out, date, routine, prs);
}
function wkSummary(sm, out, date, routine, prs){
  const d = $('#dlg');
  d.innerHTML = `<div class="form" style="gap:12px"><h2 class="full">Workout done 💪</h2>
    <div class="full tiles"><div class="tile"><span class="l">Time</span><span class="v">${sm.minutes<60?sm.minutes+' min':Math.floor(sm.minutes/60)+'h '+pad(sm.minutes%60)}</span></div>
      <div class="tile"><span class="l">Volume</span><span class="v">${n0(sm.volume)}<span class="muted" style="font-size:16px"> kg</span></span></div>
      <div class="tile"><span class="l">Sets</span><span class="v">${sm.sets}</span></div><div class="tile"><span class="l">Exercises</span><span class="v">${sm.exercises}</span></div></div>
    ${prs.length?`<div class="full"><b>New personal records</b><ul class="tips">${prs.map(p=>`<li>${esc(p.name)}: ${esc(p.text)}</li>`).join('')}</ul></div>`:''}
    <div class="full row">${routine?`<button class="btn ghost" id="ws_upd">Update “${esc(routine.name)}”</button>`:`<button class="btn ghost" id="ws_save">Save as routine</button>`}<span class="spacer"></span><button class="btn" id="ws_ok">Done</button></div></div>`;
  if (!d.open) d.showModal();
  $('#ws_ok').onclick = () => d.close();
  const asRoutine = (id, name) => ({ id, name, exercises: out.map(e => { const ws = e.sets.filter(s=>s.type!=='warmup'); return {name:e.name, group:e.muscle_group, sets:Math.max(1,ws.length), reps:(ws[0]||{}).reps||'', weight:(ws[0]||{}).weight||'', warmups:e.sets.filter(s=>s.type==='warmup').length, superset:e.superset||null}; }), updated:Date.now() });
  if ($('#ws_save')) $('#ws_save').onclick = () => { const name = prompt('Name this routine', sm.name==='Workout'?'':sm.name); if (!name) return; saveRoutine(asRoutine(uid(), name.trim().slice(0,40))); d.close(); toast(`Saved routine “${name.trim().slice(0,40)}”`); };
  if ($('#ws_upd')) $('#ws_upd').onclick = () => { saveRoutine(asRoutine(routine.id, routine.name)); d.close(); toast(`Updated “${routine.name}”`); };
}
function saveRoutine(r){ S.routines = [...(S.routines||[]).filter(x=>x.id!==r.id), r]; render(); if (S.db) S.db.doc('routines/'+r.id).set(r).catch(()=>{}); }
function openRoutine(id){
  const d = $('#dlg'); const orig = (S.routines||[]).find(r=>r.id===id);
  const r = orig ? JSON.parse(JSON.stringify(orig)) : {id:uid(), name:'', exercises:[]};
  const draw = () => {
    d.innerHTML = `<form class="form" id="rtform" style="gap:12px"><h2 class="full">${orig?'Edit routine':'New routine'}</h2>
      <label class="field full">Name<input id="rt_name" maxlength="40" value="${esc(r.name)}" placeholder="e.g. Push day" required></label>
      <div class="full rtlist">${r.exercises.map((e,i)=>`<div class="rtrow${e.superset?' ss':''}"><div><b>${esc(e.name)}</b> <span class="tag">${esc(e.group||'')}</span>${e.superset?` <span class="muted small">superset ${esc(e.superset)}</span>`:''}</div>
        <div class="rtnums"><label>Sets<input type="number" min="1" max="12" data-rt="sets" data-i="${i}" value="${esc(e.sets||3)}"></label><label>Reps<input type="number" min="1" max="100" data-rt="reps" data-i="${i}" value="${esc(e.reps||'')}" placeholder="8"></label><label>kg<input type="number" step="0.5" min="0" data-rt="weight" data-i="${i}" value="${esc(e.weight||'')}" placeholder="last"></label><label>Warm-ups<input type="number" min="0" max="4" data-rt="warmups" data-i="${i}" value="${esc(e.warmups||0)}"></label></div>
        <div class="row"><button type="button" class="linkbtn" data-rtup="${i}" ${i?'':'disabled'}>Move up</button><button type="button" class="linkbtn" data-rtss="${i}">${e.superset?'Unlink superset':'Superset with next'}</button><button type="button" class="linkbtn" data-rtdel="${i}">Remove</button></div></div>`).join('') || '<div class="muted small">No exercises yet.</div>'}</div>
      <div class="full row"><button type="button" class="btn ghost sm" id="rt_add">+ Add exercise</button></div>
      <div class="full row">${orig?'<button type="button" class="btn ghost danger" id="rt_del">Delete routine</button>':''}<span class="spacer"></span><button type="button" class="btn ghost" id="rt_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
    if (!d.open) d.showModal();
    const keep = () => { r.name = $('#rt_name').value; d.querySelectorAll('[data-rt]').forEach(el => { r.exercises[+el.dataset.i][el.dataset.rt] = el.value; }); };
    $('#rt_add').onclick = () => { keep(); openExPicker(x => { r.exercises.push({name:x.name, group:x.group, sets:3, reps:'', weight:'', warmups:0}); draw(); }, 'Add exercise', draw); };
    $('#rt_cancel').onclick = () => d.close();
    d.querySelectorAll('[data-rtdel]').forEach(b => b.onclick = () => { keep(); r.exercises.splice(+b.dataset.rtdel,1); draw(); });
    d.querySelectorAll('[data-rtup]').forEach(b => b.onclick = () => { keep(); const i=+b.dataset.rtup; [r.exercises[i-1], r.exercises[i]] = [r.exercises[i], r.exercises[i-1]]; draw(); });
    d.querySelectorAll('[data-rtss]').forEach(b => b.onclick = () => { keep(); linkSuperset(r.exercises, +b.dataset.rtss); draw(); });
    if ($('#rt_del')) $('#rt_del').onclick = () => { if (!confirm(`Delete the routine “${orig.name}”?`)) return; S.routines = (S.routines||[]).filter(x=>x.id!==orig.id); if (S.db) S.db.doc('routines/'+orig.id).delete().catch(()=>{}); d.close(); render(); toast(`Deleted “${orig.name}”`, () => saveRoutine(orig)); };
    $('#rtform').onsubmit = ev => { ev.preventDefault(); keep(); r.name = r.name.trim().slice(0,40); if (!r.name) return;
      r.exercises = r.exercises.map(e=>({...e, sets:Math.max(1,Math.min(12,Number(e.sets)||3)), reps:Number(e.reps)||'', weight:Number(e.weight)||'', warmups:Math.max(0,Math.min(4,Number(e.warmups)||0))}));
      r.updated = Date.now(); saveRoutine(r); d.close(); toast(`Saved “${r.name}”`); };
  };
  draw();
}
// Superset this exercise with the next one (or unlink it).
function linkSuperset(list, i){
  const e = list[i]; if (!e) return;
  if (e.superset) { const g = e.superset; list.forEach(x => { if (x.superset===g) x.superset = null; }); return; }
  const next = list[i+1]; if (!next) { toast('Add the next exercise first, then link them.'); return; }
  const used = new Set(list.map(x=>x.superset).filter(Boolean)); const g = next.superset || [...SS_LETTERS].find(c=>!used.has(c)) || 'A';
  e.superset = g; next.superset = g;
}
function wkAction(a, b){
  const w = S.workout, i = Number(b.dataset.ex), j = Number(b.dataset.set), e = w && w.exercises[i];
  switch (a) {
    case 'wkStart': wkStart(null); break;
    case 'wkStartRoutine': { const r = (S.routines||[]).find(x=>x.id===b.dataset.id); if (r) wkStart(r); break; }
    case 'routineNew': openRoutine(null); break;
    case 'routineEdit': openRoutine(b.dataset.id); break;
    case 'wkDiscard': if (w && confirm('Discard this workout? Nothing from it will be saved.')) { S.workout = null; wkSave(); stopRest(); render(); } break;
    case 'wkFinish': wkFinishNow(); break;
    case 'wkAddEx': openExPicker(x => { S.workout.exercises.push(wkExercise(x.name, x.group)); wkSave(); render(); }); break;
    case 'wkRemoveEx': if (e && confirm(`Remove ${e.name} from this workout?`)) { if (e.superset) linkSuperset(w.exercises, i); w.exercises.splice(i,1); wkSave(); render(); } break;
    case 'wkAddSet': if (e) { const last = e.sets[e.sets.length-1] || {}; e.sets.push(newSet({weight:last.weight||'', reps:last.reps||''})); wkSave(); render(); } break;
    case 'wkDelSet': if (e && e.sets.length>1) { e.sets.pop(); wkSave(); render(); } break;
    case 'wkType': if (e) { const order = ['normal','warmup','drop','failure'], s = e.sets[j]; s.type = order[(order.indexOf(s.type)+1)%order.length]; wkSave(); render(); } break;
    case 'wkSuperset': if (e) { linkSuperset(w.exercises, i); wkSave(); render(); } break;
    case 'wkWarmup': if (e) { const first = e.sets.find(s=>s.type!=='warmup'), prev = prevSets(e.name).find(s=>s.type!=='warmup');
      const kg = Number(first&&first.weight) || (prev&&prev.weight) || 0; e.sets = e.sets.filter(s=>s.type!=='warmup'||s.done); e.sets.unshift(...warmupSets(kg));
      wkSave(); render(); toast(kg ? `Added warm-up sets building to ${n1(kg)} kg` : 'Added a warm-up set; type your working weight to get a full ramp'); } break;
    case 'wkPlates': if (e) { const s = e.sets.find(x=>!x.done && x.type!=='warmup') || e.sets[0]; const p = prevSets(e.name)[0]; openPlates(s.weight || (p&&p.weight) || ''); } break;
    case 'wkDone': if (e) { const s = e.sets[j];
      if (s.done) { s.done = false; s.pr = false; wkSave(); render(); break; }
      const prev = prevSets(e.name).filter(x=>x.type!=='warmup'), pi = e.sets.slice(0,j).filter(x=>x.type!=='warmup').length, p = s.type==='warmup' ? null : prev[pi];
      if (s.weight==='' && p && p.weight>0) s.weight = String(p.weight);
      if (s.reps==='' && p) s.reps = String(p.reps);
      if (!(Number(s.reps)>0)) { toast('Type the reps first.'); break; }
      { const bad = setProblem(Number(s.weight)||0, Number(s.reps)); if (bad) { toast(bad); render(); break; } }
      s.done = true;
      // Live PR: heavier than ever, or a better estimated 1RM (or more reps, bodyweight).
      const hist = buildSessions().get(exKey(e.name));
      if (hist && hist.sessions.length && s.type!=='warmup') { const wt = Number(s.weight)||0, reps = Number(s.reps)||0;
        const top = Math.max(...hist.sessions.map(x=>x.top)), best = Math.max(...hist.sessions.map(x=>x.best));
        const done = e.sets.filter(x=>x.done && x!==s && x.type!=='warmup');
        const already = done.some(x => (Number(x.weight)||0) >= wt && Number(x.reps) >= reps);
        if (!already && (hist.sessions[0].bodyweight ? reps > best && !wt : wt > top || (wt>0 && e1rm({weight:wt, reps}) > best + 0.05))) { s.pr = true; toast(`New personal record on ${e.name}! 🎉`); } }
      wkSave(); render();
      if (b.dataset.last==='1' && e.rest!=='0') startRest(Number(e.rest)||null); } break;
  }
}
setInterval(() => { if (!S.workout) return; const el = document.getElementById('wkClock'); if (el) el.textContent = fmtDur(Date.now()-Date.parse(S.workout.started)); }, 1000);
/* ---------- exercise library (exercises.js + data/ex-*.json) ---------- */
const libCount = () => typeof Gym==='undefined' ? 0 : Gym.EXERCISES.length + Gym.libraries().reduce((s,l)=>s+l.items.length,0);
function sourcesHtml(){
  return `<ul class="tips">
    <li><b>Foods:</b> MaxxTempo’s table (IFCT 2017 and USDA averages); Indian recipes from the <a href="https://www.anuvaad.org.in/indian-nutrient-databank/" target="_blank" rel="noopener">Indian Nutrient Databank (INDB)</a>, Vijayakumar et al. 2024, CC BY 4.0; <a href="https://fdc.nal.usda.gov" target="_blank" rel="noopener">USDA FoodData Central</a> SR Legacy, public domain.</li>
    <li><b>Sports and activities:</b> METs from the <a href="https://pacompendium.com" target="_blank" rel="noopener">2024 Adult Compendium of Physical Activities</a> (Herrmann, Willis, Ainsworth et al., <i>J Sport Health Sci</i> 2024), free to use.</li>
    <li><b>Packaged foods:</b> barcode lookups from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, © Open Food Facts contributors, <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>. Scanning uses <a href="https://github.com/zxing-js/browser" target="_blank" rel="noopener">ZXing</a> (MIT / Apache-2.0). Packs that aren’t there are read from a label photo on your phone with <a href="https://github.com/naptha/tesseract.js" target="_blank" rel="noopener">Tesseract.js</a> (Apache-2.0) and shared with your group.</li>
    <li><b>Restaurants:</b> California Burrito meals use the values from <a href="https://www.californiaburrito.in/nutrition" target="_blank" rel="noopener">their nutrition calculator</a>, part by part; WeFit meals use <a href="https://wefitmeals.in" target="_blank" rel="noopener">WeFit’s own nutrition data</a>.</li>
    <li><b>Exercises:</b> <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain); <a href="https://wger.de" target="_blank" rel="noopener">wger</a> (CC-BY-SA, authors listed on each exercise); <a href="https://oss.exercisedb.dev" target="_blank" rel="noopener">ExerciseDB</a> free version (non-commercial, animations from ExerciseDB).</li>
  </ul><div class="muted small">All free, with no accounts or keys. Food and exercise data is stored in the app, so it keeps working even if a source goes offline; only barcode lookups and exercise pictures need the internet.</div>`;
}
function libraryHtml(){
  return `<label class="field full">Find an exercise<input id="exq" type="search" placeholder="e.g. incline db, lat pulldown, rdl" value="${esc(S.exq||'')}" autocomplete="off"></label>
    <div id="exres" class="exres">${libResults(S.exq||'')}</div>
    `;
}
function libResults(q){
  if (!q.trim()) return '';
  const r = Gym.search(q, 30);
  if (!r.length) return `<div class="empty">No exercise matches “${esc(q)}”.</div>`;
  return r.map(x=>`<button class="exrow" data-action="howto" data-name="${esc(x.name)}"><span>${esc(x.name)}</span><span class="tag">${esc(x.group)}</span></button>`).join('');
}
// "How to do it" under an exercise: a fold whose content is filled the first time it opens.
const howtoFold = name => `<details class="howfold" data-how="${esc(name)}"><summary>How to do it</summary><div class="howbody"></div></details>`;
function howtoBody(name){
  const hs = Gym.howto(name);
  if (!hs.length) return `<div class="muted small">${libCount() ? 'No instructions for this exercise in the built-in libraries yet.' : 'The exercise library is still loading. Close and open this again in a moment.'}</div>`;
  const pic = hs.find(h=>h.item.img && /\.gif$/i.test(h.item.img)) || hs.find(h=>h.item.img);
  const text = hs.find(h=>(h.item.i||[]).length); const info = hs[0].item;
  const credits = [...new Map(hs.map(h=>[h.source, h])).values()].map(h => h.source==='wger'
    ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">wger.de</a> (${esc(h.item.lic||'CC-BY-SA')}, ${esc(h.item.by||'wger.de')})`
    : h.source==='ExerciseDB' ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">ExerciseDB</a> (free version, non-commercial)`
    : `<a href="${esc(h.url)}" target="_blank" rel="noopener">free-exercise-db</a> (public domain)`).join(' · ');
  return `${pic ? `<img class="howimg" src="${esc(pic.item.img)}" alt="${esc(pic.item.n)} demonstration" loading="lazy">` : ''}
    <div class="small muted">${[info.g, (info.mu||[]).join(', '), (info.s||[]).length?`also ${info.s.join(', ')}`:'', info.eq].filter(Boolean).map(esc).join(' · ')}</div>
    ${text ? `<ol class="tips howsteps">${text.item.i.slice(0,10).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    <div class="muted small">From ${credits}.${text && text.item.n!==name ? ` Closest match: ${esc(text.item.n)}.` : ''}</div>`;
}
document.addEventListener('toggle', ev => {
  const det = ev.target; if (!det.matches || !det.matches('details.howfold') || !det.open) return;
  const body = det.querySelector('.howbody'); if (!body || body.dataset.done) return;
  body.innerHTML = howtoBody(det.dataset.how||''); body.dataset.done = libCount() ? '1' : '';
  const img = body.querySelector('.howimg'); if (img) img.addEventListener('error', () => img.remove());
}, true);
function openHowto(name){
  const hs = Gym.howto(name); const d = $('#dlg');
  const pic = hs.find(h=>h.item.img && /\.gif$/i.test(h.item.img)) || hs.find(h=>h.item.img);
  const text = hs.find(h=>(h.item.i||[]).length);
  const info = hs[0]?.item;
  const credits = [...new Map(hs.map(h=>[h.source, h])).values()].map(h => h.source==='wger'
    ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">wger.de</a> (${esc(h.item.lic||'CC-BY-SA')}, ${esc(h.item.by||'wger.de')})`
    : h.source==='ExerciseDB' ? `<a href="${esc(h.url)}" target="_blank" rel="noopener">ExerciseDB</a> (free version, non-commercial)`
    : `<a href="${esc(h.url)}" target="_blank" rel="noopener">free-exercise-db</a> (public domain)`).join(' · ');
  d.innerHTML = `<div class="howto"><h2>${esc(name)}</h2>
    ${!hs.length ? `<p class="muted">${libCount() ? 'No instructions found for this exercise in the built-in libraries.' : 'The exercise library is still loading. Try again in a moment.'}</p>` : ''}
    ${pic ? `<img class="howimg" src="${esc(pic.item.img)}" alt="${esc(pic.item.n)} demonstration" loading="lazy">` : ''}
    ${info ? `<div class="small muted">${[info.g, (info.mu||[]).join(', '), (info.s||[]).length?`also ${info.s.join(', ')}`:'', info.eq].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    ${text ? `<ol class="tips howsteps">${text.item.i.slice(0,10).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    ${hs.length ? `<div class="muted small">From ${credits}.${text && text.item.n!==name ? ` Closest match: ${esc(text.item.n)}.` : ''}</div>` : ''}
    <div class="row"><span class="spacer"></span><button class="btn" id="howClose">Close</button></div></div>`;
  d.showModal(); $('#howClose').onclick = () => d.close();
  const img = d.querySelector('.howimg'); if (img) img.addEventListener('error', () => img.remove());
}
/* Built-in databases in data/ (see DATA-LICENSES.md), fetched once after sign-in
   and kept by the service worker. The app works without them. */
const DATA_VER = 1;
async function loadData(){
  const get = f => fetch(`data/${f}.json?v=${DATA_VER}`).then(r => r.ok ? r.json() : null).catch(() => null);
  const [free, wger, edb, indb] = await Promise.all([get('ex-free'), get('ex-wger'), get('ex-edb'), get('indb')]);
  Gym.setLibraries([free, wger, edb]); S.libsReady = true; loadActs();
  if (indb && indb.items?.length) { S.libFoods = indb.items.map(r=>rowToFood(r,'indb')); S.indbBuiltIn = true; S.myFoodsVer=(S.myFoodsVer||0)+1; }
  render();
}
// USDA is only needed for search, so it loads the first time someone searches.
let usdaP = null;
const loadUsda = () => usdaP ||= fetch(`data/usda.json?v=${DATA_VER}`).then(r => r.ok ? r.json() : null).then(d => (d?.items||[]).map(usdaToFood)).catch(() => (usdaP = null, []));
function usdaToFood(r){
  const [name, cat, units, kcal, protein, carbs, fat, fiber, sugar, ...m] = r;
  const micros = {}; FOOD_MICRO_ORDER.forEach((k,i)=>micros[k]=m[i]||0);
  return {name:usdaName(name), aliases:[name], units:units||{}, per:{kcal,protein,carbs,fat,fiber,sugar,micros}, alcohol:m[14]||0, cat, src:'usda'};
}
// USDA names lead with a group ("Nuts, almonds, blanched"); put the food first: "Almonds, blanched (nuts)".
const USDA_GROUPS = new Set(['nuts','seeds','cereals','spices','oil','candies','beverages','snacks','soup','sauce','fast foods','restaurant','babyfood','cereals ready-to-eat','fish','crustaceans','mollusks','vegetables','fruit']);
function usdaName(n){
  const seg = String(n).split(', ');
  let out = seg.length > 1 && USDA_GROUPS.has(seg[0].toLowerCase()) ? `${seg.slice(1).join(', ')} (${seg[0].toLowerCase()})` : seg.join(', ');
  out = out.replace(/\b[A-Z]{3,}(?:'[A-Z]+)?\b/g, w => w[0] + w.slice(1).toLowerCase());   // "ALMOND JOY" → "Almond Joy"
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/* ---------- food search (my foods, built-in, INDB, USDA) and portions ---------- */
async function searchFoods(q, limit=40){
  const qw = normFood(q).split(' ').filter(Boolean).map(singular); if (!qw.length) return [];
  const words = t => normFood(t).split(' ').map(singular);
  const hit = (name, aliases) => [name, ...(aliases||[])].some(a => { const ws = words(a); return qw.every((w,i) => ws.some(x => i===qw.length-1 ? x.startsWith(w) : x===w)); });
  const mine = Object.values(S.myFoods||{}).map(f => ({...f, src:'mine'}));
  const out = [], seen = new Set();
  const add = f => { const k = normFood(f.name); if (seen.has(k) || out.length >= limit*3) return; seen.add(k); out.push(f); };
  for (const f of mine) if (hit(f.name, f.aliases)) add(f);
  for (const f of FOODS) if (hit(f.name, f.aliases)) add({...f, src:'builtin'});
  for (const f of S.libFoods||[]) if (hit(f.name, f.aliases)) add(f);
  for (const f of await loadUsda()) if (hit(f.name)) add(f);
  // Relevance: exact names and names that start with what was typed first; oils, sweets and
  // baby foods only when asked for; then your own foods, the built-in table, INDB, USDA.
  const rank = {mine:0, builtin:1, indb:2, usda:3}, qs = new Set(qw);
  const score = f => { const n = normFood(f.name), ws = words(f.name); let x = rank[f.src]*6 + n.length/25;
    const qj = qw.join(' ');
    if (n === qj || words(f.name).join(' ') === qj) x -= 100;
    else if ((f.aliases||[]).some(a => words(a).join(' ') === qj)) x -= 90;
    if (ws[0] === qw[0]) x -= 20; else if (ws.slice(0,2).includes(qw[0])) x -= 8;
    for (const [re, pen] of [[/\boil\b/,40],[/\bcand(y|ies)\b/,40],[/\bbabyfood|infant\b/,60],[/\bflour\b/,12],[/\bbran\b/,12],[/\bfast food|restaurant\b/,10],[/\bbeverage\b/,8]])
      if (re.test(n) && !qw.some(w => re.test(w))) x += pen;
    return x; };
  return out.map(f => [score(f), f]).sort((a,b) => a[0]-b[0]).map(x => x[1]).slice(0, limit);
}
/* ---------- restaurant meals (restaurants.js) ---------- */
function restaurantFood(r, meal){
  const q = r.qty || 1, k = v => Math.round(v * q * 10) / 10;
  const extras = r.parts.filter(x => /^Extra /.test(x.label) || ['GUACAMOLE','MELTED CHEESE QUESO','CHIPOTLE MAYO','SOUTHWEST SAUCE','HOT HABANERO SAUCE','MANGO SALSA','SUNFLOWER SEEDS','CRUSHED CORN CHIPS'].includes(x.name)).map(x => x.label.replace(/^Extra /,'extra '));
  const micros = {}; for (const m of MICROS) micros[m.key] = 0;
  const part = q===0.5 ? 'Half ' : q===0.25 ? 'Quarter ' : '';
  return {id:uid(), name:(part + r.title + (extras.length ? ' + ' + extras.join(', ').toLowerCase() : '')).slice(0,110), quantity:q===0.5?`half ${r.unit}`:q===0.25?`quarter ${r.unit}`:`${q} ${r.unit}${q>1?'s':''}`, grams:0, meal:meal||guessMeal(), time:nowTime(),
    kcal:k(r.kcal), protein:k(r.protein), carbs:k(r.carbs), fat:k(r.fat), fiber:k(r.fiber||0), sugar:0, added_sugar:0, alcohol:0, micros, confidence:'high', source:'restaurant',
    parts:r.parts.map(x => x.label).slice(0,20), restaurant:'California Burrito', no_fat_split:true};
}
/* ---------- WeFit meals (wefit.js): whole meals, from WeFit's own nutrition data ---------- */
function wefitFood(m, qty, meal){
  const q = qty || 1, k = v => Math.round(v * q * 10) / 10;
  const micros = {}; for (const x of MICROS) micros[x.key] = 0;
  const part = q===0.5 ? 'Half ' : q===0.25 ? 'Quarter ' : '';
  return {id:uid(), name:(part + 'WeFit ' + m.name).slice(0,110), quantity:q===0.5?'half meal':q===0.25?'quarter meal':`${q} meal${q>1?'s':''}`, grams:0, meal:meal||guessMeal(), time:nowTime(),
    kcal:k(m.kcal), protein:k(m.protein), carbs:k(m.carbs), fat:k(m.fat), fiber:k(m.fiber), sugar:0, added_sugar:0, alcohol:0, micros, confidence:'high', source:'restaurant',
    parts:m.parts.slice(0,20), restaurant:'WeFit', no_fat_split:true};
}
function openWeFit(pick){
  const d = $('#dlg'), W = WeFit; let m = pick || W.MEALS[0], cat = m.cat;
  const draw = () => {
    d.innerHTML = `<form class="form" id="wfform" style="gap:10px"><h2 class="full">WeFit</h2>
      <label class="field full">Menu<select id="wf_cat">${W.CATEGORIES.map(c=>`<option ${c===cat?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field full">Meal<select id="wf_meal">${W.MEALS.filter(x=>x.cat===cat).map(x=>`<option value="${esc(x.name)}" ${x===m?'selected':''}>${esc(x.name)} · ${n0(x.kcal)} kcal</option>`).join('')}</select></label>
      <label class="field">Amount<select id="wf_qty">${[[0.5,'Half'],[1,'1 meal'],[1.5,'1½ meals'],[2,'2 meals']].map(([v,l])=>`<option value="${v}" ${v===1?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="field">Meal<select id="wf_when">${MEALS.map(x=>`<option ${x===guessMeal()?'selected':''}>${x}</option>`).join('')}</select></label>
      <div class="full" id="wf_prev"></div>
      <details class="full how"><summary>What’s in it</summary><ul>${m.parts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>
      <div class="full muted small">From WeFit’s own nutrition data. Meat and grains are weighed as they go in.</div>
      <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="wf_cancel">Cancel</button><button class="btn" type="submit">Log it</button></div></form>`;
    const upd = () => { const q = Number($('#wf_qty').value)||1;
      $('#wf_prev').innerHTML = `<b>${n0(m.kcal*q)} kcal</b> · protein ${n1(m.protein*q)} g · carbs ${n1(m.carbs*q)} g · fat ${n1(m.fat*q)} g · fibre ${n1(m.fiber*q)} g`; };
    $('#wf_cat').onchange = ev => { cat = ev.target.value; m = W.MEALS.find(x=>x.cat===cat); draw(); };
    $('#wf_meal').onchange = ev => { m = W.MEALS.find(x=>x.name===ev.target.value) || m; draw(); };
    $('#wf_qty').onchange = upd; upd();
    $('#wf_cancel').onclick = () => d.close();
    $('#wfform').onsubmit = async ev => { ev.preventDefault();
      const f = wefitFood(m, Number($('#wf_qty').value)||1, $('#wf_when').value); d.close(); await saveEntry(S.date, {foods:[f]}); setStatus(`Logged ${f.name} · ${n0(f.kcal)} kcal. No AI used.`); };
  };
  draw(); if (!d.open) d.showModal();
}
function openCB(){
  const d = $('#dlg'), R = Restaurants; let meal = 'ricebowl', size = 'regular', picks = null;
  const opt = (rows, sel, none) => (none?`<option value="">${none}</option>`:'') + rows.map(r => `<option value="${esc(r[0])}" ${r[0]===sel?'selected':''}>${esc(R.titleCase(r[0]))} · ${n0(r[1])} kcal</option>`).join('');
  // Add-on groups show the add-on portion (30% of the matching side, where there is one).
  const chk = (rows, on, grp) => (['extraToppings','makeItRich','extras'].includes(grp) ? rows.map(R.addonRow) : rows).map(r => `<label class="check"><input type="checkbox" data-g="${grp}" value="${esc(r[0])}" ${on.includes(r[0])?'checked':''}> ${esc(R.titleCase(r[0]))} <span class="muted small">${n0(r[1])} kcal</span></label>`).join('');
  const fresh = () => {
    const L = c => R.list(meal, c, size);
    picks = {protein:(L('proteins')[0]||[])[0], rice:meal==='salad'||meal==='tacos'||meal==='nachos'?'':'CILANTRO RICE', beans:meal==='tacos'?'':'BLACK BEANS',
      toppings:(R.DEFAULT_TOPPINGS[size==='one'?'mini':size]||R.DEFAULT_TOPPINGS.regular).filter(x=>L('toppings').some(r=>r[0]===x)), extraToppings:[], extraFillings:[], makeItRich:[], extras:[], dips:[],
      dressing:meal==='salad'?'CHILLI LIME VINAIGRETTE':'', shell:'SOFT SHELL', filling:(L('filling')[0]||[])[0], snack:(R.CB.munchies.snacks[0]||[])[0], side:(R.CB.sides[0]||[])[0]};
  };
  const draw = () => {
    const L = c => R.list(meal, c, size), M = R.MEALS[meal];
    const full = (meal==='ricebowl'||meal==='salad')&&size==='pro' || meal==='burrito'&&size==='habanero' || meal==='tacos'&&size==='overcrowded';
    const r = R.build(meal, size, picks);
    d.innerHTML = `<form class="form cbform" id="cbform" style="gap:10px"><h2 class="full">California Burrito</h2>
      <label class="field">Meal<select id="cb_meal">${Object.entries(R.MEALS).map(([k,v])=>`<option value="${k}" ${k===meal?'selected':''}>${v.name}</option>`).join('')}</select></label>
      ${M.sizes.length>1?`<label class="field">Size<select id="cb_size">${M.sizes.map(z=>`<option value="${z}" ${z===size?'selected':''}>${z==='three'?'3 tacos':z==='one'?'1 taco':z[0].toUpperCase()+z.slice(1)}</option>`).join('')}</select></label>`:''}
      ${meal==='tacos'?`<label class="field">Shell<select data-s="shell">${opt(L('shell'), picks.shell)}</select></label>`:''}
      ${meal==='munchies'?`<label class="field full">Snack<select data-s="snack">${opt(R.CB.munchies.snacks, picks.snack)}</select></label>`
        : meal==='sides'?`<label class="field full">Side<select data-s="side">${opt(R.CB.sides, picks.side)}</select></label>`
        : meal==='tacos'&&size==='overcrowded'?`<label class="field full">Taco<select data-s="filling">${opt(L('filling'), picks.filling)}</select></label>`
        : `<label class="field full">${meal==='quesadilla'?'Quesadilla':'Protein'}<select data-s="protein">${opt(L('proteins'), picks.protein)}</select></label>`}
      ${!full && ['ricebowl','burrito','salad','nachos','tacos'].includes(meal) ? `
        <label class="field">Rice<select data-s="rice">${opt(L('rice').filter(x=>x[0]!=='NO RICE'), picks.rice, 'No rice')}</select></label>
        <label class="field">Beans<select data-s="beans">${opt(L('beans').filter(x=>x[0]!=='NO BEANS'), picks.beans, 'No beans')}</select></label>
        <fieldset class="full cbset"><legend>Toppings</legend>${chk(L('toppings'), picks.toppings, 'toppings')}</fieldset>
        <fieldset class="full cbset"><legend>Extra toppings</legend>${chk(L('extraToppings'), picks.extraToppings, 'extraToppings')}</fieldset>` : ''}
      ${meal==='salad'&&!full?`<label class="field full">Dressing<select data-s="dressing">${opt(L('dressing'), picks.dressing, 'No dressing')}</select></label>`:''}
      ${!(meal==='burrito'&&size==='habanero') && !['quesadilla','munchies','sides'].includes(meal) && !(meal==='tacos'&&size==='overcrowded') ? `
        <fieldset class="full cbset"><legend>Extra fillings (extra chicken, paneer…)</legend>${chk(L('extraFillings'), picks.extraFillings, 'extraFillings')}</fieldset>
        <fieldset class="full cbset"><legend>Make it rich</legend>${chk(L('makeItRich'), picks.makeItRich, 'makeItRich')}</fieldset>` : ''}
      ${meal==='quesadilla'?`<fieldset class="full cbset"><legend>Extras</legend>${chk(R.list('quesadilla','beans','regular'), picks.extras, 'extras')}</fieldset>`:''}
      ${['quesadilla','munchies'].includes(meal)?`<fieldset class="full cbset"><legend>Dip</legend>${chk(R.CB[meal].chooseyourdip, picks.dips, 'dips')}</fieldset>`:''}
      ${meal==='nachos'?'<div class="full muted small">Includes a portion of their plain nachos for the chips.</div>':''}
      <div class="full cbtotal"><b>${n0(r.kcal)} kcal</b> · protein ${n1(r.protein)} g · carbs ${n1(r.carbs)} g · fat ${n1(r.fat)} g${r.fiber?` · fibre ${n1(r.fiber)} g`:''}</div>
      <label class="field">How much<select id="cb_qty"><option value="0.5">Half</option><option value="1" selected>1</option><option value="1.5">1½</option><option value="2">2</option><option value="3">3</option></select></label>
      <label class="field">Meal<select id="cb_when">${MEALS.map(m=>`<option ${m===guessMeal()?'selected':''}>${m}</option>`).join('')}</select></label>
      <div class="full muted small">From California Burrito’s nutrition calculator. Toppings and sauces added on that are also sold as a side count as 30% of that side.</div>
      <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="cb_cancel">Cancel</button><button class="btn" type="submit">Log it</button></div></form>`;
    $('#cb_cancel').onclick = () => d.close();
    $('#cb_meal').onchange = ev => { meal = ev.target.value; size = R.MEALS[meal].sizes[0]; fresh(); draw(); };
    if ($('#cb_size')) $('#cb_size').onchange = ev => { size = ev.target.value; fresh(); draw(); };
    d.querySelectorAll('[data-s]').forEach(el => el.onchange = () => { picks[el.dataset.s] = el.value; draw(); });
    d.querySelectorAll('[data-g]').forEach(el => el.onchange = () => { const g = el.dataset.g; picks[g] = [...d.querySelectorAll(`[data-g="${g}"]:checked`)].map(x=>x.value); draw(); });
    $('#cbform').onsubmit = async ev => { ev.preventDefault(); const res = R.build(meal, size, picks); res.qty = Math.max(0.25, Math.min(10, Number($('#cb_qty').value)||1));
      const f = restaurantFood(res, $('#cb_when').value); d.close(); await saveEntry(S.date, {foods:[f]}); setStatus(`Logged ${f.name} · ${n0(f.kcal)} kcal. No AI used.`); };
  };
  fresh(); if (!d.open) d.showModal(); draw();
}
const SRC_LABEL = {mine:'my food', builtin:'built in', indb:'INDB', usda:'USDA', off:'Open Food Facts', group:'added by your group', label:'from the label'};
function openFoodSearch(){
  const d = $('#dlg');
  d.innerHTML = `<div class="fsearch"><h2>Find a food</h2>
    <label class="field full">Search<input id="fq" type="search" placeholder="e.g. almonds, paneer tikka, oats" autocomplete="off"></label>
    <div id="fres" class="exres"><div class="muted small">${n0(FOODS.length + (S.libFoods||[]).length)} Indian and everyday foods, plus about 7,200 from USDA. No AI used.</div></div>
    <div class="row"><button class="btn ghost sm" id="fscan">Scan a barcode</button><button class="btn ghost sm" id="flabel">From a label</button><button class="btn ghost sm" id="fcb">California Burrito</button><button class="btn ghost sm" id="fwf">WeFit</button><span class="spacer"></span><button class="btn ghost" id="fclose">Close</button></div></div>`;
  d.showModal(); $('#fclose').onclick = () => d.close(); $('#fscan').onclick = () => openScanner(); $('#fcb').onclick = () => openCB(); $('#fwf').onclick = () => openWeFit(); $('#flabel').onclick = () => openLabel('', ($('#fq')?.value||'').trim(), 'A packed food without a barcode, or one you’d rather add by hand?');
  let t = null, list = [];
  $('#fq').addEventListener('input', ev => { clearTimeout(t); t = setTimeout(async () => {
    const q = ev.target.value; if (!q.trim()) { $('#fres').innerHTML=''; return; }
    // WeFit meals: all of them when the search names WeFit, otherwise a few at the end.
    const wf = typeof WeFit==='undefined' ? [] : WeFit.search(q).map(m => ({wefit:m, name:'WeFit '+m.name}));
    list = wf.length && WeFit.isWeFit(q) ? wf : [...await searchFoods(q), ...wf.slice(0,4)];
    if ($('#fq')?.value !== q) return;
    $('#fres').innerHTML = list.length ? list.map((f,i)=>`<button class="exrow" data-i="${i}"><span>${esc(f.name)}<span class="muted small"> · ${f.wefit?`${n0(f.wefit.kcal)} kcal per meal`:`${n0(f.per.kcal)} kcal/100 g`}</span></span><span class="tag">${f.wefit?'WeFit':SRC_LABEL[f.src]||''}</span></button>`).join('')
      : `<div class="empty">Nothing found for “${esc(q)}”. Type it in the log box instead and AI will read it.</div>`;
  }, 180); });
  $('#fres').addEventListener('click', ev => { const b = ev.target.closest('[data-i]'); if (!b) return; const f = list[+b.dataset.i]; if (f.wefit) openWeFit(f.wefit); else openPortion(f); });
  setTimeout(() => $('#fq')?.focus(), 50);
}
function foodFromPer(f, grams, label){
  const k = grams/100, per = f.per; const micros = {}; for (const m of MICROS) micros[m.key] = (per.micros[m.key]||0)*k;
  return {id:uid(), name:f.name, quantity:label, grams:Math.round(grams), meal:guessMeal(), time:nowTime(), kcal:per.kcal*k, protein:per.protein*k, carbs:per.carbs*k, fat:per.fat*k,
    fiber:(per.fiber||0)*k, sugar:(per.sugar||0)*k, added_sugar:addedPer100(f)*k, alcohol:((f.alcohol ?? FOOD_ALCOHOL[f.name]) || 0)*k, micros, confidence:'high', source:'food-'+(f.src||'db')};
}
function openPortion(f, note){
  if (!f) return;
  const d = $('#dlg'); const units = Object.entries(f.units||{}).filter(([,g])=>g>0);
  // Start from one serving; a whole packet only when it's a small one (a bar, a sachet), otherwise 100 g.
  const U = f.units||{}; const def = U.serving ? 'serving' : U.packet && U.packet<=60 ? 'packet' : units.length && !U.packet ? units[0][0] : 'g';
  const opts = [...units.map(([u,g])=>`<option value="${esc(u)}" ${u===def?'selected':''}>${esc(u)} (${n0(g)} g)</option>`), `<option value="g" ${def==='g'?'selected':''}>grams</option>`].join('');
  d.innerHTML = `<form class="form" id="pform" style="gap:12px"><h2 class="full">${esc(f.name)}</h2>
    ${note ? `<div class="full small muted">${note}</div>` : ''}
    <label class="field">Amount<input id="pq" type="number" min="0" step="any" inputmode="decimal" value="${def==='g'?100:1}"></label>
    <label class="field">Unit<select id="pu">${opts}</select></label>
    <label class="field">Meal<select id="pm">${MEALS.map(m=>`<option ${m===guessMeal()?'selected':''}>${m}</option>`).join('')}</select></label>
    <div class="full" id="pprev"></div>
    <div class="full muted small">Per 100 g: ${n0(f.per.kcal)} kcal · P ${n1(f.per.protein)} · C ${n1(f.per.carbs)} · F ${n1(f.per.fat)} g · from ${esc(SRC_LABEL[f.src]||'food table')}</div>
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="pcancel">Cancel</button><button class="btn" type="submit">Log it</button></div></form>`;
  d.showModal();
  const grams = () => { const q = num($('#pq').value, 100000), u = $('#pu').value; return u==='g' ? q : q*((f.units||{})[u]||100); };
  const upd = () => { const g = grams(), k = g/100; $('#pprev').innerHTML = `<b>${n0(f.per.kcal*k)} kcal</b> · ${n0(g)} g · protein ${n1(f.per.protein*k)} g · carbs ${n1(f.per.carbs*k)} g · fat ${n1(f.per.fat*k)} g`; };
  $('#pq').addEventListener('input', upd); $('#pu').addEventListener('change', () => { if ($('#pu').value==='g' && num($('#pq').value,1e5)<10) $('#pq').value = 100; upd(); }); upd();
  $('#pcancel').onclick = () => d.close();
  $('#pform').onsubmit = async ev => { ev.preventDefault();
    const g = grams(); if (!(g>0) || g>5000) { $('#pprev').innerHTML = '<span class="err">Enter an amount up to 5 kg.</span>'; return; }
    const q = num($('#pq').value,1e5), u = $('#pu').value;
    const x = foodFromPer(f, g, u==='g' ? `${n0(g)} g` : `${q} ${u}${q>1&&!/s$/.test(u)?'s':''}`); x.meal = $('#pm').value;
    d.close();
    await saveEntry(S.date, {foods:[x]});
    const keep = ['usda','off','group','label'].includes(f.src);
    if (keep) saveMyFood({...x, verified:f.src!=='usda'}, f.barcode || null);
    setStatus(`Logged ${f.name} · ${n0(x.kcal)} kcal. No AI used${keep?'; saved to your food list, so typing it next time works too':''}.`);
  };
}

/* ---------- barcode scanning (ZXing in the browser + Open Food Facts) ---------- */
const ZXING = { src:'https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js', integrity:'sha384-HRtzk9lZgkbSgvUyQrnfC/GxiXZgwaNyD7hC9wcXlsBpDhkS80ISl73juef2FRuf' };
let scanCtl = null;
function stopScan(){ try { scanCtl?.stop(); } catch {} scanCtl = null; }
async function openScanner(onCode = lookupBarcode){
  const d = $('#dlg');
  d.innerHTML = `<div class="scan"><h2>Scan a barcode</h2>
    <div class="scanbox"><video id="scanv" playsinline muted></video><div class="scanline"></div></div>
    <div class="small muted" id="scanmsg">Starting the camera…</div>
    <form class="row" id="codeform"><input id="codein" inputmode="numeric" pattern="[0-9]*" placeholder="or type the barcode number" style="flex:1"><button class="btn ghost sm" type="submit">Look up</button></form>
    <div class="muted small">Product data from <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>, free and open (ODbL).</div>
    <div class="row"><span class="spacer"></span><button class="btn ghost" id="scanclose">Close</button></div></div>`;
  d.showModal();
  const close = () => { stopScan(); d.close(); };
  $('#scanclose').onclick = close; d.addEventListener('close', stopScan, {once:true});
  $('#codeform').onsubmit = ev => { ev.preventDefault(); const c = ($('#codein').value||'').replace(/\D/g,''); if (c.length>=6) { stopScan(); onCode(c); } };
  try {
    await loadScript(ZXING);
    const reader = new ZXingBrowser.BrowserMultiFormatReader();
    scanCtl = await reader.decodeFromVideoDevice(undefined, $('#scanv'), (res) => {
      if (!res || !scanCtl) return; const code = res.getText(); stopScan(); if (navigator.vibrate) navigator.vibrate(60); onCode(code);
    });
    if ($('#scanmsg')) $('#scanmsg').textContent = 'Point the camera at the barcode on the packet.';
  } catch (e) {
    console.warn('scanner', e?.name, e?.message);
    if ($('#scanmsg')) $('#scanmsg').textContent = /NotAllowed|Permission/i.test(e?.name||e?.message||'') ? 'Camera permission is off. Allow the camera for this app, or type the number below.' : 'Couldn’t start the camera here. Type the barcode number below.';
  }
}
async function lookupBarcode(code){
  const d = $('#dlg'); if (!d.open) d.showModal();
  // Scanned before? It's in your food list, no network needed.
  const mine = Object.values(S.myFoods||{}).find(f => (f.aliases||[]).includes(code));
  if (mine) { openPortion({...mine, src:'mine'}, `Barcode ${esc(code)} · from your food list`); return; }
  d.innerHTML = `<div class="scan"><h2>Looking up ${esc(code)}…</h2><div class="muted small">Checking your group’s list, then Open Food Facts.</div></div>`;
  // Added from a label by someone in the group? Everyone gets it.
  const shared = await sharedFood(code);
  if (shared) { openPortion(shared, `Barcode ${esc(code)} · added from the label by someone in your group`); return; }
  let p = null;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,nutriments,serving_quantity,product_quantity,quantity`);
    const j = await r.json().catch(() => null); if (j && j.status === 1) p = j.product;
  } catch { d.innerHTML = `<div class="scan"><h2>Couldn’t look it up</h2><p class="muted">You seem to be offline. Try again when connected, or type what you ate in the log box.</p><div class="row"><span class="spacer"></span><button class="btn ghost" id="scanclose">Close</button></div></div>`; $('#scanclose').onclick = () => d.close(); return; }
  const f = p && offToFood(p, code);
  if (!f) { openLabel(code, p ? String(p.product_name_en || p.product_name || '').trim() : '', p ? 'Open Food Facts has this product but not its nutrition table.' : 'This pack isn’t on Open Food Facts yet.'); return; }
  openPortion(f, `Barcode ${esc(code)} · <a href="https://world.openfoodfacts.org/product/${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a> (ODbL)`);
}
// Open Food Facts nutriments are per 100 g, minerals and vitamins in grams.
function offToFood(p, code){
  const n = p.nutriments||{}; const g = k => { const v = Number(n[k+'_100g']); return Number.isFinite(v) && v>=0 ? v : 0; };
  const kcal = g('energy-kcal') || (g('energy') ? g('energy')/4.184 : 0); if (!(kcal>0)) return null;
  const pn = String(p.product_name_en || p.product_name || '').trim(), brand = String(p.brands||'').split(',')[0].trim();
  const name = (brand && !pn.toLowerCase().includes(brand.toLowerCase()) ? `${pn} · ${brand}` : pn || brand).slice(0,70) || `Product ${code}`;
  const micros = { sat_fat_g:g('saturated-fat'), cholesterol_mg:g('cholesterol')*1000, sodium_mg:(g('sodium') || g('salt')/2.5)*1000, potassium_mg:g('potassium')*1000,
    calcium_mg:g('calcium')*1000, iron_mg:g('iron')*1000, magnesium_mg:g('magnesium')*1000, zinc_mg:g('zinc')*1000, vitamin_a_mcg:g('vitamin-a')*1e6, vitamin_c_mg:g('vitamin-c')*1000,
    vitamin_d_mcg:g('vitamin-d')*1e6, vitamin_b12_mcg:g('vitamin-b12')*1e6, folate_mcg:g('folates')*1e6, omega3_g:g('omega-3-fat') };
  const units = {}; const sq = Number(p.serving_quantity); if (sq>0 && sq<2000) units.serving = Math.round(sq);
  const pq = Number(p.product_quantity); if (pq>0 && pq<5000 && pq!==sq) units.packet = Math.round(pq);
  // Added sugar: from the label when given; plain milk, curd, oats, flour, rice, dal, eggs and nuts have none; other packaged foods count all their sugar.
  const plain = /\b(milk|curd|dahi|yogh?urt|paneer|cheese|egg|oats|atta|flour|rice|dal|lentil|nuts?|almond|peanut|butter|ghee|tofu|soya)\b/i.test(name) && !sweetName(name);
  const added = n['added-sugars_100g'] != null ? g('added-sugars') : plain ? 0 : g('sugars');
  return {name, aliases:[code], units, per:{kcal, protein:g('proteins'), carbs:g('carbohydrates'), fat:g('fat'), fiber:g('fiber'), sugar:g('sugars'), added_sugar:added, micros}, alcohol:g('alcohol')*0.789, src:'off', barcode:code};
}

/* ---------- packs that aren't on Open Food Facts: read the label once, share it ----------
   The photo is read on the phone by Tesseract (no AI, ~7 MB downloaded the first
   time); label.js picks out the per-100 g values. The person checks them, and the
   pack goes into the group's shared list (table shared_foods) for everyone's next scan. */
async function sharedFood(code){
  if (!SB || !S.user || !/^\d{6,14}$/.test(code)) return null;
  try { const { data } = await SB.from('shared_foods').select('code,name,per,units').eq('code', code).maybeSingle();
    return data && data.per && data.per.kcal > 0 ? {name:data.name, aliases:[code], units:data.units||{}, per:{...data.per, micros:{...(data.per.micros||{})}}, src:'group', barcode:code} : null; } catch { return null; }
}
const TESS = { src:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', integrity:'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F' };
async function readLabelText(file, onProgress){
  await loadScript(TESS);
  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
    logger: m => onProgress && onProgress(m) });
  try {
    // Grey and about 1,600 px wide: faster, and easier to read than a raw phone photo.
    const bmp = await createImageBitmap(file); const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc);
    const x = c.getContext('2d'); x.filter = 'grayscale(1) contrast(1.3)'; x.drawImage(bmp, 0, 0, c.width, c.height);
    const { data } = await worker.recognize(c); return data.text || '';
  } finally { await worker.terminate().catch(()=>{}); }
}
const LB_FIELDS = [['kcal','Energy','kcal'],['protein','Protein','g'],['carbs','Carbohydrate','g'],['sugar','of which sugars','g'],['added_sugar','Added sugars','g'],['fat','Total fat','g'],['sat_fat','Saturated fat','g'],['fiber','Fibre','g'],['sodium','Sodium','mg']];
function openLabel(code, name, why){
  const d = $('#dlg'); if (!d.open) d.showModal();
  let photo = null;
  d.innerHTML = `<form class="form" id="lbform" style="gap:12px"><h2 class="full">Add it from the label</h2>
    <div class="full small muted">${esc(why||'')} Take a photo of the nutrition table (or type the per 100 g values). ${code?'It’s saved for everyone in MaxxTempo, so the next scan is instant.':'It’s saved to your food list.'}</div>
    <label class="field full">Product name<input id="lb_name" maxlength="70" value="${esc(name||'')}" placeholder="e.g. Haldiram’s Aloo Bhujia" required></label>
    <div class="full row"><label class="btn ghost sm" style="cursor:pointer">Photo of the nutrition table<input id="lb_file" type="file" accept="image/*" capture="environment" hidden></label>${S.sample?'<button type="button" class="btn ghost sm" id="lb_ai" hidden>Read it with AI instead</button>':''}</div>
    <div class="full status" id="lb_msg" aria-live="polite"></div>
    <div class="full muted small"><b>Per 100 g</b> (or 100 ml), as printed on the label</div>
    <div class="full micgrid">${LB_FIELDS.map(([k,l,u])=>`<label class="field">${l} (${u})<input data-lb="${k}" type="number" min="0" step="any" inputmode="decimal"></label>`).join('')}</div>
    <label class="field">Serving size (g)<input id="lb_serv" type="number" min="0" step="any" inputmode="decimal" placeholder="optional"></label>
    <label class="field">Pack size (g)<input id="lb_pack" type="number" min="0" step="any" inputmode="decimal" placeholder="optional"></label>
    ${code?`<div class="full muted small">Barcode ${esc(code)} · you can also <a href="https://world.openfoodfacts.org/cgi/product.pl?type=add&code=${esc(code)}" target="_blank" rel="noopener">add it to Open Food Facts</a> for everyone else.</div>`:''}
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="lb_cancel">Cancel</button><button class="btn" type="submit">Save and log</button></div></form>`;
  const msg = (t, err) => { const m = $('#lb_msg'); if (m) { m.textContent = t; m.classList.toggle('err', !!err); } };
  const fill = (v, src) => { let n = 0; for (const [k] of LB_FIELDS) { const el = d.querySelector(`[data-lb="${k}"]`); if (v[k] != null && el) { el.value = v[k]; n++; } }
    if (v.name && !$('#lb_name').value) $('#lb_name').value = String(v.name).slice(0,70);
    if (v.serving_g > 0 && !$('#lb_serv').value) $('#lb_serv').value = v.serving_g; if (v.pack_g > 0 && !$('#lb_pack').value) $('#lb_pack').value = v.pack_g;
    return n; };
  $('#lb_cancel').onclick = () => d.close();
  $('#lb_file').onchange = async ev => { photo = ev.target.files?.[0]; ev.target.value = ''; if (!photo) return;
    msg('Reading the label on your phone… (the first time downloads the reader, about 7 MB)');
    try {
      const text = await readLabelText(photo, m => { if (m.status==='recognizing text') msg(`Reading the label… ${Math.round((m.progress||0)*100)}%`); });
      const n = fill(Label.parse(text), 'ocr');
      msg(n >= 4 ? `Read ${n} values. Check them against the label, then save.` : n ? `Read ${n} value${n>1?'s':''}; type the rest from the label.` : 'Couldn’t read the numbers. Try a sharper, straight-on photo of just the table, or type them in.', n < 4);
    } catch (e) { console.warn('ocr', e?.message); msg('Couldn’t read the photo here. Type the values from the label, or try the AI reader.', true); }
    if ($('#lb_ai')) $('#lb_ai').hidden = false;
  };
  if ($('#lb_ai')) $('#lb_ai').onclick = async () => { if (!photo) return; msg('Reading the label with AI…');
    try { const r = await S.sample.json(`Read the nutrition information table in this photo of a packaged food label. Reply with ONLY JSON: {"name":string|null,"per_100g":{"kcal":number|null,"protein_g":number|null,"carbs_g":number|null,"sugar_g":number|null,"added_sugar_g":number|null,"fat_g":number|null,"sat_fat_g":number|null,"fiber_g":number|null,"sodium_mg":number|null},"serving_g":number|null,"pack_g":number|null}. Use the per 100 g (or 100 ml) column; if only per serving is printed, convert with the serving size. kJ ÷ 4.184 = kcal. Use null for anything not printed.`, {task:'log', images:[await toJpeg(photo)]});
      const v = r?.per_100g || {}; const n = fill({kcal:v.kcal, protein:v.protein_g, carbs:v.carbs_g, sugar:v.sugar_g, added_sugar:v.added_sugar_g, fat:v.fat_g, sat_fat:v.sat_fat_g, fiber:v.fiber_g, sodium:v.sodium_mg, name:r?.name, serving_g:r?.serving_g, pack_g:r?.pack_g});
      msg(n ? `AI read ${n} values. Check them against the label, then save.` : 'The AI couldn’t read that photo either. Type the values from the label.', !n);
    } catch (e) { msg(AI_ERR[e?.code] || AI_ERR.unavailable, true); } };
  $('#lbform').onsubmit = async ev => { ev.preventDefault();
    const v = {}; for (const [k] of LB_FIELDS) { const x = d.querySelector(`[data-lb="${k}"]`).value; v[k] = x === '' ? null : num(x, k==='sodium'?100000:k==='kcal'?1000:100); }
    const nm = $('#lb_name').value.trim();
    if (!nm) { msg('Add the product name.', true); return; }
    if (!(v.kcal > 0) || v.protein == null || v.carbs == null || v.fat == null) { msg('Energy, protein, carbohydrate and fat are needed.', true); return; }
    const off = Label.checkEnergy(v);
    if (off != null && off > 0.3 && !d.dataset.warned) { d.dataset.warned = '1'; msg(`The calories don’t match protein, carbs and fat (about ${n0(4*v.protein+4*v.carbs+9*v.fat)} kcal expected). Check for a typo, or tap Save again if the label really says this.`, true); return; }
    const units = {}; const sv = num($('#lb_serv').value, 2000), pk = num($('#lb_pack').value, 5000); if (sv > 0) units.serving = Math.round(sv); if (pk > 0 && pk !== sv) units.packet = Math.round(pk);
    const per = {kcal:v.kcal, protein:v.protein, carbs:v.carbs, fat:v.fat, fiber:v.fiber||0, sugar:v.sugar||0, ...(v.added_sugar!=null?{added_sugar:v.added_sugar}:{}), micros:{sat_fat_g:v.sat_fat||0, sodium_mg:v.sodium||0}};
    const f = {name:nm, aliases:code?[code]:[], units, per, src:code?'group':'label', barcode:code||null};
    if (code && SB && S.user) {
      const { error } = await SB.from('shared_foods').upsert({code, name:nm, per, units, source:'label', added_by:S.user.id, updated_at:new Date().toISOString()});
      if (error) { console.warn('shared_foods', error.message); if (/per_sane|check constraint/i.test(error.message||'')) toast('Logged for you. Those label numbers look off, so they weren’t shared with the group.'); }
    }
    openPortion(f, code ? `Barcode ${esc(code)} · saved for everyone in MaxxTempo` : 'From the label');
  };
}

/* ---------- Trends ---------- */
// target: a number, or a function of the row (per-day targets rise on training days)
function weekBars(rows, get, fmt, kind, target){
  const tgt = r => typeof target==='function' ? target(r) : target;
  const vals = rows.map(r=>get(r)); const have = vals.filter(v=>v>0);
  const max = Math.max(...rows.map(r=>tgt(r)||0), ...vals, 1)*1.05;
  const avg = have.length ? have.reduce((s,v)=>s+v,0)/have.length : 0;
  return {avg, html:`<div class="wbars">${rows.map((r,i)=>{ const v=vals[i]; const target = tgt(r); const h=v>0?Math.max(4, v/max*100):0; const st = goalState(v, target, kind);
    return `<div class="wb" data-tip="${esc(fmtDate(r.date)+': '+(v>0?fmt(v):'nothing logged'))}"><span class="wv">${v>0?fmt(v,true):''}</span><div class="wtrack">${target?`<i class="wt" style="bottom:${target/max*100}%"></i>`:''}<i class="wfill" style="height:${h}%;background:${stBar(st)}"></i></div><span class="wd${r.date===localDate()?' now':''}">${esc(fmtDate(r.date,{weekday:'narrow'}))}</span></div>`; }).join('')}</div>`};
}
function viewTrends(){
  const rows = Array.from({length:7},(_,i)=>{ const date=addDays(S.date, i-6); const d=S.days.get(date); return {date, d, t:d?dayTotals(d):null, T:d?dayTargets(d):targets(date)}; });
  const T = targets(); const goal = Number(prof().steps_goal)||10000;
  const k = v => v>=10000 ? n1(v/1000)+'k' : n0(v);
  const metrics = [
    ['Steps', r=>r.d&&r.d.health&&r.d.health.steps||0, (v,s)=>s?k(v):n0(v), 'more', goal, v=>n0(v), `goal ${n0(goal)}`],
    ['Protein', r=>r.t?r.t.protein:0, (v,s)=>s?n0(v):`${n0(v)} g`, 'more', r=>r.T.protein, v=>`${n0(v)} g`, `target ${n0(T.protein)} g`],
    ['Burned', r=>r.d&&((r.d.foods||[]).length||(r.d.exercises||[]).length||(r.d.sports||[]).length||Object.keys(r.d.health||{}).length)?burnedTotal(r.d).total:0, (v,s)=>s?k(v):`${n0(v)} kcal`, 'more', 0, v=>`${n0(v)} kcal`, 'training + sports + steps'],
    ['Calories eaten', r=>r.t?r.t.kcal:0, (v,s)=>s?k(v):`${n0(v)} kcal`, 'range', r=>r.T.kcal, v=>`${n0(v)} kcal`, `target ${n0(T.kcal)}`],
    ['Sleep', r=>r.d&&r.d.health&&r.d.health.sleep_min?r.d.health.sleep_min/60:0, (v,s)=>s?n1(v):fmtSleep(v*60), 'more', 7, v=>fmtSleep(v*60), 'aim for 7–9 h'],
    ['Water', r=>r.t?r.t.water/1000:0, (v,s)=>fmtL(v*1000)+(s?'':' L'), 'more', r=>waterTarget(r.d||emptyDay(r.date), r.T)/1000, v=>`${fmtL(v*1000)} L`, `target ${fmtL(T.water_ml)} L+`],
  ];
  const day = getDay(S.date), dt = dayTotals(day), DT = dayTargets(day);
  // targets reached, day by day
  const checks = [
    ['Steps', r=>r.d&&r.d.health&&r.d.health.steps ? goalState(r.d.health.steps, goal, 'more') : null],
    ['Protein', r=>r.t&&r.t.kcal ? goalState(r.t.protein, r.T.protein, 'more') : null],
    ['Calories', r=>r.t&&r.t.kcal ? goalState(r.t.kcal, r.T.kcal, 'range') : null],
    ['Carbs', r=>r.t&&r.t.kcal ? goalState(r.t.carbs, r.T.carbs, 'range') : null],
    ['Fibre', r=>r.t&&r.t.kcal ? goalState(r.t.fiber, r.T.fiber, 'more') : null],
    ['Added sugar (limit)', r=>r.t&&r.t.kcal ? goalState(r.t.sugar, r.T.sugar, 'limit') : null],
    ['Water', r=>r.t&&r.t.water ? goalState(r.t.water, waterTarget(r.d,r.T), 'more') : null],
    ['Sleep 7 h+', r=>r.d&&r.d.health&&r.d.health.sleep_min ? goalState(r.d.health.sleep_min, 420, 'more') : null],

  ];
  const ok = x => x==='at' || x==='plus';
  const hits = checks.reduce((s,[,f])=>s+rows.filter(r=>ok(f(r))).length,0), tries = checks.reduce((s,[,f])=>s+rows.filter(r=>f(r)!==null).length,0);
  const mark = x => x===null ? '<span class="muted">·</span>' : `<span class="st st-${x}">${x==='under'?'↓':x==='over'?'↑':'✓'}</span>`;
  const targetsHtml = `<div class="tablewrap" tabindex="0"><table class="hits"><thead><tr><th class="l"></th>${rows.map(r=>`<th>${esc(fmtDate(r.date,{weekday:'narrow'}))}</th>`).join('')}<th class="r">Hit</th></tr></thead><tbody>
    ${checks.map(([l,f])=>{ const res=rows.map(f); return `<tr><td class="l">${l}</td>${res.map(x=>`<td>${mark(x)}</td>`).join('')}<td class="r">${res.filter(ok).length}/${res.filter(x=>x!==null).length}</td></tr>`; }).join('')}
    </tbody></table></div>`;
  const actDays = rows.slice().reverse().filter(r=>r.d&&((r.d.sports||[]).length||(r.d.exercises||[]).length));
  const activityHtml = actDays.length ? actDays.map(r=>`<h3>${esc(fmtDate(r.date,{weekday:'long',day:'numeric',month:'short'}))}</h3>${activityPanel(r.d)}`).join('') : '<div class="empty">No gym or sport logged in these 7 days.</div>';
  const actCount = actDays.reduce((s,r)=>s+(r.d.sports||[]).length+((r.d.exercises||[]).length?1:0),0);
  const {cur,prev,label} = periodRanges(S.date, 'week'); const a = periodStats(...cur), b = periodStats(...prev);
  const sportKcal = Object.values(a.sp).reduce((s,x)=>s+x.kcal,0);
  const weights = rows.filter(r=>r.d&&r.d.weight_kg);
  const trendsW = (()=>{ const pts=trendPoints().slice(-30); if (pts.length<2) return '<div class="muted small">Log your weight a few times to see your trend.</div>';
    return lineChart({pts:pts.map(x=>({date:x.date, v:x.trend, raw:x.kg, tip:`trend ${n1(x.trend)} kg`})), unit:'kg', color:'var(--water)'}); })();
  return `<div class="grid">
    ${boardHtml()}
    ${feedHtml()}
    ${trainingTrends()}
    <div class="panel-head"><h2>Last 7 days</h2>${hideBtn('w7','last 7 days')}</div>
    ${isHidden('w7') ? '' : `${stateKey()}
    <div class="grid two">
    ${metrics.map(([title,get,fmt,kind,target,fmtAvg,sub])=>{ const w = weekBars(rows, get, fmt, kind, target);
      const pts = rows.map(r=>({r, v:get(r)})).filter(x=>x.v>0);
      const tg = r => typeof target==='function' ? target(r) : target;
      const score = x => kind==='range' ? -Math.abs(x.v-tg(x.r)) : x.v;
      const best = pts.length>1 ? pts.reduce((a,b)=>score(b)>score(a)?b:a) : null, worst = pts.length>1 ? pts.reduce((a,b)=>score(b)<score(a)?b:a) : null;
      const day = x => esc(fmtDate(x.r.date,{weekday:'long'}));
      return `<section class="panel wk"><div class="panel-head"><h3>${title}</h3><span class="muted small">avg ${w.avg?fmtAvg(w.avg):'—'} · ${esc(sub)}</span></div>${w.html}
        ${best&&worst&&best!==worst?`<div class="insight"><div><span class="idot" style="background:${stBar('at')}"></span><span><b>Best day</b><span class="muted small">${day(best)}</span></span><b class="num">${fmtAvg(best.v)}</b></div><div><span class="idot" style="background:${stBar('over')}"></span><span><b>${kind==='range'?'Furthest from target':'Lowest day'}</b><span class="muted small">${day(worst)}</span></span><b class="num">${fmtAvg(worst.v)}</b></div></div>`:''}</section>`; }).join('')}
    </div>`}
    <section class="panel folds">
      ${fold('t-activity', 'Activity', `${actCount} session${actCount===1?'':'s'}`, activityHtml)}
      ${fold('t-targets', 'Daily targets reached', tries?`${hits} of ${tries}`:'', targetsHtml)}
      ${fold('t-sports', 'Sports played', sportKcal?`${n0(sportKcal)} kcal this week`:'', sportSummary(a,b,label))}
      ${fold('t-body', 'Body measurements &amp; photos', (S.measures||[]).length?`last ${esc(fmtDate((S.measures||[]).map(m=>m.date).sort().pop(),{day:'numeric',month:'short'}))}`:'add yours', measuresHtml())}
      ${fold('t-weight', 'Body weight &amp; maintenance', weights.length?`${n1(weights[weights.length-1].d.weight_kg)} kg`:'', trendsW + maintenancePanel())}
    </section>
  </div>`;
}

/* ---------- training trends: streaks, muscles, monthly report, year in review ---------- */
const trainedOn = d => d && ((d.exercises||[]).length || (d.sports||[]).length);
const workingSets = e => (e.sets||[]).filter(s=>s.type!=='warmup');
function workoutStreaks(){
  const days = new Set([...S.days].filter(([,d])=>trainedOn(d)).map(([k])=>k)); if (!days.size) return {weeks:0, best:0, thisWeek:0};
  const has = m => [0,1,2,3,4,5,6].some(i=>days.has(addDays(m,i)));
  const mon = weekMonday(localDate()); let w = has(mon) ? mon : addDays(mon,-7), weeks = 0;
  while (has(w)) { weeks++; w = addDays(w,-7); }
  let best = 0, run = 0; for (let m = weekMonday([...days].sort()[0]); m <= mon; m = addDays(m,7)) { run = has(m) ? run+1 : 0; best = Math.max(best, run); }
  return {weeks, best, thisWeek:[0,1,2,3,4,5,6].filter(i=>days.has(addDays(mon,i))).length};
}
// Working sets per muscle between two dates (gym only; cardio left out).
function muscleSets(a, b){
  const out = {}; for (const m of MUSCLES) if (m!=='cardio') out[m] = 0;
  for (const [date,d] of S.days) { if (date<a || date>b) continue;
    for (const e of d.exercises||[]) { const g = e.muscle_group; if (!g || g==='cardio') continue; const n = workingSets(e).length;
      if (g==='full body') { for (const m of ['chest','back','shoulders','legs','core']) out[m] += n/5; } else out[g] = (out[g]||0) + n; } }
  return out;
}
// A simple front and back figure; each muscle is shaded by how many sets it got.
/* Body map: an anatomical front and back view. Each muscle is shaded with a highlight and a
   soft shadow so it reads as rounded, and glows stronger the more sets its group got. */
// Smooth closed (or open) path through points (Catmull-Rom -> cubic Bezier).
function bmSmooth(pts, closed = true, t = 0.5) {
  const n = pts.length, P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + (closed ? 'Z' : '');
}
const bmMir = pts => pts.map(([x, y]) => [-x, y]);
// Body bmOutline, left half (x from the centre line), top of neck to crotch, arms out a little.
const BM_OUT = [[-10,58],[-11,72],[-26,80],[-48,86],[-62,94],[-70,110],[-72,132],[-75,158],[-79,182],[-83,208],[-87,236],[-89,254],[-94,266],[-93,284],[-85,290],[-80,276],[-78,258],[-72,234],[-66,208],[-61,186],[-58,162],[-55,138],[-50,128],
  [-48,146],[-43,172],[-39,198],[-44,224],[-47,250],[-46,286],[-41,322],[-40,340],[-42,362],[-36,388],[-29,400],[-33,412],[-14,416],[-13,401],[-14,376],[-17,346],[-14,318],[-10,286],[-4,262],[0,258]];
const bmOutline = () => bmSmooth([...BM_OUT, ...bmMir(BM_OUT).reverse().slice(1)]);
// Muscles: [group, side-left points]; drawn for both sides.
const BM_FRONT = [
  ['shoulders', [[-44,86],[-58,88],[-69,100],[-73,120],[-68,134],[-58,132],[-52,114],[-44,98]]],
  ['chest',     [[-3,94],[-22,86],[-42,92],[-52,106],[-50,124],[-34,138],[-14,138],[-3,133]]],
  ['biceps',    [[-55,134],[-67,132],[-74,148],[-75,168],[-68,182],[-59,178],[-55,158]]],
  [null,        [[-60,186],[-76,186],[-84,214],[-88,246],[-80,252],[-70,228],[-62,206]]],          // forearm
  ['core',      [[-3,140],[-15,139],[-16,158],[-3,160]]],
  ['core',      [[-3,163],[-16,162],[-16,182],[-3,184]]],
  ['core',      [[-3,187],[-16,186],[-15,207],[-3,209]]],
  ['core',      [[-3,212],[-15,211],[-12,238],[-3,250]]],
  ['core',      [[-19,142],[-36,140],[-44,150],[-41,176],[-38,200],[-42,222],[-22,238],[-19,206]]],   // obliques
  ['legs',      [[-44,244],[-47,280],[-43,316],[-34,332],[-27,304],[-29,262]]],                    // outer quad
  ['legs',      [[-28,258],[-25,296],[-22,322],[-14,334],[-11,308],[-15,280]]],                    // inner quad
  ['legs',      [[-5,262],[-24,256],[-17,282],[-11,300],[-6,286]]],                                 // adductor
  ['legs',      [[-39,346],[-42,368],[-36,394],[-28,395],[-25,368],[-28,348]]],                    // shin / calf
  ['legs',      [[-18,348],[-23,370],[-19,392],[-14,394],[-12,364]]],
];
const BM_BACK = [
  ['back',      [[0,62],[-12,70],[-40,85],[-30,96],[-14,110],[-8,140],[0,166]]],                     // traps
  ['shoulders', [[-42,88],[-58,88],[-69,100],[-73,120],[-68,134],[-58,130],[-50,108]]],             // rear delts
  ['back',      [[-14,112],[-32,100],[-50,106],[-52,134],[-44,170],[-30,198],[-14,190],[-9,150]]], // lats
  ['back',      [[-3,168],[-12,166],[-20,196],[-18,224],[-4,230]]],                                // lower back
  ['triceps',   [[-55,132],[-68,130],[-75,148],[-75,170],[-68,182],[-59,178],[-55,156]]],
  [null,        [[-60,186],[-76,186],[-84,214],[-88,246],[-80,252],[-70,228],[-62,206]]],
  ['glutes',    [[-2,230],[-24,222],[-45,234],[-47,262],[-31,277],[-6,272]]],
  ['legs',      [[-44,276],[-45,302],[-40,330],[-30,334],[-27,304],[-29,280]]],                    // hamstrings
  ['legs',      [[-25,280],[-24,316],[-16,332],[-8,302],[-9,284]]],
  ['legs',      [[-38,344],[-42,366],[-33,384],[-27,364],[-28,344]]],                              // calves
  ['legs',      [[-25,344],[-25,374],[-18,386],[-13,362],[-15,344]]],
];
function bmFigure(muscles, fill, label, sets, U) {
  const title = g => g ? `<title>${titleCase(g)}: ${n0(sets[g]||0)} set${Math.round(sets[g]||0)===1?'':'s'}</title>` : '';
  const parts = muscles.flatMap(([g, pts]) => [[g, pts], [g, bmMir(pts)]]).map(([g, pts]) => {
    const d = bmSmooth(pts);
    return `<g class="mus">${title(g)}<path d="${d}" style="fill:${fill(g)};stroke:var(--bm-line);stroke-width:.7"/><path d="${d}" fill="${U('Bulge')}"/></g>`;
  }).join('');
  return `<g filter="${U('Drop')}"><path d="${bmSmooth([[0,10],[15,15],[20,32],[17,48],[9,60],[0,63],[-9,60],[-17,48],[-20,32],[-15,15]])}" fill="${U('Skin')}" style="stroke:var(--bm-line);stroke-width:.7"/>
      <path d="${bmOutline()}" fill="${U('Skin')}" style="stroke:var(--bm-line);stroke-width:.7"/><path d="${bmOutline()}" fill="${U('Edge')}"/></g>
    ${parts}
    <text x="0" y="440" text-anchor="middle" font-size="15" fill="var(--ink-3)">${label}</text>`;
}
let bmN = 0;
function bodyMap(sets) {
  const id = 'bm' + (++bmN), U = n => `url(#${id}${n})`;
  const max = Math.max(1, ...Object.values(sets));
  const fill = g => { const v = g ? sets[g] || 0 : 0;
    return v ? `color-mix(in srgb, var(--bm-hot) ${Math.round(35 + 65 * v / max)}%, var(--bm-muscle))` : 'var(--bm-muscle)'; };
  return `<svg class="bodymap" viewBox="-110 0 440 452" role="img" aria-label="Sets per muscle, front and back">
    <defs>
      <radialGradient id="${id}Skin" cx="0.42" cy="0.3" r="0.8"><stop offset="0" style="stop-color:var(--bm-skin-hi)"/><stop offset="1" style="stop-color:var(--bm-skin)"/></radialGradient>
      <linearGradient id="${id}Edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
      <radialGradient id="${id}Bulge" cx="0.38" cy="0.3" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".35" stop-color="#fff" stop-opacity=".08"/><stop offset=".75" stop-color="#000" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
      <filter id="${id}Drop" x="-30%" y="-10%" width="160%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.18"/></filter>
    </defs>
    <g>${bmFigure(BM_FRONT, fill, 'Front', sets, U)}</g>
    <g transform="translate(220,0)">${bmFigure(BM_BACK, fill, 'Back', sets, U)}</g>
  </svg>`;
}

function monthStats(a, b){
  let days=0, sets=0, volume=0, minutes=0, prs=0; const ex = {}, mus = {};
  for (const [date,d] of S.days) { if (date<a || date>b || !trainedOn(d)) continue; days++;
    for (const e of d.exercises||[]) { const ws = workingSets(e); sets += ws.length; volume += ws.reduce((s,x)=>s+(x.weight||0)*(x.reps||0),0); ex[e.name] = (ex[e.name]||0) + ws.length; if (e.muscle_group && e.muscle_group!=='cardio') mus[e.muscle_group] = (mus[e.muscle_group]||0) + ws.length; if (e.duration_min && !ws.length) minutes += e.duration_min; }
    minutes += (d.workouts||[]).reduce((s,w)=>s+(w.minutes||0),0) + (d.sports||[]).reduce((s,x)=>s+(x.minutes||0),0);
    prs += prsOn(date).size; }
  const top = o => Object.entries(o).sort((x,y)=>y[1]-x[1])[0];
  return {days, sets, volume, minutes, prs, topEx: top(ex), topMuscle: top(mus)};
}
const hrs = m => m>=60 ? `${Math.floor(m/60)}h ${pad(Math.round(m%60))}m` : `${Math.round(m)} min`;
function monthReport(){
  const t = localDate(), m0 = t.slice(0,8)+'01', pm = addDays(m0,-1), p0 = pm.slice(0,8)+'01';
  const a = monthStats(m0, t), b = monthStats(p0, pm), name = fmtDate(m0,{month:'long'});
  if (!a.days && !b.days) return '<div class="muted small">Your monthly report fills in as you train.</div>';
  return `<div class="tiles"><div class="tile"><span class="l">Workouts</span><span class="v">${a.days}</span>${delta(a.days,b.days)}</div>
      <div class="tile"><span class="l">Working sets</span><span class="v">${n0(a.sets)}</span>${delta(a.sets,b.sets)}</div>
      <div class="tile"><span class="l">Volume</span><span class="v">${n0(a.volume)}<span class="muted" style="font-size:16px"> kg</span></span>${delta(a.volume,b.volume)}</div>
      <div class="tile"><span class="l">Time training</span><span class="v" style="font-size:22px">${hrs(a.minutes)}</span>${delta(a.minutes,b.minutes)}</div></div>
    <div class="kv"><span>Personal records</span><b>${a.prs}</b>${a.topEx?`<span>Most done</span><b>${esc(a.topEx[0])} · ${n0(a.topEx[1])} sets</b>`:''}${a.topMuscle?`<span>Most trained</span><b>${esc(titleCase(a.topMuscle[0]))}</b>`:''}</div>
    <div class="muted small">${esc(name)} so far, compared with all of ${esc(fmtDate(p0,{month:'long'}))}.</div>`;
}
function yearReview(){
  const y = localDate().slice(0,4), s = monthStats(y+'-01-01', y+'-12-31');
  if (!s.days) return '<div class="muted small">Your year in review fills in as you train.</div>';
  const months = Array.from({length:12},(_,i)=>{ const m = `${y}-${pad(i+1)}`; return {m, n:[...S.days].filter(([k,d])=>k.startsWith(m)&&trainedOn(d)).length}; });
  const best = months.reduce((a,b)=>b.n>a.n?b:a);
  return `<div class="tiles"><div class="tile"><span class="l">Workouts</span><span class="v">${s.days}</span></div><div class="tile"><span class="l">Volume</span><span class="v">${n0(s.volume/1000)}<span class="muted" style="font-size:16px"> t</span></span></div>
      <div class="tile"><span class="l">Time training</span><span class="v" style="font-size:22px">${hrs(s.minutes)}</span></div><div class="tile"><span class="l">PRs</span><span class="v">${s.prs}</span></div></div>
    <div class="kv">${s.topEx?`<span>Favourite exercise</span><b>${esc(s.topEx[0])}</b>`:''}${s.topMuscle?`<span>Most trained</span><b>${esc(titleCase(s.topMuscle[0]))}</b>`:''}<span>Best month</span><b>${esc(fmtDate(best.m+'-01',{month:'long'}))} · ${best.n} workouts</b><span>Longest weekly streak</span><b>${workoutStreaks().best} weeks</b></div>
    ${barChart({rows:months.map(x=>({date:x.m+'-15', v:x.n})), color:'var(--accent)', unit:'workouts', label:'Workouts per month', wide:true, xfmt:x=>fmtDate(x,{month:'short'})})}`;
}
function trainingTrends(){
  const st = workoutStreaks(), per = S.musclePeriod || 'week', t = localDate();
  const a = per==='week' ? weekMonday(t) : per==='month' ? t.slice(0,8)+'01' : addDays(t,-29);
  const sets = muscleSets(a, t), list = Object.entries(sets).filter(([,v])=>v>0).sort((x,y)=>y[1]-x[1]), max = Math.max(1, ...list.map(x=>x[1]));
  return `<section class="panel span2" aria-label="Training"><div class="panel-head"><h2>Training</h2>${hideBtn('tr','training')}</div>
    ${isHidden('tr') ? '' : `<div class="tiles"><div class="tile"><span class="l">Week streak</span><span class="v">${st.weeks}<span class="muted" style="font-size:16px"> ${st.weeks===1?'week':'weeks'}</span></span><span class="muted small">best ${st.best}</span></div>
      <div class="tile"><span class="l">This week</span><span class="v">${st.thisWeek}<span class="muted" style="font-size:16px"> ${st.thisWeek===1?'day':'days'}</span></span><span class="muted small">trained</span></div></div>
    <div class="panel-head"><h3>Sets per muscle</h3><div class="seg" role="group" aria-label="Muscle period">${[['week','This week'],['month','This month'],['30','30 days']].map(([k,l])=>`<button data-action="musclePeriod" data-p="${k}" aria-pressed="${per===k}">${l}</button>`).join('')}</div></div>
    ${list.length ? `<div class="musclewrap">${bodyMap(sets)}<div class="musclebars">${list.map(([m,v])=>`<div class="mbar"><span>${esc(titleCase(m))}</span><span class="mtrack"><i style="width:${v/max*100}%"></i></span><b>${n0(v)}</b></div>`).join('')}</div></div>
      <div class="muted small">Working sets, warm-ups left out.</div>` : '<div class="muted small">No gym sets in this period yet.</div>'}
    <section class="folds">${fold('t-month', 'Monthly report', esc(fmtDate(t,{month:'long'})), monthReport())}${fold('t-year', 'Year in review', t.slice(0,4), yearReview())}</section>`}
  </section>`;
}

/* ---------- body measurements and progress photos ---------- */
const MEASURES = [['waist','Waist'],['chest','Chest'],['arms','Arms'],['thighs','Thighs'],['hips','Hips'],['neck','Neck'],['calves','Calves'],['body_fat','Body fat %']];
function measuresHtml(){
  const ms = (S.measures||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)), last = ms[ms.length-1] || {};
  const rows = MEASURES.map(([k,l]) => { const pts = ms.filter(m=>m[k]>0); if (!pts.length) return '';
    const first = pts[0][k], cur = pts[pts.length-1][k];
    return `<div class="mrow2"><span>${l}</span><b>${n1(cur)}${k==='body_fat'?' %':' cm'}</b><span class="muted small">${pts.length>1?`${cur-first>0?'+':''}${n1(cur-first)} since ${esc(fmtDate(pts[0].date,{day:'numeric',month:'short'}))}`:'first entry'}</span>${spark(pts.map(p=>p[k]),'var(--accent)')}</div>`; }).join('');
  return `<form class="form" id="msform" style="gap:10px">
      <label class="field">Date<input type="date" id="ms_date" value="${localDate()}" max="${localDate()}"></label>
      <div class="full micgrid">${MEASURES.map(([k,l])=>`<label class="field">${l}${k==='body_fat'?'':' (cm)'}<input type="number" step="0.1" min="0" inputmode="decimal" data-ms="${k}" placeholder="${last[k]?esc(n1(last[k])):''}"></label>`).join('')}</div>
      <div class="full row"><span class="muted small">Fill in only what you measured.</span><span class="spacer"></span><button class="btn sm" type="submit">Save measurements</button></div></form>
    ${rows ? `<div class="mlist">${rows}</div>` : ''}
    ${ms.length ? `<details class="howfold"><summary>All entries</summary>${ms.slice().reverse().map(m=>`<div class="item"><div><div class="nm">${esc(fmtDate(m.date,{day:'numeric',month:'short',year:'numeric'}))}</div><div class="sub">${MEASURES.filter(([k])=>m[k]>0).map(([k,l])=>`${l} ${n1(m[k])}`).join(' · ')}</div></div><span></span><div class="acts"><button data-action="delMeasure" data-id="${esc(m.date)}" aria-label="Delete measurements from ${esc(m.date)}">✕</button></div></div>`).join('')}</details>` : ''}
    <h3>Progress photos</h3>
    <div class="muted small">Private: only you can see them.</div>
    <div class="row"><select id="ph_pose"><option value="front">Front</option><option value="side">Side</option><option value="back">Back</option></select><label class="btn ghost sm" style="cursor:pointer">Add photo<input type="file" accept="image/*" id="ph_file" hidden></label>${(S.photos||[]).length>1?'<button class="btn ghost sm" data-action="photoCompare">Compare</button>':''}</div>
    <div class="status" id="ph_msg"></div>
    <div class="photos">${(S.photos||[]).map(p=>`<figure class="ph"><img src="${esc(p.url||'')}" alt="${esc(p.pose)} photo, ${esc(p.date)}" loading="lazy"><figcaption>${esc(fmtDate(p.date,{day:'numeric',month:'short'}))} · ${esc(p.pose)}<button class="linkbtn" data-action="photoDel" data-path="${esc(p.path)}" aria-label="Delete photo">✕</button></figcaption></figure>`).join('') || (S.photosLoaded ? '<div class="muted small">No photos yet.</div>' : '')}</div>`;
}
async function loadPhotos(){
  if (!SB || !S.user) return;
  try { const { data, error } = await SB.storage.from('progress').list(S.user.id, {limit:200, sortBy:{column:'name', order:'desc'}}); if (error) throw error;
    const files = (data||[]).filter(f=>/\.jpg$/.test(f.name)); const paths = files.map(f=>S.user.id+'/'+f.name);
    const signed = paths.length ? (await SB.storage.from('progress').createSignedUrls(paths, 3600)).data || [] : [];
    S.photos = files.map((f,i)=>{ const [date, pose] = f.name.split('_'); return {path:paths[i], date, pose:pose||'front', url:(signed[i]||{}).signedUrl}; });
  } catch (e) { console.warn('photos', e?.message); S.photos = S.photos || []; }
  S.photosLoaded = true; if (S.view==='trends') render();
}
async function addPhoto(file, pose){
  const msg = t => { const m = $('#ph_msg'); if (m) m.textContent = t; };
  msg('Saving the photo…');
  try { const bmp = await createImageBitmap(file), sc = Math.min(1, 1200/Math.max(bmp.width,bmp.height)); const c = document.createElement('canvas');
    c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc); c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);
    const blob = await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));
    const path = `${S.user.id}/${localDate()}_${pose}_${uid().slice(0,8)}.jpg`;
    const { error } = await SB.storage.from('progress').upload(path, blob, {contentType:'image/jpeg', upsert:false}); if (error) throw error;
    msg('Saved.'); await loadPhotos();
  } catch (e) { msg('Couldn’t save the photo. Check your connection and try again.'); console.warn('photo', e?.message); }
}
function photoCompare(){
  const ph = S.photos||[]; if (ph.length<2) return; const d = $('#dlg');
  const opt = sel => ph.map((p,i)=>`<option value="${i}" ${i===sel?'selected':''}>${esc(fmtDate(p.date,{day:'numeric',month:'short',year:'numeric'}))} · ${esc(p.pose)}</option>`).join('');
  let a = ph.length-1, b = 0;
  const draw = () => { d.innerHTML = `<div class="form" style="gap:10px"><h2 class="full">Compare photos</h2>
      <label class="field">Before<select id="pc_a">${opt(a)}</select></label><label class="field">After<select id="pc_b">${opt(b)}</select></label>
      <div class="full pcompare"><img src="${esc(ph[a].url||'')}" alt="Before"><img src="${esc(ph[b].url||'')}" alt="After"></div>
      <div class="full row"><span class="spacer"></span><button class="btn" id="pc_ok">Done</button></div></div>`;
    $('#pc_a').onchange = ev => { a = +ev.target.value; draw(); }; $('#pc_b').onchange = ev => { b = +ev.target.value; draw(); }; $('#pc_ok').onclick = () => d.close(); };
  draw(); if (!d.open) d.showModal();
}

/* ---------- Profile (coach on top, then plan, then settings) ---------- */
function recoveryItems(){
  const now=Date.now(); const act=[];
  for (let i=0;i<4;i++){ const d=S.days.get(addDays(localDate(),-i)); if(!d) continue;
    for (const a of d.sports||[]) if (a.recovery&&a.recovery.ready_at&&Date.parse(a.recovery.ready_at)>now) act.push({label:actTitle(a), date:d.date, r:a.recovery});
    if (d.gym_recovery&&d.gym_recovery.ready_at&&Date.parse(d.gym_recovery.ready_at)>now) act.push({label:'Gym: '+(d.gym_recovery.muscles||[]).join(', '), date:d.date, r:d.gym_recovery}); }
  return act;
}
function profileForm(){
  const p = prof(), T = targets();
  const opt = (obj,val) => Object.entries(obj).map(([k,v])=>`<option value="${k}" ${k===val?'selected':''}>${esc(v.label)}</option>`).join('');
  return `<form class="form profForm">
        <label class="field full">Name<input id="pf_name" name="name" type="text" maxlength="40" autocomplete="given-name" placeholder="What should the app call you?" value="${esc(p.name||'')}"></label>
        <label class="field">Sex<select id="pf_sex" name="sex"><option value="male" ${p.sex==='male'?'selected':''}>Male</option><option value="female" ${p.sex==='female'?'selected':''}>Female</option></select></label>
        <label class="field">Date of birth<input id="pf_birth" name="birth" type="date" max="${localDate()}" value="${esc(p.birth||'')}"><span class="hint">${p.birth?`Age ${ageOf(p)}`:`Using age ${esc(p.age)} until you add it`}</span></label>
        <label class="field">Height (cm)<input id="pf_height" name="height_cm" type="number" min="120" max="230" step="0.5" value="${esc(p.height_cm)}"></label>
        <label class="field">Weight (kg)<input id="pf_weight" name="weight_kg" type="number" min="30" max="250" step="0.1" value="${esc(p.weight_kg)}"><span class="hint">Trend: ${n1(who(localDate()).kg)} kg</span></label>
        <label class="field">Body fat %<input id="pf_bf" name="body_fat" type="number" min="3" max="60" step="0.1" placeholder="Optional" value="${esc(p.body_fat??'')}"><span class="hint">Only from a DEXA scan or tape measurement.</span></label>
        <label class="field">Goal<select id="pf_goal" name="goal">${opt(GOALS,p.goal)}</select></label>
        <label class="field">Rate (kg per week)<select id="pf_rate" name="goal_rate">${(p.goal==='gain'?[0.1,0.25,0.5]:[0.25,0.5,0.75,1]).map(r=>`<option value="${r}" ${Number(p.goal_rate)===r?'selected':''}>${r}</option>`).join('')}</select></label>
        <label class="field full">Daily life, not counting gym and sport<select id="pf_act" name="activity">${opt(ACTIVITY,actId(p.activity))}</select></label>
        <label class="field full">Maintenance calories<select id="pf_maint" name="maint_source"><option value="auto" ${p.maint_source!=='formula'?'selected':''}>Measured from my logs when ready (recommended)</option><option value="formula" ${p.maint_source==='formula'?'selected':''}>Always use the formula</option></select><span class="hint">${T.adaptive.ready?`Ready: your logs show you burn about ${n0(T.adaptive.tdee)} kcal a day.`:`Still learning: needs ${esc(T.adaptive.need.join(', '))}.`}</span></label>
        <label class="check full"><input type="checkbox" id="pf_eatback" ${p.eat_back!==false?'checked':''}> Add each day’s gym and sport calories to that day’s target</label>
        <div class="full row"><button class="btn" type="submit">Save</button></div>
      </form>`;
}
function goalsForm(){
  const p = prof(), T = targets(), SG = suggestedTargets();
  return `<form class="form profForm">
        <div class="full muted small">Leave a box empty to use the suggested goal.</div>
        ${[['pf_kcal','calorie_override','Calories','kcal',SG.kcal,1000,6000,10],['pf_prot','protein_override','Protein','g',SG.protein,30,400,1],['pf_carbs','carbs_override','Carbs','g',SG.carbs,0,900,1],['pf_fat','fat_override','Fat','g',SG.fat,20,300,1],['pf_fibre','fiber_override','Fibre','g',SG.fiber,10,120,1],['pf_water','water_override_ml','Water','ml',SG.water_ml,1000,8000,250]].map(([id,key,label,unit,sug,mn,mx,st])=>`
          <label class="field">${label} (${unit})<input id="${id}" name="${key}" type="number" min="${mn}" max="${mx}" step="${st}" placeholder="Suggested ${n0(sug)}" value="${esc(p[key]??'')}">
          <span class="hint">${p[key]?`Yours · suggested ${n0(sug)} <button type="button" class="linkbtn" data-action="resetGoal" data-key="${key}" style="padding:0 2px">Use suggested</button>`:`Suggested ${n0(sug)} ${unit}`}</span></label>`).join('')}
        <label class="field">Daily steps goal<input id="pf_steps" name="steps_goal" type="number" min="1000" max="50000" step="500" value="${esc(p.steps_goal??10000)}"></label>
        ${T.fat < Math.round(0.6*(Number(p.weight_kg)||70)) ? `<div class="full banner">With these goals fat drops to ${n0(T.fat)} g, below the ${n0(0.6*(Number(p.weight_kg)||70))} g your body needs. Lower carbs or protein a little, or set fat yourself.</div>` : ''}
        ${(()=>{ const mk=T.protein*4+T.carbs*4+T.fat*9; return Math.abs(mk-T.kcal)>60 ? `<div class="full banner">Your protein, carbs and fat add up to ${n0(mk)} kcal, but your calorie goal is ${n0(T.kcal)} kcal. Adjust one so they match.</div>` : ''; })()}
        <div class="full row"><button class="btn" type="submit">Save goals</button></div>
      </form>
      <div class="kv">
        <span>Resting burn (${esc(T.bmrMethod)})</span><b>${n0(T.bmr)} kcal</b>
        <span>Maintenance used</span><b>${n0(T.maint)} kcal <span class="tag">${T.maintSource}</span></b>
        <span>Goal</span><b>${T.goalDelta>0?'+':T.goalDelta<0?'−':''}${n0(Math.abs(T.goalDelta))} kcal</b>
        <span>Fibre${p.fiber_override?' <span class="tag">yours</span>':''}</span><b>${n0(T.fiber)} g</b><span>Added sugar, up to</span><b>${n0(T.sugar)} g</b>
      </div>
      <div class="muted small">Protein is ${GOALS[p.goal]?.ppk||1.6} g per kg${T.refKg<T.weight-0.5?` of ${n1(T.refKg)} kg (your weight at BMI 25)`:' of body weight'}. Fat is 25% of calories, carbs fill the rest. ${p.goal==='lose'?`Losing ${p.goal_rate} kg a week takes about ${n0(p.goal_rate*7700/7)} kcal a day under maintenance.`:p.goal==='gain'?`Gaining ${p.goal_rate} kg a week takes about ${n0(p.goal_rate*7700/7)} kcal a day over maintenance.`:''} ${T.floored?`Capped at ${n0(T.floor)} kcal for safety; pick a slower rate.`:''}</div>`;
}
const microSummary = m => MICROS.filter(x => (m||{})[x.key] > 0).slice(0,4).map(x => `${x.label} ${fmtDose((m||{})[x.key])} ${x.unit}`).join(' · ');
const fmtDose = v => v >= 100 ? n0(v) : v >= 10 ? n1(v) : String(Math.round(v*100)/100);
function supplementsFold(){
  const p = prof(), today = getDay(localDate()), st = p.stack||[];
  return `${st.length ? `<div>${st.map(x=>`<div class="item"><div><div class="nm">${esc(x.name)}</div><div class="sub">${esc([x.dose, freqText(x.freq)].filter(Boolean).join(' · '))}</div><div class="sub">${esc(microSummary(x.micros)) || 'no vitamins or minerals counted'}</div></div><span></span><div class="acts"><button data-action="editSupp" data-id="${x.id}" aria-label="Edit ${esc(x.name)}">Edit</button><button data-action="rmStack" data-id="${x.id}" aria-label="Remove ${esc(x.name)}">✕</button></div></div>`).join('')}</div>` : '<div class="muted small">Add the vitamins and supplements you take and how often. They’re added to your log on the right days, and their vitamins and minerals count toward your daily totals.</div>'}
    <div class="row"><button class="btn sm" data-action="editSupp" data-id="">+ Add supplement</button></div>
    ${st.length ? `<label class="check small"><input type="checkbox" data-action="stackAuto" ${p.stack_auto!==false?'checked':''}> Add them to my log automatically on the days they’re due</label>
      <h3>Today</h3>${supplementsPanel(today)}` : ''}`;
}
/* Nutrients from the name and dose, no AI: "Vitamin D3 60,000 IU", "Zinc 50 mg",
   "Fish oil 1000 mg" with "2 capsules". Amounts are per unit; a count in the dose multiplies them. */
const SUPP_NUT = [
  ['vitamin_d_mcg', /(?:vit(?:amin)?\.?\s*)?d3?\b|cholecalciferol/, {iu:1/40, mcg:1, mg:1000}],
  ['vitamin_b12_mcg', /b\s?12|cobalamin|methylcobalamin/, {mcg:1, mg:1000}],
  ['vitamin_c_mg', /vit(?:amin)?\.?\s*c\b|ascorbic/, {mg:1, g:1000}],
  ['vitamin_a_mcg', /vit(?:amin)?\.?\s*a\b|retinol/, {iu:0.3, mcg:1}],
  ['folate_mcg', /fol(?:ic acid|ate)|b9\b/, {mcg:1, mg:1000}],
  ['zinc_mg', /zinc/, {mg:1}], ['iron_mg', /iron|ferrous/, {mg:1}], ['magnesium_mg', /magnesium/, {mg:1, g:1000}],
  ['calcium_mg', /calcium/, {mg:1, g:1000}], ['potassium_mg', /potassium/, {mg:1, g:1000}],
  ['omega3_g', /omega\s?-?3|epa|dha/, {mg:0.001, g:1}],
];
function suppMicrosFromText(name, dose){
  const t = `${name} ${dose}`.toLowerCase().replace(/(\d),(\d{3})/g,'$1$2').replace(/µg|ug/g,'mcg');
  const out = {};
  for (const [key, kw, units] of SUPP_NUT) {
    const m = t.match(new RegExp(`(?:${kw.source})[^0-9]{0,25}(\\d+(?:\\.\\d+)?)\\s*(iu|mcg|mg|g)\\b`)) || t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(iu|mcg|mg|g)\\s*(?:of\\s*)?(?:${kw.source})`));
    if (m && units[m[2]] != null) out[key] = +m[1] * units[m[2]];
  }
  // EPA and DHA listed separately: omega-3 is their sum.
  const epa = t.match(/epa[^0-9]{0,10}(\d+(?:\.\d+)?)\s*(mg|g)\b/), dha = t.match(/dha[^0-9]{0,10}(\d+(?:\.\d+)?)\s*(mg|g)\b/);
  if (epa || dha) out.omega3_g = [epa, dha].reduce((a, m) => a + (m ? +m[1] * (m[2]==='mg' ? 0.001 : 1) : 0), 0);
  // Fish oil without EPA/DHA amounts: about 0.3 g omega-3 per 1 g of oil.
  if (!out.omega3_g && /fish oil|cod liver/.test(t)) { const m = t.match(/(\d+(?:\.\d+)?)\s*(mg|g)\b/); out.omega3_g = m ? (+m[1] * (m[2]==='mg'?0.001:1)) * 0.3 : 0.3; }
  const c = String(dose||'').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(caps?|capsules?|tabs?|tablets?|softgels?|pills?|gummies|drops?|sachets?)\b/);
  if (c && !new RegExp('\\d\\s*(iu|mcg|mg|g)\\b').test(String(dose||'').toLowerCase())) for (const k in out) out[k] *= +c[1];
  for (const k in out) out[k] = Math.round(out[k]*1000)/1000;
  return out;
}
function suppPrompt(name, dose, fromPhoto){
  return `${fromPhoto ? 'This photo shows the label of a vitamin or supplement product. Read the amount per serving from the label' : `Look up the nutrients in one dose of this supplement using standard product information: "${name}"${dose?`, dose "${dose}"`:''}`}.
Reply with ONLY this JSON (amounts for ONE dose as taken${dose?` ("${dose}")`:''}, 0 for anything not in it):
{"name":"product name","dose":"e.g. 1 capsule","per_serving":"what one serving is",${MICROS.map(m=>`"${m.key}":0`).join(',')},"note":"one short sentence, e.g. what else it contains"}
Convert units: vitamin D 1 mcg = 40 IU; vitamin A IU × 0.3 = mcg RAE; omega-3 is EPA + DHA (+ ALA) in grams.`;
}
function openSuppEdit(id, preset){
  const p = prof(); const saved = (p.stack||[]).find(x=>x.id===(preset?.id||id)); const isNew = !saved;
  const cur = preset || saved || {id:uid(), name:'', dose:'', micros:{}, freq:{type:'daily'}}; if (!cur) return;
  const f = cur.freq || {type:'daily'}; const d = $('#dlg');
  d.innerHTML = `<form class="form supform" id="suForm" style="gap:12px"><h2 class="full">${isNew?'Add a supplement':'Edit supplement'}</h2>
    <label class="field full">Name<input id="su_name" value="${esc(cur.name)}" placeholder="e.g. Vitamin D3 60,000 IU" required></label>
    <label class="field full">Dose<input id="su_dose" value="${esc(cur.dose)}" placeholder="e.g. 1 capsule, 5 g, 2 softgels"></label>
    <label class="field full">How often<select id="su_ft"><option value="daily" ${f.type==='daily'?'selected':''}>Every day</option><option value="days" ${f.type==='days'?'selected':''}>On certain days of the week</option><option value="every" ${f.type==='every'?'selected':''}>Every few days</option></select></label>
    <div class="full wdays" id="su_days" ${f.type==='days'?'':'hidden'}>${WD.map((w,i)=>`<label class="wd"><input type="checkbox" value="${i}" ${(f.days||[]).includes(i)?'checked':''}><span>${w}</span></label>`).join('')}</div>
    <div class="full row" id="su_every" ${f.type==='every'?'':'hidden'}><label class="field">Every<input id="su_n" type="number" min="2" max="60" step="1" value="${f.n||7}"></label><label class="field">starting<input id="su_start" type="date" value="${esc(f.start||localDate())}"></label></div>
    <h3 class="full">Vitamins and minerals in one dose</h3>
    <div class="full row">${S.sample?'<button type="button" class="btn ghost sm" id="su_ai">Look it up</button><button type="button" class="btn ghost sm" id="su_photo">Label photo</button>':''}<button type="button" class="btn ghost sm" id="su_scan">Scan barcode</button></div>
    <div class="full muted small" id="su_msg">Filled in from the name and dose where possible. “Look it up” and “Label photo” use AI (1 use each).</div>
    <div class="full micgrid">${MICROS.filter(m=>!['sodium_mg','cholesterol_mg','sat_fat_g'].includes(m.key)).map(m=>`<label class="field">${esc(m.label)} (${m.unit})<input data-mk="${m.key}" type="number" min="0" step="any" inputmode="decimal" value="${(cur.micros||{})[m.key]>0?fmtDose(cur.micros[m.key]).replace(/,/g,''):''}"></label>`).join('')}</div>
    <div class="full row">${isNew?'':'<button class="btn ghost sm" type="button" id="su_del">Remove</button>'}<span class="spacer"></span><button class="btn ghost" type="button" id="su_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
  d.showModal();
  const msg = t => { $('#su_msg').textContent = t; };
  const setMicros = (m, overwrite) => { for (const el of d.querySelectorAll('[data-mk]')) { const v = Number(m[el.dataset.mk]); if (v>0 && (overwrite || !el.value)) el.value = fmtDose(v).replace(/,/g,''); else if (overwrite && !(v>0)) el.value=''; } };
  const auto = () => { if ((!isNew || preset) && Object.keys(cur.micros||{}).length) return; const m = suppMicrosFromText($('#su_name').value, $('#su_dose').value); if (Object.keys(m).length) { setMicros(m, true); msg('Filled in from the name and dose. Check the numbers against the label.'); } };
  $('#su_name').addEventListener('change', auto); $('#su_dose').addEventListener('change', auto);
  $('#su_ft').onchange = () => { const v = $('#su_ft').value; $('#su_days').hidden = v!=='days'; $('#su_every').hidden = v!=='every'; };
  const fromAi = async (res, how) => {
    const m = {}; for (const x of MICROS) { const v = num(res?.[x.key], 100000); if (v>0) m[x.key] = v; }
    if (!$('#su_name').value && res?.name) $('#su_name').value = String(res.name).slice(0,60);
    if (!$('#su_dose').value && res?.dose) $('#su_dose').value = String(res.dose).slice(0,40);
    setMicros(m, true); msg(`${how}${res?.note ? ': ' + String(res.note).slice(0,160) : ''}. Check the numbers against the label.`);
  };
  if (S.sample) {
    $('#su_ai').onclick = async () => { const n = $('#su_name').value.trim(); if (!n) { msg('Type the product name first.'); return; }
      msg('Looking it up…'); try { await fromAi(await S.sample.json(suppPrompt(n, $('#su_dose').value.trim(), false), {task:'log'}), 'Looked up by name'); } catch (e) { msg(AI_ERR[e?.code] || AI_ERR.unavailable); } };
    $('#su_photo').onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.setAttribute('capture','environment');
      inp.onchange = async () => { const file = inp.files?.[0]; if (!file) return; msg('Reading the label…');
        try { await fromAi(await S.sample.json(suppPrompt($('#su_name').value.trim(), $('#su_dose').value.trim(), true), {task:'log', images:[await toJpeg(file)]}), 'Read from the label photo'); } catch (e) { msg(AI_ERR[e?.code] || 'Couldn’t read that photo. Try a sharper photo of the nutrition panel.'); } };
      inp.click(); };
  }
  const collect = () => {
    const ft = $('#su_ft').value; const freq = ft==='days' ? {type:'days', days:[...d.querySelectorAll('#su_days input:checked')].map(x=>+x.value)} : ft==='every' ? {type:'every', n:Math.max(2, Math.round(num($('#su_n').value,60))||7), start:$('#su_start').value||localDate()} : {type:'daily'};
    const micros = {}; for (const el of d.querySelectorAll('[data-mk]')) { const v = num(el.value, 100000); if (v>0) micros[el.dataset.mk] = v; }
    return {...cur, name:titleCase($('#su_name').value).slice(0,60), dose:$('#su_dose').value.trim().slice(0,40), freq, micros};
  };
  $('#su_scan').onclick = () => { const keep = collect(); openScanner(code => suppFromBarcode(code, keep)); };
  $('#su_cancel').onclick = () => d.close();
  if (!isNew) $('#su_del').onclick = () => { d.close(); const pp = prof(); saveProfile({...pp, stack:pp.stack.filter(x=>x.id!==cur.id)}); toast(`Removed ${cur.name}`, () => saveProfile({...prof(), stack:[...(prof().stack||[]), cur]})); };
  $('#suForm').onsubmit = ev => { ev.preventDefault(); const x = collect(); if (!x.name) return;
    if (x.freq.type==='days' && !x.freq.days.length) { msg('Pick at least one day of the week.'); return; }
    const pp = prof(); const list = pp.stack||[]; x.since = x.since || localDate();
    saveProfile({...pp, stack: isNew ? [...list, x] : list.map(y=>y.id===x.id?x:y)});
    // Keep today's log in step: add it if it's due and not there yet, update the values if it is.
    writeDay(localDate(), dd => { dd.supplements = dd.supplements||[]; const i = dd.supplements.findIndex(y=>y.stack_id===x.id);
      if (i>=0) dd.supplements[i] = {...dd.supplements[i], name:x.name, dose:x.dose, micros:{...x.micros}};
      else if (isNew && suppDue(x, localDate()) && pp.stack_auto!==false) dd.supplements.push({id:uid(), name:x.name, dose:x.dose, micros:{...x.micros}, stack_id:x.id, time:nowTime(), auto:true}); });
    d.close(); toast(`${isNew?'Added':'Saved'} ${x.name} · ${freqText(x.freq).toLowerCase()}`);
  };
  if (isNew) setTimeout(()=>$('#su_name')?.focus(), 50);
}
// Supplement from a barcode: Open Food Facts, per serving where the label gives it.
async function suppFromBarcode(code, keep){
  const d = $('#dlg'); if (!d.open) d.showModal();
  d.innerHTML = `<div class="scan"><h2>Looking up ${esc(code)}…</h2><div class="muted small">Asking Open Food Facts.</div></div>`;
  let p = null;
  try { const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,nutriments,serving_size`); const j = await r.json().catch(()=>null); if (j && j.status===1) p = j.product; } catch {}
  const n = p?.nutriments || {}; const per = k => { const v = Number(n[k+'_serving'] ?? n[k+'_100g']); return Number.isFinite(v) && v>0 ? v : 0; };
  const m = {vitamin_d_mcg:per('vitamin-d')*1e6, vitamin_b12_mcg:per('vitamin-b12')*1e6, vitamin_c_mg:per('vitamin-c')*1000, vitamin_a_mcg:per('vitamin-a')*1e6, folate_mcg:per('folates')*1e6,
    zinc_mg:per('zinc')*1000, iron_mg:per('iron')*1000, magnesium_mg:per('magnesium')*1000, calcium_mg:per('calcium')*1000, potassium_mg:per('potassium')*1000, omega3_g:per('omega-3-fat')};
  for (const k in m) if (!(m[k]>0)) delete m[k];
  const name = [p?.product_name_en || p?.product_name, (p?.brands||'').split(',')[0]].filter(Boolean).join(' · ');
  // Back to the form with what was found; nothing is saved until Save.
  openSuppEdit(null, {...keep, name: keep.name || titleCase(name).slice(0,60), dose: keep.dose || String(p?.serving_size||'').slice(0,40), micros: Object.keys(m).length ? m : keep.micros});
  $('#su_msg').textContent = !p ? `Barcode ${code} isn’t on Open Food Facts. Try Look it up or Label photo instead.` : Object.keys(m).length ? `Found on Open Food Facts${name?`: ${name}`:''} (ODbL). Check the numbers against the label.` : `Found ${name||'the product'} on Open Food Facts, but without vitamin and mineral values. Try Label photo.`;
}
function connectFold(){
  const p = prof();
  return `${healthSyncHtml()}
    <label class="check"><input type="checkbox" data-action="watchToggle" ${p.watch_workouts?'checked':''}> My watch records my gym and sport sessions (so they’re already in its active calories)</label>
    <ul class="tips">
      <li><b>Android, Fitbit, Samsung and others:</b> type your day into the log box, like “slept 7h 10m, 9200 steps, active 520 kcal”, or add a screenshot of the watch app’s daily summary with Add photo. The AI reads it.</li>
    </ul>
    <div class="muted small">Apple and Garmin don’t let websites read your data directly, which is why the iPhone Shortcut does the sending.</div>`;
}
function dataFold(){
  return `<div class="row"><button class="btn sm" data-action="exportExcel" ${S.xlsBusy?'disabled':''}>${S.xlsBusy?'Preparing…':'Download all my data (Excel)'}</button></div>
    <div class="muted small">One spreadsheet with a sheet each for daily totals, food, gym sets, sport, supplements and blood tests.</div>
    <div class="row"><button class="btn ghost sm" data-action="exportData">Download backup (JSON)</button><button class="btn ghost sm" data-action="importData">Restore from backup</button></div>
    <div class="muted small">The backup file can be restored into this app later. Restoring also accepts a Fuel &amp; Lift backup or an export from the claude.ai version.</div>`;
}
function securityFold(){
  return `<div class="muted small">Signed in as ${esc(S.user?.email||'')}. Set or change the password you use to sign in (including on the home-screen app).</div>
    <div class="row"><input id="newPass" type="password" autocomplete="new-password" placeholder="New password (8+ characters)" class="inp" style="flex:1;min-width:0"><button class="btn ghost sm" data-action="setPassword">Set password</button></div>
    <div class="row"><button class="btn ghost sm" data-action="signOut">Sign out on this device</button></div>`;
}
function accountFold(){
  const u = S.usage;
  return `<div class="kv"><span>Email</span><b>${esc(S.user?.email||'')}</b>
      <span>AI</span><b>${!S.sample?'Off in config.js':S.aiHealth==='ok'?'Connected':S.aiHealth?`<span style="color:var(--bad)">${esc(S.aiHealth==='unavailable'?'Can’t reach the AI service':AI_ERR[S.aiHealth]||S.aiHealth)}</span>`:'Checking…'}</b>
      <span>AI uses today</span><b>${u?`${u.count} of ${u.cap}`:'—'}</b>
      <span>Sync</span><b>${{synced:'Up to date',saving:'Saving…',offline:'Offline',error:'Retrying'}[S.sync]||'—'}${S.db&&S.db.pendingCount()?` · ${S.db.pendingCount()} waiting`:''}</b></div>
    <div class="row"><button class="btn ghost sm" data-action="refreshUsage">Check again</button></div>`;
}
function foodListHtml(){
  const list=Object.entries(S.myFoods||{}).sort((a,b)=>(b[1].updated||0)-(a[1].updated||0));
  return `${S.indbBuiltIn ? '' : `<div class="row"><button class="btn ghost sm" data-action="importIndb" ${S.libBusy?'disabled':''}>${(S.libFoods||[]).length?'Re-import INDB.xlsx':'Import 1,014 Indian recipes (INDB.xlsx)'}</button><span class="status${/isn|failed|Couldn|declined|Only|empty|Reconnect/.test(S.libStatus||'')?' err':''}">${esc(S.libStatus||'')}</span></div>`}
    <div class="muted small">${FOODS.length} foods built in${(S.libFoods||[]).length?`, ${n0((S.libFoods||[]).length)} Indian recipes from INDB`:''}, about 7,200 USDA foods to search, plus ${list.length} learned from your logs, and ${n0(libCount())} gym exercises. These log instantly without AI.</div>
    ${list.length?`<div>${list.slice(0,40).map(([k,f])=>`<div class="item"><div><div class="nm">${esc(f.name)}${f.verified?' <span class="tag">corrected</span>':''}</div><div class="sub">${n0(f.per.kcal)} kcal · P ${n1(f.per.protein)} · C ${n1(f.per.carbs)} · F ${n1(f.per.fat)} per 100 g</div></div><span></span><div class="acts"><button data-action="rmFood" data-key="${esc(k)}" aria-label="Remove ${esc(f.name)}">✕</button></div></div>`).join('')}</div>`:''}`;
}
function viewProfile(){
  const p = prof(), T = targets();
  const t=dayTotals(getDay(localDate())), TT=dayTargets(getDay(localDate()));
  const reps = S.reports||[]; const rv = (S.reviews||[])[0];
  return `<div class="grid">
    <h2 class="sect">My plan</h2>
    <section class="panel folds">
      ${fold('p-goals', 'Daily goals', `${n0(T.kcal)} kcal · ${n0(T.protein)} g protein`, goalsForm())}
      ${fold('p-blood', 'Blood tests', reps.length?`${reps.length} report${reps.length===1?'':'s'}`:'add a report', viewHealth())}
      ${fold('p-supps', 'Vitamins &amp; supplements', (p.stack||[]).length?`${p.stack.length} supplement${p.stack.length===1?'':'s'}${p.stack_auto!==false?' · auto-added':''}`:'add yours', supplementsFold())}
    </section>
    <h2 class="sect">Settings</h2>
    <section class="panel folds">
      ${fold('s-review', 'Coach review', rv?`last ${esc(fmtDate(rv.date,{day:'numeric',month:'short'}))}`:'weekly check-in', reviewPanel())}
      ${fold('s-profile', 'My details', `${esc(p.sex)} · ${n1(who(localDate()).kg)} kg · ${esc((GOALS[p.goal]||{}).label||'')}`, profileForm())}
      ${fold('s-data', 'Download my data', 'Excel', dataFold())}
      ${fold('s-notify', 'Notifications', notifySub(), notifyFold())}
      ${fold('s-connect', 'Watch &amp; health apps', p.watch_workouts?'watch on':'', connectFold())}
      ${fold('s-sources', 'Data sources', 'free &amp; open', sourcesHtml())}
      ${S.isAdmin ? fold('s-people', 'People &amp; approvals', (()=>{ const n=(S.members||[]).filter(x=>x.status==='pending').length; return n?`${n} waiting`:`${(S.members||[]).filter(x=>x.status==='approved').length} approved`; })(), peopleFold()) : ''}
      ${fold('s-sports', 'Sports &amp; food list', `${Object.keys(p.sports||{}).length} sport${Object.keys(p.sports||{}).length===1?'':'s'}`, `<h3>Sports you play</h3>${sportsProfileHtml()}<h3>Your food list</h3>${foodListHtml()}`)}
    </section>
  </div>`;
}

/* ---------- daily supplements, added automatically ---------- */
function autoStack(){
  const p = prof(), today = localDate();
  if (!S.dbReady || S.stackAutoDate===today || p.stack_auto===false || !(p.stack||[]).length) return;
  S.stackAutoDate = today;
  // When did each item start? Its "since" date, or the first day it appears in the log.
  const firstSeen = st => { let d=null; for (const [k,day] of S.days) if ((day.supplements||[]).some(x=>x.stack_id===st.id || exKey(x.name)===exKey(st.name)) && (!d || k<d)) d=k; return d; };
  const since = {}; for (const st of p.stack) since[st.id] = st.since || firstSeen(st) || today;
  const earliest = Object.values(since).sort()[0], limit = addDays(today, -60);
  for (let d = earliest < limit ? limit : earliest; d <= today; d = addDays(d, 1)) {
    const day = S.days.get(d); if (day && day.stack_auto) continue; // already filled (and anything unticked stays unticked)
    const due = p.stack.filter(st => since[st.id] <= d && suppDue(st, d) && !((day && day.supplements) || []).some(x=>x.stack_id===st.id));
    if (!due.length) continue;
    writeDay(d, dd => { dd.supplements = dd.supplements||[]; dd.stack_auto = true;
      for (const st of due) if (!dd.supplements.some(x=>x.stack_id===st.id)) dd.supplements.push({id:uid(), name:st.name, dose:st.dose, micros:{...st.micros}, stack_id:st.id, time:nowTime(), auto:true}); });
  }
  if (p.stack.some(st=>!st.since)) saveProfile({...p, stack:p.stack.map(st=>({...st, since: st.since || since[st.id]}))});
}

/* ---------- Pinned libraries, loaded on demand ----------
   Each is checked against its hash (subresource integrity), so a tampered
   CDN copy is refused instead of run. */
const LIBS = {
  xlsx: { src:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', integrity:'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw' },
  webauthn: { src:'https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@14.0.0/dist/bundle/index.umd.min.js', integrity:'sha384-06g944bCm8L/wG3i0Q8PdB8jccE4GdpHdNCa1tJY8eMqoP3GIHGJdL6B5lD5OMGD' },
};
function loadScript({ src, integrity }){
  return new Promise((res, rej) => {
    const el = document.createElement('script'); el.src = src; el.integrity = integrity; el.crossOrigin = 'anonymous';
    el.onload = res; el.onerror = () => { el.remove(); rej(new Error('load failed')); }; document.head.appendChild(el);
  });
}
/* ---------- Excel export ---------- */
async function loadXlsx(){
  if (window.XLSX) return;
  await loadScript(LIBS.xlsx).catch(()=>{ throw {msg:'Couldn’t load the spreadsheet tool. Check your connection and try again.'}; });
}
async function exportExcel(){
  S.xlsBusy=true; render();
  try {
    await loadXlsx();
    const days = [...S.days.values()].sort((a,b)=>a.date.localeCompare(b.date));
    const r1 = v => Math.round((Number(v)||0)*10)/10;
    const summary=[], food=[], gym=[], sport=[], supps=[], blood=[];
    for (const d of days) {
      const t=dayTotals(d), T=dayTargets(d), H=d.health||{};
      summary.push({Date:d.date, 'Calories eaten':Math.round(t.kcal), 'Calorie target':Math.round(T.kcal), 'Protein (g)':r1(t.protein), 'Carbs (g)':r1(t.carbs), 'Fat (g)':r1(t.fat), 'Fibre (g)':r1(t.fiber), 'Added sugar (g)':r1(t.sugar),
        'Water (L)':r1(t.water/1000), 'Burned (kcal)':Math.round(burnedTotal(d).total), 'Training (kcal)':Math.round(t.burned||0), Steps:H.steps||'', 'Sleep (h)':H.sleep_min?r1(H.sleep_min/60):'', 'Weight (kg)':d.weight_kg||''});
      for (const f of d.foods||[]) food.push({Date:d.date, Meal:f.meal, Time:f.time||'', Food:f.name, Quantity:f.quantity||'', Grams:Math.round(f.grams||0), kcal:Math.round(f.kcal||0), 'Protein (g)':r1(f.protein), 'Carbs (g)':r1(f.carbs), 'Fat (g)':r1(f.fat), 'Fibre (g)':r1(f.fiber), 'Sugar (g)':r1(f.sugar), 'Added sugar (g)':r1(addedSugar(f))});
      for (const e of d.exercises||[]) { const sets=e.sets||[]; if (!sets.length) gym.push({Date:d.date, Exercise:e.name, 'Muscle group':e.muscle_group||'', Set:'', 'Weight (kg)':'', Reps:'', Minutes:e.duration_min||'', kcal:Math.round(e.kcal||0)});
        sets.forEach((s,i)=>gym.push({Date:d.date, Exercise:e.name, 'Muscle group':e.muscle_group||'', Set:i+1, 'Weight (kg)':s.weight||0, Reps:s.reps||0, Minutes:'', kcal:i===0?Math.round(e.kcal||0):''})); }
      for (const a of d.sports||[]) sport.push({Date:d.date, Activity:actTitle(a), Details:actLine(a), Minutes:Math.round(a.minutes||0), 'Effort (1-10)':a.rpe||'', kcal:Math.round(a.kcal||0)});
      for (const s of d.supplements||[]) supps.push({Date:d.date, Supplement:s.name, Dose:s.dose||''});
    }
    for (const r of S.reports||[]) for (const m of r.markers||[]) blood.push({'Report date':r.report_date, Lab:r.lab||'', Test:m.name, Value:m.value??m.value_text??'', Unit:m.unit||'', Range:m.ref||'', Status:m.status||''});
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of [['Daily',summary],['Food',food],['Gym',gym],['Sport',sport],['Supplements',supps],['Blood tests',blood]])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length?rows:[{Note:'Nothing logged yet'}]), name);
    XLSX.writeFile(wb, `maxxtempo-${localDate()}.xlsx`);
  } catch(e) { toast(e?.msg || 'Couldn’t build the spreadsheet. Try again.'); }
  finally { S.xlsBusy=false; render(); }
}

/* ---------- dialogs ---------- */
function openFoodEdit(id){
  const f = getDay(S.date).foods.find(x=>x.id===id); if (!f) return;
  const d=$('#dlg');
  d.innerHTML = `<form method="dialog" id="editForm" class="form" style="gap:12px">
    <h2 class="full">Edit food</h2>
    <label class="field full">Name<input id="ef_name" value="${esc(f.name)}"></label>
    <label class="field">Grams<input id="ef_grams" type="number" min="0" step="1" value="${esc(Math.round(f.grams||0))}"></label>
    <label class="field">Meal<select id="ef_meal">${MEALS.map(m=>`<option ${m===f.meal?'selected':''}>${m}</option>`).join('')}</select></label>
    <label class="check full"><input type="checkbox" id="ef_scale" checked> Scale every nutrient to the new grams</label>
    <label class="field">kcal<input id="ef_kcal" type="number" min="0" value="${esc(Math.round(f.kcal))}"></label>
    <label class="field">Protein (g)<input id="ef_p" type="number" min="0" step="0.1" value="${esc(n1(f.protein).replace(/,/g,''))}"></label>
    <label class="field">Carbs (g)<input id="ef_c" type="number" min="0" step="0.1" value="${esc(n1(f.carbs).replace(/,/g,''))}"></label>
    <label class="field">Fat (g)<input id="ef_f" type="number" min="0" step="0.1" value="${esc(n1(f.fat).replace(/,/g,''))}"></label>
    <div class="full muted small">With scaling on, changing grams recalculates everything. Turn it off to type exact numbers from a label.</div>
    <div class="full row"><span class="spacer"></span><button class="btn ghost" value="cancel" type="button" id="ef_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
  d.showModal();
  $('#ef_cancel').onclick = () => d.close();
  $('#editForm').onsubmit = (ev) => { ev.preventDefault();
    const g = num($('#ef_grams').value,5000), scale = $('#ef_scale').checked;
    writeDay(S.date, day => { const x = day.foods.find(y=>y.id===id); if (!x) return;
      x.name = $('#ef_name').value.trim()||x.name; x.meal = $('#ef_meal').value;
      if (scale && x.grams>0 && g>0 && g!==x.grams) { const k=g/x.grams;
        x.added_sugar = addedSugar(x)*k; ['kcal','protein','carbs','fat','fiber','sugar'].forEach(key=>x[key]=(x[key]||0)*k);
        for (const m of MICROS) x.micros[m.key]=(x.micros[m.key]||0)*k;
        x.quantity = `${Math.round(g)} g`;
      } else { x.kcal=num($('#ef_kcal').value,5000); x.protein=num($('#ef_p').value,500); x.carbs=num($('#ef_c').value,1000); x.fat=num($('#ef_f').value,500); if (g!==x.grams && g>0) x.quantity=`${Math.round(g)} g`; }
      x.grams = g || x.grams; x.confidence='high'; delete x.check; }).then(() => { const x2=getDay(S.date).foods.find(y=>y.id===id); if (x2) saveMyFood({...x2, verified:true}); });
    d.close(); };
}
function openExEdit(id){
  const e = getDay(S.date).exercises.find(x=>x.id===id); if (!e) return;
  const d=$('#dlg');
  const setsTxt = (e.sets||[]).map(s=>s.weight>0?`${s.weight}x${s.reps}`:`${s.reps}`).join(', ');
  d.innerHTML = `<form id="editForm" class="form" style="gap:12px">
    <h2 class="full">Edit exercise</h2>
    <label class="field full">Name<input id="ee_name" value="${esc(e.name)}"></label>
    <label class="field full">Sets<input id="ee_sets" value="${esc(setsTxt)}"><span class="hint">weight x reps, separated by commas: 60x8, 60x8, 65x6. Reps only for bodyweight: 12, 10, 8</span></label>
    <label class="field">Muscle group<select id="ee_group">${MUSCLES.map(m=>`<option ${m===e.muscle_group?'selected':''}>${m}</option>`).join('')}</select></label>
    <label class="field">Minutes<input id="ee_min" type="number" min="0" placeholder="auto" value="${esc(e.duration_min||'')}"></label>
    <div class="full status err" id="ee_err"></div>
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="ee_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
  d.showModal();
  $('#ee_cancel').onclick = () => d.close();
  $('#editForm').onsubmit = (ev) => { ev.preventDefault();
    const sets=[]; const txt=$('#ee_sets').value.toLowerCase().replace(/kg/g,'').replace(/×/g,'x');
    for (const part of txt.split(/[,;]+/)) { const s=part.trim(); if(!s) continue; let m;
      if ((m=s.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/))) sets.push({weight:+m[1],reps:+m[2]});
      else if ((m=s.match(/^(\d+)$/))) sets.push({weight:0,reps:+m[1]});
      else { $('#ee_err').textContent=`Couldn’t read “${s}”. Write it as weight x reps, like 60x8.`; return; } }
    for (const x of sets) { const bad = setProblem(x.weight, x.reps); if (bad) { $('#ee_err').textContent = bad.replace(' and tick again', ''); return; } }
    writeDay(S.date, day => { const x=day.exercises.find(y=>y.id===id); if(!x) return;
      x.name=titleCase($('#ee_name').value)||x.name; x.sets=sets; x.muscle_group=$('#ee_group').value; x.duration_min=num($('#ee_min').value,600)||null;
      x.kcal = exerciseKcal(x, S.date); });
    d.close(); };
}

// Sports and activities from the Compendium table (sports.js), picked rather than typed.
async function openAddSport(){
  await Promise.race([loadActs(), new Promise(r => setTimeout(r, 3000))]);
  if (typeof Sports==='undefined' || !Sports.ready()) { toast('The activity table didn’t load. Check your connection and try again.'); return; }
  const d = $('#dlg'), fams = Sports.families(), mine = Object.keys(prof().sports||{});
  const yours = fams.filter(f=>mine.includes(f.key)), rest = fams.filter(f=>!mine.includes(f.key));
  let key = S.lastSport && Sports.family(S.lastSport) ? S.lastSport : (yours[0]||fams[0]).key, touched = false;
  const hint = k => k==='cricket' ? 'e.g. nets, bowled 6 overs pace, faced 40 balls' : /badminton|tennis|squash|table-tennis|pickleball/.test(k) ? 'e.g. singles or doubles'
    : /running|jogging|walking|cycling|swimming|hiking|rowing/.test(k) ? 'e.g. 5 km' : 'e.g. anything else about it';
  const defMin = k => sportProfile(k).minutes || 60;
  const opts = list => list.map(f=>`<option value="${esc(f.key)}" ${f.key===key?'selected':''}>${esc(f.name)}</option>`).join('');
  d.innerHTML = `<form class="form" id="asform" style="gap:12px"><h2 class="full">Add sport or activity</h2>
    <label class="field full">Activity<select id="as_key">${yours.length?`<optgroup label="Your sports">${opts(yours)}</optgroup><optgroup label="All">${opts(rest)}</optgroup>`:opts(fams)}</select></label>
    <label class="field">Minutes<input id="as_min" type="number" min="1" max="600" inputmode="numeric" value="${defMin(key)}"></label>
    <label class="field">Effort<select id="as_eff"><option value="easy">Easy</option><option value="" selected>Normal</option><option value="hard">Hard</option></select></label>
    <label class="field full">Details <span class="muted small">(optional)</span><input id="as_det" type="text" maxlength="120" placeholder="${esc(hint(key))}" autocomplete="off"></label>
    <div class="full" id="as_prev"></div>
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="as_cancel">Cancel</button><button class="btn" type="submit">Log it</button></div></form>`;
  if (!d.open) d.showModal();
  const build = () => { const f = Sports.family(key), min = num($('#as_min').value, 600); if (!f || !min) return null;
    const entry = `${f[1]} ${min} min${$('#as_det').value.trim() ? ', ' + $('#as_det').value.trim() : ''}`;
    const sp = sportFromText(entry, S.date, key, $('#as_eff').value || undefined); if (!sp) return null;
    return makeActivity({key:sp.key, name:sp.name, entry, date:S.date, time:nowTime(), qa:[]}, sp.res); };
  const upd = () => { const a = build();
    $('#as_prev').innerHTML = a ? `<b>about ${n0(a.kcal)} kcal</b> · ${esc(a.title)}, ${esc(a.summary)}` : '<span class="muted small">Enter the minutes.</span>'; };
  $('#as_key').onchange = ev => { key = ev.target.value; if (!touched) $('#as_min').value = defMin(key); $('#as_det').placeholder = hint(key); upd(); };
  $('#as_min').oninput = () => { touched = true; upd(); };
  $('#as_det').oninput = upd; $('#as_eff').onchange = upd; upd();
  $('#as_cancel').onclick = () => d.close();
  $('#asform').onsubmit = async ev => { ev.preventDefault(); const a = build(); if (!a) { upd(); return; }
    S.lastSport = key; d.close(); await saveEntry(S.date, {sportsLocal:[a]}); toast(`Logged ${a.title} · ${n0(a.minutes)} min · ${n0(a.kcal)} kcal`); };
}
function openSportEdit(id){
  const a = (getDay(S.date).sports||[]).find(x=>x.id===id); if (!a) return;
  if (a.v===2) return openActEdit(a);
  const d=$('#dlg'); const cr = a.sport==='cricket';
  const nf = (idv,label,val,hint='') => `<label class="field">${label}<input id="${idv}" type="number" min="0" placeholder="—" value="${esc(val??'')}">${hint?`<span class="hint">${hint}</span>`:''}</label>`;
  d.innerHTML = `<form id="editForm" class="form" style="gap:12px">
    <h2 class="full">Edit ${esc(sportTitle(a))}</h2>
    ${cr?`<label class="field">Session<select id="es_session">${['match','nets','practice'].map(x=>`<option ${x===a.session?'selected':''}>${x}</option>`).join('')}</select></label>`
        :a.sport==='badminton'?`<label class="field">Format<select id="es_format"><option value="">not set</option>${['singles','doubles'].map(x=>`<option ${x===a.format?'selected':''}>${x}</option>`).join('')}</select></label>`:''}
    ${nf('es_min','Total minutes',a.minutes)}
    ${cr?`${nf('es_bowled','Balls bowled',a.balls_bowled,'6 overs = 36')}
      <label class="field">Bowling style<select id="es_style"><option value="">not set</option>${['pace','medium','spin'].map(x=>`<option ${x===a.bowling_style?'selected':''}>${x}</option>`).join('')}</select></label>
      ${nf('es_faced','Balls faced',a.balls_faced)}${nf('es_batmin','Minutes batted',a.minutes_batted)}${nf('es_field','Overs fielded',a.overs_fielded)}`:''}
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="es_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
  d.showModal();
  $('#es_cancel').onclick = () => d.close();
  $('#editForm').onsubmit = ev => { ev.preventDefault();
    const g = (idv,max) => { const el=$('#'+idv); return el ? (num(el.value,max)||null) : undefined; };
    writeDay(S.date, day => { const x=(day.sports||[]).find(y=>y.id===id); if(!x) return;
      x.minutes = g('es_min',1440);
      if (cr) { x.session=$('#es_session').value; x.balls_bowled=g('es_bowled',600); x.bowling_style=$('#es_style').value||null; x.balls_faced=g('es_faced',600); x.minutes_batted=g('es_batmin',600); x.overs_fielded=g('es_field',100); }
      if ($('#es_format')) x.format = $('#es_format').value||null;
      x.kcal = sportKcal(x, S.date); });
    d.close(); };
}

function openActEdit(a){
  const d=$('#dlg');
  d.innerHTML = `<form id="editForm" class="form" style="gap:12px">
    <h2 class="full">Edit ${esc(a.title)}</h2>
    <div class="full muted small">Change the minutes or effort of each part. Calories recalculate from your weight.</div>
    ${(a.components||[]).map((c,i)=>`<label class="field full">${esc(c.part)}<span class="row"><input id="ac_m${i}" type="number" min="0" value="${esc(Math.round(c.minutes))}" style="max-width:110px"> min · MET <input id="ac_e${i}" type="number" min="1" max="16" step="0.1" value="${esc(c.met)}" style="max-width:90px"></span></label>`).join('')}
    <label class="field">Effort (1–10)<input id="ac_rpe" type="number" min="1" max="10" value="${esc(a.rpe)}"></label>
    <div class="full row"><span class="spacer"></span><button class="btn ghost" type="button" id="ac_cancel">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
  d.showModal();
  $('#ac_cancel').onclick = () => d.close();
  $('#editForm').onsubmit = ev => { ev.preventDefault(); const W=who(S.date);
    writeDay(S.date, day => { const x=(day.sports||[]).find(y=>y.id===a.id); if(!x) return;
      x.components = (x.components||[]).map((c,i)=>({...c, minutes:num($('#ac_m'+i).value,600), met:Math.min(Math.max(Number($('#ac_e'+i).value)||c.met,1),16)}));
      x.minutes = Math.round(x.components.reduce((s,c)=>s+c.minutes,0));
      x.kcal = Math.round(x.components.reduce((s,c)=>s+Calc.netKcalFromMet(c.met, W.kg, c.minutes, W.bmrKcal).net,0));
      x.kcal_gross = Math.round(x.components.reduce((s,c)=>s+Calc.netKcalFromMet(c.met, W.kg, c.minutes, W.bmrKcal).gross,0));
      x.rpe = Math.min(10,Math.max(1,Math.round(Number($('#ac_rpe').value)||x.rpe))); });
    d.close(); };
}

/* ---------- render + events ---------- */
function render(){
  const isToday = S.date===localDate();
  $('#syncDot').className = 'sync ' + (S.user ? S.sync : '');
  $('#syncDot').title = {synced:'Saved', saving:'Saving…', offline:'Offline: saved on this device', error:'Sync problem: retrying'}[S.sync]||'';
  $('#dateLabel').textContent = isToday ? 'Today, ' + fmtDate(S.date,{day:'numeric',month:'short'}) : fmtDate(S.date);
  $('#datePick').max = localDate(); $('#datePick').value = S.date;
  if (!$('#menu').hidden && $('#menuAcct')) $('#menuAcct').innerHTML = accountFold(); // leaves the password box alone
  $('#goToday').hidden = isToday;
  $('#nextDay').disabled = isToday;
  document.querySelectorAll('.tab').forEach(b => { if (b.dataset.view===S.view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  const ta = $('#logText'); const draft = ta ? ta.value : ''; const hadFocus = document.activeElement===ta;
  let html = '';
  if (!S.user) { $('#main').innerHTML = authView(); document.querySelector('.tabs').hidden = true; document.querySelector('.hright').hidden = true; $('#menu').hidden = true; return; }
  document.querySelector('.tabs').hidden = false; document.querySelector('.hright').hidden = false;
  if (S.sync==='offline') html += `<div class="banner" style="margin-bottom:16px">You’re offline. Everything you log is saved on this device and syncs when you’re back online.</div>`;
  else if (S.sync==='error') html += `<div class="banner" style="margin-bottom:16px">${S.netBlocked ? esc(blockedMsg()) + ' Your logs are safe on this device and sync once it’s fixed.' : 'Couldn’t sync with the server. Your changes are safe on this device; retrying.'}</div>`;
  if (S.dbState==='connecting') html += `<div class="muted small" style="margin-bottom:12px">Loading your log…</div>`;
  if (!isToday && S.view!=='setup') html += `<div class="pastbar"><span>Viewing <b>${esc(fmtDate(S.date,{weekday:'long',day:'numeric',month:'short'}))}</b></span><span class="spacer"></span><button class="linkbtn" data-action="goToday">Back to today</button></div>`;
  html += S.view==='setup'&&S.setup?viewSetup():S.view==='gym'?viewGym():S.view==='trends'?viewTrends():S.view==='coach'||S.view==='health'?viewProfile():S.view==='profile'?viewProfile():viewToday();
  $('#main').innerHTML = html;
  const ta2 = $('#logText'); if (ta2) { ta2.value = draft; if (hadFocus) ta2.focus(); if (draft) foodSugg(); }
  document.querySelectorAll('.profForm').forEach(f => { f.onsubmit = onProfileSubmit; });
  autoStack();
  if (S.rev !== S.boardRev) { S.boardRev = S.rev; publishBoard(); pushState(); }
}
function onProfileSubmit(ev){
  ev.preventDefault();
  const v = id => $(id).value;
  const optNum = (x,max) => { const n=Number(x); return x!==''&&Number.isFinite(n)&&n>0 ? Math.min(n,max) : null; };
  if (v('#pf_weight') && num(v('#pf_weight'),300) && Math.abs(num(v('#pf_weight'),300)-(Number(prof().weight_kg)||0))>0.05) writeDay(localDate(), d => { d.weight_kg = num(v('#pf_weight'),300); });
  const birth = v('#pf_birth'), bf = optNum(v('#pf_bf'),60);
  if (birth && !(Calc.ageOn(birth, localDate())>=13)) { toast('Check your date of birth.'); return; }
  if (bf!==null && bf<3) { toast('Body fat should be between 3 and 60%.'); return; }
  const p = {...prof(), name:($('#pf_name')?.value||'').trim().slice(0,40), sex:v('#pf_sex'), birth, age:birth?Calc.ageOn(birth, localDate()):prof().age, height_cm:num(v('#pf_height'),250)||170, weight_kg:num(v('#pf_weight'),300)||70,
    body_fat:bf, maint_source:v('#pf_maint'), eat_back:$('#pf_eatback').checked,
    activity:v('#pf_act'), goal:v('#pf_goal'), goal_rate:Number(v('#pf_rate'))||0.5,
    calorie_override:optNum(v('#pf_kcal'),6000), protein_override:optNum(v('#pf_prot'),400), carbs_override:optNum(v('#pf_carbs'),900), fat_override:optNum(v('#pf_fat'),300), fiber_override:optNum(v('#pf_fibre'),120), water_override_ml:optNum(v('#pf_water'),8000), steps_goal:optNum(v('#pf_steps'),50000)||10000};
  saveProfile(p); toast('Profile saved. Targets updated.');
}
function setView(v){ if (S.user && S.profile && needsPw() && v!=='setup') { if (!S.setup) startSetup('password'); return; } S.view=v; S.status=''; S.statusErr=false; render(); window.scrollTo({top:0}); if (v==='trends') { loadBoard(); loadFeed(); } }

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-action],[data-view].tab'); if (!b) return;
  if (b.classList.contains('tab')) return setView(b.dataset.view);
  const a = b.dataset.action, day = getDay(S.date);
  if (/^(wk|routine)/.test(a)) { wkAction(a, b); return; }
  if (a==='musclePeriod') { S.musclePeriod = b.dataset.p; render(); return; }
  if (a==='feedDel') { feedDel(b.dataset.id); return; }
  if (a==='feedMore') { S.feedAll = true; render(); return; }
  if (a==='photoCompare') { photoCompare(); return; }
  if (a==='photoDel') { const path = b.dataset.path; if (!confirm('Delete this photo? This can’t be undone.')) return; SB.storage.from('progress').remove([path]).then(() => { S.photos = (S.photos||[]).filter(p=>p.path!==path); render(); }); return; }
  if (a==='delMeasure') { const id = b.dataset.id, m = (S.measures||[]).find(x=>x.date===id); if (!m) return; S.measures = S.measures.filter(x=>x!==m); render(); if (S.db) S.db.doc('measurements/'+id).delete().catch(()=>{}); toast('Deleted measurements', () => { S.measures = [...(S.measures||[]), m]; render(); S.db && S.db.doc('measurements/'+id).set(m); }); return; }
  switch (a) {
    case 'log': submitLog(); break;
    case 'stop': S.ctl?.abort(); break;
    case 'example': { const ta=$('#logText'); if (ta){ ta.value=b.dataset.text; ta.focus(); } break; }
    case 'pickPhoto': $('#photoInput').click(); break;
    case 'clearPhoto': clearPhoto(); render(); break;
    case 'goto': setView(b.dataset.view); break;
    case 'goToday': S.date=localDate(); S.status=''; render(); break;
    case 'theme': setTheme(b.dataset.t); break;
    case 'water': writeDay(S.date, d => d.water.push({id:uid(), ml:+b.dataset.ml, time:nowTime()})); break;
    case 'undoWater': { const last = day.water[day.water.length-1]; if (!last) break; writeDay(S.date, d=>d.water.pop()); toast(`Removed ${n0(last.ml)} ml`, () => writeDay(S.date, d=>d.water.push(last))); break; }
    case 'delFood': { const i = day.foods.findIndex(f=>f.id===b.dataset.id); if (i<0) break; const item=day.foods[i]; const date=S.date;
      writeDay(date, d => { d.foods = d.foods.filter(f=>f.id!==item.id); }); toast(`Deleted ${item.name}`, () => writeDay(date, d => d.foods.splice(i,0,item))); break; }
    case 'delEx': { const i = day.exercises.findIndex(f=>f.id===b.dataset.id); if (i<0) break; const item=day.exercises[i]; const date=S.date;
      writeDay(date, d => { d.exercises = d.exercises.filter(f=>f.id!==item.id); }); toast(`Deleted ${item.name}`, () => writeDay(date, d => d.exercises.splice(i,0,item))); break; }
    case 'editFood': openFoodEdit(b.dataset.id); break;
    case 'editEx': openExEdit(b.dataset.id); break;
    case 'editSport': openSportEdit(b.dataset.id); break;
    case 'addSport': openAddSport(); break;
    case 'ans': { const ns=b.dataset.ns, q=b.dataset.q, v=b.dataset.v;
      if (ns==='q') { const it=S.queue[0]; if (it) it.answers[q] = it.answers[q]===v ? undefined : v; }
      else if (ns.startsWith('setup.')) { const k=ns.slice(6); const o=(S.setup.answers[k] ||= {}); o[q] = o[q]===v ? undefined : v; }
      render(); break; }
    case 'qSubmit': case 'qSkip': { const it=S.queue[0]; if (!it) break;
      it.qa = a==='qSkip' ? [] : (it.questions||[]).filter(q=>it.answers[q.id]!==undefined&&it.answers[q.id]!=='').map(q=>({q:q.text, a:String(it.answers[q.id])}));
      it.submitted = true; runQueue(); break; }
    case 'qRetry': { const it=S.queue[0]; if (it) it.failed=false; runQueue(); break; }
    case 'qDiscard': S.queue.shift(); S.qStatus=''; render(); if (S.queue.length) runQueue(); break;
    case 'qSaveProfile': { const it=S.queue.shift(); saveSportProfile(it.key, it.name, it.questions||[], it.answers); toast(`Saved how you play ${it.name}`); render(); if (S.queue.length) runQueue(); break; }
    case 'qSkipProfile': { S.queue.shift(); render(); if (S.queue.length) runQueue(); break; }
    case 'updSport': { const k=b.dataset.key, sp=(prof().sports||{})[k]; if (!sp) break;
      S.queue.unshift({type:'profile', key:k, name:sp.name||sportName(k), questions:SPORT_Q[k] || (sp.answers||[]).map(x=>({id:x.id, text:x.q, type:'text'})), answers:Object.fromEntries((sp.answers||[]).map(x=>[x.id,x.a])), isNew:false});
      setView('today'); break; }
    case 'stillRight': { const k=b.dataset.key, p=prof(); const sp={...(p.sports||{})}; if (sp[k]) { sp[k]={...sp[k], updated:localDate()}; saveProfile({...p, sports:sp}); } break; }
    case 'rmSport': { const k=b.dataset.key, p=prof(); const sp={...(p.sports||{})}; const old=sp[k]; delete sp[k]; saveProfile({...p, sports:sp}); toast(`Removed ${old?.name||k}`, () => saveProfile({...prof(), sports:{...(prof().sports||{}), [k]:old}})); break; }
    case 'startSetup': startSetup(b.dataset.step); break;
    case 'setupNext': setupGo(1); break;
    case 'setupPassword': setupPassword(); break;
    case 'setupFinish': S.setup.step='done'; setupGo(1); break;
    case 'setupBack': setupGo(-1); break;
    case 'setupSkip': S.setup=null; S.view='today'; render(); break;
    case 'setupSport': { const k=b.dataset.key; const l=S.setup.sports; const i=l.indexOf(k); if (i>=0) l.splice(i,1); else l.push(k); render(); break; }
    case 'setupAddOther': { const v=($('#setupOther')?.value||'').trim(); if (!v) break; for (const part of v.split(',')) { const k=sportKey(part); if (k && !S.setup.sports.includes(k)) S.setup.sports.push(k); } render(); break; }
    case 'delSport': { const i=(day.sports||[]).findIndex(y=>y.id===b.dataset.id); if(i<0) break; const item=day.sports[i]; const date=S.date;
      writeDay(date, d => { d.sports=d.sports.filter(y=>y.id!==item.id); }); toast(`Deleted ${actTitle(item)}`, () => writeDay(date, d => { d.sports=d.sports||[]; d.sports.splice(i,0,item); })); break; }
    case 'gymPeriod': S.gymPeriod=b.dataset.p; render(); break;
    case 'pickEx': S.gymEx = S.gymEx===b.dataset.key ? null : b.dataset.key; render(); break;
    case 'allEx': S.allEx=!S.allEx; render(); break;
    case 'exportExcel': exportExcel(); break;
    case 'range': S.trendRange=+b.dataset.n; render(); break;
    case 'toggleStack': { const st=(prof().stack||[]).find(x=>x.id===b.dataset.id); if(!st) break;
      writeDay(S.date, d => { d.supplements = d.supplements||[]; const i=d.supplements.findIndex(x=>x.stack_id===st.id);
        if (i>=0) d.supplements.splice(i,1); else d.supplements.push({id:uid(), name:st.name, dose:st.dose, micros:{...st.micros}, stack_id:st.id, time:nowTime()}); }); break; }
    case 'addStack': { const x=(day.supplements||[]).find(y=>y.id===b.dataset.id); if(!x) break; const p=prof();
      if (findStack(x.name)) { toast(`${x.name} is already on your daily list`); break; }
      const st={id:uid(), name:x.name, dose:x.dose, micros:{...x.micros}, since:S.date};
      saveProfile({...p, stack:[...(p.stack||[]), st]});
      writeDay(S.date, d => { const y=(d.supplements||[]).find(z=>z.id===x.id); if (y) y.stack_id=st.id; });
      toast(`Added ${x.name} to your daily list`); break; }
    case 'delSupp': { const i=(day.supplements||[]).findIndex(y=>y.id===b.dataset.id); if(i<0) break; const item=day.supplements[i]; const date=S.date;
      writeDay(date, d => { d.supplements = d.supplements.filter(y=>y.id!==item.id); }); toast(`Deleted ${item.name}`, () => writeDay(date, d => { d.supplements=d.supplements||[]; d.supplements.splice(i,0,item); })); break; }
    case 'rmStack': { const p=prof(); const st=(p.stack||[]).find(x=>x.id===b.dataset.id); if(!st) break;
      saveProfile({...p, stack:p.stack.filter(x=>x.id!==st.id)}); toast(`Removed ${st.name} from your daily list`, () => saveProfile({...prof(), stack:[...(prof().stack||[]), st]})); break; }
    case 'pickReport': $('#reportInput').click(); break;
    case 'pickRep': S.repSel=b.dataset.id; S.repMarker=null; render(); break;
    case 'pickMarker': S.repMarker=b.dataset.key; render(); break;
    case 'applyReport': { const r=S.reports.find(x=>x.id===b.dataset.id); if(!r) break; saveProfile({...prof(), report_adjust:{...r.adjust, from:r.id, from_date:r.report_date}}); toast('Applied. Your targets now reflect this report.'); break; }
    case 'unapplyReport': { const p={...prof()}; delete p.report_adjust; saveProfile(p); toast('Removed the report changes from your targets.'); break; }
    case 'delReport': { const r=S.reports.find(x=>x.id===b.dataset.id); if(!r) break; S.reports=S.reports.filter(x=>x.id!==r.id); S.repSel=null; if (S.db) S.db.doc('reports/'+r.id).delete().catch(()=>{});
      if (prof().report_adjust?.from===r.id) { const p={...prof()}; delete p.report_adjust; saveProfile(p); }
      render(); toast(`Deleted the ${fmtDate(r.report_date,{day:'numeric',month:'short'})} report`, () => { S.reports=[r,...S.reports]; if (S.db) S.db.doc('reports/'+r.id).set(r); render(); }); break; }
    case 'review': runReview(); break;
    case 'toggleHide': { const k=b.dataset.key; if (S.hidden.has(k)) S.hidden.delete(k); else S.hidden.add(k); try { localStorage.setItem('fl:hidden', JSON.stringify([...S.hidden])); } catch {} render(); break; }
    case 'relog': { let f=null; for (const [,d] of S.days) { f=(d.foods||[]).find(y=>y.id===b.dataset.id); if (f) break; } if(!f) break;
      const copy={...structuredClone(f), id:uid(), time:nowTime(), meal:guessMeal()}; const date=S.date;
      writeDay(date, d=>d.foods.push(copy)); toast(`Logged ${f.name}`, () => writeDay(date, d => { d.foods=d.foods.filter(y=>y.id!==copy.id); })); break; }
    case 'suggFood': { const x = (S.fsugg||[])[+b.dataset.i]; if (!x) break; const f = x.f, date = S.date;
      const copy = {...structuredClone(f), id:uid(), time:nowTime(), meal:guessMeal()};
      // Take the typed part out of the box; anything typed before it stays.
      const ta = $('#logText'); if (ta) { const parts = ta.value.split(/([,;\n])/); parts.pop(); ta.value = parts.join('').replace(/[,;\s]+$/,''); ta.value += ta.value ? ', ' : ''; }
      writeDay(date, d=>d.foods.push(copy)); toast(`Logged ${f.name}`, () => writeDay(date, d => { d.foods=d.foods.filter(y=>y.id!==copy.id); }));
      if (ta) ta.focus(); break; }
    case 'resetGoal': { const p={...prof()}; p[b.dataset.key]=null; saveProfile(p); toast('Back to the suggested goal.'); break; }
    case 'rmFood': { const k=b.dataset.key; const f=(S.myFoods||{})[k]; if(!f) break; const m={...S.myFoods}; delete m[k]; S.myFoods=m; S.myFoodsVer++; if (S.db) S.db.doc('foods/'+k).delete().catch(()=>{}); render(); toast(`Removed ${f.name} from your food list`); break; }
    case 'importIndb': importIndb(); break;
    case 'authPassword': authPassword(); break;
    case 'authRequest': S.auth={step:'request', email:($('#authEmail')?.value||'').trim().toLowerCase(), msg:'', busy:false}; render(); setTimeout(()=>$('#reqEmail')?.focus(), 50); break;
    case 'accessRequest': accessRequest(); break;
    case 'accessCheck': accessCheck(false); break;
    case 'accessCancel': setClaim(null); clearTimeout(accessTimer); S.auth={step:'request', email:'', msg:'', busy:false}; render(); break;
    case 'setPassword': setPassword(); break;
    case 'authOAuth': authOAuth(b.dataset.p); break;
    case 'faceIdSignIn': authFaceId(); break;
    case 'faceIdSetup': setupFaceId(); break;
    case 'howto': openHowto(b.dataset.name||''); break;
    case 'qLocal': { const it = S.queue[0]; if (!it) break; const sim = $('#qSimilar')?.value;
      const est = sportFromText(it.entry, it.date, sportKey(it.name)) || (sim ? sportFromText(it.entry, it.date, sim) : null);
      if (!est) break; if (!sportFromText(it.entry, it.date, sportKey(it.name))) { est.res.title = it.name; est.res.assumptions = `Estimated like ${est.name.toLowerCase()}. ` + est.res.assumptions; }
      S.queue.shift(); saveActivity(it, est.res).then(() => { render(); if (S.queue.length) runQueue(); }); break; }
    case 'editSupp': openSuppEdit(b.dataset.id||''); break;
    case 'restAdd': addRest(+b.dataset.s); break;
    case 'restStop': stopRest(); break;
    case 'pushTest': pushTest(); break;
    case 'tempPw': tempPassword(b.dataset.id, b.dataset.name||'this member'); break;
    case 'mustChangeSave': mustChangeSave(); break;
    case 'forgotPw': S.auth={...S.auth, err:false, msg:'This app doesn’t send reset emails to members. Ask the owner to set a temporary password for you (they tap Password next to your name in People & approvals). Sign in with it and you’ll choose a new one. If you turned on Face ID or fingerprint, you can use that instead.'}; render(); break;
    case 'backupNow': exportData(); break;
    case 'backupLater': try { localStorage.setItem('mt:backup-later', String(Date.now())); } catch {} render(); break;
    case 'foodSearch': openFoodSearch(); break;
    case 'scan': openScanner(); break;
    case 'hsCreate': hsCreate(); break;
    case 'hsRevoke': hsRevoke(); break;
    case 'hsReload': S.hsync = undefined; render(); loadHealthSync(); break;
    case 'hsCopy': b.dataset.what==='key' ? copyText(S.hsKey||'', 'Key') : copyText(hsUrl(), 'Address'); break;
    case 'faceIdRemove': removePasskey(b.dataset.id); break;
    case 'faceIdLater': try { localStorage.setItem('mt:faceid-later:'+S.user.id, '1'); } catch {} render(); break;
    case 'recheckMember': if (S.pendingUser) startFor(S.pendingUser); break;
    case 'memberSet': setMember(b.dataset.id, b.dataset.s); break;
    case 'memberAdmin': setMemberAdmin(b.dataset.id, b.dataset.on==='1', b.dataset.name||'this member'); break;
    case 'reviewPeople': S.openFolds.add('s-people'); setView('profile'); loadMembers(); break;
    case 'authBack': S.auth={step:'email', email:S.auth.email, msg:'', busy:false}; render(); break;
    case 'signOut': if (confirm(S.db&&S.db.pendingCount() ? `Sign out? ${S.db.pendingCount()} change(s) haven’t synced yet and will be lost.` : 'Sign out on this device? Your data stays in your account.')) signOut(); break;
    case 'exportData': exportData(); break;
    case 'importData': $('#importInput').click(); break;
    case 'refreshUsage': refreshUsage(); break;
    case 'openDay': S.date=b.dataset.date; setView('today'); break;
  }
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.action==='dayComplete') { const on = el.checked; writeDay(S.date, d => { if (on) delete d.incomplete; else d.incomplete = true; }); }
  if (el.dataset && el.dataset.action==='stackAuto') saveProfile({...prof(), stack_auto:el.checked});
  if (el.dataset && el.dataset.action==='watchToggle') saveProfile({...prof(), watch_workouts:el.checked});
  if (el.dataset && el.dataset.action==='restToggle') { saveProfile({...prof(), rest_timer:el.checked}); if (!el.checked) stopRest(); }
  if (el.dataset && el.dataset.action==='restDefault') saveProfile({...prof(), rest_default:+el.value});
  if (el.dataset && el.dataset.action==='boardToggle') { boardLast = ''; saveProfile({...prof(), leaderboard:el.checked}); }
  if (el.dataset && el.dataset.action==='feedToggle') saveProfile({...prof(), share_workouts:el.checked});
  if (el.dataset && el.dataset.action==='pushToggle') pushToggle(el.dataset.k, el.checked, el);
});
document.addEventListener('toggle', ev => { const k = ev.target.dataset && ev.target.dataset.fold; if (!k) return;
  if (ev.target.open) S.openFolds.add(k); else S.openFolds.delete(k);
  try { localStorage.setItem('fl:folds', JSON.stringify([...S.openFolds])); } catch {} }, true);
document.addEventListener('input', ev => bindInput(ev.target));
// Measurements form and progress photo upload (Trends).
document.addEventListener('submit', ev => { if (ev.target.id!=='msform') return; ev.preventDefault();
  const date = $('#ms_date').value || localDate(), prev = (S.measures||[]).find(m=>m.date===date) || {date}; const m = {...prev, date}; let n = 0;
  ev.target.querySelectorAll('[data-ms]').forEach(el => { const v = num(el.value, 400); if (v>0) { m[el.dataset.ms] = Math.round(v*10)/10; n++; } });
  if (!n) { toast('Type at least one measurement.'); return; }
  S.measures = [...(S.measures||[]).filter(x=>x.date!==date), m]; render(); if (S.db) S.db.doc('measurements/'+date).set(m).catch(()=>{}); toast('Measurements saved'); }, true);
document.addEventListener('change', ev => { if (ev.target.id==='ph_file' && ev.target.files?.[0]) { const f = ev.target.files[0]; ev.target.value=''; addPhoto(f, $('#ph_pose')?.value||'front'); } });
// Live workout fields: kept as typed, saved on the device, no re-render (keeps the keyboard up).
document.addEventListener('input', ev => { const t = ev.target, w = S.workout; if (!w) return;
  if (t.dataset.wk) { const s = w.exercises[+t.dataset.ex]?.sets[+t.dataset.set]; if (s) { s[t.dataset.wk] = t.value.replace(',', '.'); wkSave(); } }
  else if (t.dataset.wkname!==undefined) { w.name = t.value.slice(0,40) || 'Workout'; wkSave(); } });
document.addEventListener('change', ev => { const t = ev.target, w = S.workout; if (!w) return;
  if (t.dataset.wkrest!==undefined) { const e = w.exercises[+t.dataset.wkrest]; if (e) { e.rest = t.value || null; wkSave(); } } });
document.addEventListener('change', ev => bindInput(ev.target));
function bindInput(el){
  if (el.id==='logText') { foodSugg(); return; }
  if (el.id==='exq') { S.exq = el.value; const r=$('#exres'); if (r) r.innerHTML = libResults(el.value); return; }
  const path = el.dataset && el.dataset.bind; if (!path) return;
  const v = el.type==='checkbox' ? el.checked : el.value;
  const [ns, ...rest] = path.split('.');
  if (ns==='q') { const it=S.queue[0]; if (it) it.answers[rest.join('.')] = v; return; }
  if (ns==='about') { S.setup.about[rest[0]] = v; return; }
  if (ns==='setup') { const k=rest[0]; (S.setup.answers[k] ||= {})[rest.slice(1).join('.')] = v; }
}
document.addEventListener('keydown', ev => {
  if (ev.key==='Enter' && ev.target.matches('tr.click')) ev.target.click();
  if (ev.key==='Enter' && (ev.metaKey||ev.ctrlKey) && ev.target.id==='logText') submitLog();
  if (ev.key==='Enter' && ev.target.id==='authEmail') { ev.preventDefault(); $('#authPass')?.focus(); }
  if (ev.key==='Enter' && ev.target.id==='authPass') { ev.preventDefault(); authPassword(); }
  if (ev.key==='Enter' && ev.target.id==='newPass') { ev.preventDefault(); setPassword(); }
  if (ev.key==='Enter' && ev.target.id==='reqEmail') { ev.preventDefault(); accessRequest(); }
});
$('#reportInput').addEventListener('change', ev => { const fs=[...(ev.target.files||[])]; ev.target.value=''; onReportFiles(fs); });
$('#photoInput').addEventListener('change', ev => { const f=ev.target.files?.[0]; ev.target.value=''; if(!f) return; clearPhoto(); S.photo=f; S.photoUrl=URL.createObjectURL(f); S.status=''; render(); });
$('#indbInput').addEventListener('change', ev => { const f=ev.target.files?.[0]; ev.target.value=''; if (f) importIndb(f); });
$('#importInput').addEventListener('change', ev => { const f=ev.target.files?.[0]; ev.target.value=''; if (f) importData(f); });
$('#prevDay').onclick = () => { S.date=addDays(S.date,-1); S.status=''; render(); };
$('#nextDay').onclick = () => { if (S.date<localDate()) { S.date=addDays(S.date,1); S.status=''; render(); } };
$('#goToday').onclick = () => { S.date=localDate(); render(); };
$('#datePick').onchange = ev => { const v=ev.target.value; if (v && v<=localDate()) { S.date=v; S.status=''; render(); } };
function themePref(){ try { const t=localStorage.getItem('mt:theme'); return t==='light'||t==='dark' ? t : 'auto'; } catch { return 'auto'; } }
function setTheme(t){
  try { if (t==='auto') localStorage.removeItem('mt:theme'); else localStorage.setItem('mt:theme', t); } catch {}
  if (t==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  syncThemeColor(); if (!$('#menu').hidden) $('#menuBody').innerHTML = menuHtml(); render();
}
function syncThemeColor(){ const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(); const m=document.querySelector('meta[name="theme-color"]'); if (m && bg) m.content = bg; }
syncThemeColor();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor); } catch {}
function menuHtml(){
  const th = themePref();
  return `<div class="menu-sec"><div class="menu-l">Appearance</div>
      <div class="seg" role="group" aria-label="Theme">${[['light','Light'],['dark','Dark'],['auto','Match phone']].map(([k,l])=>`<button data-action="theme" data-t="${k}" aria-pressed="${th===k}">${l}</button>`).join('')}</div></div>
    <div class="menu-sec"><div class="menu-l">Account</div><div id="menuAcct">${accountFold()}</div></div>
    <div class="menu-sec"><div class="menu-l">${bioName()} sign-in</div><div id="menuPk">${passkeyMenu()}</div></div>
    <div class="menu-sec"><div class="menu-l">Password &amp; security</div>${securityFold()}</div>`;
}
function setMenu(open){
  const m=$('#menu'); m.hidden=!open; $('#menuBtn').setAttribute('aria-expanded', String(open));
  if (open) { $('#menuBody').innerHTML = menuHtml(); if (!S.usage && S.sample) refreshUsage(); loadPasskeys(); }
}
$('#menuBtn').onclick = () => setMenu($('#menu').hidden);
$('#menuClose').onclick = () => setMenu(false);
// A tap outside closes the menu and nothing else: the same tap must not also press what's underneath.
let swallowClick = false, swallowT;
document.addEventListener('pointerdown', ev => { if (!$('#menu').hidden && !ev.target.closest('#menu,#menuBtn')) {
  setMenu(false); swallowClick = true; clearTimeout(swallowT); swallowT = setTimeout(() => { swallowClick = false; }, 600); } }, true);
document.addEventListener('click', ev => { if (swallowClick) { swallowClick = false; ev.preventDefault(); ev.stopPropagation(); } }, true);
document.addEventListener('keydown', ev => { if (ev.key==='Escape' && !$('#menu').hidden) setMenu(false); });

// chart tooltips
const tip = $('#tip');
document.addEventListener('pointermove', ev => {
  const t = ev.target.closest && ev.target.closest('[data-tip]');
  if (!t) { tip.hidden=true; return; }
  tip.textContent = t.getAttribute('data-tip'); tip.hidden=false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(window.innerWidth-w-8, Math.max(8, ev.clientX - w/2)) + 'px';
  tip.style.top = Math.max(8, ev.clientY - h - 14) + 'px';
});
document.addEventListener('pointerleave', () => { tip.hidden=true; });

let lastW = window.innerWidth, rT;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (Math.abs(window.innerWidth-lastW)>40 && S.view!=='today' && S.view!=='profile') { lastW=window.innerWidth; render(); } }, 250); });

/* ---------- measured maintenance, account, sign-in ---------- */
function maintenancePanel(){
  const T = computeTargets(prof(), localDate()), ad = T.adaptive;
  if (ad.ready) return `<section class="panel"><div class="panel-head"><h3>Your real maintenance</h3><span class="pill ${ad.confidence==='high'?'good':'warn'}">${ad.confidence} confidence</span></div>
    <div class="kv" style="max-width:460px"><span>Measured from your logs</span><b>${n0(ad.tdee)} kcal/day</b><span>Formula estimate</span><b>${n0(T.tdee + ad.avgExercise)} kcal/day</b><span>Average eaten</span><b>${n0(ad.avgIntake)} kcal</b><span>Weight trend</span><b>${ad.kgPerWeek>0?'+':''}${n1(ad.kgPerWeek)} kg/week</b></div>
    <div class="muted small">Over the last 28 days you ate ${n0(ad.avgIntake)} kcal a day on ${ad.logged} fully logged days, and ${ad.weighIns} weigh-ins show your weight moving ${n1(ad.kgPerWeek)} kg a week. Each kg is about 7,700 kcal, so you really burn about ${n0(ad.tdee)} kcal a day${ad.avgExercise>5?`, including ${n0(ad.avgExercise)} a day of training`:''}. ${prof().maint_source==='formula'?'Your targets still use the formula; change that in Profile.':'Your targets use this number.'}</div></section>`;
  return `<section class="panel"><div class="panel-head"><h3>Your real maintenance</h3><span class="pill warn">learning</span></div>
    <div class="small">Formulas can be 10% or more off for any one person. After a few weeks of logging food and weighing in, the app measures what you actually burn from how your weight responds, and sets your targets from that.</div>
    <div class="muted small">Still needed: ${esc(ad.need.join(', '))}.</div></section>`;
}
function exportData(){
  saveProfile({...prof(), last_backup:localDate()});
  const blob = new Blob([JSON.stringify({app:'fuel-lift', v:1, exported:new Date().toISOString(), docs:S.db.dump()}, null, 1)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `maxxtempo-backup-${localDate()}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}
async function importData(file){
  let j; try { j = JSON.parse(await file.text()); } catch { toast('That file isn’t a MaxxTempo backup.'); return; }
  // Accepts our own backups ({docs:{collection:{id:data}}}) or a plain {collection:{id:data}} / {collection:[{id,...}]} export.
  const docs = j && j.docs ? j.docs : j;
  const OK = ['days','profile','foods','reports','plans','reviews','foodlib'];
  let n = 0;
  if (!docs || typeof docs!=='object') { toast('That file isn’t a MaxxTempo backup.'); return; }
  if (!confirm('Add everything in this backup to your account? Days with the same date are replaced.')) return;
  for (const c of OK) {
    const coll = docs[c]; if (!coll) continue;
    const entries = Array.isArray(coll) ? coll.map(d=>[d.id||d.date, d]) : Object.entries(coll);
    for (const [id, data] of entries) { if (!id || !data) continue; await S.db.doc(c+'/'+id).set(data); n++; }
  }
  toast(`Restored ${n} item${n===1?'':'s'}.`);
}

let SB = null;
function waitingView(){
  const u = S.pendingUser, m = S.memberInfo||{}, nm = (u.user_metadata?.full_name || u.user_metadata?.name || '').split(' ')[0];
  // Often it's a second, mistyped email the phone saved and keeps filling in: say which one, and how out.
  if (m.status==='declined') return `<section class="panel setup"><h2>This email isn’t approved</h2>
    <p>You signed in as <b>${esc(u.email||'this account')}</b>, which isn’t approved to use MaxxTempo.</p>
    <p class="muted">Have another email that is? Sign out and sign in with that one. If your phone keeps filling in this email, pick the other one from its suggestions or type it.</p>
    <div class="row"><span class="spacer"></span><button class="btn" data-action="signOut">Sign out and use another email</button></div></section>`;
  return `<section class="panel setup"><h2>${nm?`Thanks, ${esc(nm)}!`:'Almost in'}</h2>
    <p>${m.status==='unknown' ? 'Couldn’t check your access. Check your connection and try again.' : `Your request to join has been sent. You’ll be let in as soon as the owner approves <b>${esc(u.email||'your account')}</b>. After that you sign in as normal, no approval needed again.`}</p>
    <div class="row"><button class="btn ghost" data-action="signOut">Sign out</button><span class="spacer"></span><button class="btn" data-action="recheckMember">Check again</button></div></section>`;
}
function authView(){
  if (S.pendingUser) return waitingView();
  if (S.mustChange) return `<section class="panel auth" aria-label="Choose a new password"><h2>Choose a new password</h2>
    <p class="muted">You signed in with a temporary password from the owner. Pick your own now; the temporary one stops working.</p>
    <label class="field full">New password<input id="mcPass" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"></label>
    <div class="row"><span class="spacer"></span><button class="btn" data-action="mustChangeSave" ${S.mcBusy?'disabled':''}>${S.mcBusy?'Saving…':'Save and continue'}</button></div>
    ${S.mcMsg?`<div class="status err">${esc(S.mcMsg)}</div>`:''}</section>`;
  const a = S.auth, cfgOk = window.FL_CONFIG && /^https:\/\//.test(FL_CONFIG.SUPABASE_URL||'') && FL_CONFIG.SUPABASE_ANON_KEY && !/YOUR_/.test(FL_CONFIG.SUPABASE_ANON_KEY);
  if (!cfgOk) return `<section class="panel setup"><h2>Almost there</h2><p>This copy of MaxxTempo isn’t connected to a database yet. Put your Supabase project URL and anon key in <b>config.js</b>, following SETUP.md.</p></section>`;
  if (a.step==='request') return `<section class="panel setup"><h2>Request access</h2>
    <p class="muted">Type your email. The owner gets your request, and as soon as they approve it this phone signs you in. Then you add your details and choose a password.</p>
    <label class="field">Email<input id="reqEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(a.email)}"></label>
    <div class="row"><button class="btn ghost" data-action="authBack">Back to sign in</button><span class="spacer"></span><button class="btn" data-action="accessRequest" ${a.busy?'disabled':''}>${a.busy?'Sending…':'Request access'}</button></div>
    <div class="status${a.err?' err':''}">${esc(a.msg||'')}</div></section>`;
  if (a.step==='waiting') return `<section class="panel setup"><h2>Waiting for approval</h2>
    <p>Your request for <b>${esc(a.email)}</b> has been sent to the owner. Keep this page open, or come back to MaxxTempo on this phone later: you’ll be signed in as soon as they approve it.</p>
    <div class="row"><button class="btn ghost" data-action="accessCancel">Use another email</button><span class="spacer"></span><button class="btn" data-action="accessCheck" ${a.busy?'disabled':''}>${a.busy?'Checking…':'Check now'}</button></div>
    <div class="status${a.err?' err':''}">${esc(a.msg||'')}</div></section>`;
  return `<section class="panel setup"><h2>Sign in</h2>
    <p class="muted">Your food, training and health logs are private to you and sync across your phone and laptop.</p>
    ${window.PublicKeyCredential||FL_CONFIG.GOOGLE_SIGN_IN ? `<div class="authalt">
      ${window.PublicKeyCredential?`<button class="btn provider face" data-action="faceIdSignIn" ${a.busy?'disabled':''}><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1.2 3.6 1.2 5 0"/></svg><span>Sign in with ${bioName()}</span></button>`:''}
      ${FL_CONFIG.GOOGLE_SIGN_IN?`<button class="btn provider" data-action="authOAuth" data-p="google" ${a.busy?'disabled':''}><svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"/></svg><span>Continue with Google</span></button>`:''}
    </div><div class="ordiv"><span>or use email</span></div>`:''}
    <label class="field">Email<input id="authEmail" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(a.email)}"></label>
    <label class="field">Password<input id="authPass" type="password" autocomplete="current-password" placeholder="At least 8 characters"></label>
    <div class="row"><button class="linkbtn" data-action="forgotPw" style="padding-left:0">Forgot password?</button><span class="spacer"></span><button class="btn" data-action="authPassword" ${a.busy?'disabled':''}>${a.busy?'Working…':'Sign in'}</button></div>
    <div class="ordiv"><span>new here?</span></div>
    <button class="btn ghost" data-action="authRequest">Request access with your email</button>
    <div class="status${a.err?' err':''}">${esc(a.msg||'')}</div></section>`;
}
const redirectTo = () => location.origin + location.pathname;
// Supabase's error, in plain words; the fallback when it's something else.
function authErrMsg(error, fallback){
  const m = `${error?.code||''} ${error?.message||''}`;
  if (/already.?(registered|exists)/i.test(m)) return 'That email already has an account. Sign in with your password or Face ID. Never set a password (you used an email link)? Ask the owner for a temporary password.';
  if (/not.?authori[sz]ed|sending|smtp|confirmation email|magic link email/i.test(m)) return 'This app can’t send emails to new addresses yet. Create an account with a password instead, then ask the owner to approve you.';
  if (/rate|too many/i.test(m)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/weak|pwned|password/i.test(m)) return error.message;
  if (/invalid.*email|email.*invalid/i.test(m)) return 'That email address doesn’t look right. Check it and try again.';
  return fallback + (error?.message ? ` (${error.message})` : '');
}
async function mustChangeSave(){
  const password = $('#mcPass')?.value||'';
  if (password.length<8) { S.mcMsg='Choose a password of at least 8 characters.'; render(); return; }
  S.mcBusy=true; S.mcMsg=''; render();
  if (await pwnedPassword(password)) { S.mcBusy=false; S.mcMsg=PWNED_MSG; render(); return; }
  const { data, error } = await SB.auth.updateUser({ password, data:{ must_change_password:false } });
  S.mcBusy=false;
  if (error) { S.mcMsg = authErrMsg(error, 'Couldn’t save the password. Try again.'); render(); return; }
  S.mustChange = null; toast('Password saved. Use it from now on.'); startFor(data.user);
}
const authCreds = () => ({ email:($('#authEmail')?.value||'').trim().toLowerCase(), password:$('#authPass')?.value||'' });
function authCheck(email, password, minLen){
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'Enter your email address.';
  if (password.length<minLen) return minLen>1 ? `Choose a password of at least ${minLen} characters.` : 'Enter your password.';
}
// Has this password appeared in a known data breach? Only the first 5 characters
// of its SHA-1 hash leave the device (k-anonymity), and if the check can't run
// the password is allowed rather than blocking sign-up.
async function pwnedPassword(password){
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch('https://api.pwnedpasswords.com/range/' + hex.slice(0,5), { signal:ctl.signal, headers:{ 'Add-Padding':'true' }, referrerPolicy:'no-referrer' });
    clearTimeout(t); if (!res.ok) return false;
    return (await res.text()).split('\n').some(l => { const [suf, n] = l.trim().split(':'); return suf === hex.slice(5) && Number(n) > 0; });
  } catch { return false; }
}
const PWNED_MSG = 'That password has shown up in a data breach, so it’s easy to guess. Choose a different one.';
/* Since Feb 2026 Jio, Airtel and ACT block *.supabase.co by DNS in India, so a request
   that never gets an answer may be the network, not the person. Check with a plain
   request (no-cors: it only fails if the server can't be reached at all). */
async function serverReachable(){
  if (!navigator.onLine) return true;   // just offline: the usual message covers it
  try { const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
    await fetch(FL_CONFIG.API_URL + '/auth/v1/health', {mode:'no-cors', cache:'no-store', signal:c.signal}); clearTimeout(t); return true; }
  catch { return false; }
}
const blockedMsg = () => /iPhone|iPad/.test(navigator.userAgent)
  ? 'Your network is blocking MaxxTempo’s server (Jio, Airtel and ACT do this in India). Fix: install Cloudflare’s free “1.1.1.1” app and turn it on, or use a different Wi-Fi. Then try again.'
  : 'Your network is blocking MaxxTempo’s server (Jio, Airtel and ACT do this in India). Fix: open Settings → Network & internet (Samsung: Connections → More connection settings) → Private DNS → Private DNS provider hostname → type dns.google → Save. Then try again.';
async function netFailMsg(fallback){ return (await serverReachable()) ? fallback : blockedMsg(); }
async function authPassword(){
  const { email, password } = authCreds(), bad = authCheck(email, password, 1);
  if (bad) { S.auth={...S.auth, email, msg:bad, err:true}; render(); return; }
  S.auth={step:'email', email, busy:true, msg:''}; render();
  const { error } = await SB.auth.signInWithPassword({ email, password });
  if (error) { S.auth={step:'email', email, busy:false, err:true, msg:
    /confirm/i.test(error.message) ? 'Confirm your email first: tap the link we sent you, then sign in.' :
    /invalid/i.test(error.message) ? `Wrong password for ${email}, or that email has no account. Check the email your phone filled in. Forgot your password? Ask the owner for a temporary one.` :
    await netFailMsg(`Couldn’t sign in. Check your connection and try again. (${error.message||error.name||'no answer'})`) }; render(); }
}
/* ---------- joining without email (supabase/functions/access) ----------
   A new person types their email; the owner approves; this phone is then signed in
   with the private claim key it got when asking. */
const CLAIM_KEY = 'mt:claim';
const getClaim = () => { try { return JSON.parse(localStorage.getItem(CLAIM_KEY)||'null'); } catch { return null; } };
const setClaim = c => { try { c ? localStorage.setItem(CLAIM_KEY, JSON.stringify(c)) : localStorage.removeItem(CLAIM_KEY); } catch {} };
const HAS_ACCOUNT = 'That email already has an account. Sign in with your password or Face ID. Forgot your password? Ask the owner for a temporary one.';
async function accessRequest(){
  const email = ($('#reqEmail')?.value||'').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { S.auth={...S.auth, email, err:true, msg:'Enter your email address.'}; render(); return; }
  S.auth={step:'request', email, busy:true, msg:''}; render();
  let r;
  try { r = await fnCall('access', 'request', {email}); }
  catch (e) { if (!['rate_limited','bad_email'].includes(e?.code) && !(await serverReachable())) { S.auth={step:'request', email, busy:false, err:true, msg:blockedMsg()}; render(); return; }
    S.auth={step:'request', email, busy:false, err:true, msg: e?.code==='rate_limited' ? 'Lots of requests right now. Try again in an hour.' : e?.code==='offline' ? 'You’re offline. Connect to the internet and try again.' : e?.code==='bad_email' ? 'That email address doesn’t look right.' : 'Couldn’t send the request. Try again.'}; render(); return; }
  if (r.state==='has_account') { S.auth={step:'email', email, busy:false, err:true, msg:HAS_ACCOUNT}; render(); return; }
  if (r.state==='requested_elsewhere') { S.auth={step:'request', email, busy:false, err:true, msg:'This email already has a request waiting on another phone. Finish there, or ask the owner to sort it out.'}; render(); return; }
  if (r.state==='declined') { S.auth={step:'email', email, busy:false, err:true, msg:'This email wasn’t approved. Ask the owner if that’s a mistake.'}; render(); return; }
  setClaim({email, key:r.key, at:Date.now()}); S.auth={step:'waiting', email, busy:false, msg:''}; render();
  if (r.state==='approved') accessCheck(true); else pollAccess();
}
let accessTimer = null;
function pollAccess(){
  clearTimeout(accessTimer);
  accessTimer = setTimeout(async () => { if (S.auth.step!=='waiting' || S.user) return; if (document.visibilityState==='visible') await accessCheck(true); pollAccess(); }, 15000);
}
async function accessCheck(quiet){
  const c = getClaim(); if (!c) { S.auth={step:'request', email:S.auth.email||'', msg:'', busy:false}; render(); return; }
  if (!quiet) { S.auth={...S.auth, busy:true, err:false, msg:''}; render(); }
  let r;
  try { r = await fnCall('access', 'status', {email:c.email, key:c.key}); }
  catch (e) { S.auth={step:'waiting', email:c.email, busy:false, err:!quiet, msg: quiet ? '' : e?.code==='offline' ? 'You’re offline. Connect to the internet and tap Check now.' : 'Couldn’t check. Try again in a moment.'}; render(); return; }
  if (r.state==='approved' && r.token_hash) {
    setClaim(null); clearTimeout(accessTimer);
    const { error } = await SB.auth.verifyOtp({ token_hash:r.token_hash, type:'magiclink' });
    S.auth = error ? {step:'request', email:c.email, busy:false, err:true, msg:'You were approved, but signing in didn’t finish. Request access again with the same email; it goes straight through.'} : {step:'email', email:'', msg:'', busy:false};
    render(); return;
  }
  if (r.state==='declined') { setClaim(null); S.auth={step:'email', email:c.email, busy:false, err:true, msg:'The owner didn’t approve this email.'}; }
  else if (r.state==='expired') { setClaim(null); S.auth={step:'request', email:c.email, busy:false, err:true, msg:'This request expired or was replaced by a newer one. Request access again.'}; }
  else S.auth={step:'waiting', email:c.email, busy:false, err:false, msg: quiet ? '' : 'Not approved yet. You’ll be signed in automatically once it is.'};
  render();
}
async function setPassword(){
  const password = $('#newPass')?.value||'';
  if (password.length<8) { toast('Choose a password of at least 8 characters.'); return; }
  if (await pwnedPassword(password)) { toast(PWNED_MSG); return; }
  const { error } = await SB.auth.updateUser({ password });
  toast(error ? 'Couldn’t set the password: '+error.message : 'Password set. Use it to sign in on any device, including the home-screen app.');
  if (!error && $('#newPass')) $('#newPass').value='';
}
async function authOAuth(provider){
  S.auth={...S.auth, busy:true, err:false, msg:''}; render();
  const { error } = await SB.auth.signInWithOAuth({ provider, options:{ redirectTo:redirectTo() } });
  if (error) { S.auth={...S.auth, busy:false, err:true, msg:'Couldn’t open Google sign-in. Try again, or use email.'}; render(); }
}
/* ---------- Face ID / Touch ID sign-in (passkeys, see supabase/functions/passkey) ---------- */
const bioName = () => /iPhone|iPad/.test(navigator.userAgent) ? 'Face ID' : /Macintosh/.test(navigator.userAgent) ? 'Touch ID' : 'Face ID or fingerprint';
const deviceName = () => { const u = navigator.userAgent; return /iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android phone':/Macintosh/.test(u)?'Mac':/Windows/.test(u)?'Windows PC':'This device'; };
async function webauthnLib(){
  if (window.SimpleWebAuthnBrowser) return window.SimpleWebAuthnBrowser;
  await loadScript(LIBS.webauthn).catch(() => { throw {code:'offline'}; });
  return window.SimpleWebAuthnBrowser;
}
const passkeyCall = (action, body) => fnCall('passkey', action, body);
async function fnCall(fn, action, body = {}){
  const cfg = FL_CONFIG; let token = cfg.SUPABASE_ANON_KEY;
  const { data:{ session } } = await SB.auth.getSession(); if (session) token = session.access_token;
  let res; try { res = await fetch(cfg.API_URL + '/functions/v1/' + fn, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:cfg.SUPABASE_ANON_KEY, Authorization:'Bearer ' + token }, body:JSON.stringify({ action, ...body }) }); }
  catch { throw { code:'offline' }; }
  let out = null; try { out = await res.json(); } catch {}
  if (!res.ok || !out || !out.ok) throw { code:(out && out.code) || 'unavailable' };
  return out;
}
async function authFaceId(){
  S.auth = {...S.auth, busy:true, err:false, msg:''}; render();
  try {
    const lib = await webauthnLib();
    const o = await passkeyCall('login-options');
    const response = await lib.startAuthentication({ optionsJSON:o.options });
    const v = await passkeyCall('login-verify', { challengeId:o.challengeId, response });
    const { error } = await SB.auth.verifyOtp({ token_hash:v.token_hash, type:'magiclink' });
    if (error) throw { code:'server_error' };
    S.auth = {step:'email', email:'', msg:'', busy:false};
  } catch (e) {
    const n = e?.name || e?.code, b = bioName();
    S.auth = {...S.auth, busy:false, err:true, msg:
      n==='NotAllowedError' || n==='AbortError' ? `${b} was cancelled, or ${b} isn’t set up for MaxxTempo on this device yet. Sign in with email or Google, then turn it on in ⚙︎ Settings.` :
      n==='unknown_passkey' ? `That ${b} sign-in was removed. Sign in with email or Google, then set it up again in ⚙︎ Settings.` :
      n==='not_approved' ? 'Your account is waiting for the owner’s approval.' :
      n==='offline' ? 'You’re offline. Connect to the internet and try again.' : 'Couldn’t sign in. Try again, or use email.'};
    if (!/NotAllowedError|AbortError|unknown_passkey|not_approved/.test(n||'')) S.auth.msg = await netFailMsg(S.auth.msg);
  }
  render();
}
/* ---------- Automatic Apple Health sync (iPhone Shortcut → supabase/functions/health-sync) ---------- */
const hsUrl = () => FL_CONFIG.API_URL + '/functions/v1/health-sync';
async function loadHealthSync(){
  try { S.hsync = await fnCall('health-sync', 'status'); } catch { S.hsync = S.hsync || null; }
  render();
}
async function hsCreate(){
  if (S.hsync?.connected && !confirm('Make a new sync key? The Shortcut will need the new key; the old one stops working.')) return;
  S.hsBusy = true; render();
  try { const r = await fnCall('health-sync', 'create-key'); S.hsKey = r.key; S.hsync = {connected:true, last_sync_at:null}; S.openFolds.add('hs-steps'); }
  catch (e) { toast(e.code==='offline' ? 'You’re offline. Try again when connected.' : 'Couldn’t create a sync key. Try again.'); }
  S.hsBusy = false; render();
}
async function hsRevoke(){
  if (!confirm('Turn off automatic sync? The Shortcut stops working until you make a new key. Numbers already synced stay.')) return;
  try { await fnCall('health-sync', 'revoke'); S.hsync = {connected:false}; S.hsKey = null; toast('Automatic sync is off.'); }
  catch { toast('Couldn’t turn it off. Try again.'); }
  render();
}
async function copyText(text, what){
  try { await navigator.clipboard.writeText(text); toast(`${what} copied.`); }
  catch { toast(`Couldn’t copy. Press and hold the ${what.toLowerCase()} to copy it.`); }
}
function healthSyncHtml(){
  const H = S.hsync, key = S.hsKey;
  const when = t => { if (!t) return 'not yet'; const d = new Date(t); return (localDate(d)===localDate() ? 'today' : fmtDate(localDate(d),{day:'numeric',month:'short'})) + ' at ' + d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); };
  const state = H===undefined ? '<div class="muted small">Checking…</div>'
    : H===null ? '<div class="muted small">Couldn’t check the sync status. <button class="linkbtn" data-action="hsReload">Try again</button></div>'
    : key ? `<div class="hskey"><div class="small"><b>Your sync key</b>. Shown only now: copy it into the Shortcut (step 6). Keep it private; anyone with it can add steps and sleep to your log.</div>
        <code class="keybox">${esc(key)}</code><div class="row"><button class="btn sm" data-action="hsCopy" data-what="key">Copy key</button><button class="btn sm ghost" data-action="hsCopy" data-what="address">Copy address</button></div>
        <div class="muted small">Address: <code>${esc(hsUrl())}</code></div></div>`
    : H.connected ? `<div class="row"><span class="pill good">On</span><span class="small">Last sync: ${esc(when(H.last_sync_at))}</span></div>
        <div class="row"><button class="btn sm ghost" data-action="hsCopy" data-what="address">Copy address</button><button class="btn sm ghost" data-action="hsCreate" ${S.hsBusy?'disabled':''}>New key</button><button class="btn sm ghost" data-action="hsRevoke">Turn off</button></div>`
    : `<button class="btn sm" data-action="hsCreate" ${S.hsBusy?'disabled':''}>${S.hsBusy?'Creating…':'Set up automatic sync'}</button>`;
  const steps = `<ol class="tips hsteps">
      <li><b>Garmin?</b> In Garmin Connect: More → Settings → Connected Apps → Apple Health, and allow steps, active calories and sleep. (Apple Watch: nothing to do.)</li>
      <li>Open the <b>Shortcuts</b> app → <b>+</b> and name it “MaxxTempo sync”.</li>
      <li>Add <b>Find Health Samples</b>: Type <i>Steps</i>, Start Date <i>is today</i>, Group By <i>Day</i>. Then add <b>Calculate Statistics</b>: <i>Sum</i>.</li>
      <li>Add <b>Find Health Samples</b>: Type <i>Active Energy</i>, Start Date <i>is today</i>, Group By <i>Day</i>. Then <b>Calculate Statistics</b>: <i>Sum</i>.</li>
      <li>Add <b>Find Health Samples</b>: Type <i>Sleep Analysis</i>, End Date <i>is today</i>, Value <i>is not In Bed</i>, Value <i>is not Awake</i>. Then <b>Get Details of Health Samples</b>: <i>Duration</i>, then <b>Calculate Statistics</b>: <i>Sum</i>.</li>
      <li>Add <b>Get Contents of URL</b> with the address above. Tap the arrow: Method <i>POST</i>, Request Body <i>JSON</i>, and add four <i>Text</i> fields: <code>key</code> = your sync key, <code>steps</code> = the first Statistics, <code>active_kcal</code> = the second, <code>sleep</code> = the third.</li>
      <li>Tap ▶ to test. It answers “MaxxTempo: saved … steps …”, and Today fills in.</li>
      <li>Make it automatic: <b>Automation</b> tab → <b>+</b> → <i>Time of Day</i>, 11:45 pm, Daily → <i>Run Immediately</i> → pick “MaxxTempo sync”. Add another at 9 am to see last night’s sleep in the morning.</li>
    </ol>
    <div class="muted small">Steps look about double what the Health app shows? In step 3, add the filter Source <i>is</i> your Apple Watch. Synced numbers replace typed ones for that day.</div>`;
  return `<div class="hsync"><div class="nm">Automatic sync from Apple Health <span class="tag">iPhone</span></div>
    <div class="muted small">An iPhone Shortcut sends your steps, active calories and sleep every night, including Garmin data once Garmin Connect shares to Apple Health.</div>
    ${state}
    ${fold('hs-steps', 'Set up the Shortcut (5 minutes, once)', '', steps, 'inner')}</div>`;
}
async function loadPasskeys(){
  try { S.passkeys = (await passkeyCall('list')).passkeys; } catch { if (!S.passkeys) S.passkeys = null; }
  render(); if (!$('#menu').hidden) $('#menuBody').innerHTML = menuHtml();
}
async function setupFaceId(){
  S.pkBusy = true; render(); if (!$('#menu').hidden) $('#menuBody').innerHTML = menuHtml();
  const b = bioName();
  try {
    const lib = await webauthnLib();
    const o = await passkeyCall('register-options');
    const response = await lib.startRegistration({ optionsJSON:o.options });
    await passkeyCall('register-verify', { challengeId:o.challengeId, response, device:deviceName() });
    toast(`${b} is on. Next time, tap “Sign in with ${b}”.`);
  } catch (e) {
    const n = e?.name || e?.code;
    if (n==='InvalidStateError' || n==='already_registered') toast(`${b} is already set up on this device.`);
    else if (n!=='NotAllowedError' && n!=='AbortError') toast(n==='offline' ? 'You’re offline. Try again when you’re connected.' : `Couldn’t set up ${b}. Try again.`);
  } finally { S.pkBusy = false; await loadPasskeys(); }
}
async function removePasskey(id){
  const k = (S.passkeys||[]).find(x=>x.id===id); if (!k) return;
  if (!confirm(`Remove ${bioName()} sign-in for ${k.device_name||'this device'}? You can set it up again any time.`)) return;
  try { await passkeyCall('delete', { id }); toast('Removed.'); } catch { toast('Couldn’t remove it. Try again.'); }
  loadPasskeys();
}
function passkeyMenu(){
  if (!window.PublicKeyCredential) return '<div class="muted small">This browser can’t use Face ID or fingerprint sign-in.</div>';
  const list = S.passkeys, b = bioName();
  return `<div class="muted small">Sign in with ${b} instead of your password. Works on every device where your passkeys sync (iCloud Keychain or Google Password Manager).</div>
    ${list && list.length ? list.map(k=>`<div class="item"><div><div class="nm">${esc(k.device_name||'Passkey')}</div><div class="sub">added ${esc(fmtDate(k.created_at.slice(0,10),{day:'numeric',month:'short'}))}${k.last_used_at?` · last used ${esc(fmtDate(k.last_used_at.slice(0,10),{day:'numeric',month:'short'}))}`:''}</div></div><span></span><div class="acts"><button data-action="faceIdRemove" data-id="${esc(k.id)}">Remove</button></div></div>`).join('') : ''}
    <div class="row"><button class="btn sm" data-action="faceIdSetup" ${S.pkBusy?'disabled':''}>${S.pkBusy?'Waiting for '+b+'…':list&&list.length?`Add this device`:`Turn on ${b}`}</button></div>`;
}

/* ---------- weekly leaderboard (table "leaderboard" in schema.sql) ---------- */
// Goal each week (Mon-Sun): 3+ days with gym or sport, protein at your own target on average,
// your own daily step goal and about 2,000 kcal burned by moving (ACSM's upper weekly
// guideline for activity), both counted for the days of the week so far.
const BOARD_WORKOUTS = 3, BOARD_BURN_WEEK = 2000;
function weekMonday(date){ const d = new Date(date+'T12:00:00'); const dow = (d.getDay()+6)%7; return addDays(date, -dow); }
function weekSummary(monday){
  const today = localDate(); let workouts = 0, pSum = 0, tSum = 0, logged = 0, steps = 0, burned = 0, days = 0;
  for (let i=0; i<7; i++) { const date = addDays(monday, i); if (date > today) break; days++; const d = S.days.get(date); if (!d) continue;
    if ((d.exercises||[]).length || (d.sports||[]).length) workouts++;
    steps += Number((d.health||{}).steps)||0;
    if ((d.foods||[]).length || (d.exercises||[]).length || (d.sports||[]).length || Object.keys(d.health||{}).length) burned += burnedTotal(d).total;
    if ((d.foods||[]).length) { logged++; pSum += dayTotals(d).protein; tSum += dayTargets(d).protein; } }
  const pAvg = logged ? pSum/logged : 0, pTgt = logged ? tSum/logged : targets().protein;
  const steps_goal = (Number(prof().steps_goal)||10000) * days, burn_goal = Math.round(BOARD_BURN_WEEK * days / 7);
  const part = (v, g) => g>0 ? Math.min(1, v/g) : 0;
  const score = Math.round(25*part(workouts, BOARD_WORKOUTS) + 25*part(pAvg, pTgt) + 25*part(steps, steps_goal) + 25*part(burned, burn_goal));
  return { workouts, protein_avg: Math.round(pAvg), protein_target: Math.round(pTgt), logged_days: logged, steps: Math.round(steps), steps_goal, burned: Math.round(burned), burn_goal, score };
}
const boardHit = r => r.workouts >= BOARD_WORKOUTS && r.logged_days > 0 && r.protein_avg >= r.protein_target && (!r.steps_goal || r.steps >= r.steps_goal) && (!r.burn_goal || r.burned >= r.burn_goal);
let boardT = null, boardLast = '';
function publishBoard(){
  if (!S.dbReady || !S.user || !SB) return;
  clearTimeout(boardT);
  boardT = setTimeout(async () => {
    const monday = weekMonday(localDate());
    if (prof().leaderboard === false) {
      if (boardLast !== 'off') { boardLast = 'off'; await SB.from('leaderboard').delete().eq('user_id', S.user.id); loadBoard(); }
      return;
    }
    const row = { user_id:S.user.id, week:monday, name:(prof().name||'').trim().slice(0,40) || (S.user.email||'').split('@')[0] || 'Member', ...weekSummary(monday) };
    const key = JSON.stringify(row); if (key === boardLast) return; boardLast = key;
    const { error } = await SB.from('leaderboard').upsert({ ...row, updated_at:new Date().toISOString() });
    if (!error) loadBoard();
  }, 2500);
}
async function loadBoard(){
  if (!SB || !S.user) return;
  const { data, error } = await SB.from('leaderboard').select('user_id,name,workouts,protein_avg,protein_target,logged_days,steps,steps_goal,burned,burn_goal,score,updated_at').eq('week', weekMonday(localDate()));
  if (!error) { S.board = data || []; if (S.view==='trends') render(); }
}
function boardHtml(){
  const monday = weekMonday(localDate()), me = S.user?.id, off = prof().leaderboard === false;
  const rows = (S.board||[]).slice().sort((a,b)=> (boardHit(b)-boardHit(a)) || (b.score-a.score) || (b.workouts-a.workouts) || ((b.burned||0)-(a.burned||0)) || ((b.steps||0)-(a.steps||0)) || String(a.name).localeCompare(String(b.name)));
  const kk = v => v>=10000 ? n1(v/1000)+'k' : n0(v);
  const line = r => `${r.workouts}/${BOARD_WORKOUTS} workouts · ${r.logged_days?`${n0(r.protein_avg)}/${n0(r.protein_target)} g protein`:'no food logged'} · ${kk(r.steps||0)} steps · ${n0(r.burned||0)} kcal burned`;
  const tag = r => boardHit(r) ? '<span class="spill" style="color:var(--st-at-t);background:color-mix(in srgb, var(--st-at) 15%, transparent)">✓ Target hit</span>' : '';
  const top = rows.slice(0,3), rest = rows.slice(3);
  const order = top.length===3 ? [top[1], top[0], top[2]] : top;             // podium: 2nd, 1st, 3rd
  const place = r => rows.indexOf(r)+1;
  return `<section class="panel board" aria-label="Leaderboard">
    <div class="panel-head"><h2>This week’s leaderboard</h2><span class="muted small">${esc(fmtDate(monday,{day:'numeric',month:'short'}))} – ${esc(fmtDate(addDays(monday,6),{day:'numeric',month:'short'}))}</span></div>
    ${!rows.length ? `<div class="empty">${off?'You’re hidden from the leaderboard.':'Nobody is on the board yet this week. Log a workout or a meal and you’ll appear.'}</div>` : `
    <div class="podium${top.length<3?' few':''}">${order.map(r=>`<div class="pod p${place(r)}${r.user_id===me?' me':''}">
        <div class="medal">${place(r)}</div><div class="pname">${esc(r.name||'Member')}${r.user_id===me?' <span class="muted">(you)</span>':''}</div>
        <div class="pscore">${r.score}<small>/100</small></div><div class="pline">${esc(line(r))}</div>${tag(r)}<div class="pblock"></div></div>`).join('')}</div>
    ${rest.length ? fold('lb-rest', 'Everyone else', `${rest.length} ${rest.length===1?'person':'people'}`, rest.map(r=>`<div class="brow${r.user_id===me?' me':''}"><span class="brank">${place(r)}</span><div><b>${esc(r.name||'Member')}${r.user_id===me?' <span class="muted">(you)</span>':''}</b><div class="muted small">${esc(line(r))}</div></div>${tag(r)||'<span></span>'}<b class="num">${r.score}</b></div>`).join(''), 'inline') : ''}`}
    <label class="check small"><input type="checkbox" data-action="boardToggle" ${off?'':'checked'}> Show me on the leaderboard</label>
  </section>`;
}

/* ---------- workout feed (table "feed_posts" in schema.sql) ---------- */
// Finished workouts are shown to approved members. It’s read-only: nothing to react to or reply to.
const FEED_DAYS = 30, FEED_SHOW = 8;
const myName = () => (prof().name||'').trim().slice(0,40) || (S.user?.email||'').split('@')[0] || 'Member';
function feedWorkout(sm, out, prs){
  const best = e => { const ws = e.sets.filter(s=>s.type!=='warmup'); const top = ws.reduce((a,s)=>(!a || s.weight>a.weight || (s.weight===a.weight && s.reps>a.reps)) ? s : a, null);
    return top ? (top.weight>0 ? `${n1(top.weight)} kg × ${top.reps}` : `${top.reps} reps`) : ''; };
  return { title:String(sm.name||'Workout').slice(0,40), minutes:sm.minutes, sets:sm.sets, volume:sm.volume,
    exercises: out.slice(0,12).map(e => ({ name:String(e.name).slice(0,40), sets:e.sets.filter(s=>s.type!=='warmup').length, best:best(e) })),
    more: Math.max(0, out.length-12), prs: prs.slice(0,5).map(p => `${String(p.name).slice(0,40)}: ${p.text}`) };
}
async function postWorkout(sm, out, date, prs){
  if (!SB || !S.user || prof().share_workouts === false) return;
  let r; try { r = await SB.from('feed_posts').insert({ name:myName(), date, workout:feedWorkout(sm, out, prs) }).select('id,user_id,name,date,workout,created_at').single(); } catch (e) { r = {error:e}; }
  const { data, error } = r; if (error) { console.warn('feed', error.message); return; }
  S.feed = [data, ...(S.feed||[])]; if (S.view==='trends') render();
}
async function loadFeed(){
  if (!SB || !S.user) return;
  const since = new Date(Date.now() - FEED_DAYS*864e5).toISOString();
  let data;
  try {
    const r = await SB.from('feed_posts').select('id,user_id,name,date,workout,created_at').gte('created_at', since).order('created_at', {ascending:false}).limit(60);
    if (r.error) return; data = r.data||[];
  } catch (e) { console.warn('feed', e?.message); return; }
  S.feed = data; S.feedLoaded = true; if (S.view==='trends') render();
}
async function feedDel(id){
  const p = (S.feed||[]).find(x=>x.id===id); if (!p || !SB || !confirm('Take this workout off the feed? It stays in your own log.')) return;
  let error; try { ({ error } = await SB.from('feed_posts').delete().eq('id', id)); } catch (e) { error = e; }
  if (error) { toast('Couldn’t remove it. Try again.'); return; }
  S.feed = S.feed.filter(x=>x.id!==id); render();
}
function ago(iso){
  const m = Math.round((Date.now()-Date.parse(iso))/60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m/60)} h ago`;
  const d = Math.round(m/1440); return d===1 ? 'yesterday' : d < 7 ? `${d} days ago` : fmtDate(iso.slice(0,10), {day:'numeric', month:'short'});
}
function feedHtml(){
  const me = S.user?.id, off = prof().share_workouts === false, posts = S.feed||[], shown = S.feedAll ? posts : posts.slice(0, FEED_SHOW);
  const card = p => { const w = p.workout||{};
    const hrs = m => m<60 ? `${m} min` : `${Math.floor(m/60)}h ${pad(m%60)}`;
    return `<article class="post${p.user_id===me?' me':''}"><div class="post-head"><b>${esc(p.name||'Member')}${p.user_id===me?' <span class="muted">(you)</span>':''}</b><span class="muted small">${esc(ago(p.created_at))}</span></div>
      <div class="post-title">${esc(w.title||'Workout')}</div>
      <div class="muted small">${esc(hrs(Number(w.minutes)||0))} · ${n0(w.sets||0)} ${w.sets===1?'set':'sets'} · ${n0(w.volume||0)} kg volume</div>
      <ul class="post-ex">${(w.exercises||[]).map(e=>`<li><span>${esc(e.sets)} × ${esc(e.name)}</span><span class="muted">${esc(e.best||'')}</span></li>`).join('')}${w.more?`<li class="muted">+ ${esc(w.more)} more</li>`:''}</ul>
      ${(w.prs||[]).length?`<div class="post-pr">🏆 ${(w.prs||[]).map(esc).join(' · ')}</div>`:''}
      ${p.user_id===me?`<div class="post-foot"><span class="spacer"></span><button class="linkbtn" data-action="feedDel" data-id="${esc(p.id)}">Take off feed</button></div>`:''}</article>`; };
  return `<section class="panel feed" aria-label="Workout feed"><div class="panel-head"><h2>Workout feed</h2>${hideBtn('feed','workout feed')}</div>
    ${isHidden('feed') ? '' : `${posts.length ? shown.map(card).join('') : `<div class="empty">${S.feedLoaded?'No workouts in the last 30 days. Finish a workout in Train and it shows up here.':'Loading…'}</div>`}
    ${posts.length > shown.length ? `<div class="row"><button class="btn ghost sm" data-action="feedMore">Show ${posts.length-shown.length} more</button></div>` : ''}
    <label class="check small"><input type="checkbox" data-action="feedToggle" ${off?'':'checked'}> Show my finished workouts here</label>`}
  </section>`;
}

/* ---------- approvals (owner only) ---------- */
async function loadMembers(){
  if (!S.isAdmin || !SB) return;
  const { data, error } = await SB.from('members').select('user_id,email,name,provider,status,is_admin,primary_owner,requested_at,decided_at').order('requested_at', {ascending:false});
  if (!error) { S.members = data||[]; render(); }
}
async function setMember(id, status){
  const m = (S.members||[]).find(x=>x.user_id===id); if (!m) return;
  if (status==='declined' && m.status==='approved' && !confirm(`Remove ${m.name||m.email}’s access? They won’t be able to open their data until you approve them again.`)) return;
  const { error } = await SB.rpc('set_member_status', { p_user:id, p_status:status });
  if (error) { toast('Couldn’t update that. Try again.'); return; }
  toast(status==='approved' ? `Approved ${m.name||m.email}` : `Declined ${m.name||m.email}`); loadMembers();
}
// Co-owners can approve and decline members and make temporary passwords, so someone
// can still let people in if the main owner can't. Only the main owner adds or removes them.
async function setMemberAdmin(id, on, name){
  if (!confirm(on ? `Make ${name} a co-owner? They’ll be able to approve and remove members and make temporary passwords, but not change owners.` : `Remove ${name} as co-owner?`)) return;
  const { error } = await SB.rpc('set_member_admin', { p_user:id, p_admin:on });
  if (error) { toast('Couldn’t change that. Try again.'); return; }
  toast(on ? `${name} is now a co-owner` : `${name} is no longer a co-owner`); loadMembers();
}
function peopleFold(){
  const ms = S.members||[], pend = ms.filter(x=>x.status==='pending'), appr = ms.filter(x=>x.status==='approved'), dec = ms.filter(x=>x.status==='declined');
  const me = S.user?.id, iAmMain = ms.some(x=>x.user_id===me && x.primary_owner);
  const role = x => x.primary_owner ? 'owner' : x.is_admin ? 'co-owner' : '';
  const who = x => `<div><div class="nm">${esc(x.name||x.email||'Unknown')}${role(x)?` <span class="tag">${role(x)}</span>`:''}${x.user_id===me?' <span class="muted small">(you)</span>':''}</div><div class="sub">${esc(x.email||'')}${x.provider?` · ${esc(x.provider==='email'?'email':x.provider[0].toUpperCase()+x.provider.slice(1))}`:''} · ${esc(fmtDate((x.decided_at||x.requested_at).slice(0,10),{day:'numeric',month:'short'}))}</div></div>`;
  return `${pend.length ? `<h3>Waiting for you</h3>${pend.map(x=>`<div class="item person">${who(x)}<span></span><div class="acts"><button class="approve" data-action="memberSet" data-id="${x.user_id}" data-s="approved">Approve</button><button data-action="memberSet" data-id="${x.user_id}" data-s="declined">Decline</button></div></div>`).join('')}` : '<div class="muted small">Nobody is waiting. When someone signs in for the first time, they appear here for you to approve.</div>'}
    <h3>Approved</h3>${appr.map(x=>`<div class="item person">${who(x)}<span></span><div class="acts">${x.is_admin
      ? (iAmMain && !x.primary_owner ? `<button data-action="memberAdmin" data-id="${x.user_id}" data-on="0" data-name="${esc(x.name||x.email||'')}">Remove co-owner</button>` : '')
      : `<button data-action="tempPw" data-id="${x.user_id}" data-name="${esc(x.name||x.email||'')}" aria-label="Set a temporary password for ${esc(x.name||x.email||'')}">Password</button>${iAmMain?`<button data-action="memberAdmin" data-id="${x.user_id}" data-on="1" data-name="${esc(x.name||x.email||'')}">Make co-owner</button>`:''}<button data-action="memberSet" data-id="${x.user_id}" data-s="declined">Remove</button>`}</div></div>`).join('')}
    <div class="muted small">Forgot their password? Tap Password to make a temporary one, and give it to them privately. They choose their own next time they sign in.</div>
    ${dec.length?`<h3>Declined</h3>${dec.map(x=>`<div class="item person">${who(x)}<span></span><div class="acts"><button data-action="memberSet" data-id="${x.user_id}" data-s="approved">Approve</button></div></div>`).join('')}`:''}
    <div class="row"><button class="btn ghost sm" data-action="reviewPeople">Refresh</button></div>`;
}
async function tempPassword(id, name){
  if (!confirm(`Make a temporary password for ${name}? Their current password stops working.`)) return;
  let r; try { r = await fnCall('members', 'temp-password', {user_id:id}); } catch (e) { toast(e.code==='offline' ? 'You’re offline. Try again when connected.' : 'Couldn’t set a temporary password. Try again.'); return; }
  const d = $('#dlg');
  d.innerHTML = `<div class="howto"><h2>Temporary password</h2>
    <p class="small">For <b>${esc(name)}</b>${r.email?` (${esc(r.email)})`:''}. Share it privately (in person or a direct message). They sign in with it and then choose their own.</p>
    <code class="keybox">${esc(r.password)}</code>
    <div class="row"><button class="btn sm" id="tpCopy">Copy</button><span class="spacer"></span><button class="btn ghost" id="tpClose">Done</button></div>
    <div class="muted small">It’s shown only now.</div></div>`;
  d.showModal(); $('#tpClose').onclick = () => d.close(); $('#tpCopy').onclick = () => copyText(r.password, 'Password');
}
async function signOut(){
  try { const sub = pushReady() && await navigator.serviceWorker.ready.then(r => r.pushManager.getSubscription());
    if (sub) { await SB.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } localStorage.removeItem(pushKey()); } catch {}
  if (S.db) await S.db.forget();
  await SB.auth.signOut(); location.reload();
}
async function refreshUsage(){
  if (!S.sample) return;
  try { S.usage = await S.sample.usage(); S.aiHealth = 'ok'; }
  catch (e) { S.aiHealth = e?.code || 'unavailable'; }
  render();
}

// Is this person approved? Cached on the device so the app still opens offline.
async function memberStatus(user){
  const key = 'mt:member:' + user.id;
  let data = null, error = null;
  try { ({ data, error } = await SB.from('members').select('status,is_admin').eq('user_id', user.id).maybeSingle()); } catch (e) { error = e; }
  if (error) { let c=null; try { c = JSON.parse(localStorage.getItem(key)||'null'); } catch {} return c || {status:'unknown'}; }
  const m = data || {status:'pending'};
  try { if (m.status==='approved') localStorage.setItem(key, JSON.stringify(m)); else localStorage.removeItem(key); } catch {}
  return m;
}
let memberCheck = null;
async function startFor(user){
  if (S.user && S.user.id===user.id) return;
  if (memberCheck) return memberCheck;
  memberCheck = (async () => { const m = await memberStatus(user); memberCheck = null; return m; })();
  const m = await memberCheck;
  if (m.status!=='approved') { S.pendingUser = user; S.memberInfo = m; render(); return; }
  if (user.user_metadata?.must_change_password) { S.mustChange = user; render(); return; }
  S.pendingUser = null; S.isAdmin = !!m.is_admin;
  S.user = user; S.dbState='connecting'; render();
  if (S.isAdmin) loadMembers();
  loadPasskeys(); loadBoard(); loadFeed(); loadHealthSync(); loadData();
  const db = FL.makeDb(SB, user.id, {
    onStatus: st => { if (S.sync!==st) { S.sync = st; render(); if (st==='error') serverReachable().then(ok => { S.netBlocked = !ok; render(); }); else if (st==='synced') S.netBlocked = false; } },
    onError: code => { if (code==='too_large') toast('One change was too large to sync and was skipped.'); },
  });
  S.db = db;
  S.sample = FL_CONFIG.CLAUDE !== false ? FL.makeAI(SB, FL_CONFIG, { onUsage: u => { S.usage = u; } }) : null;
  S.aiState = S.sample ? 'on' : 'off'; S.canPhoto = !!S.sample;
  db.doc('profile/me').onSnapshot(snap => { S.profile = snap.exists ? {...snap.data()} : null; S.rev++;
    if (!S.profile && !S.setupShown && !snap.metadata?.fromCache) { S.setupShown = true; startSetup('about'); return; }
    if (S.profile) S.setupShown = true;
    if (S.profile && needsPw() && !S.setup) { startSetup('password'); return; }
    render(); });
  db.collection('reports').orderBy('report_date','desc').limit(50).onSnapshot(snap => { S.reports = snap.docs.map(d=>({...d.data()})); render(); });
  db.collection('foodlib').onSnapshot(snap => { if (S.indbBuiltIn) return; const rows=[]; for (const d of snap.docs) { try { rows.push(...JSON.parse(d.data().rows||'[]')); } catch {} } S.libFoods = rows.map(r=>rowToFood(r,'indb')); S.myFoodsVer=(S.myFoodsVer||0)+1; });
  db.collection('foods').limit(1000).onSnapshot(snap => { const m={}; for (const d of snap.docs) m[d.id]={...d.data()}; S.myFoods=m; S.myFoodsVer=(S.myFoodsVer||0)+1; });
  wkLoad();
  db.collection('measurements').limit(500).onSnapshot(snap => { S.measures = snap.docs.map(d=>({...d.data()})); render(); });
  loadPhotos();
  db.collection('routines').limit(100).onSnapshot(snap => { S.routines = snap.docs.map(d=>({...d.data()})); render(); });
  db.collection('reviews').orderBy('created','desc').limit(10).onSnapshot(snap => { S.reviews = snap.docs.map(d=>({...d.data()})); render(); });
  db.collection('days').orderBy('date','desc').limit(1000).onSnapshot(snap => {
    const m = new Map(); for (const d of snap.docs) m.set(d.id, d.data());
    S.daysRaw = m; mergeDays(); S.rev++; S.dbState='on'; render();
  });
  // Numbers the Apple Health Shortcut sent (written only by the server, so
  // syncing days never overwrites them); laid over each day's own health.
  db.collection('health').onSnapshot(snap => {
    const m = new Map(); for (const d of snap.docs) m.set(d.id, d.data());
    S.healthSync = m; mergeDays(); S.rev++; render();
  });
  await db.start();
  S.dbReady = true; S.dbState='on'; render();
  refreshUsage(); pushResync(); pushState();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState!=='visible') return;
  if (S.isAdmin) loadMembers();
  if (S.pendingUser && S.memberInfo?.status!=='declined') startFor(S.pendingUser); });
// A tapped notification opens Today or Train.
const NOTE_VIEW = {food:'today', today:'today', gym:'gym'};
try { const v = NOTE_VIEW[new URLSearchParams(location.search).get('view')]; if (v) { S.view = v; history.replaceState(null, '', location.pathname); } } catch {}
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => { const v = ev.data && ev.data.type==='open' && NOTE_VIEW[ev.data.view]; if (v && S.user) setView(v); });
try { window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.().then(ok => { S.bioOK = !!ok; render(); }).catch(()=>{}); } catch {}
render();
(async () => {
  const cfg = window.FL_CONFIG || {};
  if (!window.supabase || !/^https:\/\//.test(cfg.SUPABASE_URL||'') || /YOUR_/.test(cfg.SUPABASE_ANON_KEY||'YOUR_')) { render(); return; }
  // Through the Worker when set; the session key stays tied to the project, so nobody is signed out by the switch.
  SB = window.supabase.createClient(cfg.API_URL, cfg.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce',
    storageKey:`sb-${new URL(cfg.SUPABASE_URL).hostname.split('.')[0]}-auth-token` } });
  const { data:{ session } } = await SB.auth.getSession();
  if (session?.user) startFor(session.user);
  else { const c = getClaim(); if (c) { S.auth={step:'waiting', email:c.email, msg:'', busy:false}; accessCheck(true); pollAccess(); } render(); }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState==='visible' && S.auth.step==='waiting' && !S.user) accessCheck(true); });
  SB.auth.onAuthStateChange((ev, sess) => {
    if (sess?.user) startFor(sess.user);
    else if (ev==='SIGNED_OUT') { S.user=null; S.pendingUser=null; S.isAdmin=false; S.passkeys=null; render(); }
  });
})();
})();
