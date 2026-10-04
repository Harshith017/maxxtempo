// Run: node --test restaurants.test.js
var test = require("node:test");
var assert = require("node:assert");
var R = require("./restaurants.js");
var p = function (t) { var r = R.parse(t); return r && !r.need ? r : null; };

test("bowls match California Burrito's published totals (within ~12%)", function () {
  var near = function (a, b) { return Math.abs(a - b) / b < 0.12; };
  assert.ok(near(p("california burrito mexican paneer rice bowl").kcal, 792));
  assert.ok(near(p("cb mini bbq chicken bowl").kcal, 570));
  assert.ok(near(p("cb mexican paneer salad").kcal, 533));
  assert.ok(near(p("cb bbq chicken salad").kcal, 459));
  assert.strictEqual(p("CB pro bowl grilled chicken").kcal, 612);
});

test("extras: extra chicken is the same chicken, extra paneer is Mexican paneer", function () {
  var a = p("cb peri peri chicken burrito extra chicken"), b = p("cb peri peri chicken burrito with extra paneer and guacamole");
  assert.ok(a.parts.some(function (x) { return x.label === "Extra crispy peri peri chicken"; }));
  assert.ok(b.parts.some(function (x) { return x.label === "Extra mexican paneer"; }));
  assert.ok(b.parts.some(function (x) { return x.name === "GUACAMOLE"; }));
});

test("toppings and sauces sold as a side are 30% of that side; fillings keep the calculator value", function () {
  assert.deepStrictEqual(R.addonRow(["MEXICAN PANEER", 291, 22.6, 13.5, 7.5]).slice(0, 5), ["MEXICAN PANEER", 272, 21.2, 12.6, 7]); // side 908 kcal
  assert.deepStrictEqual(R.addonRow(["CRISPY PERI PERI CHICKEN", 238, 13.4, 19.4, 13.8]), ["CRISPY PERI PERI CHICKEN", 238, 13.4, 19.4, 13.8]);
  var a = p("cb peri peri chicken burrito extra chicken"), b = p("cb peri peri chicken burrito with extra paneer and guacamole");
  assert.strictEqual(b.kcal, a.kcal - 238 + 291 + 185); // extra fillings keep the calculator value; guacamole side 617 → 185
  assert.strictEqual(p("cb mexican paneer bowl extra corn salsa").kcal - p("cb mexican paneer bowl").kcal, 103); // corn salsa side 342 → 103
});

test("rice, beans and toppings follow what's said", function () {
  var r = p("cb mushroom bowl no cheese no beans brown rice");
  var names = r.parts.map(function (x) { return x.name; });
  assert.ok(names.includes("BROWN RICE") && !names.includes("BLACK BEANS") && !names.includes("CHEESE") && names.includes("CORN SALSA"));
  assert.ok(p("cb chicken bowl with sour cream").parts.some(function (x) { return x.name === "SOUR CREAM"; }));
});

test("tacos, quesadilla, munchies, habanero", function () {
  assert.ok(p("cb 3 tacos crispy chicken crunchy shell").parts.some(function (x) { return x.name === "CRUNCHY SHELL"; }));
  assert.strictEqual(p("cb snachos").kcal, 346);
  assert.strictEqual(p("cb chicken quesadilla").title, "California Burrito California Chicken Quesadilla");
  assert.strictEqual(p("cb habanero burrito paneer").kcal, 105 + 268);
});

test("only with the brand; a bowl with no protein asks", function () {
  assert.strictEqual(R.parse("chicken burrito"), null);
  assert.strictEqual(R.parse("cb bowl").need, "protein");
  assert.ok(R.isModifier("extra paneer") && !R.isModifier("2 roti"));
});

test("matches the calculator: Pro salad, grilled chicken, extra grilled chicken", function () {
  var r = p("California pro salad bowl with extra chicken");
  assert.deepStrictEqual([r.kcal, r.fat, r.protein, r.carbs], [786, 38.2, 75.4, 46.8]);
  assert.strictEqual(R.parse("I went to California and ate 2 roti"), null);
});
