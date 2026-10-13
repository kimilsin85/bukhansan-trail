# 북한산둘레길 웹앱

북한산둘레길 21개 구간의 정보, 지도 경로, 내 위치를 휴대폰 한 화면에서 보는 웹앱입니다.

## 기능

| 기능 | 내용 | 쓴 기술 |
|---|---|---|
| 구간 목록 | 21개 구간, 난이도 필터, 지역별 묶음 | JSON 데이터 · 반응형 |
| 구간 상세 | 거리 · 걸리는 시간 · 난이도 · 출발/도착, 경로 미니 지도 | JSON · Leaflet |
| 지도 | 전체 둘레길 경로, 구간 선택 강조 | Leaflet · OpenStreetMap · GeoJSON |
| 내 위치 | 현재 위치 표시, 선택 구간까지 거리 ("코스 위에 있어요") | Geolocation API |
| 가는 길 | 출발점까지 카카오맵 길찾기 연결 | 카카오맵 URL 링크 |
| 오프라인 열람 | 앱·구간 정보는 미리 저장, 지도 타일은 본 만큼 저장 | PWA (서비스 워커) |
| 산행 노트 · 출발 시각 | 날짜별 일몰에서 거꾸로 계산한 출발 시각. 구간 상세에서 바로 연결 | 일몰 계산식 |
| 산행 노트 · 봉우리 기록 | 오른 봉우리와 날짜·메모 기록 | localStorage |
| 산행 노트 · 하산 맛집 | 하산 지점별 맛집 기록·추천, 내보내기/가져오기로 나눔 | localStorage |

산행 노트는 claude.ai에서 만든 "산행 노트"를 합친 것입니다. 기록은 각자 기기의 브라우저에만 저장됩니다.

## 실행

```bash
node tools/serve.js
```

브라우저에서 http://localhost:8130 을 엽니다. 위치 기능과 PWA 설치는 `localhost` 또는 HTTPS 주소에서만 동작합니다.

## 배포

빌드 과정이 없는 정적 사이트입니다. `tools/` 폴더를 뺀 나머지 파일을 GitHub Pages, Netlify 같은 정적 호스팅에 올리면 됩니다.

## 데이터

- `data/sections.json`: 구간명·거리·시간·난이도. 북한산국립공원 둘레길 안내를 바탕으로 정리한 참고값입니다.
- `data/routes.geojson`: 구간 경로. `node tools/build-routes.js`로 만듭니다.
  - 17개 구간은 OpenStreetMap에 등록된 구간 경로를 그대로 씁니다.
  - OSM에 구간 경로가 없는 9·10·20구간과 8구간 뒷부분은 주변 길을 이어 만든 **추정 경로**입니다 (지도에 점선으로 표시).
  - OSM 경로 길이는 공식 거리와 다를 수 있습니다. 화면의 거리는 공식 안내값입니다.
- 경로·지도 데이터 © OpenStreetMap contributors, ODbL.

## 폴더

```
index.html, css/, js/          화면 (js/note*.js: 산행 노트)
data/                          구간 정보, 경로 GeoJSON
sw.js, manifest.webmanifest    PWA
vendor/leaflet/                Leaflet 1.9.4
tools/                         경로 변환 스크립트, OSM 원본, 로컬 서버
```
