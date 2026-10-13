// 산행 노트 화면: 출발 시각 · 봉우리 기록 · 하산 맛집
// 계산·검증·저장은 note-logic.js(window.Logic), 기록은 이 기기 브라우저에만 저장
(function () {
  const L = window.Logic;
  const SUBS = [["depart", "출발 시각"], ["peaks", "봉우리 기록"], ["food", "하산 맛집"]];

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const show = (el, msg) => { el.textContent = msg || ""; el.hidden = !msg; };
  function todayStr() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function getStorage() { try { return window.localStorage; } catch (e) { return null; } }
  const failing = { getItem() { throw new Error("no storage"); }, setItem() { throw new Error("no storage"); } };
  const storage = getStorage();
  const st = storage || failing;

  // "1시간 30분" -> 90
  function minutesOf(time) {
    const h = /(\d+)\s*시간/.exec(time), m = /(\d+)\s*분/.exec(time);
    return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  }

  function render($view, sub, opts) {
    sub = SUBS.some(([k]) => k === sub) ? sub : "depart";
    $view.innerHTML = `
      <header class="top">
        <h1>산행 노트</h1>
        <p>출발 시각을 계산하고, 오른 봉우리와 하산 맛집을 기록하세요.</p>
      </header>
      <nav class="seg" aria-label="산행 노트 메뉴">
        ${SUBS.map(([k, t]) => `<a href="#/note/${k}" class="${k === sub ? "on" : ""}" ${k === sub ? 'aria-current="page"' : ""}>${t}</a>`).join("")}
      </nav>
      <section id="note-body"></section>
      <p class="note">기록은 이 기기의 브라우저에만 저장됩니다. 일몰 시각은 북한산·도봉산 일대 좌표로 계산한 근삿값입니다.</p>`;
    const body = document.getElementById("note-body");
    if (sub === "depart") renderDepart(body, opts);
    else if (sub === "peaks") renderPeaks(body);
    else renderFood(body);
  }

  // ---------- 출발 시각 ----------
  function renderDepart(body, { sections, sectionNo }) {
    const trail = sections.map((s) => ({ id: `s${s.no}`, name: `${s.no}구간 ${s.name} (${s.time})`, minutes: minutesOf(s.time) }));
    const peaks = L.COURSES.map((c) => ({ id: c.id, name: c.name, minutes: c.minutes }));
    const all = trail.concat(peaks);
    body.innerHTML = `
      <form id="depart-form" class="panel" novalidate>
        <label>코스
          <select id="course">
            <optgroup label="북한산둘레길">${trail.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>
            <optgroup label="봉우리 코스">${peaks.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>
            <option value="custom">직접 입력</option>
          </select>
        </label>
        <div class="row">
          <label>산행 시간(분)<input id="hike" type="number" inputmode="numeric" min="30" max="1200" step="1"></label>
          <label>휴식 시간(분)<input id="rest" type="number" inputmode="numeric" min="0" max="300" step="1" value="30"></label>
        </div>
        <div class="row">
          <label>산행 날짜<input id="date" type="date"></label>
          <label>일몰 전 여유(분)<input id="buffer" type="number" inputmode="numeric" min="0" max="240" step="1" value="60"></label>
        </div>
        <p class="hint">코스 시간은 참고값입니다. 본인 속도에 맞게 고쳐 쓰세요.</p>
        <button type="submit" class="btn primary">출발 시각 계산</button>
      </form>
      <div id="depart-error" class="err" role="alert" hidden></div>
      <div id="depart-result" class="result" hidden></div>`;

    const $ = (id) => body.querySelector("#" + id);
    const sel = $("course");
    const sync = () => { const c = all.find((x) => x.id === sel.value); if (c) $("hike").value = c.minutes; };
    sel.value = sectionNo && trail.some((c) => c.id === `s${sectionNo}`) ? `s${sectionNo}` : trail[0].id;
    sel.addEventListener("change", sync);
    $("hike").addEventListener("input", () => {
      const c = all.find((x) => x.id === sel.value);
      if (c && String($("hike").value) !== String(c.minutes)) sel.value = "custom";
    });
    $("date").value = todayStr();
    sync();

    const num = (id) => ($(id).value === "" ? NaN : Number($(id).value));
    $("depart-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const res = L.calcDeparture({ date: $("date").value, hikeMinutes: num("hike"), restMinutes: num("rest"), bufferMinutes: num("buffer") });
      const box = $("depart-result");
      if (!res.ok) { box.hidden = true; show($("depart-error"), res.errors.join(" ")); return; }
      show($("depart-error"), "");
      box.innerHTML = `
        <span>늦어도 이 시각에는 출발</span>
        <strong class="big">${res.feasible ? L.formatTime(res.depart) : "출발 불가"}</strong>
        <dl><div><dt>일몰</dt><dd>${L.formatTime(res.sunset)}</dd></div><div><dt>하산 완료 목표</dt><dd>${L.formatTime(res.finish)}</dd></div></dl>
        ${res.warning ? `<p class="warn">${esc(res.warning)}</p>` : ""}`;
      box.hidden = false;
    });
  }

  // ---------- 봉우리 기록 ----------
  function renderPeaks(body) {
    const loaded = L.loadPeaks(st);
    let peaks = loaded.peaks;
    body.innerHTML = `
      <p id="progress" class="progress"></p>
      <div id="peaks-notice" class="err" role="alert" hidden></div>
      <ul id="peak-list" class="items"></ul>
      <form id="peak-form" class="panel" novalidate>
        <h2>오른 봉우리 기록하기</h2>
        <label>봉우리<select id="peak-select"></select></label>
        <label id="custom-wrap" hidden>새 봉우리 이름<input id="custom-name" type="text" autocomplete="off"></label>
        <label>오른 날짜<input id="peak-date" type="date"></label>
        <label>메모 (선택)<textarea id="peak-memo" rows="3" placeholder="예: 정상석 앞 인증샷, 구름 많음"></textarea></label>
        <p class="hint"><span id="memo-count">0</span> / ${L.MEMO_MAX}자</p>
        <button type="submit" class="btn primary">기록 저장</button>
      </form>
      <div id="peak-error" class="err" role="alert" hidden></div>`;
    const $ = (id) => body.querySelector("#" + id);
    show($("peaks-notice"), loaded.error || (storage ? "" : "이 브라우저에서는 저장소를 쓸 수 없어 기록이 유지되지 않습니다."));

    const persist = () => { const r = L.savePeaks(st, peaks); show($("peaks-notice"), r.ok ? "" : r.error); return r.ok; };

    function draw() {
      const sel = $("peak-select"), prev = sel.value;
      sel.innerHTML = peaks.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") + `<option value="__new">+ 새 봉우리 추가</option>`;
      if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
      $("custom-wrap").hidden = sel.value !== "__new";

      const done = peaks.filter((p) => p.conquered).length;
      $("progress").textContent = `오른 봉우리 ${done} / ${peaks.length}`;
      const ul = $("peak-list");
      ul.innerHTML = "";
      peaks.forEach((p) => {
        const li = document.createElement("li");
        if (p.conquered) li.className = "done";
        li.innerHTML = `<div class="info"><strong>${p.conquered ? "✓ " : ""}${esc(p.name)}</strong>
          <span class="meta">${p.conquered ? `${p.date} 오름` : "아직 오르지 않음"}</span>
          ${p.conquered && p.memo ? `<span class="memo">${esc(p.memo)}</span>` : ""}</div>`;
        if (p.conquered || p.custom) {
          const b = document.createElement("button");
          b.type = "button"; b.className = "sbtn"; b.textContent = p.custom ? "삭제" : "기록 지우기";
          b.addEventListener("click", () => {
            const snap = JSON.stringify(peaks);
            if (p.custom) peaks = peaks.filter((x) => x.id !== p.id);
            else { p.conquered = false; p.date = ""; p.memo = ""; }
            if (!persist()) peaks = JSON.parse(snap);
            draw();
          });
          li.appendChild(b);
        }
        ul.appendChild(li);
      });
    }

    $("peak-select").addEventListener("change", () => { $("custom-wrap").hidden = $("peak-select").value !== "__new"; });
    $("peak-memo").addEventListener("input", () => { $("memo-count").textContent = L.codePointLength(L.cleanText($("peak-memo").value)); });
    $("peak-date").value = todayStr();

    $("peak-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const rec = L.validateRecord({ date: $("peak-date").value, memo: $("peak-memo").value }, todayStr());
      const errors = rec.errors.slice();
      let target = null, newName = null;
      if ($("peak-select").value === "__new") {
        const v = L.validateName($("custom-name").value, peaks);
        if (!v.ok) errors.push(v.error); else newName = v.name;
      } else {
        target = peaks.find((p) => p.id === $("peak-select").value);
        if (!target) errors.push("봉우리를 선택해 주세요.");
      }
      if (errors.length) { show($("peak-error"), errors.join(" ")); return; }
      const snap = JSON.stringify(peaks);
      if (newName) {
        target = { id: "c" + Date.now().toString(36), name: newName, custom: true, conquered: false, date: "", memo: "" };
        peaks.push(target);
      }
      target.conquered = true; target.date = $("peak-date").value; target.memo = rec.memo;
      if (!persist()) { peaks = JSON.parse(snap); show($("peak-error"), "저장에 실패해 기록을 반영하지 않았습니다."); draw(); return; }
      show($("peak-error"), "");
      $("peak-memo").value = ""; $("custom-name").value = ""; $("memo-count").textContent = "0";
      draw();
      $("peak-select").value = target.id;
    });
    draw();
  }

  // ---------- 하산 맛집 (이 기기에 저장, 내보내기·가져오기로 나눔) ----------
  function renderFood(body) {
    const loaded = L.loadSpots(st);
    let spots = loaded.spots, liked = L.loadLiked(st);
    body.innerHTML = `
      <label>하산 지점 보기<select id="food-filter"></select></label>
      <div id="food-notice" class="err" role="alert" hidden></div>
      <ul id="food-list" class="items"></ul>
      <form id="food-form" class="panel" novalidate>
        <h2>맛집 추가하기</h2>
        <label>하산 지점<select id="food-point"></select></label>
        <label id="food-point-new-wrap" hidden>새 하산 지점 이름<input id="food-point-new" type="text" autocomplete="off"></label>
        <label>가게 이름<input id="food-name" type="text" autocomplete="off"></label>
        <div class="row">
          <label>종류<select id="food-category">${L.CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label>닉네임 (선택)<input id="food-author" type="text" autocomplete="off" placeholder="익명"></label>
        </div>
        <label>대표 메뉴 (선택)<input id="food-menu" type="text" autocomplete="off"></label>
        <label>한줄 후기 (선택)<textarea id="food-memo" rows="2"></textarea></label>
        <p class="hint"><span id="food-memo-count">0</span> / ${L.SPOT_LIMITS.memo}자</p>
        <button type="submit" class="btn primary">맛집 등록</button>
      </form>
      <div id="food-error" class="err" role="alert" hidden></div>
      <details class="panel share">
        <summary>다른 사람과 맛집 목록 나누기</summary>
        <p class="hint">내보내기로 나온 글을 복사해 전달하고, 받은 글은 붙여 넣고 가져오기를 누르세요.</p>
        <textarea id="share-text" rows="4"></textarea>
        <div class="row">
          <button type="button" id="share-export" class="btn">내보내기</button>
          <button type="button" id="share-import" class="btn">가져오기</button>
        </div>
        <p id="share-msg" class="hint" role="status"></p>
      </details>`;
    const $ = (id) => body.querySelector("#" + id);
    show($("food-notice"), loaded.error || (storage ? "" : "이 브라우저에서는 저장소를 쓸 수 없어 맛집이 유지되지 않습니다."));

    const persist = () => { const r = L.saveSpots(st, spots); show($("food-notice"), r.ok ? "" : r.error); return r.ok; };
    const points = () => { const list = L.POINTS.slice(); spots.forEach((s) => { if (!list.includes(s.point)) list.push(s.point); }); return list; };
    function fill(sel, values, first, extra) {
      const prev = sel.value;
      sel.innerHTML = (first || []).concat(values.map((v) => [v, v]), extra || []).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
      if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    }

    function draw() {
      fill($("food-filter"), points(), [["", "전체 보기"]]);
      fill($("food-point"), points(), [], [["__new", "+ 새 하산 지점"]]);
      $("food-point-new-wrap").hidden = $("food-point").value !== "__new";
      const f = $("food-filter").value;
      const shown = spots.filter((s) => !f || s.point === f).sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
      const ul = $("food-list");
      ul.innerHTML = shown.length ? "" : `<li class="empty">${f ? esc(f) + "에는 아직 등록된 맛집이 없습니다." : "아직 등록된 맛집이 없습니다. 아래에서 첫 맛집을 추가해 보세요."}</li>`;
      shown.forEach((s) => {
        const li = document.createElement("li");
        li.innerHTML = `<div class="info"><strong><span class="tag">${esc(s.category)}</span>${esc(s.name)}</strong>
          <span class="meta">${esc(s.point)} · ${esc(s.author)}${s.menu ? " · " + esc(s.menu) : ""}</span>
          ${s.memo ? `<span class="memo">${esc(s.memo)}</span>` : ""}</div>`;
        const acts = document.createElement("div"); acts.className = "acts";
        const isLiked = liked.includes(s.id);
        const like = document.createElement("button");
        like.type = "button"; like.className = "sbtn" + (isLiked ? " on" : "");
        like.setAttribute("aria-pressed", String(isLiked));
        like.textContent = `추천 ${s.likes}`;
        like.addEventListener("click", () => {
          const snapS = JSON.stringify(spots), snapL = liked.slice();
          if (isLiked) { liked = liked.filter((x) => x !== s.id); s.likes = Math.max(0, s.likes - 1); }
          else { liked.push(s.id); s.likes += 1; }
          if (!persist() || !L.saveLiked(st, liked)) { spots = JSON.parse(snapS); liked = snapL; }
          draw();
        });
        acts.appendChild(like);
        if (s.mine) {
          const del = document.createElement("button");
          del.type = "button"; del.className = "sbtn"; del.textContent = "삭제";
          del.addEventListener("click", () => { const snap = spots; spots = spots.filter((x) => x.id !== s.id); if (!persist()) spots = snap; draw(); });
          acts.appendChild(del);
        }
        li.appendChild(acts);
        ul.appendChild(li);
      });
    }

    $("food-filter").addEventListener("change", draw);
    $("food-point").addEventListener("change", () => { $("food-point-new-wrap").hidden = $("food-point").value !== "__new"; });
    $("food-memo").addEventListener("input", () => { $("food-memo-count").textContent = L.codePointLength(L.cleanText($("food-memo").value)); });

    $("food-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const point = $("food-point").value === "__new" ? $("food-point-new").value : $("food-point").value;
      const v = L.validateSpot({ point, name: $("food-name").value, category: $("food-category").value, menu: $("food-menu").value, memo: $("food-memo").value, author: $("food-author").value });
      if (!v.ok) { show($("food-error"), v.errors.join(" ")); return; }
      if (spots.some((s) => s.point === v.spot.point && s.name === v.spot.name)) { show($("food-error"), "같은 하산 지점에 이미 등록된 가게입니다. 추천을 눌러 주세요."); return; }
      if (spots.length >= L.SPOT_LIMITS.total) { show($("food-error"), `등록 가능한 맛집 수(${L.SPOT_LIMITS.total}개)를 넘었습니다.`); return; }
      const snap = spots;
      const spot = Object.assign(v.spot, { id: L.newId(), likes: 0, createdAt: Date.now(), mine: true });
      spots = spots.concat([spot]);
      if (!persist()) { spots = snap; show($("food-error"), "저장에 실패해 등록하지 않았습니다."); return; }
      show($("food-error"), "");
      ["food-name", "food-menu", "food-memo", "food-point-new"].forEach((id) => ($(id).value = ""));
      $("food-memo-count").textContent = "0";
      draw();
      $("food-filter").value = spot.point;
      draw();
    });

    $("share-export").addEventListener("click", () => {
      $("share-text").value = L.exportSpots(spots);
      $("share-msg").textContent = `${spots.length}개를 내보냈습니다. 내용을 복사해 전달하세요.`;
    });
    $("share-import").addEventListener("click", () => {
      const p = L.parseImport($("share-text").value);
      if (!p.ok) { $("share-msg").textContent = p.error; return; }
      const r = L.mergeSpots(spots, p.data), snap = spots;
      spots = r.spots;
      if (!persist()) { spots = snap; $("share-msg").textContent = "저장에 실패해 가져오지 못했습니다."; return; }
      $("share-msg").textContent = `${r.added}개를 새로 추가했습니다.`;
      draw();
    });
    draw();
  }

  window.Note = { render };
})();
