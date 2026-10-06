// Run: node --test backend.test.js
var test = require("node:test");
var assert = require("node:assert");
var merge3 = require("./backend.js").FL.merge3;
var day = function (o) { return Object.assign({ date: "2026-10-06", foods: [], water: [], exercises: [] }, o); };
var f = function (id, name, kcal) { return { id: id, name: name, kcal: kcal }; };

test("foods added on two devices are both kept", function () {
  var base = day({ foods: [f("a", "Poha", 350)] });
  var phone = day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105)] });
  var laptop = day({ foods: [f("a", "Poha", 350), f("c", "Dal", 180)] });
  assert.deepStrictEqual(merge3(base, phone, laptop).foods.map(function (x) { return x.id; }), ["a", "b", "c"]);
});

test("a food deleted on the other device stays deleted", function () {
  var base = day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105)] });
  var phone = day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105), f("c", "Tea", 60)] });
  var laptop = day({ foods: [f("a", "Poha", 350)] });
  assert.deepStrictEqual(merge3(base, phone, laptop).foods.map(function (x) { return x.id; }), ["a", "c"]);
});

test("a food deleted here stays deleted, and the other device's edits elsewhere are kept", function () {
  var base = day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105)], weight_kg: null });
  var phone = day({ foods: [f("a", "Poha", 350)], weight_kg: null });
  var laptop = day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105)], weight_kg: 72.4 });
  var m = merge3(base, phone, laptop);
  assert.deepStrictEqual(m.foods.map(function (x) { return x.id; }), ["a"]);
  assert.strictEqual(m.weight_kg, 72.4);
});

test("the same food edited on both: each side's changed fields kept, a clash goes to this device", function () {
  var base = day({ foods: [{ id: "a", name: "Poha", kcal: 350, meal: "breakfast" }] });
  var phone = day({ foods: [{ id: "a", name: "Poha", kcal: 300, meal: "breakfast" }] });
  var laptop = day({ foods: [{ id: "a", name: "Poha", kcal: 320, meal: "lunch" }] });
  assert.deepStrictEqual(merge3(base, phone, laptop).foods[0], { id: "a", name: "Poha", kcal: 300, meal: "lunch" });
});

test("health numbers from both devices are combined", function () {
  var base = day({ health: { steps: 4000 } });
  var phone = day({ health: { steps: 4000, sleep_min: 420 } });
  var laptop = day({ health: { steps: 9000 } });
  assert.deepStrictEqual(merge3(base, phone, laptop).health, { steps: 9000, sleep_min: 420 });
});

test("a daily-stack supplement added on both devices is kept once", function () {
  var base = day({ supplements: [] });
  var phone = day({ supplements: [{ id: "p1", name: "Creatine", stack_id: "s1", auto: true }] });
  var laptop = day({ supplements: [{ id: "l1", name: "Creatine", stack_id: "s1", auto: true }] });
  assert.strictEqual(merge3(base, phone, laptop).supplements.length, 1);
});

test("a day created on both devices while offline keeps both sets of food", function () {
  var m = merge3(null, day({ foods: [f("b", "Banana", 105)] }), day({ foods: [f("c", "Dal", 180)] }));
  assert.deepStrictEqual(m.foods.map(function (x) { return x.id; }).sort(), ["b", "c"]);
});

test("nothing changed on the server: this device's version as is", function () {
  var base = day({ foods: [f("a", "Poha", 350)] }), phone = day({ foods: [] });
  assert.deepStrictEqual(merge3(base, phone, JSON.parse(JSON.stringify(base))), phone);
});

// Two devices against one (fake) server, through the real sync queue.
function fakeServer() {
  var rows = new Map(), key = function (m) { return m.collection + "/" + m.id; };
  var sb = { from: function () {
    return {
      select: function () { return { match: function (m) { return { maybeSingle: function () { var r = rows.get(key(m)); return Promise.resolve({ data: r ? { data: JSON.parse(JSON.stringify(r)) } : null, error: null }); } }; } }; },
      upsert: function (row) { rows.set(key(row), JSON.parse(JSON.stringify(row.data))); return Promise.resolve({ error: null }); },
      delete: function () { return { match: function (m) { rows.delete(key(m)); return Promise.resolve({ error: null }); } }; },
    };
  } };
  return { sb: sb, rows: rows };
}
test("phone and laptop log the same day offline: both foods survive the sync", async function () {
  global.navigator = { onLine: true };
  var srv = fakeServer(), FL = require("./backend.js").FL;
  var phone = FL.makeDb(srv.sb, "u1"), laptop = FL.makeDb(srv.sb, "u1");
  var d0 = day({ foods: [f("a", "Poha", 350)] });
  await phone.doc("days/2026-10-06").set(d0); await phone.flush();
  // The laptop had already synced the morning's poha, then both go offline and log something.
  await laptop.doc("days/2026-10-06").set(d0); await laptop.flush();
  global.navigator.onLine = false;
  await phone.doc("days/2026-10-06").set(day({ foods: [f("a", "Poha", 350), f("b", "Banana", 105)] }));
  await laptop.doc("days/2026-10-06").set(day({ foods: [f("a", "Poha", 350), f("c", "Dal", 180)] }));
  global.navigator.onLine = true;
  await phone.flush(); await laptop.flush();
  assert.deepStrictEqual(srv.rows.get("days/2026-10-06").foods.map(function (x) { return x.id; }).sort(), ["a", "b", "c"]);
});
