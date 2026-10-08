# kimchi.db 백업 — 2026-09 (카페24 봇이 매일 올린다)

- `premium-history/<UTC 날짜>.csv.gz` — 그날의 5분 김프 이력 전부. 닫힌 날만 올라온다.
- `trades.json` · `universe.json` — 거래 기록과 거래 대상 목록 전체. 가장 최근 달의 브랜치 것이 최신이다.

달마다 브랜치가 하나씩 생기고, 36개월이 지난 달의 브랜치는 자동으로 지워진다.
만드는 스크립트와 되살리는 방법은 main 브랜치 `report/README.md`.
