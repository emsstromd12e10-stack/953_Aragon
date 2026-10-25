/* v17.5 lane C (A-037): profile photo check, in the browser, on the phone. The photo never leaves the device for this check.
   window.FaceCheck.check(src) -> Promise<{ok, reason, unchecked?}>; src = HTMLCanvasElement | HTMLImageElement | ImageBitmap | Blob.
   Uses the Shape Detection API (window.FaceDetector) when the browser has it, else MediaPipe Face Detector 1.0.1 (Apache-2.0), loaded on first use (bundle + 13 MB wasm + 230 KB model).
   When the checker cannot load (offline, blocked) the answer is { ok:true, reason:null, unchecked:true }: a member is never blocked because the checker is missing. */
(function () {
  var V = '1.0.1';
  var BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + V;
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  var MAXSIDE = 640;          // detection runs on a copy no larger than this: fast on a mid-range phone, plenty to see a face
  var LOAD_MS = 25000;        // first-use download budget; slower than this counts as "cannot load"
  var REASON = {
    none: 'We can’t see a face',
    many: 'More than one face',
    far: 'Move back a little: your whole head should fit in the photo',
    away: 'Face the camera'
  };
  var det = null;             // Promise of a detect(canvas) function, or null before first use

  function bad(k) { return { ok: false, reason: REASON[k] }; }

  // The rules, on plain numbers (pixels). faces: [{ x, y, w, h, score, eyes:[{x,y}], mouth:{x,y}|null, nose:{x,y}|null }], W/H = image size.
  // shortcut: a face this rule list passes can still be a poor photo (blur, dark); we only judge framing, upgrade = a quality model.
  function judge(faces, W, H) {
    var f = (faces || []).filter(function (a) { return a.score >= 0.6; });
    if (!f.length) return bad('none');
    if (f.length > 1) return bad('many');
    f = f[0];
    if (f.h * 100 < 22 * H) return bad('far');                                   // tiny face
    if (f.x < 0 || f.x + f.w > W || f.y * 100 < 2 * H || (f.y + f.h) * 100 > 98 * H) return bad('far'); // forehead or chin cut / touching the edge
    var inBox = function (p) { return p && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h; };
    if (f.eyes && f.eyes.length) {                                           // a detector that gives no keypoints is judged on the box alone
      if (f.eyes.length < 2 || !f.eyes.every(inBox) || (f.mouth && !inBox(f.mouth))) return bad('away');
      var e0 = f.eyes[0], e1 = f.eyes[1], span = Math.abs(e0.x - e1.x);
      if (span * 100 < 28 * f.w) return bad('away');                             // a turned head: the two eyes close together
      if (f.nose) { var lo = Math.min(e0.x, e1.x), hi = Math.max(e0.x, e1.x); if (f.nose.x < lo - 0.1 * span || f.nose.x > hi + 0.1 * span) return bad('away'); }
    }
    return { ok: true, reason: null };
  }

  function toCanvas(src) {
    return Promise.resolve(src instanceof Blob ? createImageBitmap(src) : src).then(function (s) {
      var w = s.naturalWidth || s.videoWidth || s.width, h = s.naturalHeight || s.videoHeight || s.height;
      if (!w || !h) throw new Error('empty image');
      var k = Math.min(1, MAXSIDE / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(s, 0, 0, c.width, c.height);
      return c;
    });
  }

  function native() {
    var d = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
    return function (c) {
      return d.detect(c).then(function (list) {
        return list.map(function (a) {
          var b = a.boundingBox, L = a.landmarks || [], at = function (t) { var m = L.filter(function (l) { return l.type === t; }); return m.map(function (l) { return l.locations && l.locations[0]; }).filter(Boolean); };
          var mouth = at('mouth')[0] || null, nose = at('nose')[0] || null, eyes = at('eye');
          return { x: b.x, y: b.y, w: b.width, h: b.height, score: 1, eyes: eyes.length >= 2 ? eyes.slice(0, 2) : [], mouth: mouth, nose: nose };
        });
      });
    };
  }

  function mediapipe() {
    return import(BASE + '/vision_bundle.mjs').then(function (m) {
      return m.FilesetResolver.forVisionTasks(BASE + '/wasm').then(function (fs) {
        return m.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.3 });
      });
    }).then(function (fd) {
      return function (c) {
        var r = fd.detect(c), W = c.width, H = c.height;
        return r.detections.map(function (a) {
          var b = a.boundingBox, k = a.keypoints || [], P = function (i) { return k[i] ? { x: k[i].x * W, y: k[i].y * H } : null; };
          // blaze_face_short_range keypoint order: right eye, left eye, nose tip, mouth, right ear, left ear (normalised 0..1)
          return { x: b.originX, y: b.originY, w: b.width, h: b.height, score: a.categories && a.categories[0] ? a.categories[0].score : 0, eyes: k.length >= 4 ? [P(0), P(1)] : [], nose: P(2), mouth: P(3) };
        });
      };
    });
  }

  function load() {
    if (!det) {
      var p = (typeof window.FaceDetector === 'function' ? Promise.resolve().then(native) : mediapipe());
      det = Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error('load timeout')); }, LOAD_MS); })]);
      det.catch(function () { det = null; });   // a failed load (offline) is retried on the next photo
    }
    return det;
  }

  function check(src) {
    var c;
    return toCanvas(src).then(function (cv) { c = cv; return load(); }).then(function (run) {
      return Promise.resolve(run(c)).then(function (faces) { window.FaceCheck.last = { faces: faces, w: c.width, h: c.height }; return judge(faces, c.width, c.height); });
    }).catch(function (e) { window.FaceCheck.err = String(e && e.message || e); return { ok: true, reason: null, unchecked: true }; });
  }

  window.FaceCheck = { check: check, judge: judge };
})();
