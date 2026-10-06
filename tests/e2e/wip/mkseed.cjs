const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
const day = i => { const d=new Date(); d.setDate(d.getDate()-i); return iso(d); };
const profile = { name:'H', sex:'male', age:27, birth:'1999-05-01', height_cm:176, weight_kg:74, activity:'moderate', goal:'lose', goal_rate:0.5, maint_source:'auto', eat_back:true, steps_goal:10000,
  stack:[{id:'s1', name:'Creatine', dose:'5 g', micros:{}}, {id:'s2', name:'Vitamin D3', dose:'60000 IU weekly', micros:{vitamin_d_mcg:50}}], sports:{badminton:{name:'Badminton', answers:[], updated:day(3)}} };
const food = (n,k,p,c,f,meal) => ({id:n+Math.random(), name:n, quantity:'1 serving', grams:200, meal, time:'13:00', kcal:k, protein:p, carbs:c, fat:f, fiber:4, sugar:5, micros:{iron_mg:2, calcium_mg:80}, confidence:'high', source:'food-db'});
const rows = [{ collection:'profile', id:'me', data: profile }];
for (let i=6;i>=1;i--) {
  const w = 60 + (6-i)*2.5;
  const d = { date:day(i), foods:[food('Poha',350,8,60,9,'breakfast'), food('Chicken curry + rice',700,40,80,22,'lunch'), food('Dal + 2 roti',520,22,80,10,'dinner')].slice(0, i%3?3:2),
    water:[{id:'w'+i, ml:2000-i*120, time:'10:00'}], exercises:[], sports:[], weight_kg: i%2? 74.6 - (6-i)*0.12 : null,
    health:{ steps: 6000+i*900, sleep_min: 380+i*14 } };
  if (i%2===0) d.exercises = [
    {id:'e1'+i, name:'Bench Press', muscle_group:'chest', kcal:60, sets:[{weight:w,reps:8},{weight:w,reps:8},{weight:w,reps:7}]},
    {id:'e2'+i, name:'Squat', muscle_group:'legs', kcal:80, sets:[{weight:w+20,reps:5},{weight:w+20,reps:5}]},
    {id:'e3'+i, name:'Pull Up', muscle_group:'back', kcal:30, sets:[{weight:0,reps:6+(6-i)},{weight:0,reps:6}]}];
  if (i===3) d.sports = [{id:'sp1', v:2, sport:'Badminton', title:'Badminton doubles', summary:'doubles, 3 games', minutes:60, rpe:7, kcal:380}];
  rows.push({collection:'days', id:d.date, data:d});
}

require('fs').writeFileSync(__dirname+'/seed.json', JSON.stringify(rows));
