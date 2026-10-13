# 북한산둘레길 웹앱 · 프로젝트 규칙

- 모바일 우선. 산에서 한 손으로 보는 상황을 기준으로 글씨 16px 이상, 버튼 높이 44px 이상.
- 색은 소나무색 계열 (`--pine #2E5B3E`, `--moss #8BA888`). 난이도 색: 쉬움 녹색, 보통 황토, 어려움 적갈색.
- 빌드 도구 없이 정적 파일(HTML·CSS·JS)만 쓴다. 서버 코드 없음.
- 지도는 Leaflet + OpenStreetMap 타일. 외부 라이브러리는 `vendor/`에 넣어 오프라인에서도 열리게 한다.
- 구간 정보(`data/sections.json`)의 거리·시간·난이도는 국립공원공단 안내 기준 참고값. 바꿀 때는 원자료와 대조한다.
- 경로(`data/routes.geojson`)는 `node tools/build-routes.js`로 다시 만든다. 손으로 고치지 않는다.
- 앱 파일을 추가·이름 변경하면 `sw.js`의 `APP_FILES`와 `VERSION`도 함께 바꾼다.
- 문구는 존댓말, 짧게.
