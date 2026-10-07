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

# 한스법칙 알림 차트의 모양을 따른다 — 흰 바탕, 가운데 굵은 제목, 범례는 아래
BG, PANEL, GRID, TEXT, MUTED = "#ffffff", "#ffffff", "#e3e5e8", "#222222", "#666666"
NAVY, RED, ORANGE, GREEN, BLUE = "#1f2a44", "#e74c3c", "#f39c12", "#27ae60", "#3498db"
GUIDE_COLORS = [ORANGE, "#c98a00"]

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
fig, axes = plt.subplots(rows, cols, figsize=(7.2 * cols, 4.1 * rows), facecolor=BG, squeeze=False)
t0 = ASOF - pd.Timedelta(WINDOW)

for ax, (coin, tag) in zip(axes.flat, panels):
    s = wide[coin][wide.index >= t0]
    m, d = ma[coin].reindex(s.index), sd[coin].reindex(s.index)
    x = s.index.tz_convert(KST)
    ax.set_facecolor(PANEL)

    # 눈금선(−2.5σ·−3σ)은 가늘게, 봇이 실제로 쓰는 −2σ 만 굵게
    ax.plot(x, m + EXIT_SIGMA * d, color=GREEN, lw=1.8, label=f"청산선 (+{EXIT_SIGMA:g}σ)")
    ax.plot(x, m, color=BLUE, lw=1.8, label="3일 평균")
    for g, gc in zip(GUIDE_SIGMAS, GUIDE_COLORS):
        ax.plot(x, m - g * d, color=gc, lw=1.1, ls=(0, (5, 3)), label=f"-{g:g}σ")
    ax.plot(x, m - ENTRY_SIGMA * d, color=RED, lw=3.6, label=f"-{ENTRY_SIGMA:g}σ 진입선")
    ax.plot(x, s, color=NAVY, lw=1.5, label="김프")
    ax.scatter([x[-1]], [s.iloc[-1]], color=NAVY, s=30, zorder=5)

    cur, zc = s.iloc[-1], z[coin].iloc[-1]
    left_sig = zc + ENTRY_SIGMA
    left_pp = cur - (m.iloc[-1] - ENTRY_SIGMA * d.iloc[-1])
    if coin in held:
        tr = held[coin]
        et = pd.Timestamp(tr["entryTime"]).tz_convert(KST)
        ax.axvline(et, color=MUTED, lw=1.0, ls=":")
        ax.scatter([et], [tr["entryPremium"]], marker="v", color=RED, s=80, zorder=6,
                   edgecolor=NAVY, lw=0.8)
        to_exit = (m.iloc[-1] + EXIT_SIGMA * d.iloc[-1]) - cur
        sub = f"진입 {tr['entryPremium']:+.2f}% → 현재 {cur:+.2f}%  ·  청산선까지 {to_exit:+.2f}%p"
    elif left_sig <= 0:
        sub = f"현재 {cur:+.2f}%  ·  진입선 아래 {abs(left_sig):.2f}σ ({abs(left_pp):.2f}%p)"
    else:
        prog = max(0.0, min(1.0, -zc / ENTRY_SIGMA))
        sub = f"현재 {cur:+.2f}%  ·  진입선까지 {left_sig:.2f}σ ({left_pp:.2f}%p)  ·  근접도 {prog*100:.0f}%"
    ax.text(0.5, 1.115, f"{coin} 김프 (최근 3일) — {tag}", transform=ax.transAxes, color=TEXT,
            fontsize=13, fontweight="bold", ha="center", va="bottom")
    ax.text(0.5, 1.025, sub, transform=ax.transAxes, color=MUTED, fontsize=9.5, ha="center", va="bottom")

    ax.set_xlim(x[0], x[-1])
    ax.xaxis.set_major_locator(mdates.HourLocator(byhour=[0, 12], tz=KST))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H시", tz=KST))
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:+.1f}%")
    ax.tick_params(colors=MUTED, labelsize=8.5, length=0)
    plt.setp(ax.get_xticklabels(), rotation=35, ha="right")
    ax.grid(color=GRID, lw=0.8)
    for sp in ax.spines.values():
        sp.set_color(GRID)

for ax in list(axes.flat)[n:]:
    ax.axis("off")

# 범례는 아래에 한 번만 — 그리는 순서가 아니라 읽는 순서로 놓는다
h, l = axes.flat[0].get_legend_handles_labels()
order = [l.index(k) for k in ["김프", f"-{ENTRY_SIGMA:g}σ 진입선"]] +         [l.index(f"-{g:g}σ") for g in GUIDE_SIGMAS] + [l.index("3일 평균"), l.index(f"청산선 (+{EXIT_SIGMA:g}σ)")]
fig.legend([h[i] for i in order], [l[i] for i in order], loc="lower center", ncol=6, frameon=False,
           fontsize=10.5, labelcolor=MUTED, handlelength=2.6, bbox_to_anchor=(0.5, 0.004))
H = 4.1 * rows
fig.suptitle(f"김프 3일 추이와 진입선  ·  {ASOF.tz_convert(KST):%Y-%m-%d %H:%M} 기준",
             color=TEXT, fontsize=15, fontweight="bold", y=1 - 0.18 / H)
fig.subplots_adjust(left=0.06, right=0.975, top=1 - 1.15 / H, bottom=1.25 / H, hspace=0.62, wspace=0.16)
fig.savefig(OUT, dpi=130, facecolor=BG)
print("held:", list(held), "top3:", [(c, round(cands[c], 2)) for c in top3], "->", OUT)
