// 북한산둘레길 웹앱
// 화면: #/ (구간 목록) · #/s/3 (구간 상세) · #/map · #/map/3 (지도) · #/note/depart|peaks|food (산행 노트)
(function () {
  const $view = document.getElementById("view");
  const LEVEL = { 하: "쉬움", 중: "보통", 상: "어려움" };
  const COLORS = { route: "#2E5B3E", active: "#E4572E", detail: "#2E5B3E", me: "#2F6FD6" };
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const state = { sections: [], routes: new Map(), note: "", filter: "all", map: null, mini: null, me: null, watchId: null };

  // ---------- 데이터 ----------
  async function load() {
    const [s, r] = await Promise.all([
      fetch("data/sections.json").then((x) => x.json()),
      fetch("data/routes.geojson").then((x) => x.json()),
    ]);
    state.sections = s.sections;
    state.note = s.source;
    for (const f of r.features) state.routes.set(f.properties.no, f);
  }
  const section = (no) => state.sections.find((s) => s.no === no);
  const totalKm = () => state.sections.reduce((a, s) => a + s.km, 0);

  // ---------- 공통 ----------
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3000);
  }
  function setTab(name) {
    document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
  }
  function cleanupMaps() {
    if (state.map) { state.map.remove(); state.map = null; }
    if (state.mini) { state.mini.remove(); state.mini = null; }
    state.me = null;
  }
  const levelBadge = (s) => `<span class="lv lv-${s.level}">${LEVEL[s.level]}</span>`;
  const kakaoTo = (name, [lng, lat]) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;

  // ---------- 구간 목록 ----------
  function renderList() {
    setTab("list");
    const shown = state.sections.filter((s) => state.filter === "all" || s.level === state.filter);
    const areas = [...new Set(state.sections.map((s) => s.area))];
    const chips = [["all", "전체"], ["하", "쉬움"], ["중", "보통"], ["상", "어려움"]]
      .map(([v, t]) => `<button class="chip${state.filter === v ? " on" : ""}" data-filter="${v}">${t}</button>`).join("");

    $view.innerHTML = `
      <header class="top">
        <h1>북한산둘레길</h1>
        <p>${state.sections.length}개 구간 · 약 ${Math.round(totalKm())}km</p>
      </header>
      <div class="chips" role="group" aria-label="난이도">${chips}</div>
      ${areas.map((area) => {
        const list = shown.filter((s) => s.area === area);
        if (!list.length) return "";
        return `<h2 class="area">${esc(area)} <small>${list.length}개 구간</small></h2>
          <ul class="cards">${list.map((s) => `
            <li><a class="card lv-${s.level}" href="#/s/${s.no}">
              <span class="no">${s.no}</span>
              <span class="body">
                <strong>${esc(s.name)}</strong>
                <span class="meta">${s.km}km · ${esc(s.time)} · ${LEVEL[s.level]}</span>
                <span class="fromto">${esc(s.from)} → ${esc(s.to)}</span>
              </span>
            </a></li>`).join("")}
          </ul>`;
      }).join("")}
      <p class="note">${esc(state.note)}</p>`;

    $view.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      state.filter = b.dataset.filter; renderList();
    }));
  }

  // ---------- 구간 상세 ----------
  function renderDetail(no) {
    setTab("list");
    const s = section(no), f = state.routes.get(no);
    if (!s) return (location.hash = "#/");
    const prev = section(no - 1), next = section(no + 1);
    const estimated = f && f.properties.source !== "osm";

    $view.innerHTML = `
      <header class="top sub">
        <a class="back" href="#/" aria-label="목록으로">‹</a>
        <div><p>${s.no}구간 · ${esc(s.area)}</p><h1>${esc(s.name)}</h1></div>
      </header>
      <section class="stats">
        <div><span>거리</span><strong>${s.km}km</strong></div>
        <div><span>걸리는 시간</span><strong>${esc(s.time)}</strong></div>
        <div><span>난이도</span><strong>${levelBadge(s)}</strong></div>
      </section>
      ${s.notice ? `<p class="notice">${esc(s.notice)}</p>` : ""}
      <section class="course">
        <div class="pt"><i class="dot start"></i><span>출발</span><strong>${esc(s.from)}</strong></div>
        <div class="pt"><i class="dot end"></i><span>도착</span><strong>${esc(s.to)}</strong></div>
      </section>
      <div id="mini" class="mini" aria-label="${esc(s.name)} 경로 지도"></div>
      ${estimated ? `<p class="note">이 구간 지도 경로는 주변 길을 이어 만든 추정 경로입니다. 현장 표지판을 따라 걸어 주세요.</p>` : ""}
      <div class="actions">
        <a class="btn primary" href="#/map/${s.no}">지도에서 크게 보기</a>
        ${f ? `<a class="btn" href="${kakaoTo(s.from, f.properties.start)}" target="_blank" rel="noopener">출발점까지 길찾기 (카카오맵)</a>` : ""}
        <a class="btn" href="#/note/depart?s=${s.no}">언제 출발할지 계산하기</a>
      </div>
      <nav class="pager">
        ${prev ? `<a href="#/s/${prev.no}">‹ ${prev.no}. ${esc(prev.name)}</a>` : "<span></span>"}
        ${next ? `<a href="#/s/${next.no}">${next.no}. ${esc(next.name)} ›</a>` : "<span></span>"}
      </nav>`;

    if (f) {
      state.mini = L.map("mini", { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, tap: false });
      L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTR }).addTo(state.mini);
      // 레이어를 붙이기 전에 화면 범위부터 잡는다 (보기 범위 없이 선을 붙이면 Leaflet이 오류를 냄)
      const layer = L.geoJSON(f, { style: { color: COLORS.detail, weight: 5, opacity: 0.9 } });
      state.mini.fitBounds(layer.getBounds(), { padding: [24, 24] });
      layer.addTo(state.mini);
      endMarkers(f).forEach((m) => m.addTo(state.mini));
      const fit = () => { if (!state.mini) return; state.mini.invalidateSize(); state.mini.fitBounds(layer.getBounds(), { padding: [24, 24] }); };
      fit(); requestAnimationFrame(fit);
      document.getElementById("mini").addEventListener("click", () => (location.hash = `#/map/${s.no}`));
    }
  }

  function endMarkers(f) {
    const [sLng, sLat] = f.properties.start, [eLng, eLat] = f.properties.end;
    return [
      L.circleMarker([sLat, sLng], { radius: 7, color: "#fff", weight: 2, fillColor: COLORS.detail, fillOpacity: 1 }),
      L.circleMarker([eLat, eLng], { radius: 7, color: COLORS.detail, weight: 3, fillColor: "#fff", fillOpacity: 1 }),
    ];
  }

  // ---------- 지도 ----------
  function renderMap(no) {
    setTab("map");
    $view.innerHTML = `
      <div class="mapwrap">
        <div id="map" class="map"></div>
        <button id="locate" class="fab" aria-label="내 위치 보기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
        </button>
        <div id="sheet" class="sheet" hidden></div>
      </div>`;

    const map = (state.map = L.map("map", { zoomControl: false, zoomSnap: 0.25 }));
    L.control.zoom({ position: "topright" }).addTo(map);
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTR }).addTo(map);

    const layers = new Map(), starts = [];
    for (const [n, f] of state.routes) {
      const layer = L.geoJSON(f, {
        style: { color: COLORS.route, weight: 4, opacity: 0.8, dashArray: f.properties.source === "estimated" ? "6 6" : null },
      });
      layer.on("click", () => select(n));
      layers.set(n, layer);
      const [lng, lat] = f.properties.start;
      starts.push(L.marker([lat, lng], { icon: L.divIcon({ className: "num", html: `<span>${n}</span>`, iconSize: [24, 24] }) })
        .on("click", () => select(n)));
    }
    const all = L.featureGroup([...layers.values()]);
    map.fitBounds(all.getBounds(), { padding: [20, 20] });
    all.addTo(map);
    starts.forEach((m) => m.addTo(map));
    requestAnimationFrame(() => { if (state.map === map) { map.invalidateSize(); if (!no) map.fitBounds(all.getBounds(), { padding: [20, 20] }); } });

    let selected = null;
    function select(n, fit = true) {
      if (selected && layers.get(selected)) layers.get(selected).setStyle({ color: COLORS.route, weight: 4 });
      selected = n;
      const layer = layers.get(n);
      layer.setStyle({ color: COLORS.active, weight: 7 }); layer.bringToFront();
      if (fit) map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16 });
      history.replaceState(null, "", `#/map/${n}`);
      showSheet();
    }

    function showSheet() {
      const sheet = document.getElementById("sheet");
      if (!selected) { sheet.hidden = true; return; }
      const s = section(selected), f = state.routes.get(selected);
      let where = "";
      if (state.me) {
        const d = Geo.distanceToLines(state.me, f.geometry.coordinates);
        where = d <= 50 ? `<p class="where on">지금 코스 위에 있어요</p>` : `<p class="where">코스까지 약 ${Geo.formatMeters(d)}</p>`;
      }
      sheet.innerHTML = `
        <div class="sheet-head">
          <span class="no lv-${s.level}">${s.no}</span>
          <div><strong>${esc(s.name)}</strong><span>${s.km}km · ${esc(s.time)} · ${LEVEL[s.level]}</span></div>
          <button class="x" aria-label="닫기">×</button>
        </div>
        ${where}
        <div class="actions">
          <a class="btn primary" href="#/s/${s.no}">자세히</a>
          <a class="btn" href="${kakaoTo(s.from, f.properties.start)}" target="_blank" rel="noopener">출발점 길찾기</a>
        </div>`;
      sheet.hidden = false;
      sheet.querySelector(".x").addEventListener("click", () => {
        layers.get(selected).setStyle({ color: COLORS.route, weight: 4 });
        selected = null; sheet.hidden = true; history.replaceState(null, "", "#/map");
      });
    }

    // 내 위치 (Geolocation API)
    let meDot = null, meRing = null, firstFix = true;
    document.getElementById("locate").addEventListener("click", () => {
      if (!("geolocation" in navigator)) return toast("이 브라우저는 위치 기능을 지원하지 않아요.");
      if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
      firstFix = true;
      toast("위치를 찾는 중…");
      state.watchId = navigator.geolocation.watchPosition((pos) => {
        if (!state.map) return;
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        state.me = [lng, lat];
        if (!meDot) {
          meRing = L.circle([lat, lng], { radius: accuracy, color: COLORS.me, weight: 1, fillOpacity: 0.12 }).addTo(map);
          meDot = L.circleMarker([lat, lng], { radius: 8, color: "#fff", weight: 3, fillColor: COLORS.me, fillOpacity: 1 }).addTo(map);
        } else {
          meRing.setLatLng([lat, lng]).setRadius(accuracy); meDot.setLatLng([lat, lng]);
        }
        if (firstFix) {
          firstFix = false;
          document.getElementById("toast").hidden = true;
          map.setView([lat, lng], Math.max(map.getZoom(), 15));
          if (!selected) {
            // 가장 가까운 구간을 골라 준다
            let best = null, bd = Infinity;
            for (const [n, f] of state.routes) { const d = Geo.distanceToLines(state.me, f.geometry.coordinates); if (d < bd) { bd = d; best = n; } }
            if (best && bd < 5000) select(best, false);
            else toast("근처에 둘레길 구간이 없어요.");
          }
        }
        showSheet();
      }, (err) => {
        toast(err.code === 1 ? "위치 권한을 허용해 주세요." : "위치를 가져오지 못했어요.");
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
    });

    if (no && layers.has(no)) select(no);
  }

  // ---------- 라우팅 ----------
  function route() {
    cleanupMaps();
    if (state.watchId !== null && !location.hash.startsWith("#/map")) {
      navigator.geolocation.clearWatch(state.watchId); state.watchId = null;
    }
    const h = location.hash || "#/";
    let m;
    if ((m = h.match(/^#\/s\/(\d+)/))) renderDetail(Number(m[1]));
    else if ((m = h.match(/^#\/note(?:\/(\w+))?(?:\?s=(\d+))?/))) {
      setTab("note");
      Note.render($view, m[1], { sections: state.sections, sectionNo: m[2] ? Number(m[2]) : null });
    }
    else if ((m = h.match(/^#\/map(?:\/(\d+))?/))) renderMap(m[1] ? Number(m[1]) : null);
    else renderList();
    if (!h.startsWith("#/map")) window.scrollTo(0, 0);
  }

  // ---------- 오프라인 표시 · 서비스 워커 ----------
  function onlineState() { document.getElementById("offline").hidden = navigator.onLine; }
  window.addEventListener("online", onlineState);
  window.addEventListener("offline", onlineState);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  load().then(() => {
    window.addEventListener("hashchange", route);
    onlineState();
    route();
  }).catch(() => {
    $view.innerHTML = `<p class="note">구간 정보를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>`;
  });
})();
