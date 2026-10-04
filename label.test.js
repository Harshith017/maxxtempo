// Run: node --test label.test.js
var test = require("node:test");
var assert = require("node:assert");
var L = require("./label.js");

test("typical Indian label, per 100 g first", function () {
  var t = ["NUTRITIONAL INFORMATION", "Per 100 g Per serve (30 g) %RDA*", "Energy (kcal) 545 164 8%", "Protein (g) 6.5 2.0", "Carbohydrate (g) 52.0 15.6",
    "of which Total Sugars (g) 2.1 0.6", "Added Sugars (g) 1.2 0.4 1%", "Total Fat (g) 34.5 10.4 15%", "Saturated Fat (g) 15.2 4.6 21%", "Trans Fat (g) 0.1 0.0", "Sodium (mg) 650 195 10%"].join("\n");
  assert.deepStrictEqual(L.parse(t), { kcal: 545, protein: 6.5, carbs: 52, sugar: 2.1, added_sugar: 1.2, fat: 34.5, sat_fat: 15.2, trans_fat: 0.1, sodium: 650 });
});

test("per serve column first", function () {
  var t = "Nutrition Facts Per serve (25 g) Per 100 g\nEnergy 120 kcal 480 kcal\nProtein 2 g 8 g\nCarbohydrates 15 g 60 g\nFat 6 g 24 g";
  var v = L.parse(t); assert.strictEqual(v.kcal, 480); assert.strictEqual(v.protein, 8); assert.strictEqual(v.carbs, 60); assert.strictEqual(v.fat, 24);
});

test("kJ only, OCR slips and salt", function () {
  var v = L.parse("Energy 2280 kJ\nProtein 1O.5 g\nFat 3,2 g\nCarbohydrate 7l g\nSalt 1.5 g");
  assert.strictEqual(v.kcal, 545); assert.strictEqual(v.protein, 10.5); assert.strictEqual(v.fat, 3.2); assert.strictEqual(v.carbs, 71); assert.strictEqual(v.sodium, 600);
});

test("energy check", function () {
  assert.ok(L.checkEnergy({ kcal: 545, protein: 6.5, carbs: 52, fat: 34.5 }) < 0.05);
  assert.ok(L.checkEnergy({ kcal: 200, protein: 6.5, carbs: 52, fat: 34.5 }) > 0.5);
});
