# 07:40 상태 보고용 차트 견본 — n8n 시절 이력(backup/data/premium-history)으로 그린다.
# 사용: python report/kimp_chart.py "2026-09-29T22:40:00Z" report/sample.png
# 필요: pip install matplotlib pandas
import sys, os, json, glob, urllib.request
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIMCHI_JSON = "https://raw.githubusercontent.com/huryoungkil-ops/kimchi-premium-dashboard/paper-kimchi/kimchi.json"
ASOF = pd.Timestamp(sys.argv[1] if len(sys.argv) > 1 else "2026-09-29T22:40:00Z")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(REPO, "report", "sample.png")
WINDOW = "72h"
ENTRY_SIGMA, EXIT_SIGMA = 2.0, 0.25
GUIDE_SIGMAS = [2.5, 3.0]
KST = "Asia/Seoul"

plt.rcParams["font.family"] = "Malgun Gothic"
plt.rcParams["axes.unicode_minus"] = False

BG, PANEL, GRID, TEXT, MUTED = "#1e1f22", "#2b2d31", "#3a3d44", "#f2f3f5", "#a3a6ad"
BLUE, ORANGE, GREEN, RED = "#3987e5", "#eb6834", "#3fb97a", "#e5484d"

# ── 자료 ──
df = pd.concat(pd.read_csv(f) for f in sorted(glob.glob(f"{REPO}/backup/data/premium-history/*.csv")))
df["t"] = pd.to_datetime(df["checkedAt"], format="ISO8601").dt.floor("5min")
df = df[(df.t <= ASOF) & (df.t > ASOF - pd.Timedelta("146h"))]
wide = df.pivot_table(index="t", columns="coin", values="premium", aggfunc="last").sort_index()

ma = wide.rolling(WINDOW, min_periods=600).mean()
sd = wide.rolling(WINDOW, min_periods=600).std(ddof=0)
z = (wide - ma) / sd

# 거래 대상 여부는 지금 봇이 올리는 kimchi.json 의 universe 를 쓴다
uni = json.load(urllib.request.urlopen(KIMCHI_JSON, timeout=20))["universe"]
tradable = {u["coin"] for u in uni if u["state"] == "tradable"}

trades = json.load(open(f"{REPO}/backup/data/paper-trades.json", encoding="utf-8"))
held = {}
for tr in trades:
    if tr.get("status") == "VOID":
        continue
    et = pd.Timestamp(tr["entryTime"])
    xt = pd.Timestamp(tr["exitTime"]) if tr.get("exitTime") else None
    if et <= ASOF and (xt is None or xt > ASOF):
        held[tr["coin"]] = tr

# ── Top 3: 진입선(−2σ)까지 남은 거리(σ)가 짧은 순. 거래 대상만, 보유 종목 제외 ──
last = z.iloc[-1].dropna()
gap = (last + ENTRY_SIGMA)                       # 0 이하면 이미 진입선 아래
cands = gap[[c for c in gap.index if c in tradable and c not in held]].sort_values()
top3 = list(cands.index[:3])
panels = [(c, "보유 중") for c in held] + [(c, f"후보 {i+1}") for i, c in enumerate(top3)]

# ── 그리기 ──
n = len(panels)
cols = 2 if n > 1 else 1
rows = (n + cols - 1) // cols
fig, axes = plt.subplots(rows, cols, figsize=(7.2 * cols, 3.9 * rows), facecolor=BG, squeeze=False)
t0 = ASOF - pd.Timedelta(WINDOW)

for ax, (coin, tag) in zip(axes.flat, panels):
    s = wide[coin][wide.index >= t0]
    m, d = ma[coin].reindex(s.index), sd[coin].reindex(s.index)
    x = s.index.tz_convert(KST)
    ax.set_facecolor(PANEL)

    # 진입 구간 띠 (−2σ ~ −3σ) 와 눈금선
    ax.fill_between(x, m - ENTRY_SIGMA * d, m - GUIDE_SIGMAS[-1] * d, color=ORANGE, alpha=0.13, lw=0)
    for g in GUIDE_SIGMAS:
        ax.plot(x, m - g * d, color=ORANGE, lw=0.9, ls=(0, (4, 3)), alpha=0.75)
    ax.plot(x, m - ENTRY_SIGMA * d, color=ORANGE, lw=2.4)
    ax.plot(x, m, color=MUTED, lw=1.0, ls=(0, (2, 2)))
    ax.plot(x, m + EXIT_SIGMA * d, color=GREEN, lw=1.2, ls=(0, (6, 3)))
    ax.plot(x, s, color=BLUE, lw=1.7)
    ax.scatter([x[-1]], [s.iloc[-1]], color=BLUE, s=34, zorder=5, edgecolor=PANEL, lw=1.2)

    # 오른쪽 끝 선 이름
    xr = x[-1] + pd.Timedelta("1h")
    labels = [(m.iloc[-1] - ENTRY_SIGMA * d.iloc[-1], "-2σ 진입", ORANGE, "bold")]
    labels += [(m.iloc[-1] - g * d.iloc[-1], f"-{g:g}σ", ORANGE, "normal") for g in GUIDE_SIGMAS]
    labels += [(m.iloc[-1], "3일 평균", MUTED, "normal"),
               (m.iloc[-1] + EXIT_SIGMA * d.iloc[-1], "청산선", GREEN, "normal")]
    # 이름이 겹치지 않게 아래에서부터 최소 간격을 둔다
    lo, hi = ax.get_ylim(); gapmin = (hi - lo) * 0.062
    labels.sort(key=lambda l: l[0]); prev = None
    for y, name, colr, w in labels:
        yy = y if prev is None else max(y, prev + gapmin); prev = yy
        ax.text(xr, yy, name, color=colr, fontsize=8.5, va="center", fontweight=w, clip_on=False)

    cur, zc = s.iloc[-1], z[coin].iloc[-1]
    left_sig = zc + ENTRY_SIGMA
    left_pp = cur - (m.iloc[-1] - ENTRY_SIGMA * d.iloc[-1])
    if coin in held:
        tr = held[coin]
        et = pd.Timestamp(tr["entryTime"]).tz_convert(KST)
        ax.axvline(et, color=RED, lw=1.0, ls=":")
        ax.scatter([et], [tr["entryPremium"]], marker="v", color=RED, s=70, zorder=6)
        to_exit = (m.iloc[-1] + EXIT_SIGMA * d.iloc[-1]) - cur
        sub = f"진입 {tr['entryPremium']:+.2f}% → 현재 {cur:+.2f}%  ·  청산선까지 {to_exit:+.2f}%p"
        tagc = RED
    else:
        if left_sig <= 0:
            sub = f"현재 {cur:+.2f}%  ·  진입선 아래 {abs(left_sig):.2f}σ ({abs(left_pp):.2f}%p)"
        else:
            sub = f"현재 {cur:+.2f}%  ·  진입선까지 {left_sig:.2f}σ ({left_pp:.2f}%p)"
        tagc = ORANGE
    ax.text(0.0, 1.13, coin, transform=ax.transAxes, color=TEXT, fontsize=15, fontweight="bold", va="bottom")
    ax.text(0.0 + 0.028 * len(coin) + 0.03, 1.14, tag, transform=ax.transAxes, color=tagc, fontsize=10,
            fontweight="bold", va="bottom")
    ax.text(0.0, 1.03, sub, transform=ax.transAxes, color=MUTED, fontsize=10, va="bottom")

    # 진입선 근접도 막대 (3일 평균 0% ↔ 진입선 100%) — 후보 종목만
    if coin not in held:
        prog = max(0.0, min(1.0, -zc / ENTRY_SIGMA))
        bx = ax.inset_axes([0.70, 1.05, 0.30, 0.045])
        bx.barh([0], [1], color=GRID, height=1); bx.barh([0], [prog], color=tagc, height=1)
        bx.set_xlim(0, 1); bx.axis("off")
        ax.text(1.0, 1.13, f"근접도 {prog*100:.0f}%", transform=ax.transAxes, color=TEXT, fontsize=9.5,
                ha="right", va="bottom")

    ax.set_xlim(x[0], x[-1])
    ax.xaxis.set_major_locator(mdates.HourLocator(byhour=[0, 12], tz=KST))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d\n%H시", tz=KST))
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:+.1f}%")
    ax.tick_params(colors=MUTED, labelsize=8.5, length=0)
    ax.grid(color=GRID, lw=0.6)
    for sp in ax.spines.values():
        sp.set_visible(False)

for ax in list(axes.flat)[n:]:
    ax.axis("off")

fig.suptitle(f"김프 3일 추이와 진입선  ·  {ASOF.tz_convert(KST):%Y-%m-%d %H:%M} 기준",
             color=TEXT, fontsize=14, fontweight="bold", x=0.02, ha="left", y=0.995)
fig.subplots_adjust(left=0.05, right=0.91, top=1 - 0.95 / (3.9 * rows) - 0.02, bottom=0.05, hspace=0.62, wspace=0.34)
fig.savefig(OUT, dpi=130, facecolor=BG)
print("held:", list(held), "top3:", [(c, round(cands[c], 2)) for c in top3], "->", OUT)
