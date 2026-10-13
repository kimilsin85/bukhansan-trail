// 산행 노트 계산·검증·저장 로직 (claude.ai "산행 노트"에서 가져옴)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 북한산·도봉산 일대 기준 좌표 (일몰 계산용)
  var LAT = 37.68;
  var LON = 127.01;
  var TZ = 9; // KST
  var MEMO_MAX = 200;
  var NAME_MAX = 20;
  var STORAGE_KEY = 'sanhaeng.peaks.v1';

  var COURSES = [
    { id: 'baekundae', name: '백운대 (우이동 원점회귀)', minutes: 270 },
    { id: 'jaunbong', name: '자운봉 (도봉산입구 왕복)', minutes: 300 },
    { id: 'obong', name: '오봉 (송추 코스)', minutes: 240 },
    { id: 'sapaesan', name: '사패산 (회룡역 코스)', minutes: 240 }
  ];

  var DEFAULT_PEAKS = [
    { id: 'baekundae', name: '백운대', custom: false },
    { id: 'jaunbong', name: '자운봉', custom: false },
    { id: 'obong', name: '오봉', custom: false },
    { id: 'sapaesan', name: '사패산', custom: false }
  ];

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function mod(a, n) { return ((a % n) + n) % n; }

  function parseDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  function dayOfYear(p) {
    return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 0)) / 86400000);
  }

  // 일몰 시각(자정 기준 분). 공개된 태양 위치 공식(Almanac 방식)으로 계산.
  function sunsetMinutes(dateStr, lat, lon) {
    var p = parseDate(dateStr);
    if (!p) return null;
    lat = lat == null ? LAT : lat;
    lon = lon == null ? LON : lon;
    var N = dayOfYear(p);
    var lngHour = lon / 15;
    var t = N + (18 - lngHour) / 24;
    var M = 0.9856 * t - 3.289;
    var Lsun = mod(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634, 360);
    var RA = mod(deg(Math.atan(0.91764 * Math.tan(rad(Lsun)))), 360);
    RA += Math.floor(Lsun / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    var sinDec = 0.39782 * Math.sin(rad(Lsun));
    var cosDec = Math.cos(Math.asin(sinDec));
    var cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
    if (cosH > 1 || cosH < -1) return null;
    var H = deg(Math.acos(cosH)) / 15;
    var T = H + RA - 0.06571 * t - 6.622;
    var UT = mod(T - lngHour, 24);
    return Math.round(mod(UT + TZ, 24) * 60);
  }

  function formatTime(min) {
    var m = mod(Math.round(min), 1440);
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function isInt(v, min, max) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max;
  }

  // 출발 시각 역산: 일몰 - 여유 - (산행 + 휴식)
  function calcDeparture(input) {
    var errors = [];
    if (!parseDate(input.date)) errors.push('날짜를 올바르게 입력해 주세요.');
    if (!isInt(input.hikeMinutes, 30, 1200)) errors.push('산행 시간은 30~1200분 사이 정수로 입력해 주세요.');
    if (!isInt(input.restMinutes, 0, 300)) errors.push('휴식 시간은 0~300분 사이 정수로 입력해 주세요.');
    if (!isInt(input.bufferMinutes, 0, 240)) errors.push('일몰 전 여유는 0~240분 사이 정수로 입력해 주세요.');
    if (errors.length) return { ok: false, errors: errors };

    var sunset = sunsetMinutes(input.date);
    if (sunset == null) return { ok: false, errors: ['이 날짜의 일몰 시각을 계산할 수 없습니다.'] };
    var finish = sunset - input.bufferMinutes;
    var depart = finish - input.hikeMinutes - input.restMinutes;
    var warning = '';
    if (depart < 0) warning = '전날 밤에 출발해야 하는 일정입니다. 코스를 줄이거나 여유 시간을 조정해 주세요.';
    else if (depart < 300) warning = '새벽(05:00 이전) 출발이 필요합니다. 헤드랜턴을 챙기세요.';
    return {
      ok: true,
      sunset: sunset,
      finish: finish,
      depart: depart,
      feasible: depart >= 0,
      warning: warning
    };
  }

  function codePointLength(s) { return Array.from(s).length; }

  function cleanText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function validateRecord(rec, todayStr) {
    var errors = [];
    var date = rec.date || '';
    if (!parseDate(date)) errors.push('정복 날짜를 입력해 주세요.');
    else if (todayStr && date > todayStr) errors.push('오늘 이후 날짜는 기록할 수 없습니다.');
    var memo = cleanText(rec.memo);
    if (codePointLength(memo) > MEMO_MAX) errors.push('메모는 ' + MEMO_MAX + '자 이내로 입력해 주세요. (현재 ' + codePointLength(memo) + '자)');
    return { ok: errors.length === 0, errors: errors, memo: memo };
  }

  function validateName(name, peaks) {
    var n = cleanText(name);
    if (!n) return { ok: false, error: '봉우리 이름을 입력해 주세요.' };
    if (codePointLength(n) > NAME_MAX) return { ok: false, error: '봉우리 이름은 ' + NAME_MAX + '자 이내로 입력해 주세요.' };
    for (var i = 0; i < peaks.length; i++) {
      if (peaks[i].name === n) return { ok: false, error: '이미 있는 봉우리입니다.' };
    }
    return { ok: true, name: n };
  }

  function defaultPeaks() {
    return DEFAULT_PEAKS.map(function (p) {
      return { id: p.id, name: p.name, custom: false, conquered: false, date: '', memo: '' };
    });
  }

  // 저장된 값이 깨져 있으면 기본값으로 복구
  function normalizePeaks(raw) {
    if (!Array.isArray(raw)) return defaultPeaks();
    var out = [];
    raw.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name) return;
      var conquered = p.conquered === true && !!parseDate(p.date);
      out.push({
        id: p.id,
        name: cleanText(p.name).slice(0, 40),
        custom: p.custom === true,
        conquered: conquered,
        date: conquered ? p.date : '',
        memo: conquered && typeof p.memo === 'string' ? cleanText(p.memo).slice(0, 400) : ''
      });
    });
    DEFAULT_PEAKS.forEach(function (d) {
      if (!out.some(function (p) { return p.id === d.id; })) {
        out.push({ id: d.id, name: d.name, custom: false, conquered: false, date: '', memo: '' });
      }
    });
    return out;
  }

  function loadPeaks(storage) {
    try {
      var s = storage.getItem(STORAGE_KEY);
      if (!s) return { peaks: defaultPeaks(), error: '' };
      return { peaks: normalizePeaks(JSON.parse(s)), error: '' };
    } catch (e) {
      return { peaks: defaultPeaks(), error: '저장된 기록을 읽지 못해 기본 목록으로 시작합니다.' };
    }
  }

  function savePeaks(storage, peaks) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(peaks));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: '저장에 실패했습니다. 브라우저 저장 공간이 막혀 있거나 가득 찼을 수 있습니다.' };
    }
  }

  // ---------- 하산 맛집 ----------
  var SPOTS_KEY = 'sanhaeng.spots.v1';
  var LIKED_KEY = 'sanhaeng.liked.v1';
  var POINTS = ['우이동(북한산)', '도봉산입구', '송추', '회룡역(사패산)'];
  var CATEGORIES = ['식당', '카페', '주점', '기타'];
  var SPOT_LIMITS = { point: 20, name: 30, menu: 40, memo: 200, author: 12, total: 500 };

  function newId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // 입력 검증 + 정리. 통과하면 spot 필드만 돌려줌.
  function validateSpot(input) {
    var errors = [];
    var lim = SPOT_LIMITS;
    var point = cleanText(input.point), name = cleanText(input.name), menu = cleanText(input.menu);
    var memo = cleanText(input.memo), author = cleanText(input.author) || '익명';
    if (!point) errors.push('하산 지점을 입력해 주세요.');
    else if (codePointLength(point) > lim.point) errors.push('하산 지점은 ' + lim.point + '자 이내로 입력해 주세요.');
    if (!name) errors.push('가게 이름을 입력해 주세요.');
    else if (codePointLength(name) > lim.name) errors.push('가게 이름은 ' + lim.name + '자 이내로 입력해 주세요.');
    if (CATEGORIES.indexOf(input.category) < 0) errors.push('종류를 선택해 주세요.');
    if (codePointLength(menu) > lim.menu) errors.push('대표 메뉴는 ' + lim.menu + '자 이내로 입력해 주세요.');
    if (codePointLength(memo) > lim.memo) errors.push('한줄 후기는 ' + lim.memo + '자 이내로 입력해 주세요. (현재 ' + codePointLength(memo) + '자)');
    if (codePointLength(author) > lim.author) errors.push('닉네임은 ' + lim.author + '자 이내로 입력해 주세요.');
    return {
      ok: errors.length === 0, errors: errors,
      spot: { point: point, name: name, category: input.category, menu: menu, memo: memo, author: author }
    };
  }

  // 저장값·가져온 값 정리: 형식이 틀린 항목은 버림
  function normalizeSpots(raw) {
    if (!Array.isArray(raw)) return [];
    var seen = {}, out = [];
    raw.forEach(function (r) {
      if (out.length >= SPOT_LIMITS.total || !r || typeof r !== 'object') return;
      if (typeof r.id !== 'string' || !r.id || r.id.length > 40 || seen[r.id]) return;
      var v = validateSpot({
        point: typeof r.point === 'string' ? r.point : '', name: typeof r.name === 'string' ? r.name : '',
        category: r.category, menu: typeof r.menu === 'string' ? r.menu : '',
        memo: typeof r.memo === 'string' ? r.memo : '', author: typeof r.author === 'string' ? r.author : ''
      });
      if (!v.ok) return;
      seen[r.id] = true;
      var s = v.spot;
      s.id = r.id;
      s.likes = isInt(r.likes, 0, 100000) ? r.likes : 0;
      s.createdAt = isInt(r.createdAt, 0, 8.64e15) ? r.createdAt : 0;
      s.mine = r.mine === true;
      out.push(s);
    });
    return out;
  }

  // 같은 id는 로컬 우선(추천 수는 큰 값). 새 항목만 추가.
  function mergeSpots(local, incoming) {
    var byId = {};
    local.forEach(function (s) { byId[s.id] = s; });
    var added = 0, merged = local.slice();
    normalizeSpots(incoming).forEach(function (s) {
      if (byId[s.id]) { byId[s.id].likes = Math.max(byId[s.id].likes, s.likes); return; }
      if (merged.length >= SPOT_LIMITS.total) return;
      s.mine = false;
      byId[s.id] = s; merged.push(s); added++;
    });
    return { spots: merged, added: added };
  }

  function exportSpots(spots) {
    return JSON.stringify(spots.map(function (s) {
      return { id: s.id, point: s.point, name: s.name, category: s.category, menu: s.menu,
               memo: s.memo, author: s.author, likes: s.likes, createdAt: s.createdAt };
    }));
  }

  function parseImport(text) {
    try { return { ok: true, data: JSON.parse(text) }; }
    catch (e) { return { ok: false, error: '가져올 내용이 올바른 형식이 아닙니다.' }; }
  }

  function loadSpots(storage) {
    try {
      var s = storage.getItem(SPOTS_KEY);
      return { spots: s ? normalizeSpots(JSON.parse(s)) : [], error: '' };
    } catch (e) { return { spots: [], error: '저장된 맛집 목록을 읽지 못했습니다.' }; }
  }
  function saveSpots(storage, spots) {
    try { storage.setItem(SPOTS_KEY, JSON.stringify(spots)); return { ok: true }; }
    catch (e) { return { ok: false, error: '저장에 실패했습니다. 브라우저 저장 공간이 막혀 있거나 가득 찼을 수 있습니다.' }; }
  }
  function loadLiked(storage) {
    try { var a = JSON.parse(storage.getItem(LIKED_KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }) : []; }
    catch (e) { return []; }
  }
  function saveLiked(storage, ids) {
    try { storage.setItem(LIKED_KEY, JSON.stringify(ids)); return true; } catch (e) { return false; }
  }

  return {
    POINTS: POINTS, CATEGORIES: CATEGORIES, SPOT_LIMITS: SPOT_LIMITS, newId: newId,
    validateSpot: validateSpot, normalizeSpots: normalizeSpots, mergeSpots: mergeSpots,
    exportSpots: exportSpots, parseImport: parseImport,
    loadSpots: loadSpots, saveSpots: saveSpots, loadLiked: loadLiked, saveLiked: saveLiked,
    LAT: LAT, LON: LON, MEMO_MAX: MEMO_MAX, NAME_MAX: NAME_MAX, STORAGE_KEY: STORAGE_KEY,
    COURSES: COURSES,
    parseDate: parseDate, sunsetMinutes: sunsetMinutes, formatTime: formatTime,
    calcDeparture: calcDeparture, validateRecord: validateRecord, validateName: validateName,
    cleanText: cleanText, codePointLength: codePointLength,
    defaultPeaks: defaultPeaks, normalizePeaks: normalizePeaks, loadPeaks: loadPeaks, savePeaks: savePeaks
  };
});
