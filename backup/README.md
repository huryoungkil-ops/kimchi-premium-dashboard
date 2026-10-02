# n8n 백업

김치 프리미엄 봇은 전적으로 self-hosted n8n(`threesons.devpartner.org`) 위에서 돌아갑니다.
워크플로 로직도, 쌓인 데이터도 전부 거기에만 있어서 n8n이 사라지면 둘 다 함께 사라집니다.
이 디렉터리는 그 두 가지를 저장소로 빼두는 자동 백업의 결과물입니다.

두 자동화가 나눠서 채웁니다. 사람이 직접 고칠 일은 없습니다.

| 무엇을 | 누가 | 주기 |
|---|---|---|
| 김프 이력 (`data/premium-history/`, `data/state.json`) | GitHub Actions `김프 이력 백업` → `export_history.py` | 매시간 17분 |
| 워크플로 정의 (`n8n/`), 매매 기록 (`data/paper-trades.json`) | Claude 클라우드 루틴 `김프 n8n 백업` | 6시간마다 |

공개 저장소라 Discord 웹훅 토큰은 `<REDACTED>`로 가려서 저장합니다.

### 김프 이력을 루틴에서 떼어낸 이유 (2026-10-02)

처음에는 루틴이 김프 이력까지 옮겼습니다. AI가 n8n MCP로 행을 100개씩 읽는 방식이라
한 실행에 4,000행이 한도였고, 하루 16,000행이 최대였습니다. 그런데 스캐너가 종목을
늘리면서 봇이 한 틱에 기록하는 종목이 31개 → 62개(9/21) → 116개(9/25~)가 됐고,
하루 약 33,400행이 쌓여 **백업이 매일 17,000행씩 뒤처졌습니다**(10/2 기준 37,400행, 27시간 지연).

지금은 n8n 워크플로 `김프 이력 백업 내보내기`(`gGOSWfvj0WX9VrQl`)가 읽기 전용 웹훅으로
`?afterId=<마지막 id>&limit=<최대 10000>` 요청에 그다음 행을 id 순으로 돌려주고,
`export_history.py`가 그걸 받아 날짜별 CSV에 붙입니다. 한 실행에 최대 20만 행이라
며칠 멈췄다 돌아도 한 번에 따라잡습니다. 밀린 37,400행은 전환하면서 한 번에 받았습니다.

- 웹훅은 «봇 무시» 옵션 때문에 **브라우저가 아닌 User-Agent를 403으로 막습니다**
  (`Authorization data is wrong!`). curl 기본값으로 시험하면 막히는 게 정상입니다.
- 종목 수가 또 늘어도 이 방식은 영향을 받지 않습니다. 다만 저장소는 하루 약 2MB씩 커집니다.

## 무엇이 들어오나

```
backup/
├── n8n/
│   └── workflow-XTg1g0vSK3kZQDsN.json   워크플로 정의 전체 (n8n에 import하면 복구됨)
└── data/
    ├── premium-history/
    │   └── YYYY-MM-DD.csv               김프 스냅샷, UTC 날짜별
    ├── paper-trades.json                가상 매매 기록 (매번 전체 교체)
    └── state.json                        어디까지 백업했는지 (증분 이어받기용)
```

`premium-history`의 CSV 열은 `checkedAt,coin,premium,korbitPrice,foreignPrice,usdKrwRate`입니다.

## 왜 이 데이터가 중요한가

백테스트용 시세는 업비트·OKX API에서 언제든 다시 받을 수 있습니다. 하지만 **코빗 기준
김프 이력은 다시 만들 수 없습니다.** 코빗이 5분봉을 약 170일치만 제공하기 때문에, 그보다
오래된 구간은 우리가 5분마다 직접 찍어둔 이 기록이 유일한 원본입니다. 봇이 오래 돌수록
가치가 커지는 자산이라 소실되면 시간으로만 복구됩니다.

하루치는 116종목 × 288회 ≈ 33,400행입니다 (2026-10-02 기준. 9월 중순까지는 31종목 ≈ 8,900행).

## 복구 절차

**워크플로**: n8n에서 새 워크플로를 만들고 `n8n/workflow-*.json`을 import합니다.
Discord 웹훅 URL이 노드 안에 그대로 들어 있으므로 별도 설정은 필요 없지만,
데이터 테이블은 새로 만들어야 하고 노드의 `dataTableId`를 새 ID로 바꿔야 합니다.

**데이터 테이블**: `kimchi_premium_history`는
`coin(string) / premium(number) / korbitPrice(number) / foreignPrice(number) /
usdKrwRate(number) / checkedAt(date)`,
`kimchi_paper_trades`는
`coin(string) / status(string) / entryTime(date) / entryPremium(number) / entryMa(number) /
entryPrice(number) / positionSize(number) / feeEntry(number) / exitTime(date) /
exitPremium(number) / exitPrice(number) / grossProfit(number) / feeExit(number) /
netProfit(number) / entryForeignPrice(number) / entryFx(number) / exitFx(number) /
exitForeignPrice(number) / korbitPnl(number) / okxPnl(number)` 열로 만든 뒤 CSV/JSON을 적재합니다.
(`entryFx` 이후 다섯 열은 2026-09-28에 추가 — 그 전 거래는 비어 있고, 대시보드는 `ledger/backfill.json`으로 채웁니다.)

`status`는 `OPEN`(보유 중) / `CLOSED`(청산 완료) / `VOID`(무효 처리, 집계 제외) 중 하나입니다.

## 한계

- 김프 이력은 백업 주기가 1시간이라 최악의 경우 **1시간치**(약 1,400행)를 잃을 수 있습니다.
  GitHub Actions의 예약 실행은 몇십 분씩 늦게 돌기도 합니다. 진행 상황은
  `data/state.json`의 `lastPremiumId` · `lastBackupAt`으로 봅니다.
- 워크플로 정의와 매매 기록은 여전히 6시간 주기입니다.
- n8n의 `김프 이력 테이블 정리`가 60일 지난 행을 지웁니다. 백업이 60일 넘게 멈추면
  그 사이 행은 백업 없이 사라집니다.
- n8n 자격증명(credential)은 백업되지 않습니다. 이 워크플로는 자격증명을 쓰지 않아
  문제가 없지만, 나중에 추가하면 별도로 챙겨야 합니다.
- 클라우드 루틴 자체(`trig_*`)는 Anthropic 쪽에 있어 이 저장소에 없습니다.
