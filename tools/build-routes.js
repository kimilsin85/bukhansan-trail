// OpenStreetMap 북한산둘레길 relation(osm_relations.json) -> data/routes.geojson
// 실행: node tools/build-routes.js
//
// - OSM에 구간 relation이 있으면 그 경로를 그대로 쓴다 (source: "osm")
// - 없는 구간(9·10·20)은 둘레길 전체 relation의 길들을 그래프로 만들어
//   앞뒤 구간 끝점 사이 최단 경로로 채운다 (source: "estimated")
// - 구간 시작·끝 좌표도 함께 계산한다
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const osm = JSON.parse(fs.readFileSync(path.join(__dirname, "osm_relations.json"), "utf8"));
const { sections } = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sections.json"), "utf8"));

// 구간 번호 -> OSM relation id (OSM 쪽 번호 표기가 틀린 13구간 송추마을길 포함)
const REL = {
  1: 11340616, 2: 11340574, 3: 11312769, 4: 11288178, 5: 11639676, 6: 11639675,
  7: 11639674, 8: 11639794, 11: 11606773, 12: 11606774, 13: 11589490, 14: 11514826,
  15: 11514831, 16: 11627661, 17: 11304602, 18: 11304603, 19: 11304604, 21: 11627660,
};

const rels = new Map(osm.elements.map((r) => [r.id, r]));
const key = (p) => p.lat.toFixed(6) + "," + p.lon.toFixed(6);
function hav(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const lines = (rel) => rel.members.filter((m) => m.type === "way" && m.geometry && m.geometry.length > 1).map((m) => m.geometry);
const lineLen = (ls) => ls.reduce((a, g) => a + g.slice(1).reduce((s, p, i) => s + hav(g[i], p), 0), 0);

// 구간 길들의 양 끝점 (연결 차수 1인 점 중 가장 멀리 떨어진 두 점)
function endpoints(ls) {
  const deg = new Map(), pt = new Map();
  for (const g of ls) for (const p of [g[0], g[g.length - 1]]) {
    deg.set(key(p), (deg.get(key(p)) || 0) + 1); pt.set(key(p), p);
  }
  let cand = [...deg].filter(([, d]) => d === 1).map(([k]) => pt.get(k));
  if (cand.length < 2) cand = [...pt.values()];
  let best = [cand[0], cand[1] || cand[0]], bd = -1;
  for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
    const d = hav(cand[i], cand[j]); if (d > bd) { bd = d; best = [cand[i], cand[j]]; }
  }
  return best;
}
const minDistTo = (p, ls) => Math.min(...ls.flat().map((q) => hav(p, q)));

// 1) OSM 구간 경로와 끝점
const geo = {};
for (const s of sections) {
  const rel = rels.get(REL[s.no]);
  if (rel) geo[s.no] = { lines: lines(rel), source: "osm" };
}
const nos = sections.map((s) => s.no);
for (const no of Object.keys(geo).map(Number)) {
  const [a, b] = endpoints(geo[no].lines);
  // 시작점 = 이전 구간 경로에 더 가까운 쪽 (1구간은 21구간 끝 우이 쪽)
  const prevNo = no === 1 ? 21 : no === 13 ? 12 : no - 1;
  const prev = geo[prevNo];
  let start = a, end = b;
  if (prev && minDistTo(b, prev.lines) < minDistTo(a, prev.lines)) [start, end] = [b, a];
  if (no === 21) { // 21구간은 교현(서쪽) -> 우이(동쪽)
    if (start.lon > end.lon) [start, end] = [end, start];
  }
  geo[no].start = start; geo[no].end = end;
}

// 2) 비어 있는 구간: 둘레길 전체 길 그래프에서 최단 경로
// 둘레길 relation 길 + 빈 구간 주변 길(osm_gap_ways.json). 산길은 싸게, 차도는 비싸게 잡아 산길을 따라가게 함
const graph = new Map(), nodes = new Map();
function addEdge(p, q, factor) {
  const kp = key(p), kq = key(q), d = hav(p, q) * factor;
  nodes.set(kp, p); nodes.set(kq, q);
  if (!graph.has(kp)) graph.set(kp, []); if (!graph.has(kq)) graph.set(kq, []);
  graph.get(kp).push([kq, d]); graph.get(kq).push([kp, d]);
}
for (const rel of osm.elements) for (const g of lines(rel)) for (let i = 1; i < g.length; i++) addEdge(g[i - 1], g[i], 0.5);
const gapFile = path.join(__dirname, "osm_gap_ways.json");
if (fs.existsSync(gapFile)) {
  const COST = { path: 1, footway: 1, track: 1.2, steps: 1.2, pedestrian: 1.3, living_street: 1.6, residential: 1.8, service: 1.8, unclassified: 2, tertiary: 3, secondary: 4 };
  for (const w of JSON.parse(fs.readFileSync(gapFile, "utf8")).elements) {
    const g = w.geometry || [];
    for (let i = 1; i < g.length; i++) addEdge(g[i - 1], g[i], COST[w.tags.highway] || 2);
  }
}
const nearestNode = (p) => { let bk = null, bd = Infinity; for (const [k, q] of nodes) { const d = hav(p, q); if (d < bd) { bd = d; bk = k; } } return [bk, bd]; };
function shortest(a, b) {
  const [ka] = nearestNode(a), [kb] = nearestNode(b);
  const dist = new Map([[ka, 0]]), prev = new Map(), done = new Set();
  // 이진 힙
  const h = [[0, ka]];
  const push = (x) => { h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const pop = () => { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; };
  while (h.length) {
    const [d, k] = pop();
    if (done.has(k)) continue; done.add(k);
    if (k === kb) break;
    for (const [n, w] of graph.get(k) || []) {
      const nd = d + w;
      if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); prev.set(n, k); push([nd, n]); }
    }
  }
  if (!dist.has(kb)) return null;
  const out = []; for (let k = kb; k; k = prev.get(k)) out.unshift(nodes.get(k));
  return out;
}
function splitAt(line, meters) {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += hav(line[i - 1], line[i]);
    if (acc >= meters) return [line.slice(0, i + 1), line.slice(i)];
  }
  return [line, [line[line.length - 1]]];
}

// 8구간 뒷부분 + 9·10구간: OSM 8구간 끝 -> 11구간 시작.
// OSM 8구간은 공식 거리보다 짧으므로, 이어지는 경로를 남은 공식 거리 비율로 8 · 9 · 10에 나눠 준다
if (!geo[9] && !geo[10] && geo[8] && geo[11]) {
  const p = shortest(geo[8].end, geo[11].start);
  if (p) {
    const km = (no) => sections.find((s) => s.no === no).km;
    const rest8 = Math.max(0, km(8) - lineLen(geo[8].lines) / 1000);
    const total = rest8 + km(9) + km(10), len = lineLen([p]);
    const [l8, r1] = splitAt(p, len * (rest8 / total));
    const [l9, l10] = splitAt(r1, len * (km(9) / total));
    geo[8].lines.push(l8); geo[8].end = l8[l8.length - 1]; geo[8].source = "osm+estimated";
    geo[9] = { lines: [l9], source: "estimated", start: l9[0], end: l9[l9.length - 1] };
    geo[10] = { lines: [l10], source: "estimated", start: l10[0], end: l10[l10.length - 1] };
  }
}
// 20구간: 19구간 끝 -> 1구간 시작
if (!geo[20] && geo[19] && geo[1]) {
  const p = shortest(geo[19].end, geo[1].start);
  if (p) geo[20] = { lines: [p], source: "estimated", start: p[0], end: p[p.length - 1] };
}

// 3) GeoJSON 출력 (좌표 소수 6자리)
const c = (p) => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))];
const features = [];
for (const no of nos) {
  const g = geo[no];
  if (!g) { console.warn(`${no}구간: 경로 없음`); continue; }
  features.push({
    type: "Feature",
    properties: { no, source: g.source, start: c(g.start), end: c(g.end), mapped_km: Number((lineLen(g.lines) / 1000).toFixed(2)) },
    geometry: { type: "MultiLineString", coordinates: g.lines.map((l) => l.map(c)) },
  });
}
const out = {
  type: "FeatureCollection",
  attribution: "경로 데이터 © OpenStreetMap contributors (ODbL)",
  features,
};
fs.writeFileSync(path.join(ROOT, "data", "routes.geojson"), JSON.stringify(out));
for (const f of features) {
  const s = sections.find((x) => x.no === f.properties.no);
  console.log(String(f.properties.no).padStart(2), s.name.padEnd(6), f.properties.source.padEnd(9), "지도", f.properties.mapped_km, "km / 공식", s.km, "km");
}
