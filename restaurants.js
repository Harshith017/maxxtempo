/* MaxxTempo — restaurant meals without AI.
   California Burrito: values from their own nutrition calculator
   (californiaburrito.in/nutrition, read October 2026). Each part of a meal (protein,
   rice, beans, toppings, extras…) has its own calories, fat, protein and carbs, and a
   meal is the sum of the parts picked, exactly as their calculator adds them.
   Loaded before app.js; also required by restaurants.test.js. */
(function (root) {
'use strict';

// [name, kcal, fat g, protein g, carbs g, (veg|nonveg)]
const CB = {"ricebowl":{"proteins":{"regular":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"mini":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"pro":[["GRILLED BARBEQUE CHICKEN",612,19,54,62],["MEXICAN PANEER",847,49,43,65]]},"rice":{"regular":[["CILANTRO RICE",314,6.9,5.5,55.5],["BROWN RICE",268,3.3,5.6,53.2],["NO RICE",0,0,0,0]],"mini":[["CILANTRO RICE",209,4.6,3.7,37],["BROWN RICE",178,2.2,3.7,35.4],["NO RICE",0,0,0,0]],"pro":[["CILANTRO RICE",314,6.9,5.5,55.5],["BROWN RICE",314,6.9,5.5,55.5],["NO RICE",0,0,0,0]]},"beans":{"regular":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"mini":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"pro":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]]},"toppings":{"regular":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3]],"mini":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8]],"pro":[["GRILLED ONION & CAPSICUM",18,0,2,4],["CORN SALSA",35,0,1.2,7.2]]},"extraToppings":[["LETTUCE",2,0,0,0],["JALAPENOS",1,0,0,0.1],["CHEESE",23,1.8,1.2,0],["CORN SALSA",35,0,1.2,7.2],["MEXICAN VEGGIE MIX",24,0.8,0.8,3.6]],"extraFillings":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",154,6.4,20.3,3.2],["MEXICAN PANEER",291,22.6,13.5,7.5],["BARBEQUE PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8]],"makeItRich":[["SUNFLOWER SEEDS",9,0.2,0.2,1.9],["GUACAMOLE",148,13.3,1.9,9.2],["CRUSHED CORN CHIPS",10,0.2,0.3,1.8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["HOT HABANERO SAUCE",9,0.3,0.1,0.9],["SOUR CREAM",57,5.6,0.5,1.1],["MANGO SALSA",9,0.2,0.2,1.9],["MELTED CHEESE QUESO",107,8,4,4]],"dressing":[]},"burrito":{"tortilla":{"regular":[["12\" TORTILLA",142,1.9,3.7,29.2]],"mini":[["10\" TORTILLA",105,1.4,2.7,21.6]],"pro":[["10\" TORTILLA",105,1.4,2.7,21.6]],"habanero":[["10\" TORTILLA",105,1.4,2.7,21.6]]},"proteins":{"regular":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"mini":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"habanero":[["PANEER HABANERO",268,19.5,15.8,7.4],["CHICKEN HABANERO",226,11.8,25.4,5.6]]},"rice":{"regular":[["CILANTRO RICE",158,3.5,2.8,27.9],["BROWN RICE",135,1.6,2.8,26.7],["NO RICE",0,0,0,0]],"mini":[["CILANTRO RICE",158,3.5,2.8,27.9],["BROWN RICE",135,1.6,2.8,26.7],["NO RICE",0,0,0,0]]},"beans":{"regular":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"mini":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"pro":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]]},"toppings":{"regular":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3]],"mini":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8]]},"extraToppings":[["LETTUCE",2,0,0,0],["JALAPENOS",1,0,0,0.1],["CHEESE",23,1.8,1.2,0],["CORN SALSA",35,0,1.2,7.2],["MEXICAN VEGGIE MIX",24,0.8,0.8,3.6]],"extraFillings":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",154,6.4,20.3,3.2],["MEXICAN PANEER",291,22.6,13.5,7.5],["BARBEQUE PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8]],"makeItRich":[["SUNFLOWER SEEDS",9,0.2,0.2,1.9],["GUACAMOLE",148,13.3,1.9,9.2],["CRUSHED CORN CHIPS",10,0.2,0.3,1.8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["HOT HABANERO SAUCE",9,0.3,0.1,0.9],["SOUR CREAM",57,5.6,0.5,1.1],["MANGO SALSA",9,0.2,0.2,1.9],["MELTED CHEESE QUESO",107,8,4,4]],"dressing":[]},"salad":{"proteins":{"regular":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"mini":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"pro":[["GRILLED BARBEQUE CHICKEN",596,28,54,45],["MEXICAN PANEER",836,59,43,49]]},"rice":{"regular":[["CILANTRO RICE",266,6.6,8.8,66],["BROWN RICE",135,1.6,2.8,26.7],["NO RICE",0,0,0,0]],"mini":[["CILANTRO RICE",177,4.4,5.9,44],["BROWN RICE",135,1.6,2.8,26.7],["NO RICE",0,0,0,0]],"pro":[["CILANTRO RICE",266,6.6,8.8,66],["BROWN RICE",266,6.6,8.8,66],["NO RICE",0,0,0,0]]},"beans":{"regular":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"mini":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"pro":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]]},"toppings":{"regular":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3],["LETTUCE",23,0.3,2.1,4.4]],"mini":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["LETTUCE",15,0.2,1.4,2.9]],"pro":[["GRILLED ONION & CAPSICUM",18,0,2,4],["CORN SALSA",35,0,1.2,7.2]]},"extraToppings":[["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["CHEESE",23,1.8,1.2,0],["CORN SALSA",35,0,1.2,7.2],["MEXICAN VEGGIE MIX",24,0.8,0.8,3.6]],"extraFillings":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",154,6.4,20.3,3.2],["MEXICAN PANEER",291,22.6,13.5,7.5],["BARBEQUE PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8]],"makeItRich":[["SUNFLOWER SEEDS",9,0.2,0.2,1.9],["GUACAMOLE",148,13.3,1.9,9.2],["CRUSHED CORN CHIPS",10,0.2,0.3,1.8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["HOT HABANERO SAUCE",9,0.3,0.1,0.9],["SOUR CREAM",57,5.6,0.5,1.1],["MANGO SALSA",9,0.2,0.2,1.9],["MELTED CHEESE QUESO",107,8,4,4]],"dressing":{"regular":[["CHILLI LIME VINAIGRETTE",28,0.2,0.4,6.5],["RANCH DRESSING",10,1.1,0,0.1],["CHIPOTLE MAYO",24,0.8,0.8,1.2]],"mini":[["CHILLI LIME VINAIGRETTE",28,0.2,0.4,6.5],["RANCH DRESSING",10,1.1,0,0.1],["CHIPOTLE MAYO",24,0.8,0.8,1.2]],"pro":[["CHILLI LIME VINAIGRETTE",28,0.2,0.4,6.5],["RANCH DRESSING",10,1.1,0,0.1],["CHIPOTLE MAYO",24,0.8,0.8,1.2]]}},"sides":[["GRILLED BBQ CHICKEN",592,31.9,67,5.6],["CHILI CHIPOTLE CHICKEN",647,36.8,56.2,21.8],["GUACAMOLE",617,55.2,8.1,38.5],["BBQ PANEER",944,64.5,42.4,50.2],["MEXICAN PANEER",908,70.7,42.1,23.3],["MANGO SALSA",45,1,1,9.5],["TOMATILLO RED CHILI SALSA",159,3.7,4.8,31.2],["TOMATILLO ROASTED SALSA",135,2.2,4.7,26],["CORN SALSA",342,5.4,13.2,74.3],["JALAPENOS",25,0,0,2.5],["SOUR CREAM",646,64.2,6.1,12.4],["MEXICAN VEGGIE MIX",62,0.5,2.4,14.6]],"tacos":{"proteins":{"three":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"one":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]],"overcrowded":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]]},"rice":{"three":[["CILANTRO RICE",314,6.9,5.5,55.5],["BROWN RICE",268,3.3,5.6,53.2],["NO RICE",0,0,0,0]],"one":[["CILANTRO RICE",209,4.6,3.7,37],["BROWN RICE",178,2.2,3.7,35.4],["NO RICE",0,0,0,0]],"overcrowded":[["CILANTRO RICE",314,6.9,5.5,55.5],["BROWN RICE",268,3.3,5.6,53.2],["NO RICE",0,0,0,0]]},"beans":{"three":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"one":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]],"overcrowded":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]]},"toppings":{"three":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3]],"one":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8]],"overcrowded":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3]]},"shell":{"three":[["SOFT SHELL",171,2.4,4.5,35.1],["CRUNCHY SHELL",210,9.6,3.9,30]],"one":[["SOFT SHELL",57,0.8,1.5,11.7],["CRUNCHY SHELL",70,3.2,1.3,10]],"overcrowded":[["SOFT SHELL",171,2.4,4.5,35.1],["CRUNCHY SHELL",210,9.6,3.9,30]]},"filling":{"overcrowded":[["7 LAYER VEG TACO",664,24.4,22.8,94.8,"veg"],["CHIPOTLE POTATO TACO",660,26,17.2,92.4,"veg"],["7 LAYER CHICKEN TACO",728,31.6,33.2,80.4,"nonveg"],["CHIPOTLE CRISPY CHICKEN TACO",712,35.6,32.4,71.2,"nonveg"]]},"extraToppings":[["LETTUCE",2,0,0,0],["JALAPENOS",1,0,0,0.1],["CHEESE",23,1.8,1.2,0],["CORN SALSA",35,0,1.2,7.2],["MEXICAN VEGGIE MIX",24,0.8,0.8,3.6]],"extraFillings":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",154,6.4,20.3,3.2],["MEXICAN PANEER",291,22.6,13.5,7.5],["BARBEQUE PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8]],"makeItRich":[["SUNFLOWER SEEDS",9,0.2,0.2,1.9],["GUACAMOLE",148,13.3,1.9,9.2],["CRUSHED CORN CHIPS",10,0.2,0.3,1.8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["HOT HABANERO SAUCE",9,0.3,0.1,0.9],["SOUR CREAM",57,5.6,0.5,1.1],["MANGO SALSA",9,0.2,0.2,1.9],["MELTED CHEESE QUESO",107,8,4,4]],"dressing":[]},"quesadilla":{"proteins":{"regular":[["CHEESY CHIPOTLE CHICKEN",343,21.2,19.7,16.6],["MEXICAN CORN FIESTA",285,15,11.2,27.8],["SOUTHWEST MUSHROOM",334,23.2,11.1,19.2],["CHEESY CHICKEN DOMINATOR",339,20.8,21,15],["CALIFORNIA CHICKEN",373,21.2,22.3,23.5],["PEPPY PANEER",437,28.5,18.5,27.4],["CHEESE MELT",272,13.8,11.9,24.6]]},"chooseyourdip":[["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["CREAMY RANCH",75,8.4,0.9,3.8],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4]],"beans":{"regular":[["BLACK BEANS",59,1.3,4.7,11.3],["PINTO BEANS",46,0.5,3.2,8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["MELTED CHEESE QUESO",107,8,4,4],["SOUR CREAM",57,5.6,0.5,1.1]]}},"munchies":{"snacks":[["Snachos",346,22.1,4.4,35,"veg"],["Cheesy Tostada",316,14.2,9,39.4,"veg"],["Popcorn Mushroom with dip",190,10,4,22,"veg"],["Crispy Peri-Peri Chicken Popper",215,10,11,20,"nonveg"],["Popcorn Chicken",205,9,11,18,"nonveg"],["Popcorn Mushroom",178,9,4,20,"veg"],["Popcorn Potato",170,8,3,22,"veg"],["Topped Nachos - Veg",244,15.6,3.2,24.9,"veg"],["Topped Nachos - Chicken",322,20,10,27.5,"nonveg"],["Avocado Tostada",279,18.4,4.4,28.1,"veg"],["Veg Tostada",148,7,4,18,"veg"],["Tortilla Chips",120,5,2,16,"veg"],["Plain Nachos",295,19.6,3.4,28.3,"veg"]],"chooseyourdip":[["Red Chili Tomatillo Salsa",14,0.3,0.4,2.8],["Southwest Sauce",18,0.2,0.6,3.6],["Roasted Tomatillo Salsa",7,0.1,0.2,1.4],["Creamy Ranch",75,8.4,0.9,3.8]]},"nachos":{"proteins":{"regular":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",207,11.8,18,7],["MEXICAN PANEER",291,22.6,13.5,7.5],["BBQ PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8],["GUACMOLE AND VEGGIE",197,17.7,2.6,12.3]]},"rice":{"regular":[["BROWN RICE",45,0.9,0.6,9],["CILANTRO RICE",314,6.9,5.5,55.5],["NO RICE",0,0,0,0]]},"beans":{"regular":[["BLACK BEANS",94,3.4,4.9,13.3],["PINTO BEANS",71,1.8,3.7,10.5],["NO BEANS",0,0,0,0]]},"toppings":{"regular":[["GRILLED ONION & CAPSICUM",28,0.6,1.4,5.5],["CORN SALSA",41,0.6,1.6,8.9],["SOUR CREAM",57,5.6,0.5,1.1],["FRESH TOMATO AND ONION SALSA",13,0.1,0.6,2.9],["ROASTED TOMATILLO SALSA",7,0.1,0.2,1.4],["RED CHILI TOMATILLO SALSA",14,0.3,0.4,2.8],["CHEESE",23,1.8,1.2,0],["LETTUCE",2,0,0.1,0],["JALAPENOS",1,0,0,0.1],["MEXICAN VEGGIE MIX",10,0.1,0.4,2.3]]},"extraToppings":[["LETTUCE",2,0,0,0],["JALAPENOS",1,0,0,0.1],["CHEESE",23,1.8,1.2,0],["CORN SALSA",35,0,1.2,7.2],["MEXICAN VEGGIE MIX",24,0.8,0.8,3.6]],"extraFillings":[["GRILLED BARBEQUE CHICKEN",190,10.2,21.4,1.8],["CRISPY PERI PERI CHICKEN",238,13.4,19.4,13.8],["CHILI CHIPOTLE CHICKEN",207,11.8,18,7],["CARNITAS CHICKEN",154,6.4,20.3,3.2],["MEXICAN PANEER",291,22.6,13.5,7.5],["BARBEQUE PANEER",302,20.6,13.6,16.1],["CRISPY MUSHROOM",209,15.3,4.8,14.5],["PERI PERI POTATO",187,3.7,4,34.8]],"makeItRich":[["SUNFLOWER SEEDS",9,0.2,0.2,1.9],["GUACAMOLE",148,13.3,1.9,9.2],["CRUSHED CORN CHIPS",10,0.2,0.3,1.8],["CHIPOTLE MAYO",24,0.8,0.8,3.6],["SOUTHWEST SAUCE",18,0.2,0.6,3.6],["HOT HABANERO SAUCE",9,0.3,0.1,0.9],["SOUR CREAM",57,5.6,0.5,1.1],["MANGO SALSA",9,0.2,0.2,1.9],["MELTED CHEESE QUESO",107,8,4,4]],"dressing":[]}};

const MEALS = {
  ricebowl: { name: 'Rice Bowl', sizes: ['regular', 'mini', 'pro'], unit: 'bowl' },
  burrito: { name: 'Burrito', sizes: ['regular', 'mini', 'habanero'], unit: 'burrito' },
  salad: { name: 'Salad Bowl', sizes: ['regular', 'mini', 'pro'], unit: 'bowl' },
  tacos: { name: 'Tacos', sizes: ['three', 'one', 'overcrowded'], unit: 'serving' },
  nachos: { name: 'Nachos', sizes: ['regular'], unit: 'serving' },
  quesadilla: { name: 'Quesadilla', sizes: ['regular'], unit: 'quesadilla' },
  munchies: { name: 'Munchies', sizes: ['regular'], unit: 'serving' },
  sides: { name: 'Side', sizes: ['regular'], unit: 'side' },
};
// What usually goes in when only the meal and protein are named. Checked against the
// published bowl totals (e.g. regular Mexican paneer rice bowl ≈ 790 kcal, mini BBQ chicken ≈ 570).
const DEFAULT_TOPPINGS = {
  regular: ['FRESH TOMATO AND ONION SALSA', 'CORN SALSA', 'CHEESE', 'LETTUCE'],
  mini: ['FRESH TOMATO AND ONION SALSA', 'CORN SALSA', 'GRILLED ONION & CAPSICUM'],
};

const list = (meal, cat, size) => { const v = (CB[meal] || {})[cat]; if (!v) return []; return Array.isArray(v) ? v : (v[size] || v.regular || v[Object.keys(v)[0]] || []); };
const find = (rows, name) => rows.find(r => r[0] === name) || null;
const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bBbq\b/g, 'BBQ').replace(/Guacmole/g, 'Guacamole');

/* Sum a meal. picks: {protein, rice, beans, toppings[], extraToppings[], extraFillings[],
   makeItRich[], dressing, shell, filling, snack, dips[], side} — names as in the data. */
function build(meal, size, picks) {
  const M = MEALS[meal]; if (!M) return null;
  size = M.sizes.includes(size) ? size : M.sizes[0];
  const parts = [], add = (row, label) => { if (row) parts.push({ name: row[0], label: label || titleCase(row[0]), kcal: row[1], fat: row[2], protein: row[3], carbs: row[4] }); };
  const p = picks || {};
  if (meal === 'burrito') add(list('burrito', 'tortilla', size)[0], 'Tortilla');
  if (meal === 'tacos') add(find(list('tacos', 'shell', size), p.shell || 'SOFT SHELL'), 'Taco shells');
  if (meal === 'nachos') add(find(CB.munchies.snacks, 'Plain Nachos'), 'Nacho chips');
  if (meal === 'tacos' && size === 'overcrowded') add(find(list('tacos', 'filling', size), p.filling));
  else if (meal === 'munchies') add(find(CB.munchies.snacks, p.snack));
  else if (meal === 'sides') add(find(CB.sides, p.side));
  else add(find(list(meal, 'proteins', size), p.protein));
  const full = (meal === 'ricebowl' || meal === 'salad') && size === 'pro' || meal === 'burrito' && size === 'habanero' || meal === 'tacos' && size === 'overcrowded';
  if (!full && ['ricebowl', 'burrito', 'salad', 'nachos', 'tacos'].includes(meal)) {
    if (p.rice && p.rice !== 'NO RICE') add(find(list(meal, 'rice', size), p.rice));
    if (p.beans && p.beans !== 'NO BEANS') add(find(list(meal, 'beans', size), p.beans));
    for (const t of p.toppings || []) add(find(list(meal, 'toppings', size), t));
    for (const t of p.extraToppings || []) add(find(list(meal, 'extraToppings', size), t), 'Extra ' + titleCase(t).toLowerCase());
  }
  if (meal === 'quesadilla') for (const t of p.extras || []) add(find(list('quesadilla', 'beans', size), t), 'Extra ' + titleCase(t).toLowerCase());
  if (!(meal === 'burrito' && size === 'habanero') && !['quesadilla', 'munchies', 'sides'].includes(meal) && !(meal === 'tacos' && size === 'overcrowded')) {
    for (const t of p.extraFillings || []) add(find(list(meal, 'extraFillings', size), t), 'Extra ' + titleCase(t).toLowerCase());
    for (const t of p.makeItRich || []) add(find(list(meal, 'makeItRich', size), t));
  }
  if (meal === 'salad' && p.dressing) add(find(list('salad', 'dressing', size), p.dressing));
  if (['quesadilla', 'munchies'].includes(meal)) for (const t of p.dips || []) add(find(CB[meal].chooseyourdip, t), titleCase(t) + ' dip');
  const sum = k => Math.round(parts.reduce((s, x) => s + (x[k] || 0), 0) * 10) / 10;
  const main = parts.find(x => !/^(Tortilla|Taco shells|Nacho chips)$/.test(x.label));
  const sizeName = M.sizes.length > 1 && size !== 'habanero' ? ` (${size === 'three' ? '3 tacos' : size === 'one' ? '1 taco' : size[0].toUpperCase() + size.slice(1)})` : '';
  const title = meal === 'munchies' || meal === 'sides' ? (main ? titleCase(main.name) : M.name) + (meal === 'sides' ? ' (side)' : '')
    : meal === 'tacos' && size === 'overcrowded' ? (main ? titleCase(main.name) : 'Tacos') + ' (Overcrowded)'
    : `${main ? main.label.replace(/^Guacamole And Veggie$/, 'Guac & Veggie') : ''} ${M.name}${sizeName}`.trim();
  return { meal, size, title: 'California Burrito ' + title, unit: M.unit, parts, kcal: Math.round(sum('kcal')), fat: sum('fat'), protein: sum('protein'), carbs: sum('carbs') };
}

/* ---------- reading what people type ---------- */
const BRAND = /\b(california burrito|cali(fornia)? burito|cali burrito|calif burrito|\bcb\b)\b/i;
const PROTEINS = [
  ['GRILLED BARBEQUE CHICKEN', /\b(grilled|bbq|barbe?que|barbecue)\s*(bbq\s*)?chicken\b/],
  ['CRISPY PERI PERI CHICKEN', /\b(crispy\s*)?peri\s*-?\s*peri\s*chicken\b|\bcrispy chicken\b/],
  ['CHILI CHIPOTLE CHICKEN', /\b(chil+i\s*)?chipotle chicken\b/],
  ['CARNITAS CHICKEN', /\bcarnitas\b/],
  ['BBQ PANEER', /\b(bbq|barbe?que|barbecue)\s*paneer\b/],
  ['MEXICAN PANEER', /\b(mexican\s*)?paneer\b/],
  ['CRISPY MUSHROOM', /\b(crispy\s*)?mushroom\b/],
  ['PERI PERI POTATO', /\b(peri\s*-?\s*peri\s*)?potato\b/],
  ['GUACMOLE AND VEGGIE', /\b(guac(amole)?\s*(and|&|n)\s*veg(gie|gies|etable)?s?|veggie)\b/],
];
const CHICKEN_ANY = /\bchicken\b/;
const TOPPINGS = [
  ['GRILLED ONION & CAPSICUM', /\b(onion\s*(and|&)?\s*capsicum|fajita veg(gies)?|grilled onion)\b/],
  ['CORN SALSA', /\bcorn salsa\b/],
  ['SOUR CREAM', /\bsour cream\b/],
  ['FRESH TOMATO AND ONION SALSA', /\b(tomato( and onion)? salsa|pico( de gallo)?|fresh salsa)\b/],
  ['ROASTED TOMATILLO SALSA', /\broasted tomatillo\b|\bgreen salsa\b/],
  ['RED CHILI TOMATILLO SALSA', /\bred chil+i( tomatillo)?( salsa)?\b|\bred salsa\b/],
  ['CHEESE', /\bcheese\b(?!\s*(queso|melt))/],
  ['LETTUCE', /\blettuce\b/],
  ['JALAPENOS', /\bjalape(n|ñ)os?\b/],
  ['MEXICAN VEGGIE MIX', /\b(mexican )?veggie mix\b/],
];
const RICH = [
  ['GUACAMOLE', /\bguac(amole)?\b(?!\s*(and|&|n)\s*veg)/], ['MELTED CHEESE QUESO', /\bqueso\b|\bmelted cheese\b/], ['SOUR CREAM', /\bsour cream\b/],
  ['CHIPOTLE MAYO', /\bchipotle mayo\b/], ['SOUTHWEST SAUCE', /\bsouth\s*west( sauce)?\b/], ['HOT HABANERO SAUCE', /\bhabanero sauce\b/],
  ['MANGO SALSA', /\bmango salsa\b/], ['SUNFLOWER SEEDS', /\bsunflower\b/], ['CRUSHED CORN CHIPS', /\b(crushed )?corn chips\b/],
];
const EXTRA_FILL = { 'GRILLED BARBEQUE CHICKEN': 'GRILLED BARBEQUE CHICKEN', 'CRISPY PERI PERI CHICKEN': 'CRISPY PERI PERI CHICKEN', 'CHILI CHIPOTLE CHICKEN': 'CHILI CHIPOTLE CHICKEN', 'CARNITAS CHICKEN': 'CARNITAS CHICKEN', 'MEXICAN PANEER': 'MEXICAN PANEER', 'BBQ PANEER': 'BARBEQUE PANEER', 'CRISPY MUSHROOM': 'CRISPY MUSHROOM', 'PERI PERI POTATO': 'PERI PERI POTATO' };
const QUESADILLAS = [['CHEESY CHIPOTLE CHICKEN', /cheesy chipotle/], ['MEXICAN CORN FIESTA', /corn fiesta/], ['SOUTHWEST MUSHROOM', /mushroom/], ['CHEESY CHICKEN DOMINATOR', /dominator/], ['CALIFORNIA CHICKEN', /california chicken|\bchicken\b/], ['PEPPY PANEER', /paneer/], ['CHEESE MELT', /cheese melt|\bcheese\b/]];
const OVERCROWDED = [['7 LAYER CHICKEN TACO', /7 layer chicken|seven layer chicken/], ['7 LAYER VEG TACO', /7 layer|seven layer/], ['CHIPOTLE CRISPY CHICKEN TACO', /chipotle crispy chicken|crispy chicken/], ['CHIPOTLE POTATO TACO', /potato/]];
const DIPS = [['Red Chili Tomatillo Salsa', /red chil+i/], ['Southwest Sauce', /south\s*west/], ['Roasted Tomatillo Salsa', /roasted tomatillo/], ['Creamy Ranch', /ranch/]];

const isCB = t => BRAND.test(String(t || ''));
// "with", "extra", "no …" pieces that belong to the meal before them ("cb bowl, extra paneer").
const ADDON = /^\s*(extra |double |add |with |no |without |plus |and )*(guac(amole)?|queso|melted cheese|sour cream|cheese|lettuce|jalape(n|ñ)os?|corn salsa|mango salsa|tomato salsa|red salsa|green salsa|salsa|chipotle mayo|south\s*west( sauce)?|habanero sauce|sunflower seeds|corn chips|veggie mix|onion and capsicum|brown rice|cilantro rice|rice|black beans|pinto beans|beans|ranch|vinaigrette|dressing|toppings|(bbq |grilled |peri peri |crispy |chipotle |mexican )?(chicken|paneer|mushroom|potato))\s*$/i;
const isModifier = t => (/^\s*(extra|add|added|with|w\/|no|without|plus|double|less)\b/i.test(t) || ADDON.test(t)) && !/\d+\s*(g|ml|kg|roti|eggs?|pieces?|cups?|bowls? of)\b/i.test(t);
// Split "cb bowl and 1 banana": keep add-ons with the meal, hand back the rest.
function splitOrder(t) {
  const parts = String(t).split(/\s+(?:and|&|\+)\s+/i), order = [parts[0]], rest = [];
  for (const x of parts.slice(1)) (isModifier(x) && !rest.length ? order : rest).push(x);
  return { order: order.join(' and '), rest };
}

function parse(text) {
  let t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ') + ' ';
  if (!BRAND.test(t)) return null;
  t = t.replace(BRAND, ' ');
  const qtyM = t.match(/^\s*(\d+|one|two|three)\s*x?\s/); const qty = qtyM ? ({ one: 1, two: 2, three: 3 }[qtyM[1]] || +qtyM[1]) : 1;
  // Extras first, so "extra paneer" doesn't decide the main protein.
  const extraFillings = [], extraToppings = [];
  t = t.replace(/\b(extra|double|add(ed)?|plus)\s+(bbq |grilled |barbe?que |peri peri |crispy |chipotle |mexican |carnitas )?(chicken|paneer|mushroom|potato)\b/g, (m, a, b, c, kind) => { extraFillings.push(((c || '') + kind).trim()); return ' '; });
  t = t.replace(/\b(extra|double)\s+(cheese|lettuce|jalape(n|ñ)os?|corn salsa|veggie mix|mexican veggie mix)\b/g, (m, a, x) => { extraToppings.push(x); return ' '; });
  const no = w => new RegExp(`\\b(no|without|skip)\\s+${w}`).test(t);
  const has = re => re.test(t);
  let meal = has(/\bquesadilla/) ? 'quesadilla' : has(/\bnachos?\b/) && !has(/\b(topped nachos|plain nachos|snachos)\b/) ? 'nachos' : has(/\btacos?\b/) ? 'tacos'
    : has(/\bsalad/) ? 'salad' : has(/\b(rice )?bowl\b/) ? 'ricebowl' : has(/\b(burrito|wrap)\b/) ? 'burrito'
    : has(/\bside\b/) ? 'sides' : null;
  const snack = CB.munchies.snacks.find(r => t.includes(r[0].toLowerCase().replace(/[-]/g, ' ').replace(/\s+/g, ' ')) || t.includes(r[0].toLowerCase()));
  if (!meal && snack) meal = 'munchies';
  if (!meal && has(/\b(snachos|tostada|popcorn|popper|tortilla chips|topped nachos|plain nachos)\b/)) meal = 'munchies';
  if (!meal) meal = 'ricebowl';
  let size = has(/\bmini\b/) ? 'mini' : has(/\bpro\b/) ? 'pro' : has(/\bhabanero\b/) && meal === 'burrito' ? 'habanero' : 'regular';
  if (meal === 'tacos') size = has(/\bover\s*crowded\b/) ? 'overcrowded' : has(/\b(one|1|single) taco\b/) ? 'one' : 'three';
  const picks = { extraFillings: [], extraToppings: [], makeItRich: [], toppings: [], extras: [], dips: [], shell: has(/\b(crunchy|crispy|hard)\s*(taco\s*)?shells?\b|\bcrunchy\b/) ? 'CRUNCHY SHELL' : 'SOFT SHELL' };
  const assumed = [];
  if (meal === 'munchies') { const s = snack || CB.munchies.snacks.find(r => r[0] === (has(/topped nachos/) ? (has(/chicken/) ? 'Topped Nachos - Chicken' : 'Topped Nachos - Veg') : has(/popcorn chicken/) ? 'Popcorn Chicken' : has(/popper/) ? 'Crispy Peri-Peri Chicken Popper' : has(/popcorn mushroom/) ? (has(/dip/) ? 'Popcorn Mushroom with dip' : 'Popcorn Mushroom') : has(/popcorn potato/) ? 'Popcorn Potato' : has(/avocado/) ? 'Avocado Tostada' : has(/cheesy tostada/) ? 'Cheesy Tostada' : has(/tostada/) ? 'Veg Tostada' : has(/snachos/) ? 'Snachos' : has(/plain nachos/) ? 'Plain Nachos' : 'Tortilla Chips')); picks.snack = s && s[0]; }
  else if (meal === 'sides') { const s = CB.sides.find(r => t.includes(r[0].toLowerCase()) || (r[0] === 'GUACAMOLE' && /guac/.test(t)) || (r[0] === 'GRILLED BBQ CHICKEN' && /(bbq|grilled) chicken/.test(t))); picks.side = s && s[0]; }
  else if (meal === 'quesadilla') { const q = QUESADILLAS.find(([, re]) => re.test(t)); picks.protein = q ? q[0] : 'CHEESE MELT'; if (!q) assumed.push('cheese melt'); }
  else if (meal === 'tacos' && size === 'overcrowded') { const f = OVERCROWDED.find(([, re]) => re.test(t)); picks.filling = f ? f[0] : '7 LAYER VEG TACO'; }
  else {
    let pr = PROTEINS.find(([, re]) => re.test(t));
    if (!pr && CHICKEN_ANY.test(t)) { pr = PROTEINS[0]; assumed.push('grilled BBQ chicken'); }
    if (size === 'pro') pr = /paneer/.test(t) ? ['MEXICAN PANEER'] : ['GRILLED BARBEQUE CHICKEN'];
    if (meal === 'burrito' && size === 'habanero') pr = [/paneer/.test(t) ? 'PANEER HABANERO' : 'CHICKEN HABANERO'];
    if (!pr) return { meal, size, need: 'protein' };
    picks.protein = pr[0];
  }
  // Extra fillings: "extra chicken" means more of the same chicken; plain "extra paneer" is Mexican paneer.
  for (const x of extraFillings) {
    const main = picks.protein || '';
    const exact = PROTEINS.find(([, re]) => re.test(' ' + x + ' '));
    let row = exact && /^(bbq |grilled |barbe?que |peri peri |crispy |chipotle |mexican |carnitas )/.test(x) ? exact[0]
      : /chicken/.test(x) ? (/CHICKEN/.test(main) && EXTRA_FILL[main] ? main : 'GRILLED BARBEQUE CHICKEN')
      : /paneer/.test(x) ? (/PANEER/.test(main) ? main : 'MEXICAN PANEER') : exact ? exact[0] : null;
    if (row && EXTRA_FILL[row]) picks.extraFillings.push(EXTRA_FILL[row]);
  }
  for (const x of extraToppings) { const r = TOPPINGS.find(([, re]) => re.test(' ' + x + ' ')); if (r) picks.extraToppings.push(r[0]); }
  if (['ricebowl', 'burrito', 'salad', 'nachos', 'tacos'].includes(meal) && size !== 'pro' && size !== 'habanero' && size !== 'overcrowded') {
    // Bowls and burritos come with cilantro rice; salads, tacos and nachos only when asked.
    picks.rice = no('rice') ? 'NO RICE' : has(/\bbrown rice\b/) ? 'BROWN RICE' : ['tacos', 'nachos', 'salad'].includes(meal) ? (has(/\brice\b/) ? 'CILANTRO RICE' : null) : 'CILANTRO RICE';
    picks.beans = no('beans') ? 'NO BEANS' : has(/\bpinto\b/) ? 'PINTO BEANS' : meal === 'tacos' && !has(/\bblack beans?\b/) ? null : 'BLACK BEANS';
    // The usual toppings, plus any named, minus any "no …".
    const removed = TOPPINGS.filter(([, re]) => new RegExp(`\\b(no|without|skip)\\s+(${re.source.replace(/^\\b|\\b$/g, '')})`).test(t)).map(r => r[0]);
    const named = TOPPINGS.filter(([n, re]) => re.test(t) && !removed.includes(n)).map(r => r[0]);
    const avail = list(meal, 'toppings', size).map(r => r[0]);
    const tops = no('toppings') ? [] : [...new Set([...(meal === 'tacos' && size === 'one' ? DEFAULT_TOPPINGS.mini : DEFAULT_TOPPINGS[size] || DEFAULT_TOPPINGS.regular), ...named])];
    picks.toppings = tops.filter(x => avail.includes(x) && !removed.includes(x));
    if (meal === 'salad') picks.dressing = has(/ranch/) ? 'RANCH DRESSING' : has(/chipotle mayo/) ? 'CHIPOTLE MAYO' : no('dressing') ? null : 'CHILLI LIME VINAIGRETTE';
  }
  for (const [n, re] of RICH) if (re.test(t) && !(n === 'SOUR CREAM' && picks.toppings.includes('SOUR CREAM')) && !(n === 'CHIPOTLE MAYO' && picks.dressing === 'CHIPOTLE MAYO')) picks.makeItRich.push(n);
  if (meal === 'quesadilla') { picks.extras = ['BLACK BEANS', 'PINTO BEANS', 'CHIPOTLE MAYO', 'MELTED CHEESE QUESO', 'SOUR CREAM'].filter(n => new RegExp(n.toLowerCase().replace('melted cheese queso', 'queso')).test(t)); picks.makeItRich = []; }
  if (meal === 'quesadilla' || meal === 'munchies') picks.dips = DIPS.filter(([, re]) => re.test(t)).map(d => meal === 'quesadilla' ? d[0].toUpperCase() : d[0]);
  const r = build(meal, size, picks); if (!r || !r.parts.length) return null;
  r.qty = qty; r.picks = picks; r.assumed = assumed;
  return r;
}

const api = { CB, MEALS, build, parse, isCB, isModifier, splitOrder, list, titleCase, DEFAULT_TOPPINGS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Restaurants = api;
})(this);
