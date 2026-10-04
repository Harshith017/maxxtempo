/* MaxxTempo — reads a packaged-food nutrition table from text.
   The text comes from Tesseract (on the phone, no AI) reading a photo of the label.
   Indian labels (FSSAI) give values per 100 g or 100 ml, often next to a per-serve
   and a %RDA column; this picks the per-100 g column. Anything it can't read is left
   blank for the person to type. Loaded before app.js; also required by label.test.js. */
(function (root) {
'use strict';

// [field, label words, unit the value is stored in]
const FIELDS = [
  ['kcal', /\b(energy|calories|calorie|kcal)\b/, 'kcal'],
  ['protein', /\bprotein/, 'g'],
  ['carbs', /\b(total\s+)?carbo\s*hydrates?\b|\bcarbs?\b/, 'g'],
  ['added_sugar', /\badded\s+sugars?\b/, 'g'],
  ['sugar', /\b(total\s+)?sugars?\b/, 'g'],
  ['sat_fat', /\bsaturated\b|\bsat\.?\s*fat/, 'g'],
  ['trans_fat', /\btrans\b/, 'g'],
  ['fiber', /\b(dietary\s+)?fib(re|er)\b/, 'g'],
  ['sodium', /\bsodium\b/, 'mg'],
  ['salt', /\bsalt\b/, 'g'],
  ['cholesterol', /\bcholesterol\b/, 'mg'],
  ['fat', /\b(total\s+)?fats?\b/, 'g'],
];

// OCR mixes up O/0, l/1, S/5 inside numbers and uses commas for decimals.
const fixNum = s => s.replace(/(?<=\d)[oO](?=\d|\b)|(?<=\b)[oO](?=[.,]\d)/g, '0').replace(/(?<=\d)[lI|](?=\d|\s*(?:g|mg|kcal)\b)/g, '1').replace(/(\d),(\d{1,2})\b/g, '$1.$2');
const NUM = /(\d+(?:\.\d+)?)\s*(kcal|kj|mg|mcg|µg|g|%)?/gi;
const nums = s => [...s.matchAll(NUM)].map(m => ({ v: +m[1], u: (m[2] || '').toLowerCase() })).filter(n => n.u !== '%'); // %RDA columns are dropped

function columnOrder(lines) {
  // Which column is per 100 g? Look for a header naming both.
  for (const l of lines) {
    const h = l.toLowerCase(), a = h.search(/(per\s*)?100\s*(g|gm|ml)\b/), b = h.search(/per\s*(serv|pack|portion|piece|\d+\s*(g|ml)\b(?<!100\s*(g|ml)))/);
    if (a >= 0 && b >= 0) return a < b ? 0 : 1;
  }
  return 0;
}

function parse(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => fixNum(l.replace(/[“”"’']/g, '')).trim()).filter(Boolean);
  const col = columnOrder(lines), out = {}, seen = {};
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    const f = FIELDS.find(([key, re]) => re.test(low) && !(key === 'fat' && /saturated|trans|mono|poly/.test(low)) && !(key === 'sugar' && /added/.test(low)));
    if (!f) continue;
    const [key, re, unit] = f;
    // Numbers after the label on this line (or the next one when the table wraps).
    const after = low.slice(low.search(re));
    let found = nums(after);
    if (!found.length && lines[i + 1] && !FIELDS.some(([, r]) => r.test(lines[i + 1].toLowerCase()))) found = nums(lines[i + 1].toLowerCase());
    if (key === 'kcal') {
      const kc = found.filter(n => n.u === 'kcal'), kj = found.filter(n => n.u === 'kj');
      let v = kc.length ? kc[Math.min(col, kc.length - 1)].v : kj.length ? kj[Math.min(col, kj.length - 1)].v / 4.184 : found.length ? found[Math.min(col, found.length - 1)].v : null;
      if (v != null && /\bkj\b/.test(low) && !kc.length && !kj.length && !/kcal/.test(low)) v = v / 4.184; // "Energy (kJ) 2280"
      if (v != null && v > 0 && v <= 950 && !seen.kcal) { out.kcal = Math.round(v); seen.kcal = 1; }
      continue;
    }
    const pick = found[Math.min(col, found.length - 1)]; if (!pick) continue;
    let v = pick.v;
    if (unit === 'g' && pick.u === 'mg') v = v / 1000;
    if (unit === 'mg' && pick.u === 'g') v = v * 1000;
    if (unit === 'g' && v > 100) continue;
    if (seen[key]) continue; seen[key] = 1; out[key] = Math.round(v * 10) / 10;
  }
  if (out.sodium == null && out.salt != null) out.sodium = Math.round(out.salt / 2.5 * 1000);
  delete out.salt;
  return out;
}

// Calories should roughly match 4 × protein + 4 × carbs + 9 × fat.
function checkEnergy(v) {
  if (!(v.kcal > 0) || v.protein == null || v.carbs == null || v.fat == null) return null;
  const est = 4 * v.protein + 4 * v.carbs + 9 * v.fat;
  return est > 0 ? Math.abs(est - v.kcal) / v.kcal : null;
}

const api = { parse, checkEnergy };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Label = api;
})(this);
