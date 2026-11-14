// Ship tools: pure calculators (deck, engine, units). No DOM. Browser: window.SHIPCALC; Node tests: require('./shipcalc.js').
// Every function returns null when an input is missing, not a finite number, or out of range, so the UI never shows NaN.
(function (g) {
  const SHIPCALC = {};
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const ok = (...a) => a.every(x => typeof x === 'number' && isFinite(x));
  const norm360 = x => ((x % 360) + 360) % 360;
  const wrapPi = x => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  // 1 nautical mile = 1852 m exactly and 1 minute of arc on the navigational sphere (Bowditch, NGA Pub. 9, Glossary "nautical mile").
  const NM_PER_RAD = 10800 / Math.PI;

  // ---------- DECK ----------

  // Distance = speed x time (Bowditch, NGA Pub. 9, chapter "Dead Reckoning": D = S x T, S in knots, T in hours).
  SHIPCALC.dst = ({ d, s, t }) => {
    if (d == null && ok(s, t) && s >= 0 && t >= 0) return { d: s * t, s, t };
    if (s == null && ok(d, t) && d >= 0 && t > 0) return { d, s: d / t, t };
    if (t == null && ok(d, s) && d >= 0 && s > 0) return { d, s, t: d / s };
    return null;
  };

  // ETA across time zones: arrival UTC = departure local - departure UTC offset + distance / speed;
  // arrival local = arrival UTC + arrival UTC offset (Bowditch, NGA Pub. 9, chapter "Time": zone time and zone description).
  // dep is 'YYYY-MM-DDTHH:MM' (the <input type=datetime-local> format); zones are UTC offsets in hours (+8 for Manila).
  SHIPCALC.eta = ({ dep, depZone, arrZone, d, s }) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dep || '');
    if (!m || !ok(depZone, arrZone, d, s) || s <= 0 || d < 0 || Math.abs(depZone) > 14 || Math.abs(arrZone) > 14) return null;
    const depUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - depZone * 3600e3;
    const hours = d / s, arrUtc = depUtc + hours * 3600e3, a = new Date(arrUtc + arrZone * 3600e3);
    const p = n => String(n).padStart(2, '0');
    return { hours, arrUtc, local: a.getUTCFullYear() + '-' + p(a.getUTCMonth() + 1) + '-' + p(a.getUTCDate()) + ' ' + p(a.getUTCHours()) + ':' + p(a.getUTCMinutes()) };
  };

  // Great circle sailing on a sphere (Bowditch, NGA Pub. 9, chapter "The Sailings", great-circle sailing by computation):
  // cos D = sin L1 sin L2 + cos L1 cos L2 cos DLo;  initial course C = atan2(sin DLo cos L2, cos L1 sin L2 - sin L1 cos L2 cos DLo).
  // Uses the haversine form of the same distance formula for accuracy at short range.
  SHIPCALC.greatCircle = ({ lat1, lon1, lat2, lon2 }) => {
    if (!ok(lat1, lon1, lat2, lon2) || Math.abs(lat1) > 90 || Math.abs(lat2) > 90) return null;
    const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = wrapPi((lon2 - lon1) * D2R);
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    const dist = 2 * Math.asin(Math.min(1, Math.sqrt(h))) * NM_PER_RAD;
    const c = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
    return { dist, course: norm360(c * R2D) };
  };

  // Mercator (rhumb line) sailing (Bowditch, NGA Pub. 9, chapter "The Sailings", Mercator sailing):
  // tan C = DLo / DMP, distance = DLat sec C; for an east-west course distance = DLo cos L.
  // ponytail: meridional parts on a sphere M = (10800/pi) ln tan(45 + L/2); Bowditch's spheroidal table differs by < 0.5%, add the ellipsoid term if that matters.
  SHIPCALC.rhumb = ({ lat1, lon1, lat2, lon2 }) => {
    if (!ok(lat1, lon1, lat2, lon2) || Math.abs(lat1) >= 89.9 || Math.abs(lat2) >= 89.9) return null;
    const p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = wrapPi((lon2 - lon1) * D2R);
    const dpsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
    const q = Math.abs(dpsi) > 1e-12 ? dp / dpsi : Math.cos(p1);
    return { dist: Math.sqrt(dp * dp + q * q * dl * dl) * NM_PER_RAD, course: norm360(Math.atan2(dl, dpsi) * R2D) };
  };

  // Set and drift: the current's direction (set) and speed (drift) are the course and distance from the DR to the fix,
  // drift = that distance / time since the last fix (Bowditch, NGA Pub. 9, chapter "Dead Reckoning", "Current sailing").
  SHIPCALC.setDrift = ({ drLat, drLon, fixLat, fixLon, hours }) => {
    if (!ok(hours) || hours <= 0) return null;
    const r = SHIPCALC.rhumb({ lat1: drLat, lon1: drLon, lat2: fixLat, lon2: fixLon });
    return r && { set: r.course, distance: r.dist, drift: r.dist / hours };
  };

  // Maximum squat (m) = Cb x V^2 / 100 in open water, Cb x V^2 / 50 in a confined channel, V = speed through water in knots
  // (C.B. Barrass, "Ship Squat and Interaction", Witherby 2004; also Barrass & Derrett, "Ship Stability for Masters and Mates", ch. "Ship squat").
  SHIPCALC.squat = ({ cb, v, confined }) => {
    if (!ok(cb, v) || cb <= 0 || cb > 1 || v < 0) return null;
    return cb * v * v / (confined ? 50 : 100);
  };

  // Under-keel clearance = charted depth + height of tide - (static draft + squat)
  // (UKHO, Admiralty Manual of Navigation vol. 1 / NP100 The Mariner's Handbook, "under-keel clearance").
  SHIPCALC.ukc = ({ depth, tide, draft, squat }) => {
    if (!ok(depth, tide, draft) || draft < 0) return null;
    return depth + tide - draft - (ok(squat) ? squat : 0);
  };

  // Sunrise / sunset (UTC minutes after midnight of the date) using the NOAA Global Monitoring Laboratory solar calculator
  // equations (NOAA GML "General Solar Position Calculations" and the NOAA_Solar_Calculations_day spreadsheet, after Meeus,
  // "Astronomical Algorithms"). Zenith 90.833 deg allows for refraction and the sun's semi-diameter. lon is east-positive.
  SHIPCALC.sun = ({ date, lat, lon, zone }) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m || !ok(lat, lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const z = ok(zone) ? zone : 0;
    const jd = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 + 2440587.5 + 0.5 - z / 24; // local noon
    const T = (jd - 2451545) / 36525;
    const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(M * D2R) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D2R) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * D2R) * 0.000289;
    const om = 125.04 - 1934.136 * T, lam = L0 + C - 0.00569 - 0.00478 * Math.sin(om * D2R);
    const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(om * D2R);
    const dec = Math.asin(Math.sin(eps * D2R) * Math.sin(lam * D2R));
    const y = Math.tan(eps * D2R / 2) ** 2, l = L0 * D2R, mr = M * D2R;
    const eqt = 4 * R2D * (y * Math.sin(2 * l) - 2 * e * Math.sin(mr) + 4 * e * y * Math.sin(mr) * Math.cos(2 * l) - 0.5 * y * y * Math.sin(4 * l) - 1.25 * e * e * Math.sin(2 * mr));
    const noon = 720 - 4 * lon - eqt;
    const cosH = Math.cos(90.833 * D2R) / (Math.cos(lat * D2R) * Math.cos(dec)) - Math.tan(lat * D2R) * Math.tan(dec);
    if (cosH > 1) return { noon, polar: 'night' };
    if (cosH < -1) return { noon, polar: 'day' };
    const H = Math.acos(cosH) * R2D;
    return { noon, rise: noon - 4 * H, set: noon + 4 * H };
  };
  // UTC minutes -> 'HH:MM' in a zone (rounded to the minute, as almanacs print).
  SHIPCALC.hhmm = (utcMin, zone) => { if (!ok(utcMin)) return null; const t = ((Math.round(utcMin + (zone || 0) * 60) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

  // Rule of twelfths: over the ~6 h between low and high water the tide moves 1, 2, 3, 3, 2, 1 twelfths of the range
  // in successive hours (UKHO, Admiralty Manual of Navigation vol. 1 / NP120 Admiralty Tidal Handbook, "rule of twelfths").
  // Works rising (h0 = LW, h1 = HW) or falling (h0 = HW, h1 = LW); between whole hours it interpolates linearly.
  SHIPCALC.twelfths = ({ h0, h1, t, dur }) => {
    const du = ok(dur) ? dur : 6;
    if (!ok(h0, h1, t) || du <= 0 || t < 0 || t > du) return null;
    const cum = [0, 1, 3, 6, 9, 11, 12], x = t / du * 6, i = Math.min(5, Math.floor(x));
    const f = (cum[i] + (cum[i + 1] - cum[i]) * (x - i)) / 12;
    return h0 + (h1 - h0) * f;
  };

  // Draft survey (UNECE "Code of Uniform Standards and Procedures for the Performance of Draught Surveys of Coal Cargoes", 1992,
  // ECE/ENERGY/19): mean of means / "quarter mean" draft = (F + A + 6 M) / 8, displacement read from the ship's hydrostatic tables
  // at that draft (interpolated), corrected for dock water density: disp x (dock density / table density, usually 1.025),
  // net displacement = displacement - deductibles (ballast + fresh water + bunkers + other).
  // ponytail: no trim (LCF) or list correction; enter F/A/M already corrected to the perpendiculars.
  SHIPCALC.quarterMean = ({ f, a, m }) => ok(f, a, m) && f >= 0 && a >= 0 && m >= 0 ? (f + a + 6 * m) / 8 : null;
  SHIPCALC.interp = (rows, x) => {
    if (!ok(x) || !Array.isArray(rows)) return null;
    const r = rows.filter(p => ok(p[0], p[1])).sort((p, q) => p[0] - q[0]);
    if (r.length < 2 || x < r[0][0] || x > r[r.length - 1][0]) return null;
    for (let i = 1; i < r.length; i++) if (x <= r[i][0]) { const [x0, y0] = r[i - 1], [x1, y1] = r[i]; return x1 === x0 ? y0 : y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
    return null;
  };
  SHIPCALC.draftSurvey = ({ f, a, m, d1, w1, d2, w2, rho, rhoTable, deduct }) => {
    const qm = SHIPCALC.quarterMean({ f, a, m });
    const rt = ok(rhoTable) ? rhoTable : 1.025;
    if (qm == null || !ok(rho) || rho < 0.99 || rho > 1.04) return null;
    const disp = SHIPCALC.interp([[d1, w1], [d2, w2]], qm);
    if (disp == null) return { qm, disp: null };
    const corr = disp * rho / rt, net = corr - (ok(deduct) ? deduct : 0);
    return { qm, disp, corr, net };
  };

  // Deadweight = displacement - lightship; cargo intake = deadweight - (bunkers + fresh water + stores + constant)
  // (Barrass & Derrett, "Ship Stability for Masters and Mates", ch. "Displacement, TPC and deadweight").
  SHIPCALC.dwt = ({ disp, light, bunkers, fw, stores, constant }) => {
    if (!ok(disp, light) || disp < light || light < 0) return null;
    const dwt = disp - light, used = [bunkers, fw, stores, constant].reduce((s, x) => s + (ok(x) ? x : 0), 0);
    return { dwt, cargo: dwt - used };
  };

  // Stowage factor = cargo volume / cargo mass. 1 m3/t = 35.8814 ft3/lt (1 ft3 = 0.028316846592 m3, 1 long ton = 1016.0469088 kg;
  // NIST SP 811, 2008 ed., Appendix B.9).
  SHIPCALC.FT3_PER_LT_PER_M3_PER_T = 1.0160469088 / 0.028316846592;
  SHIPCALC.stowage = ({ vol, mass }) => ok(vol, mass) && vol > 0 && mass > 0 ? { m3t: vol / mass, ft3lt: vol / mass * SHIPCALC.FT3_PER_LT_PER_M3_PER_T } : null;
  // space needed (m3) for a mass (t) at a given SF (m3/t), plus broken stowage %.
  SHIPCALC.space = ({ mass, sf, broken }) => ok(mass, sf) && mass >= 0 && sf > 0 ? mass * sf / (1 - (ok(broken) ? broken : 0) / 100) : null;

  // ---------- ENGINE ----------

  // Volume correction factor to 15 C, ASTM D1250-80 / API 2540 / IP 200, Table 54B (generalized products):
  // VCF = exp(-a15 dT (1 + 0.8 a15 dT)), dT = t - 15, a15 = K0 / rho15^2 + K1 / rho15 (rho15 in kg/m3).
  // Product groups and constants as published in Table 54B: fuel oils K0 103.8720 K1 0.2701; jet fuels K0 330.3010 K1 0;
  // transition zone a15 = -0.00336312 + 2680.3206 / rho15^2; gasolines K0 192.4571 K1 0.2438.
  // Product-group band edges (kg/m3 at 15 C): fuel oils 838.5-1075, jet fuels 787.5-838.5, transition zone 770.3-787.5,
  // gasolines 653-770.3 (Table 54B as briefed; 787.5 and 770.3 are the 48 and 52 deg API limits of the API 2540 product groups).
  // A density exactly on an edge goes to the heavier group. Table valid 653-1075 kg/m3, -18 to 150 C.
  SHIPCALC.vcfGroup = rho => rho >= 838.5 ? 'Fuel oil' : rho >= 787.5 ? 'Jet fuel' : rho >= 770.3 ? 'Transition zone' : 'Gasoline';
  SHIPCALC.alpha15 = rho => {
    if (!ok(rho) || rho < 653 || rho > 1075) return null;
    const g = SHIPCALC.vcfGroup(rho);
    if (g === 'Fuel oil') return 103.8720 / (rho * rho) + 0.2701 / rho;
    if (g === 'Jet fuel') return 330.3010 / (rho * rho);
    if (g === 'Transition zone') return -0.00336312 + 2680.3206 / (rho * rho);
    return 192.4571 / (rho * rho) + 0.2438 / rho;
  };
  SHIPCALC.vcf54b = ({ rho15, temp }) => {
    const a = SHIPCALC.alpha15(rho15);
    if (a == null || !ok(temp) || temp < -18 || temp > 150) return null;
    const dt = temp - 15;
    return Math.exp(-a * dt * (1 + 0.8 * a * dt));
  };
  // Bunker mass: V15 = Vobs x VCF; mass in vacuum = V15 x rho15; mass in air = V15 x (rho15 - 1.1) (ASTM D1250-80 Table 56, WCF).
  SHIPCALC.bunker = ({ vol, rho15, temp }) => {
    const vcf = SHIPCALC.vcf54b({ rho15, temp });
    if (vcf == null || !ok(vol) || vol < 0) return null;
    const v15 = vol * vcf;
    return { vcf, v15, tVac: v15 * rho15 / 1000, tAir: v15 * (rho15 - 1.1) / 1000, group: SHIPCALC.vcfGroup(rho15) };
  };

  // Parse 'a, b' / 'a b' / 'a;b' per line into number pairs (tank calibration tables entered by the user).
  SHIPCALC.parseRows = txt => String(txt || '').split(/\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[\s,;\t]+/).map(Number)).filter(r => r.length >= 2 && ok(r[0], r[1]));
  // Sounding / ullage to volume: linear interpolation in the tank's calibration table (the method the tables themselves
  // prescribe between tabulated values; ISO 7507 / API MPMS ch. 2 tank calibration tables).
  SHIPCALC.tankVolume = ({ table, level }) => SHIPCALC.interp(SHIPCALC.parseRows(table), level);
  // Tank plan: one tank per line 'observed m3, temp C, density15 kg/m3'; totals at 15 C via Table 54B above.
  SHIPCALC.tankPlan = txt => {
    const rows = String(txt || '').split(/\n/).map(l => l.trim()).filter(Boolean);
    let v15 = 0, tAir = 0, bad = 0;
    rows.forEach(l => { const n = (l.match(/-?\d+(\.\d+)?/g) || []).map(Number), b = n.length >= 3 && SHIPCALC.bunker({ vol: n[n.length - 3], temp: n[n.length - 2], rho15: n[n.length - 1] }); if (b) { v15 += b.v15; tAir += b.tAir; } else bad++; });
    return { tanks: rows.length - bad, bad, v15, tAir };
  };

  // Specific fuel oil consumption SFOC (g/kWh) = fuel mass (g) / engine output (kWh) (ISO 3046-1 definition of specific fuel consumption).
  SHIPCALC.sfoc = ({ fuelKg, kw, hours }) => ok(fuelKg, kw, hours) && kw > 0 && hours > 0 && fuelKg >= 0 ? fuelKg * 1000 / (kw * hours) : null;
  // Consumption per day (t) = SFOC (g/kWh) x power (kW) x load x hours / 1e6; the same form gives lube / cylinder oil with a feed
  // rate in g/kWh (MAN Energy Solutions, "Basic Principles of Ship Propulsion"; ISO 3046-1).
  SHIPCALC.perDay = ({ g, kw, load, hours }) => {
    const h = ok(hours) ? hours : 24, l = ok(load) ? load : 100;
    return ok(g, kw) && g >= 0 && kw >= 0 && h >= 0 && h <= 24 && l >= 0 && l <= 110 ? g * kw * (l / 100) * h / 1e6 : null;
  };
  // Cube law: propulsion power, hence fuel per day, varies roughly with speed cubed: FC2 = FC1 x (V2/V1)^3
  // (MAN Energy Solutions, "Basic Principles of Ship Propulsion", propeller law P = c x n^3 / P proportional to V^3).
  SHIPCALC.cubeLaw = ({ fc1, v1, v2 }) => ok(fc1, v1, v2) && v1 > 0 && v2 >= 0 && fc1 >= 0 ? fc1 * (v2 / v1) ** 3 : null;

  // ---------- UNITS ----------
  // Factors to the SI base of each group (NIST SP 811, 2008 ed., Appendix B.8/B.9; nautical mile and knot exact by definition).
  SHIPCALC.UNITS = {
    Length: { m: 1, km: 1000, NM: 1852, ft: 0.3048, cable: 185.2, fathom: 1.8288 },
    Mass: { kg: 1, t: 1000, LT: 1016.0469088, ST: 907.18474, lb: 0.45359237 },
    Volume: { m3: 1, L: 0.001, 'US gal': 0.003785411784, bbl: 0.158987294928, ft3: 0.028316846592 },
    Pressure: { bar: 100000, kPa: 1000, MPa: 1e6, psi: 6894.757293168, 'kg/cm2': 98066.5 },
    Speed: { kn: 1852 / 3600, 'km/h': 1000 / 3600, 'm/s': 1, mph: 0.44704 },
    Power: { kW: 1000, hp: 745.69987158227, PS: 735.49875, W: 1 },
    Temperature: { C: 1, F: 1, K: 1 },
  };
  SHIPCALC.convert = (group, value, from, to) => {
    const u = SHIPCALC.UNITS[group];
    if (!u || !(from in u) || !(to in u) || !ok(value)) return null;
    if (group === 'Temperature') { // t(F) = 1.8 t(C) + 32, T(K) = t(C) + 273.15 (NIST SP 811, B.8)
      const c = from === 'C' ? value : from === 'F' ? (value - 32) / 1.8 : value - 273.15;
      if (c < -273.15) return null;
      return to === 'C' ? c : to === 'F' ? c * 1.8 + 32 : c + 273.15;
    }
    return value * u[from] / u[to];
  };

  // ---------- GALLEY ----------
  // Recipe conversion factor = new yield / original yield; each ingredient x factor
  // (Culinary Institute of America, "The Professional Chef", ch. on recipe conversion).
  SHIPCALC.scale = ({ qty, from, to }) => ok(qty, from, to) && from > 0 && to >= 0 && qty >= 0 ? qty * to / from : null;

  if (typeof module !== 'undefined' && module.exports) module.exports = SHIPCALC; else g.SHIPCALC = SHIPCALC;
})(typeof window !== 'undefined' ? window : this);
