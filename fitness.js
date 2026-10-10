// Calories and workouts: pure helpers and the offline food list. No DOM. Browser: window.FITNESS; Node tests: require('./fitness.js').
// Everything here runs on the phone; nothing is sent to the house database.
(function (g) {
  const F = {};

  // ---------- OFFLINE FOOD LIST ----------
  // Rows: [name, kcal, protein g, carbs g, fat g, group, est] per typical serving.
  // est = 1: not an exact record for that dish: either the closest USDA record (for example "Lo mein, with pork" for pancit canton)
  // or a sum of USDA parts. The app shows these with an "est." badge.
  // USDA values: FoodData Central, Food and Nutrient Database for Dietary Studies (FNDDS) 2021-2023, FDC release 2024-10-31
  // (https://fdc.nal.usda.gov/, record = FDC id). kcal per serving = energy per 100 g x the FNDDS portion weight shown;
  // protein, carbohydrate and fat use the same record and portion. Rounded to whole numbers.
  F.FOODS = [
    // FDC 2708408 "Rice, white, cooked, no added fat" 129 kcal/100 g x 158 g (1 cup, cooked) = 203.8
    ['Rice, 1 cup', 204, 4, 44, 0, 'rice', 0],
    // FDC 2708951 "Rice, fried, meatless" 174 kcal/100 g x 166 g (1 cup) = 288.8 [estimate: closest USDA match]
    ['Fried rice / sinangag, 1 cup', 289, 6, 54, 5, 'rice', 1],
    // FDC 2707655 "Roll, white, hard" (FNDDS lists "Pan de sal / Pandisal Filipino bread" under this record) 293 kcal/100 g x 25 g (1 miniature/small roll) = 73.3
    ['Pandesal, 1 small roll', 73, 2, 13, 1, 'rice', 0],
    // FDC 2707598 "Bread, white" 267 kcal/100 g x 28 g (1 medium or regular slice) = 74.8
    ['Loaf bread, 1 slice', 75, 3, 14, 1, 'rice', 0],
    // FDC 2708418 "Congee" 39 kcal/100 g x 255 g (1 cup) = 99.5
    ['Lugaw (plain rice porridge), 1 cup', 99, 2, 21, 0, 'rice', 0],
    // FDC 2708981 "Congee, with meat, poultry, and/or seafood" 58 kcal/100 g x 255 g (1 cup) = 147.9 [estimate: closest USDA match]
    ['Arroz caldo / lugaw with chicken, 1 cup', 148, 11, 18, 3, 'rice', 1],
    // FDC 2709152 "Soup, ramen noodles, water added" 66 kcal/100 g x 245 g (1 cup) = 161.7
    ['Instant noodle soup, 1 cup prepared', 162, 4, 22, 6, 'rice', 0],
    // FDC 2708356 "Rice noodles, cooked" 107 kcal/100 g x 175 g (1 cup, cooked) = 187.3
    ['Bihon (rice noodles, plain), 1 cup', 187, 3, 42, 0, 'rice', 0],
    // FDC 2708801 "Lo mein, with pork" 138 kcal/100 g x 200 g (1 cup) = 276 [estimate: closest USDA match]
    ['Pancit canton, 1 cup', 276, 19, 32, 8, 'rice', 1],
    // FDC 2708958 "Adobo, with rice" (FNDDS: "Filipino dish") 181 kcal/100 g x 244 g (1 cup) = 441.6
    ['Adobo with rice, 1 cup', 442, 43, 22, 19, 'ulam', 0],
    // FDC 2707154 "Egg, whole, boiled or poached" 143 kcal/100 g x 50 g (1 egg) = 71.5
    ['Egg, boiled', 72, 6, 0, 5, 'ulam', 0],
    // FDC 2707158 "Egg, whole, fried with oil" 192 kcal/100 g x 55 g (1 egg) = 105.6
    ['Egg, fried in oil', 106, 6, 0, 9, 'ulam', 0],
    // Sum of parts: FDC 2706179 "Chorizo" 341 kcal/100 g x 75 g (1 piece) = 255.8 + FDC 2708951 "Rice, fried, meatless" 174 x 166 g (1 cup) = 288.8
    // + FDC 2707158 "Egg, whole, fried with oil" 192 x 55 g (1 egg) = 105.6; total 650.2 [estimate: chorizo stands in for longganisa]
    ['Longsilog (longganisa, sinangag, fried egg)', 650, 27, 56, 35, 'ulam', 1],
    // FDC 2706023 "Chicken drumstick, fried, coated, skin / coating eaten, from fast food / restaurant" 288 kcal/100 g x 85 g (1 drumstick) = 244.8
    ['Fried chicken drumstick', 245, 15, 10, 16, 'ulam', 0],
    // FDC 2706050 "Chicken thigh, fried, coated, skin / coating eaten, from fast food" 294 kcal/100 g x 110 g (1 thigh) = 323.4
    ['Fried chicken thigh', 323, 18, 14, 22, 'ulam', 0],
    // FDC 2706211 "Spam" 315 kcal/100 g x 56 g (1 slice, NFS) = 176.4
    ['Spam / luncheon meat, 1 slice', 176, 8, 3, 15, 'ulam', 0],
    // FDC 2706166 "Hot dog, NFS" 310 kcal/100 g x 57 g (1 regular) = 176.7
    ['Hotdog, 1 regular', 177, 7, 2, 16, 'ulam', 0],
    // FDC 2705850 "Beef, corned" 251 kcal/100 g x 60 g (Quantity not specified) = 150.6
    ['Corned beef, 60 g', 151, 11, 0, 11, 'ulam', 0],
    // FDC 2706179 "Chorizo" 341 kcal/100 g x 75 g (1 piece) = 255.8 [estimate: closest USDA match]
    ['Longganisa, 1 piece', 256, 14, 2, 21, 'ulam', 1],
    // FDC 2707389 "Mung beans, cooked" 156 kcal/100 g x 185 g (1 cup) = 288.6 [estimate: closest USDA match]
    ['Monggo (mung beans), 1 cup', 289, 12, 33, 13, 'ulam', 1],
    // FDC 2710064 "Chow mein or chop suey, meatless, no noodles" 43 kcal/100 g x 220 g (1 cup) = 94.6 [estimate: closest USDA match]
    ['Chop suey (vegetables), 1 cup', 95, 3, 13, 4, 'ulam', 1],
    // FDC 2706322 "Fish, tilapia, fried" 237 kcal/100 g x 90 g (1 small/regular fillet) = 213.3
    ['Tilapia, fried, 1 fillet', 213, 15, 11, 12, 'fish', 0],
    // FDC 2706227 "Fish, NS as to type, fried" 269 kcal/100 g x 90 g (1 small/regular fillet) = 242.1 [estimate: closest USDA match]
    ['Fried fish (bangus, galunggong), 1 fillet', 242, 14, 11, 15, 'fish', 1],
    // FDC 2706293 "Fish, sardines, canned" 208 kcal/100 g x 75 g (1 standard can) = 156
    ['Sardines, canned, 1 small can', 156, 18, 0, 9, 'fish', 0],
    // FDC 2706311 "Fish, tuna, canned" 85 kcal/100 g x 75 g (1 small can) = 63.8
    ['Tuna, canned, 1 small can', 64, 14, 0, 1, 'fish', 0],
    // FDC 2706334 "Calamari, fried" 234 kcal/100 g x 85 g (Quantity not specified) = 198.9
    ['Calamares (fried squid), 85 g', 199, 12, 12, 11, 'fish', 0],
    // FDC 2706364 "Shrimp, fried" 218 kcal/100 g x 85 g (Quantity not specified) = 185.3
    ['Fried shrimp, 85 g', 185, 10, 11, 11, 'fish', 0],
    // FDC 2708702 "Egg roll, with beef and/or pork" (FNDDS: "lumpia") 272 kcal/100 g x 64 g (1 egg roll) = 174.1
    ['Lumpia (pork), 1 large roll', 174, 5, 17, 9, 'snack', 0],
    // FDC 2708702 "Egg roll, with beef and/or pork" 272 kcal/100 g x 13 g (1 miniature roll) = 35.4
    ['Lumpiang shanghai, 1 small roll', 35, 1, 4, 2, 'snack', 0],
    // FDC 2708724 "Bao bun" 273 kcal/100 g x 100 g (1 item, any size) = 273 [estimate: closest USDA match]
    ['Siopao, 1 piece', 273, 11, 40, 8, 'snack', 1],
    // FDC 2708711 "Empanada, beef" 333 kcal/100 g x 35 g (1 small/individual) = 116.6
    ['Empanada (beef), 1 small', 117, 4, 10, 7, 'snack', 0],
    // FDC 2708345 "Cake made with glutinous rice" (FNDDS: "Filipino Puto cake") 279 kcal/100 g x 28.35 g (1 oz) = 79.1
    ['Puto, 28 g', 79, 1, 15, 2, 'snack', 0],
    // FDC 2705683 "Flan" (FNDDS: "Leche flan") 178 kcal/100 g x 130 g (Quantity not specified) = 231.4
    ['Leche flan, 1 serving (130 g)', 231, 7, 37, 6, 'snack', 0],
    // FDC 2705902 "Pork skin rinds" 544 kcal/100 g x 28 g (1 small single serving bag) = 152.3
    ['Chicharon (pork rinds), small bag', 152, 17, 0, 9, 'snack', 0],
    // FDC 2709422 "Potato chips, plain" 532 kcal/100 g x 28 g (1 small single serving bag) = 149
    ['Potato chips, small bag', 149, 2, 15, 10, 'snack', 0],
    // FDC 2708167 "Crackers, saltine" 418 kcal/100 g x 5 x 3 g (1 cracker) = 62.7
    ['Crackers (saltine), 5 pieces', 63, 1, 11, 1, 'snack', 0],
    // FDC 2707517 "Peanuts, dry roasted, salted" 587 kcal/100 g x 28.35 g (1 oz, NFS) = 166.4
    ['Peanuts, roasted, handful (28 g)', 166, 7, 6, 14, 'snack', 0],
    // FDC 2710328 "Chocolate candy" 535 kcal/100 g x 45 g (1 pouch/regular size) = 240.8
    ['Chocolate bar, regular', 241, 3, 27, 13, 'snack', 0],
    // FDC 2709224 "Banana, raw" 97 kcal/100 g x 126 g (1 banana) = 122.2
    ['Banana, 1 piece', 122, 1, 29, 0, 'fruit', 0],
    // FDC 2709242 "Mango, raw" 60 kcal/100 g x 210 g (1 mango) = 126
    ['Mango, 1 piece', 126, 2, 32, 1, 'fruit', 0],
    // FDC 2709246 "Papaya, raw" 43 kcal/100 g x 165 g (1 cup) = 71
    ['Papaya, 1 cup', 71, 1, 18, 0, 'fruit', 0],
    // FDC 2709260 "Pineapple, raw" 60 kcal/100 g x 165 g (1 cup) = 99
    ['Pineapple, 1 cup', 99, 1, 23, 0, 'fruit', 0],
    // FDC 2709171 "Orange, raw" 50 kcal/100 g x 154 g (1 fruit) = 77
    ['Orange, 1 piece', 77, 1, 18, 0, 'fruit', 0],
    // FDC 2709215 "Apple, raw" 61 kcal/100 g x 200 g (1 medium) = 122
    ['Apple, 1 medium', 122, 0, 30, 0, 'fruit', 0],
    // FDC 2710454 "Coffee, instant, pre-lightened and pre-sweetened with sugar, reconstituted" 27 kcal/100 g x 248 g (1 cup (8 fl oz)) = 67 [estimate: closest USDA match]
    ['3-in-1 coffee, 1 cup', 67, 0, 13, 2, 'drink', 1],
    // FDC 2710449 "Coffee, instant, reconstituted" 3 kcal/100 g x 240 g (1 cup (8 fl oz)) = 7.2
    ['Black coffee, 1 cup', 7, 0, 2, 0, 'drink', 0],
    // FDC 2710541 "Soft drink, cola" 42 kcal/100 g x 372 g (1 can (12 fl oz)) = 156.2
    ['Cola, 1 can (355 ml)', 156, 0, 39, 1, 'drink', 0],
    // FDC 2710616 "Beer" 43 kcal/100 g x 360 g (1 can or bottle (12 fl oz)) = 154.8
    ['Beer, 1 bottle (355 ml)', 155, 2, 13, 0, 'drink', 0],
    // FDC 2705385 "Milk, whole" 61 kcal/100 g x 244 g (1 cup) = 148.8
    ['Milk, whole, 1 cup', 149, 8, 11, 8, 'drink', 0],
    // FDC 2709186 "Orange juice, 100%, NFS" 47 kcal/100 g x 248 g (Quantity not specified) = 116.6
    ['Orange juice, 1 glass', 117, 2, 25, 1, 'drink', 0],
    // FDC 2710756 "Energy Drink" 43 kcal/100 g x 248 g (1 can or bottle (8 fl oz)) = 106.6
    ['Energy drink, 240 ml', 107, 1, 25, 0, 'drink', 0],
    // FDC 2706093 "Chicken nuggets, from fast food" 307 kcal/100 g x 6 x 16 g (1 nugget) = 294.7
    ['Chicken nuggets, 6 pieces', 295, 15, 14, 20, 'fastfood', 0],
    // FDC 2706892 "Cheeseburger (McDonalds)" 270 kcal/100 g x 110 g (1 cheeseburger) = 297. US recipe; the Philippine menu may differ.
    ["McDonald's cheeseburger (US recipe)", 297, 15, 28, 14, 'fastfood', 0],
    // FDC 2706924 "Hamburger (McDonalds)" 263 kcal/100 g x 100 g (1 hamburger) = 263. US recipe; the Philippine menu may differ.
    ["McDonald's hamburger (US recipe)", 263, 13, 30, 10, 'fastfood', 0],
    // Jollibee: "Nutrition Information for JOLLIBEE USA Standard Menu Items, as of 01 July 2026" (PDF linked from
    // https://www.jollibeefoods.com/nutrition). Calories, fat, carbohydrates and protein copied per item. US menu; the Philippine menu may differ.
    ['Jollibee Chickenjoy drumstick, 1 pc (US menu)', 220, 20, 3, 14, 'fastfood', 0], // 3.0 oz (85 g)
    ['Jollibee Chickenjoy thigh, 1 pc (US menu)', 380, 27, 5, 28, 'fastfood', 0], // 4.4 oz (125 g)
    ['Jollibee Spaghetti (US menu)', 610, 23, 76, 23, 'fastfood', 0], // 14.5 oz (411 g)
    ['Jollibee Yum burger (US menu)', 360, 13, 30, 21, 'fastfood', 0], // 4.2 oz (118 g)
    ['Jollibee Yum with cheese (US menu)', 410, 16, 30, 25, 'fastfood', 0], // 4.7 oz (132 g)
    ['Jollibee 2 pc Burgersteak with rice (US menu)', 570, 24, 56, 28, 'fastfood', 0], // 14.9 oz (422 g)
    ['Jollibee Jolly Crispy Fries, regular (US menu)', 340, 4, 41, 18, 'fastfood', 0], // 4.0 oz (113 g)
    ['Jollibee steamed rice (US menu)', 190, 4, 44, 0, 'fastfood', 0], // 7.0 oz (198 g)
  ];
  F.GROUPS = [['all', 'All'], ['rice', 'Rice, bread, noodles'], ['ulam', 'Ulam'], ['fish', 'Fish & seafood'], ['snack', 'Merienda & snacks'], ['fruit', 'Fruit'], ['drink', 'Drinks'], ['fastfood', 'Fast food']];

  // ---------- CALORIE MATH ----------
  const num = x => typeof x === 'number' && isFinite(x);
  // kcal (and macros) for a portion from per-100 g values, rounded to whole numbers. null when the input is not usable.
  F.portion = (per100, grams) => {
    if (!per100 || !num(per100.k) || !num(grams) || grams <= 0 || grams > 5000) return null;
    const r = v => (num(v) ? Math.round(v * grams / 100) : null);
    return { k: r(per100.k), p: r(per100.p), c: r(per100.c), f: r(per100.f) };
  };
  F.MEALS = [['b', 'Breakfast'], ['l', 'Lunch'], ['d', 'Dinner'], ['s', 'Snacks']];
  // Default meal from the Philippine clock hour (app owner's choice): 4-10 breakfast, 11-14 lunch, 17-21 dinner, else snacks.
  F.mealAt = ms => { const h = new Date(ms + 8 * 3600e3).getUTCHours(); return h >= 4 && h <= 10 ? 'b' : h >= 11 && h <= 14 ? 'l' : h >= 17 && h <= 21 ? 'd' : 's'; };
  // One day's log -> totals and the four meal groups. Entries {n, k, p?, c?, f?, m?, at}; an entry without m uses the time it was logged.
  F.day = log => {
    const by = { b: [], l: [], d: [], s: [] }; const t = { k: 0, p: 0, c: 0, f: 0 };
    (log || []).forEach((x, i) => { if (!x || !num(x.k)) return; const m = by[x.m] ? x.m : F.mealAt(num(x.at) ? x.at : 0); by[m].push({ ...x, i });
      t.k += x.k; if (num(x.p)) t.p += x.p; if (num(x.c)) t.c += x.c; if (num(x.f)) t.f += x.f; });
    return { total: t, meals: F.MEALS.map(([k, label]) => ({ k, label, items: by[k], kcal: by[k].reduce((a, x) => a + x.k, 0) })) };
  };
  // Macro split of what was eaten, as shares of macro energy (Atwater 4/4/9 kcal per g, FAO Food and Nutrition Paper 77, 2003).
  F.macroShare = t => { const p = t.p * 4, c = t.c * 4, f = t.f * 9, s = p + c + f; return s > 0 ? { p: p / s, c: c / s, f: f / s } : null; };

  // ---------- WORKOUTS ----------
  // Estimated one-rep max, Epley formula: 1RM = w x (1 + reps / 30) (Epley B, Poundage Chart, Boyd Epley Workout, Lincoln NE, 1985;
  // as given in LeSuer DA et al., J Strength Cond Res 1997;11(4):211-213). One rep is the weight itself. Rounded to 0.1 kg.
  F.e1rm = (kg, reps) => (num(kg) && num(reps) && kg > 0 && reps >= 1 && reps <= 30 ? Math.round((reps === 1 ? kg : kg * (1 + reps / 30)) * 10) / 10 : null);
  const doneSets = ex => (ex.sets || []).filter(s => s.done && !s.w && +s.kg >= 0 && +s.reps >= 1).map(s => ({ kg: +s.kg, reps: +s.reps }));
  // Best weight and best estimated 1RM per exercise name over finished workouts.
  F.bests = hist => { const b = {};
    (hist || []).forEach(w => (w.ex || []).forEach(ex => doneSets(ex).forEach(s => { const o = b[ex.n] || (b[ex.n] = { kg: 0, reps: 0, e1: 0 }), e = F.e1rm(s.kg, s.reps) || 0;
      if (s.kg > o.kg || (s.kg === o.kg && s.reps > o.reps)) { o.kg = s.kg; o.reps = s.reps; } if (e > o.e1) o.e1 = e; })));
    return b; };
  // Personal records set by workout w against the earlier history: a heavier weight, or a higher estimated 1RM.
  // An exercise done for the first time sets no record (nothing to beat yet).
  F.prs = (hist, w) => { const b = F.bests(hist), out = [];
    (w.ex || []).forEach(ex => { const o = b[ex.n]; if (!o) return; let kg = null, e1 = null;
      doneSets(ex).forEach(s => { if (s.kg > o.kg && (!kg || s.kg > kg.kg)) kg = s; const e = F.e1rm(s.kg, s.reps); if (e && e > o.e1 && (!e1 || e > e1.e)) e1 = { ...s, e }; });
      if (kg) out.push({ n: ex.n, type: 'weight', kg: kg.kg, reps: kg.reps, was: o.kg });
      if (e1) out.push({ n: ex.n, type: '1rm', kg: e1.kg, reps: e1.reps, e1: e1.e, was: o.e1 }); });
    return out; };
  // Totals for a workout: finished sets, volume (kg x reps of finished sets), minutes (at least 1).
  F.summary = w => { let sets = 0, vol = 0; (w.ex || []).forEach(ex => doneSets(ex).forEach(s => { sets++; vol += s.kg * s.reps; }));
    return { sets, vol: Math.round(vol), ex: (w.ex || []).filter(ex => doneSets(ex).length).length, min: Math.max(1, Math.round(((w.end || w.start) - w.start) / 60000)) }; };
  // Share payload for the feed or a message thread (lane M): plain data, no DOM. text fits the activities.note limit (300).
  F.sharePayload = (w, prs) => { const s = F.summary(w), names = (w.ex || []).filter(ex => doneSets(ex).length).map(ex => ex.n);
    const text = (s.ex + ' exercise' + (s.ex === 1 ? '' : 's') + ' · ' + s.sets + ' set' + (s.sets === 1 ? '' : 's') + ' · ' + s.vol.toLocaleString('en-US') + ' kg lifted' + ((prs || []).length ? ' · ' + prs.length + ' PR' + (prs.length > 1 ? 's' : '') : '') + '. ' + names.join(', ')).slice(0, 300);
    return { kind: 'workout', title: (w.name || 'Workout') + ' · ' + s.min + ' min', text, minutes: s.min, sets: s.sets, volumeKg: s.vol, exercises: names, prs: (prs || []).map(p => ({ n: p.n, type: p.type, kg: p.kg, reps: p.reps })) }; };

  // ---------- v12 FITNESS TAB: pure helpers (timer, plates, supersets, charts, backup) ----------
  // Rest timer: whole seconds left until the end timestamp. Wall-clock based, so it stays right after the screen slept or the tab was hidden.
  F.restLeft = (endTs, now) => (num(endTs) && endTs > 0 ? Math.max(0, Math.ceil((endTs - now) / 1000)) : 0);
  F.clock = sec => { sec = Math.max(0, Math.floor(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  // Plates per side for a target bar weight. Greedy is exact for this plate set (each plate is a multiple of the next smaller one).
  F.PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
  F.plates = (total, bar, avail) => { bar = num(bar) ? bar : 20; const set = avail || F.PLATES;
    if (!num(total) || total < bar) return { ok: false, under: true, perSide: [], left: 0 };
    let side = Math.round((total - bar) / 2 * 1000) / 1000; const out = [];
    set.forEach(p => { while (side + 1e-9 >= p) { out.push(p); side = Math.round((side - p) * 1000) / 1000; } });
    return { ok: side === 0, under: false, perSide: out, left: Math.round(side * 2 * 1000) / 1000 }; };
  // Superset rule: exercises sharing a group id (ex.ss) run back to back. The rest timer starts after the LAST exercise of the group
  // (that exercise's rest seconds); finishing a set on an earlier member starts no rest.
  F.restAfter = (exs, i) => { const e = exs[i], nx = exs[i + 1]; if (!e) return 0; if (e.ss && nx && nx.ss === e.ss) return 0; return num(e.rest) && e.rest >= 0 ? e.rest : 90; };
  // Link or unlink exercise i with the one after it. Returns a new array.
  F.linkNext = (exs, i, id) => { if (i < 0 || i >= exs.length - 1) return exs; const a = exs[i], b = exs[i + 1];
    if (a.ss && a.ss === b.ss) { const rest = exs.map((e, j) => (j === i + 1 ? { ...e, ss: undefined } : e));
      return rest.filter(e => e.ss === a.ss).length < 2 ? rest.map(e => (e.ss === a.ss ? { ...e, ss: undefined } : e)) : rest; }
    const gid = a.ss || id || 's' + (Date.now() % 100000).toString(36); return exs.map((e, j) => (j === i || j === i + 1 ? { ...e, ss: gid } : e)); };
  F.move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = arr.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; };
  // Estimated-1RM series for one exercise: the best Epley estimate in each finished workout, oldest first.
  F.e1rmSeries = (hist, name) => (hist || []).map(w => { let best = null;
      (w.ex || []).filter(ex => ex.n === name).forEach(ex => doneSets(ex).forEach(s => { const e = F.e1rm(s.kg, s.reps); if (e && (!best || e > best.e1)) best = { e1: e, kg: s.kg, reps: s.reps }; }));
      return best ? { t: w.start, ...best } : null; }).filter(Boolean).sort((a, b) => a.t - b.t);
  // Monday of the week containing ms, Philippine time (UTC+8), as a UTC-midnight timestamp.
  F.weekStart = ms => { const d = new Date(ms + 8 * 3600e3), dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow); };
  // Volume (kg x reps of finished non-warm-up sets) per week for the last n weeks ending with the week of `now`, oldest first.
  F.weeklyVolume = (hist, n, now) => { const cur = F.weekStart(now), out = []; for (let i = n - 1; i >= 0; i--) out.push({ wk: cur - i * 7 * 864e5, vol: 0, n: 0 });
    (hist || []).forEach(w => { const k = F.weekStart(w.start), o = out.find(x => x.wk === k); if (o) { o.vol += F.summary(w).vol; o.n++; } }); return out; };
  // Workout streak: consecutive Philippine days with a finished workout, ending today (or yesterday, as today may still come).
  F.streak = (hist, now) => { const day = ms => Math.floor((ms + 8 * 3600e3) / 864e5), d = new Set((hist || []).map(w => day(w.start)));
    let t = day(now), n = 0; if (!d.has(t)) t--; while (d.has(t)) { n++; t--; } return n; };
  // Progression hint: if every finished working set last time reached the target reps, suggest the heaviest weight plus one step.
  F.progress = (lastEx, targetReps, step) => { const t = parseInt(targetReps, 10), sets = lastEx ? doneSets(lastEx) : []; if (!(t >= 1) || !sets.length || !sets.every(s => s.reps >= t)) return null;
    const kg = Math.max(...sets.map(s => s.kg)); return { kg: Math.round((kg + (step || 2.5)) * 100) / 100, from: kg, reps: t }; };
  // Stepper for the kg and reps boxes: value + d, never below lo, as a string.
  F.step = (v, d, lo) => String(Math.max(lo || 0, Math.round(((parseFloat(v) || 0) + d) * 100) / 100));
  // Backup file: gym and health logs as JSON. parseBackup only checks the outer shape; the app filters every row with its own validators.
  F.backup = (gym, health) => JSON.stringify({ app: '953-fitness', v: 1, at: Date.now(), gym, health });
  F.parseBackup = text => { let o; try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || o.app !== '953-fitness' || o.v !== 1 || !o.gym || typeof o.gym !== 'object') return null; return { gym: o.gym, health: o.health && typeof o.health === 'object' ? o.health : {} }; };
  // Merge rows that have an id: incoming rows are added unless the id exists; newest first by key `by`, capped.
  F.mergeById = (cur, inc, by, cap) => { const seen = new Set((cur || []).map(x => x.id)), add = (inc || []).filter(x => x && !seen.has(x.id) && seen.add(x.id));
    return [...cur, ...add].sort((a, b) => (b[by] || 0) - (a[by] || 0)).slice(0, cap); };

  if (typeof module !== 'undefined' && module.exports) module.exports = F; else g.FITNESS = F;
})(typeof window !== 'undefined' ? window : this);
