# n8n 시절 기록 보관소

**이 디렉터리는 더 이상 갱신되지 않습니다.** 김치 프리미엄 봇은 2026-09-05부터 10-05까지
self-hosted n8n 위에서 돌았고, 10-05에 카페24 서버로 옮겼습니다. n8n 쪽 워크플로는
2026-10-07에 정리했습니다. 지금 기록의 기준은 `paper-kimchi` 브랜치의 `kimchi.json`입니다
(저장소 루트 `README.md`).

여기 남은 것은 n8n이 돌던 한 달 동안 빼둔 자료입니다.

## 무엇이 들어 있나

```
backup/
├── n8n/
│   ├── workflow-XTg1g0vSK3kZQDsN.json   봇 본체 (김프 계산·진입·청산·알림)
│   ├── workflow-0N7njoOA1HKJGASz.json   대시보드 실시간 조회 웹훅
│   └── workflow-80EIa2eVuDXFtp84.json   거래소 잔액 계산
└── data/
    ├── premium-history/
    │   └── YYYY-MM-DD.csv               김프 스냅샷, UTC 날짜별 (2026-09-05 ~ 10-05)
    ├── paper-trades.json                가상 매매 기록 (n8n 마지막 덤프)
    └── state.json                        마지막으로 받은 행의 id
```

`premium-history`의 CSV 열은 `checkedAt,coin,premium,korbitPrice,foreignPrice,usdKrwRate`입니다.
워크플로 JSON의 Discord 웹훅 토큰은 `<REDACTED>`로 가려져 있습니다.

## 김프 이력이 왜 중요한가

백테스트용 시세는 업비트·OKX API에서 언제든 다시 받을 수 있습니다. 하지만 **코빗 기준
김프 이력은 다시 만들 수 없습니다.** 코빗이 5분봉을 약 170일치만 제공하기 때문에, 그보다
오래된 구간은 5분마다 직접 찍어둔 기록이 유일한 원본입니다.

- 기간: 2026-09-05 13:00 ~ 2026-10-05 02:25 (UTC), 5분 간격
- 종목 수: 처음 9개 → 31개(9/9~) → 62개(9/21~) → 114~117개(9/25~)
- 마지막 한 틱(10-05 02:30 UTC, 117행)은 받지 못했습니다. n8n 테이블에는 남아 있었지만
  백업이 그 직전에 멈췄습니다.

## 매매 기록

`paper-trades.json`은 n8n 테이블의 마지막 덤프입니다. 같은 거래가 카페24 봇의 `kimchi.json`
`trades`에 `n8nId`와 함께 그대로 넘어가 있으므로(27건 일치 확인, 2026-10-07), 지금은
`kimchi.json`을 보면 됩니다.

`status`는 `OPEN`(보유 중) / `CLOSED`(청산 완료) / `VOID`(무효 처리, 집계 제외) 중 하나입니다.

## 백업이 돌던 방식 (기록용)

- 워크플로 정의·매매 기록: Claude 클라우드 루틴 `김프 n8n 백업`이 6시간마다 받았습니다.
- 김프 이력: 처음에는 같은 루틴이 100행씩 옮겼는데, 종목이 31개에서 116개로 늘며 하루
  33,400행이 쌓여 하루 16,000행 한도로는 따라가지 못했습니다. 2026-10-02에 GitHub Actions가
  n8n 내보내기 웹훅에서 매시간 직접 받는 방식으로 바꿨습니다.
- 둘 다 10-05에 멈췄고, Actions 워크플로와 받아 오던 스크립트(`export_history.py`)는
  n8n 정리와 함께 저장소에서 지웠습니다. 필요하면 git 이력(`e800979`)에 있습니다.

## n8n으로 되돌려야 한다면

n8n에서 새 워크플로를 만들고 `n8n/workflow-*.json`을 import합니다. 데이터 테이블은 새로
만들어야 하고 노드의 `dataTableId`를 새 ID로, Discord 웹훅 주소를 실제 값으로 바꿔야 합니다.

`kimchi_premium_history`는
`coin(string) / premium(number) / korbitPrice(number) / foreignPrice(number) /
usdKrwRate(number) / checkedAt(date)`,
`kimchi_paper_trades`는
`coin(string) / status(string) / entryTime(date) / entryPremium(number) / entryMa(number) /
entryPrice(number) / positionSize(number) / feeEntry(number) / exitTime(date) /
exitPremium(number) / exitPrice(number) / grossProfit(number) / feeExit(number) /
netProfit(number) / entryForeignPrice(number) / entryFx(number) / exitFx(number) /
exitForeignPrice(number) / korbitPnl(number) / okxPnl(number)` 열입니다.
