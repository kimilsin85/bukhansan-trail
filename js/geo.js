// 위치 계산 도우미: 두 점 사이 거리, 점에서 경로까지 거리
(function () {
  const R = 6371000, RAD = Math.PI / 180;

  // [lng, lat] 두 점 사이 거리(m)
  function distance(a, b) {
    const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // 점 p에서 MultiLineString 좌표까지 가장 가까운 거리(m).
  // 좁은 범위라 위도 기준 평면으로 펴서 선분 거리로 계산한다
  function distanceToLines(p, lines) {
    const kx = Math.cos(p[1] * RAD) * R * RAD, ky = R * RAD;
    let best = Infinity;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const ax = (line[i - 1][0] - p[0]) * kx, ay = (line[i - 1][1] - p[1]) * ky;
        const bx = (line[i][0] - p[0]) * kx, by = (line[i][1] - p[1]) * ky;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const cx = ax + t * dx, cy = ay + t * dy;
        best = Math.min(best, Math.hypot(cx, cy));
      }
    }
    return best;
  }

  function formatMeters(m) {
    return m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
  }

  window.Geo = { distance, distanceToLines, formatMeters };
})();
