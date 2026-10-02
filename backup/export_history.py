"""김프 이력 증분 백업 — n8n 내보내기 웹훅에서 받아 날짜별 CSV에 붙인다.

GitHub Actions(.github/workflows/backup-history.yml)가 매시간 실행한다.
예전에는 Claude 클라우드 루틴이 행을 100개씩 읽어 옮겼는데, 봇이 기록하는 종목이
31개에서 116개로 늘면서(하루 약 33,000행) 6시간 4,000행 한도로는 따라가지 못했다.

어디까지 받았는지는 backup/data/state.json 의 lastPremiumId 가 기억한다.
한 번에 다 못 받아도 다음 실행이 그 id 다음부터 이어받는다.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

URL = os.environ.get('KIMCHI_EXPORT_URL', 'https://threesons.devpartner.org/webhook/kimchi-export-4c9e17')
PAGE = 5000          # 한 번에 받는 행 수 (웹훅 상한 10,000)
MAX_PAGES = 40       # 한 실행에 최대 200,000행 — 며칠 밀려도 한 번에 따라잡는다
HEADER = 'checkedAt,coin,premium,korbitPrice,foreignPrice,usdKrwRate'

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, 'data', 'state.json')
HIST = os.path.join(ROOT, 'data', 'premium-history')


def fetch(after_id):
    url = f'{URL}?afterId={after_id}&limit={PAGE}'
    for attempt in range(4):
        try:
            # 웹훅의 «봇 무시» 옵션이 브라우저가 아닌 User-Agent 를 403 으로 막는다 (curl 기본값도 막힌다)
            ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36 kimchi-backup'
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': ua}), timeout=120) as r:
                body = json.loads(r.read().decode('utf-8'))
            if not body.get('ok'):
                raise RuntimeError(f'웹훅 응답이 ok 가 아니다: {str(body)[:200]}')
            return body['rows']
        except Exception as e:
            if attempt == 3:
                raise
            print(f'  재시도 {attempt + 1}: {e}', flush=True)
            time.sleep(5 * (attempt + 1))


def append(day, lines):
    path = os.path.join(HIST, f'{day}.csv')
    new = not os.path.exists(path)
    with open(path, 'ab+') as f:
        if new:
            f.write((HEADER + '\n').encode())
        else:
            # 앞선 기록이 줄바꿈 없이 끝났으면 두 행이 한 줄로 붙는다
            f.seek(-1, os.SEEK_END)
            if f.read(1) != b'\n':
                f.write(b'\n')
        f.write(('\n'.join(lines) + '\n').encode())


def main():
    state = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {}
    last = int(state.get('lastPremiumId') or 0)
    start = last
    os.makedirs(HIST, exist_ok=True)

    total, pages, more = 0, 0, True
    while more and pages < MAX_PAGES:
        rows = fetch(last)
        pages += 1
        if not rows:
            break
        by_day = {}
        for rid, checked_at, coin, premium, korbit, foreign, fx in rows:
            if rid <= last:
                raise RuntimeError(f'id 가 뒤로 갔다: {rid} <= {last}')
            last = rid
            vals = ['' if v is None else str(v) for v in (checked_at, coin, premium, korbit, foreign, fx)]
            by_day.setdefault(checked_at[:10], []).append(','.join(vals))
        for day, lines in by_day.items():
            append(day, lines)
        total += len(rows)
        # 페이지마다 상태를 남겨, 중간에 죽어도 받은 데까지는 다시 받지 않는다
        state.update({'lastPremiumId': last, 'lastBackupAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                      'rowsThisRun': total, 'pagesThisRun': pages})
        json.dump(state, open(STATE, 'w', encoding='utf-8'), indent=2)
        print(f'  {pages}쪽: {len(rows)}행 (id ~{last})', flush=True)
        more = len(rows) == PAGE

    print(f'김프 이력 {total}행 추가 (id {start} -> {last}), 남은 것 {"있음" if more and total else "없음"}')
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        with open(out, 'a') as f:
            f.write(f'rows={total}\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'실패: {e}', file=sys.stderr)
        sys.exit(1)
