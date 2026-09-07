# 김프레이더

김치 프리미엄 페이퍼 트레이딩 봇의 공개 대시보드 (정적 페이지, Vercel 배포용).

- `index.html` 하나로 구성된 정적 페이지입니다. 별도 빌드 과정이 없습니다.
- 코인 데이터는 `<!-- COINS_DATA_START -->` ~ `<!-- COINS_DATA_END -->` 사이 `coins` 배열과,
  헤더의 `<!--SNAPSHOT_TIME-->` / `<!--LAST_REFRESH-->` 주석 사이 텍스트를 교체해 갱신합니다.
- 실제 매매 봇(n8n 워크플로우)과 데이터 소스는 `auction-bot`과 무관한 별도 프로젝트입니다.
