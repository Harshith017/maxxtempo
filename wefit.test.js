// node --test wefit.test.js
const test = require('node:test');
const assert = require('node:assert');
const W = require('./wefit.js');
const one = t => { const r = W.parseAll(t); return r && r.length === 1 ? r[0] : r; };

test('every meal adds up to the protein and kcal in its WeFit name', () => {
  assert.strictEqual(W.MEALS.length, 61);
  const m = W.MEALS.find(x => x.name === 'BBQ Chicken Beast Bowl');
  assert.deepStrictEqual([Math.round(m.kcal), Math.round(m.protein), Math.round(m.carbs), Math.round(m.fat), Math.round(m.fiber)], [724, 64, 56, 27, 10]);
  const g = W.MEALS.find(x => x.name === 'BBQ Grilled Chicken Boneless');
  assert.strictEqual(Math.round(g.kcal), 374); assert.strictEqual(Math.round(g.protein), 54);
  assert.ok(m.parts.some(p => /Boneless Chicken \(raw\) 225 g/.test(p)));
});

test('branded names, short names and quantities', () => {
  assert.strictEqual(one('wefit bbq chicken beast bowl').meal.name, 'BBQ Chicken Beast Bowl');
  assert.strictEqual(one('We Fit tandoori wings').meal.name, 'Tandoori Grilled Chicken Wings');
  const h = one('half wefit chicken peri peri boss bowl'); assert.strictEqual(h.qty, 0.5);
  assert.strictEqual(one('wefit paneer tikka wrap x2').qty, 2);
  assert.strictEqual(one('1/2 wefit pesto chicken wrap').qty, 0.5);
  assert.strictEqual(one('wefit fibre rich palak and millet khichdi').meal.name, 'Fiber-Rich Palak & Millet Khichdi');
});

test('two dishes in one line, keeping "&" that is part of a name', () => {
  const r = W.parseAll('wefit beast bowl and pesto & chicken keto salad');
  assert.deepStrictEqual(r.map(x => x.meal.name), ['BBQ Chicken Beast Bowl', 'Pesto & Chicken Keto Salad']);
});

test('without the brand, only WeFit-only names count', () => {
  assert.strictEqual(one('beast bowl').meal.name, 'BBQ Chicken Beast Bowl');
  assert.strictEqual(one('pesto & paneer supreme bowl').meal.name, 'Pesto & Paneer Supreme Bowl');
  assert.strictEqual(W.parseAll('chicken tikka wrap'), null);
  assert.strictEqual(W.parseAll('paneer tikka'), null);
  assert.strictEqual(W.parseAll('2 rotis'), null);
});

test('unclear names are not guessed', () => {
  assert.strictEqual(W.parseAll('wefit chicken tikka'), null);
  assert.strictEqual(W.parse('wefit chicken tikka').need, 'which');
  assert.strictEqual(W.parseAll('overload wrap'), null);
});

test('search', () => {
  assert.strictEqual(W.search('wefit').length, 61);
  assert.ok(W.search('keto').length >= 10);
  assert.deepStrictEqual(W.search('beast').map(m => m.name), ['BBQ Chicken Beast Bowl']);
});
