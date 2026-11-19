const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const day = i => { const d=new Date(); d.setDate(d.getDate()-i); return iso(d); };
const profile = { name:'Harshith', sex:'male', age:27, birth:'1999-05-01', height_cm:176, weight_kg:74, activity:'moderate', goal:'lose', goal_rate:0.5, maint_source:'auto', eat_back:true, steps_goal:10000,
  stack:[{id:'s1', name:'Creatine', dose:'5 g', micros:{}}], sports:{} };
const food = (n,k,p,c,f,meal,t) => ({id:n+Math.random(), name:n, quantity:'1 serving', grams:200, meal, time:t, kcal:k, protein:p, carbs:c, fat:f, fiber:5, sugar:4, micros:{iron_mg:3, calcium_mg:120, potassium_mg:400}, confidence:'high', source:'food-db'});
const ex = (n,g,w,r,k) => ({id:n+Math.random(), name:n, muscle_group:g, kcal:40, sets:Array.from({length:k},()=>({weight:w,reps:r}))});
const plans = [
  [ex('Bench Press','chest',62.5,8,4), ex('Incline Dumbbell Press','chest',22,10,3), ex('Overhead Press','shoulders',40,8,3), ex('Lateral Raise','shoulders',8,15,3), ex('Tricep Pushdown','triceps',25,12,3)],
  [ex('Deadlift','back',110,5,3), ex('Pull Up','back',0,8,4), ex('Barbell Row','back',60,8,3), ex('Barbell Curl','biceps',30,10,3), ex('Hammer Curl','forearms',14,12,2), ex('Shrugs','shoulders',60,12,2)],
  [ex('Squat','quads',90,6,4), ex('Romanian Deadlift','hamstrings',80,8,3), ex('Hip Thrust','glutes',90,10,3), ex('Calf Raise','calves',60,15,4), ex('Hanging Leg Raise','core',0,12,3)],
];
const rows = [{ collection:'profile', id:'me', data: profile }];
for (let i=6;i>=0;i--) {
  const d = { date:day(i), foods:[food('Poha',350,8,60,9,'breakfast','08:30'), food('Chicken curry + rice',700,40,80,22,'lunch','13:15'), food('Greek yogurt + berries',220,18,24,5,'snack','17:00'), food('Dal + 2 roti',520,22,80,10,'dinner','20:30')].slice(0, i===0?2:4),
    water:[{id:'w'+i, ml:2200-i*100, time:'10:00'}], exercises: i%2===0 ? plans[(i/2)%3] : [], sports:[], weight_kg: 74.6-(6-i)*0.1,
    health:{ steps: 6500+i*700 } };
  rows.push({collection:'days', id:d.date, data:d});
}
require('fs').writeFileSync(__dirname+'/seed.json', JSON.stringify(rows));
