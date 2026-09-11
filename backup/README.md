# n8n 백업

김치 프리미엄 봇은 전적으로 self-hosted n8n(`threesons.devpartner.org`) 위에서 돌아갑니다.
워크플로 로직도, 쌓인 데이터도 전부 거기에만 있어서 n8n이 사라지면 둘 다 함께 사라집니다.
이 디렉터리는 그 두 가지를 저장소로 빼두는 자동 백업의 결과물입니다.

Claude 클라우드 루틴 **`김프 n8n 백업`**(매시간)이 채웁니다. 사람이 직접 고칠 일은 없습니다.

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

하루치는 31종목 × 288회 ≈ 8,900행입니다.

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
netProfit(number)` 열로 만든 뒤 CSV/JSON을 적재합니다.

`status`는 `OPEN`(보유 중) / `CLOSED`(청산 완료) / `VOID`(무효 처리, 집계 제외) 중 하나입니다.

## 한계

- 백업 주기가 1시간이라 최악의 경우 **1시간치**(약 370행)를 잃을 수 있습니다.
- **초기 백필은 며칠 걸립니다.** n8n 데이터 테이블은 한 번에 100행씩만 읽을 수 있고,
  한 실행이 가져올 수 있는 양도 에이전트 컨텍스트에 제한됩니다. 백업을 시작한 시점에 이미
  5만 행 넘게 쌓여 있어서, 매시간 조금씩 과거를 따라잡으며 며칠에 걸쳐 채워집니다.
  `data/state.json`의 `lastPremiumId`로 진행 상황을 볼 수 있습니다.
- n8n 자격증명(credential)은 백업되지 않습니다. 이 워크플로는 자격증명을 쓰지 않아
  문제가 없지만, 나중에 추가하면 별도로 챙겨야 합니다.
- 클라우드 루틴 자체(`trig_*`)는 Anthropic 쪽에 있어 이 저장소에 없습니다.
