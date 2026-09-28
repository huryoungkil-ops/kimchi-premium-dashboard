# 김프레이더

김치 프리미엄 페이퍼 트레이딩 봇의 공개 대시보드 (정적 페이지, Vercel 배포용).

- `index.html` 하나로 구성된 정적 페이지입니다. 별도 빌드 과정이 없습니다.
- 코인 데이터는 `<!-- COINS_DATA_START -->` ~ `<!-- COINS_DATA_END -->` 사이 `coins` 배열과,
  헤더의 `<!--SNAPSHOT_TIME-->` / `<!--LAST_REFRESH-->` 주석 사이 텍스트를 교체해 갱신합니다.
- 실제 매매 봇(n8n 워크플로우)과 데이터 소스는 `auction-bot`과 무관한 별도 프로젝트입니다.
- «거래소별 잔액» 섹션은 마커 밖에 있고, 페이지가 열릴 때 `ledger/`(원장 계산·설정·옛 거래 환율 백필)와
  `backup/data/paper-trades.json`을 읽어 브라우저에서 직접 계산합니다. 검증: `node ledger/check.js [환율]`.
  리밸런싱(가상 이체)은 `ledger/config.json`의 `transfers`에 한 줄 추가합니다.
