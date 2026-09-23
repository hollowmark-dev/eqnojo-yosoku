/* 推し予測 -- public build.
 *
 * Separate from proto/. Differences that matter:
 *   - no member photograph is ever loaded or rendered
 *   - no axis value is ever shown, although coordinates are in data.js
 *   - the oshi question comes BEFORE the result, so seeing the result
 *     cannot anchor the answer
 *   - faces load four at a time, not 161 up front
 *
 * Inference is the prototype's: a particle filter over (preference point,
 * axis weights, choice temperature), with questions chosen to maximise
 * expected information about WHICH MEMBER comes out top, not about the
 * parameters themselves.
 */
(function (global) {
"use strict";

var NP = 1200, NQ = 12, EPS = 0.05, A = 5;
var P = [], logw = [], qi = 0, answers = [], oshi = [], top3 = [];
var lastQuad = null, t0 = 0;

/* ---------- random ---------- */
function randn() {
  var u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma1(k) {              // Marsaglia-Tsang, k >= 1
  var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    var x = randn(), v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    var u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/* ---------- particle filter ---------- */
function initParticles() {
  P = []; logw = [];
  for (var k = 0; k < NP; k++) {
    var p = [], a, v;
    for (a = 0; a < A; a++) {
      do { v = randn() * 1.5; } while (v < -3 || v > 3);
      p.push(v);
    }
    var g = [], s = 0;
    for (a = 0; a < A; a++) { var x = gamma1(2); g.push(x); s += x; }
    P.push({ p: p, w: g.map(function (z) { return z / s; }),
             beta: Math.exp(Math.log(1.5) + randn() * 0.5) });
    logw.push(0);
  }
}
function util(x, pt) {
  var s = 0;
  for (var a = 0; a < A; a++) { var d = x[a] - pt.p[a]; s -= pt.w[a] * d * d; }
  return s;
}
function probs(quad, pt) {
  var u = quad.map(function (x) { return pt.beta * util(x, pt); });
  var m = Math.max.apply(null, u);
  var e = u.map(function (v) { return Math.exp(v - m); });
  var s = e.reduce(function (a, b) { return a + b; }, 0);
  return e.map(function (v) { return (1 - EPS) * v / s + EPS / 4; });
}
function weights() {
  var m = Math.max.apply(null, logw);
  var e = logw.map(function (v) { return Math.exp(v - m); });
  var s = e.reduce(function (a, b) { return a + b; }, 0);
  return e.map(function (v) { return v / s; });
}
function update(quad, c) {
  for (var k = 0; k < NP; k++) logw[k] += Math.log(probs(quad, P[k])[c]);
  var w = weights();
  var ess = 1 / w.reduce(function (a, b) { return a + b * b; }, 0);
  if (ess < NP / 2) {                         // resample + jitter
    var cum = [], s = 0, i;
    for (i = 0; i < w.length; i++) { s += w[i]; cum.push(s); }
    var next = [];
    for (k = 0; k < NP; k++) {
      var r = Math.random(), lo = 0, hi = NP - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1; else hi = mid;
      }
      var src = P[lo];
      next.push({ p: src.p.map(function (v) { return v + randn() * 0.06; }),
                  w: src.w.slice(), beta: src.beta });
    }
    P = next; logw = new Array(NP).fill(0);
  }
}

/* ---------- question choice: EIG on the top-1 member label ---------- */
function top1of(pt) {
  var best = -1, bv = Infinity;
  for (var i = 0; i < MEMBERS.length; i++) {
    var s = 0;
    for (var a = 0; a < A; a++) {
      var d = MEMBERS[i].z[a] - pt.p[a];
      s += pt.w[a] * d * d;
    }
    if (s < bv) { bv = s; best = i; }
  }
  return best;
}
function eig(quad, w, lab) {
  var Pc = [0, 0, 0, 0], byM = {}, k, c;
  for (k = 0; k < NP; k++) {
    var pr = probs(quad, P[k]), m = lab[k];
    if (!byM[m]) byM[m] = { tot: 0, pc: [0, 0, 0, 0] };
    byM[m].tot += w[k];
    for (c = 0; c < 4; c++) { Pc[c] += w[k] * pr[c]; byM[m].pc[c] += w[k] * pr[c]; }
  }
  var H = function (v) {
    var h = 0;
    for (var i = 0; i < v.length; i++) if (v[i] > 1e-12) h -= v[i] * Math.log2(v[i]);
    return h;
  };
  var cond = 0;
  for (var m2 in byM) {
    var b = byM[m2];
    if (b.tot < 1e-9) continue;
    cond += b.tot * H(b.pc.map(function (x) { return x / b.tot; }));
  }
  return H(Pc) - cond;
}
function dist(a, b) {
  var s = 0;
  for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}
function pickQuad() {
  var w = weights(), lab = P.map(top1of), best = null, bv = -1;
  for (var t = 0; t < 60; t++) {
    var idx = [], guard = 0;
    while (idx.length < 4 && guard++ < 200) {
      var j = Math.floor(Math.random() * POOL.length);
      if (idx.indexOf(j) >= 0) continue;
      var ok = idx.every(function (i) { return dist(POOL[i].z, POOL[j].z) >= 1.5; });
      if (ok) idx.push(j);
    }
    if (idx.length < 4) continue;
    var v = eig(idx.map(function (i) { return POOL[i].z; }), w, lab);
    if (v > bv) { bv = v; best = idx; }
  }
  if (!best) {                       // degenerate pool: fall back to random
    best = [];
    while (best.length < 4) {
      var q = Math.floor(Math.random() * POOL.length);
      if (best.indexOf(q) < 0) best.push(q);
    }
  }
  return best;
}

/* ---------- recommendation ---------- */
function expectedDist() {           // posterior mean weighted distance
  var w = weights();
  return MEMBERS.map(function (m) {
    var s = 0;
    for (var k = 0; k < NP; k++) {
      var d = 0;
      for (var a = 0; a < A; a++) {
        var t = m.z[a] - P[k].p[a];
        d += P[k].w[a] * t * t;
      }
      s += w[k] * d;
    }
    return s;
  });
}
function recommend() {
  var D = expectedDist();
  var ord = D.map(function (v, i) { return [v, i]; })
             .sort(function (a, b) { return a[0] - b[0]; })
             .map(function (x) { return x[1]; });
  return { top3: ord.slice(0, 3), dist: D };
}
/* One honest line instead of a confidence grade.
 *
 * v1 graded the posterior mass on the modal top member (>=0.45 "はっきり",
 * >=0.20 "うっすら"). Measured on the shipped pool (reeval/calib.js, 80
 * simulated users each): a RANDOM clicker reached "はっきり" 29% of the
 * time, a user answering exactly by the model only 40%. The number cannot
 * tell signal from noise, so no threshold can make the label true. What IS
 * true is that results move between runs -- say that, and turn it into a
 * reason to try again. */
function confidence() {
  return { level: 1,
    text: "結果は、答えるたびに少しずつ変わります。\n" +
          "何度か試すと、よく出る人が見えてきます。" };
}

/* ---------- send (silent fail) ---------- */
function send(done) {
  if (!CONFIG.endpoint) return;               // unset: do nothing, quietly
  var body = {
    ts: new Date().toISOString(),
    picks: answers.map(function (a) { return a.chosen; }),
    oshi: oshi.map(function (i) { return MEMBERS[i].id; }),
    proposed: top3.map(function (i) { return MEMBERS[i].id; }),
    completed: !!done
  };
  try {
    fetch(CONFIG.endpoint, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).catch(function () {});
  } catch (e) { /* never block the result on logging */ }
}

/* Internal group ids ("!=ME") are ASCII so they can be filenames and log
 * keys. They are not display text. Everything on screen goes through
 * here; the build refuses to emit a group that has no label. */
function gname(g) { return (GROUP_LABEL && GROUP_LABEL[g]) || g; }

/* ---------- view ---------- */
function $(id) { return document.getElementById(id); }
function show(id) {
  ["intro", "quiz", "oshi", "result"].forEach(function (s) {
    $(s).classList.toggle("hide", s !== id);
  });
  window.scrollTo(0, 0);
}
function applyBrand() {
  var b = CONFIG.brand || "推し予測";
  document.title = b;
  var h = document.querySelector && document.querySelector("#intro h1");
  if (h) h.textContent = b;
}
function renderDisclaimer() {
  $("notice").textContent = DISCLAIMER_INTRO;
  var host = $("detail");
  host.textContent = "";
  DISCLAIMER_DETAIL.split(/\n(?=### )/).forEach(function (blk) {
    var lines = blk.split("\n");
    if (/^### /.test(lines[0])) {
      var h = document.createElement("h3");
      h.textContent = lines.shift().replace(/^### /, "");
      host.appendChild(h);
    }
    var body = lines.join("\n").trim();
    if (body) {
      var p = document.createElement("p");
      p.textContent = body;                   // verbatim, as a text node
      host.appendChild(p);
    }
  });
}
function nextQ() {
  if (qi >= NQ) { toOshi(); return; }
  var idx = pickQuad();
  lastQuad = idx;
  $("qnum").textContent = "第 " + (qi + 1) + " 問 / " + NQ;
  $("qbar").style.width = (qi / NQ * 100) + "%";
  var q = $("quad");
  q.textContent = "";
  idx.forEach(function (j, pos) {
    var b = document.createElement("button");
    b.className = "face";
    var im = document.createElement("img");
    im.src = "faces/" + POOL[j].id + ".jpg";  // only these 4 are fetched
    im.loading = "lazy";
    im.decoding = "async";
    im.width = 320; im.height = 320;
    im.alt = "実在しない人物の顔 " + (pos + 1);
    b.appendChild(im);
    b.onclick = function () { choose(pos, idx); };
    q.appendChild(b);
  });
  t0 = Date.now();
}
function choose(pos, idx) {
  answers.push({ q: qi, chosen: POOL[idx[pos]].id,
                 rt_ms: Date.now() - t0 });
  update(idx.map(function (i) { return POOL[i].z; }), pos);
  qi++; nextQ();
}
function skipQ() {
  answers.push({ q: qi, chosen: "", rt_ms: Date.now() - t0 });
  qi++; nextQ();                               // skipped: no likelihood
}
function toOshi() {
  show("oshi");
  var g = $("ogrid");
  g.textContent = "";
  /* Grouped, each group in its official profile-page order. The raw
   * MEMBERS order is alphabetical by romaji, which interleaves the three
   * groups and makes people hunt for their own pick. */
  GROUP_ORDER.forEach(function (key) {
    var mine = MEMBERS.map(function (m, i) { return i; })
      .filter(function (i) { return MEMBERS[i].group === key; })
      .sort(function (a, b) { return MEMBERS[a].ord - MEMBERS[b].ord; });
    if (!mine.length) return;
    var h = document.createElement("div");
    h.className = "ghead";
    h.textContent = gname(key);
    g.appendChild(h);
    mine.forEach(function (i) {
      var b = document.createElement("button");
      b.className = "name";
      b.textContent = MEMBERS[i].name;
      b.onclick = function () { toggleOshi(i, b); };
      g.appendChild(b);
    });
  });
  syncOshiButton();
}
/* --- 4: the primary button must say what it does when nothing is
 * selected, at the moment of pressing it, not only in the paragraph
 * above. Picking an oshi is optional and this is where that shows. */
function syncOshiButton() {
  var b = $("odone");
  if (!b) return;
  b.textContent = oshi.length
    ? "これで進む（" + oshi.length + "人）"
    : "スキップして結果を見る";
}
function toggleOshi(i, el) {
  var at = oshi.indexOf(i);
  if (at >= 0) oshi.splice(at, 1);
  else if (oshi.length < 3) oshi.push(i);
  else return;
  el.classList.toggle("on", oshi.indexOf(i) >= 0);
  syncOshiButton();
}
/* Three labels in a row: with "方" on two and "人" on the third they
 * read as a mismatched set, so the noun is dropped where it is not
 * carrying meaning. */
var LEAD = ["いちばん近い", "同じくらい近い", "好みの圏内から、もう1人"];
function finish() {
  var r = recommend();
  top3 = r.top3;
  show("result");
  $("conf").textContent = confidence().text;
  var host = $("cards");
  host.textContent = "";
  top3.forEach(function (i, k) {
    var m = MEMBERS[i];
    var d = document.createElement("div");
    d.className = "res";
    var l = document.createElement("div");
    l.className = "lead"; l.textContent = LEAD[k];
    var n = document.createElement("div");
    n.className = "nm"; n.textContent = m.name;
    var g = document.createElement("div");
    g.className = "gp"; g.textContent = gname(m.group);
    var a = document.createElement("a");
    a.href = m.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = m.link || "公式プロフィール";
    d.appendChild(l); d.appendChild(n); d.appendChild(g); d.appendChild(a);
    host.appendChild(d);
  });
  drawMap(top3, r.dist);
  $("foot").textContent = DISCLAIMER_INTRO;
  send(true);
}
/* radius = how far that person sits from the estimated preference.
 * Angles are laid out evenly and carry no meaning; the caption says so. */
function drawMap(idx, D) {
  var NS = "http://www.w3.org/2000/svg", svg = $("map"), cx = 160, cy = 160;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  var mk = function (t, at) {
    var e = document.createElementNS(NS, t);
    for (var k in at) e.setAttribute(k, at[k]);
    return e;
  };
  [46, 92, 138].forEach(function (r) {
    svg.appendChild(mk("circle", { cx: cx, cy: cy, r: r, fill: "none",
      stroke: "var(--line)", "stroke-width": 1 }));
  });
  var d3 = idx.map(function (i) { return D[i]; });
  var lo = Math.min.apply(null, d3), hi = Math.max.apply(null, d3);
  var ang = [-90, 30, 150];
  idx.forEach(function (i, k) {
    var f = hi - lo < 1e-9 ? 0.5 : (d3[k] - lo) / (hi - lo);
    var r = 52 + f * 74;
    var th = ang[k] * Math.PI / 180;
    var x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
    svg.appendChild(mk("line", { x1: cx, y1: cy, x2: x, y2: y,
      stroke: "var(--line)", "stroke-width": 1 }));
    svg.appendChild(mk("circle", { cx: x, cy: y, r: 7,
      fill: "var(--accent)" }));
    var t = mk("text", { x: x, y: y - 13, "text-anchor": "middle",
      "font-size": 13, fill: "var(--fg)" });
    t.textContent = MEMBERS[i].name;
    svg.appendChild(t);
  });
  svg.appendChild(mk("circle", { cx: cx, cy: cy, r: 5,
    fill: "var(--fg)" }));
  var c = mk("text", { x: cx, y: cy + 20, "text-anchor": "middle",
    "font-size": 12, fill: "var(--sub)" });
  c.textContent = "あなたの好み";
  svg.appendChild(c);
}
function share() {
  /* First person, about my own impression. Never a ranking of members:
   * no "1位", no "トップ", no ordinal of any kind.
   *
   * The URL goes in its own `url` parameter rather than inside the text.
   * X only renders the card when a URL is present, and keeping it out of
   * the body avoids double-encoding the text. */
  window.open(shareUrl(), "_blank", "noopener");
}
/* Group name before the member name, and all three groups spelled out on
 * the second line: someone who sees the post cold may not know what
 * "イコノイジョイ" covers. Group labels come from GROUP_LABEL, the same
 * source the result cards use, so the notation cannot drift. */
function shareText() {
  var m = MEMBERS[top3[0]];
  var all = GROUP_ORDER.map(gname).join("・");
  return "私の好みは" + gname(m.group) + "の" + m.name + "さん寄りらしい\n"
       + all + "のメンバーから診断\n"
       + "#" + CONFIG.brand;
}
function shareUrl() {
  return "https://x.com/intent/post?text=" + encodeURIComponent(shareText())
       + "&url=" + encodeURIComponent(siteUrl());
}
/* Configured URL wins; otherwise fall back to wherever we are now, so
 * the button still works before siteUrl has been filled in. */
function siteUrl() {
  var u = (CONFIG.siteUrl || "").trim();
  if (u) return u.replace(/\/+$/, "") + "/";
  return location.href.split("#")[0].split("?")[0];
}
function restart() {
  qi = 0; answers = []; oshi = []; top3 = [];
  initParticles(); show("quiz"); nextQ();
}

function boot() {
  applyBrand();
  renderDisclaimer();
  $("start").onclick = function () { initParticles(); show("quiz"); nextQ(); };
  $("skipq").onclick = skipQ;
  $("odone").onclick = finish;   // works at zero selections too
  $("share").onclick = share;
  $("again").onclick = restart;
}
if (typeof document !== "undefined" && document.getElementById) {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
}

/* exposed for the headless test harness */
global.OSHIYOHO = {
  initParticles: initParticles, update: update, weights: weights,
  pickQuad: pickQuad, eig: eig, probs: probs, recommend: recommend,
  confidence: confidence, top1of: top1of, expectedDist: expectedDist,
  get P() { return P; }, get NQ() { return NQ; }, get A() { return A; },
  setAnswers: function (a) { answers = a; },
  setOshi: function (o) { oshi = o; },
  setTop3: function (t) { top3 = t; },
  buildPayload: function (done) {
    return { ts: new Date().toISOString(),
             picks: answers.map(function (a) { return a.chosen; }),
             oshi: oshi.map(function (i) { return MEMBERS[i].id; }),
             proposed: top3.map(function (i) { return MEMBERS[i].id; }),
             completed: !!done };
  },
  /* the real ones, not copies -- the copy drifted once already */
  shareText: shareText, shareUrl: shareUrl, siteUrl: siteUrl, send: send
};
})(typeof globalThis !== "undefined" ? globalThis : this);
