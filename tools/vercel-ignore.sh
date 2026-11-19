#!/bin/sh
# Vercel ignoreCommand — 아래 경로가 안 바뀌었으면 배포를 건너뛴다 (종료코드 0 = 건너뜀).
# vercel.json 의 ignoreCommand 는 256자 제한이 있어 목록을 여기로 옮겼다 (2026-11-19).
exec git diff --quiet HEAD^ HEAD -- index.html middleware.js auth-config.mjs api login kimchi turtle luna ls core usdt top3 listing mix kimlab gold crowd carry eventhorizon ledger lib backup/data/paper-trades.json 'favicon*' apple-touch-icon.png vercel.json .vercelignore tools/vercel-ignore.sh
