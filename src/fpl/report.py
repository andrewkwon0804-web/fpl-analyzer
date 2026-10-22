"""Step 5: turn results into README-ready charts (reports/figures/*.png)."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

from fpl.config import FIGURES_DIR, REPORTS_DIR

# Validated categorical palette (light mode), assigned in fixed order.
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
MUTED = "#a9a8a2"
INK, INK_2 = "#0b0b0b", "#52514e"
SURFACE = "#fcfcfb"

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE,
    "axes.edgecolor": "#d9d8d3", "axes.labelcolor": INK_2,
    "xtick.color": INK_2, "ytick.color": INK_2, "text.color": INK,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#ecebe7", "grid.linewidth": 0.8,
    "axes.axisbelow": True, "font.size": 11, "axes.titlesize": 13,
    "axes.titleweight": "bold", "axes.titlelocation": "left",
})


def _save(fig, name):
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / name, dpi=160)
    plt.close(fig)


def _hbar(ax, labels, values, colors, fmt):
    bars = ax.barh(labels, values, color=colors, height=0.6)
    for b, v in zip(bars, values):
        ax.text(b.get_width() + max(values) * 0.01, b.get_y() + b.get_height() / 2,
                fmt.format(v), va="center", color=INK, fontsize=10)
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)


def model_vs_baselines():
    res = pd.read_csv(REPORTS_DIR / "model_results.csv", index_col=0)
    fair = res.drop(index="Perfect hindsight (ceiling)")
    colors = [BLUE if "model" in i else MUTED for i in fair.index]

    fig, axes = plt.subplots(1, 2, figsize=(12, 3.8))
    _hbar(axes[0], fair.index, fair["Captain pick: avg points"], colors, "{:.1f}")
    axes[0].set_title("Captain pick: average points per gameweek")
    axes[0].set_xlabel("Higher is better  (2025-26 test season, 38 GWs)")
    _hbar(axes[1], fair.index, fair["MAE (regular starters)"], colors, "{:.2f}")
    axes[1].set_title("Prediction error for regular starters (MAE)")
    axes[1].set_xlabel("Lower is better")
    axes[1].set_yticklabels([])
    _save(fig, "model_vs_baselines.png")


def feature_importance():
    imp = pd.read_csv(REPORTS_DIR / "feature_importance.csv", index_col=0)["mae_increase"].head(12)
    fig, ax = plt.subplots(figsize=(8, 4.6))
    _hbar(ax, imp.index, imp.values, BLUE, "{:.3f}")
    ax.set_title("What the model relies on")
    ax.set_xlabel("Increase in MAE when the feature is shuffled")
    _save(fig, "feature_importance.png")


def form_regression():
    df = pd.read_csv(REPORTS_DIR / "sql_results" / "03_does_form_persist.csv")
    fig, ax = plt.subplots(figsize=(8, 4.6))
    ax.plot(df["avg_last5"], df["avg_last5"], color=MUTED, lw=2, ls="--")
    ax.plot(df["avg_last5"], df["avg_season_to_date"], color=ORANGE, lw=2, marker="o", ms=8)
    ax.plot(df["avg_last5"], df["avg_next_gw_points"], color=BLUE, lw=2, marker="o", ms=8)
    x_end = df["avg_last5"].iloc[-1]
    ax.text(x_end - 0.2, x_end - 0.1, "if form fully persisted", color=INK_2, ha="right", fontsize=10)
    ax.text(x_end + 0.15, df["avg_season_to_date"].iloc[-1] + 0.25, "season average", color=INK_2, fontsize=10)
    ax.text(x_end + 0.15, df["avg_next_gw_points"].iloc[-1] - 0.35, "actual next GW", color=INK_2, fontsize=10)
    ax.set_xlim(0.8, x_end + 2.6)
    ax.set_title("Hot streaks fade: next-GW points track the season average, not form")
    ax.set_xlabel("Average points over the last 5 gameweeks (regular starters)")
    ax.set_ylabel("Points")
    _save(fig, "form_regression.png")


def defcon_rule_change():
    df = pd.read_csv(REPORTS_DIR / "sql_results" / "06_defcon_rule_change.csv")
    d = df[df.position == "DEF"]
    colors = [MUTED] * (len(d) - 1) + [BLUE]
    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.bar(d["season"], d["share_of_points_pct"], color=colors, width=0.6)
    for b, v in zip(bars, d["share_of_points_pct"]):
        ax.text(b.get_x() + b.get_width() / 2, v + 0.4, f"{v:.1f}%", ha="center", color=INK)
    ax.set_ylim(0, 40)
    ax.grid(axis="x", visible=False)
    ax.set_title("Defenders' share of all FPL points")
    ax.set_xlabel("2025-26 added points for defensive contributions")
    _save(fig, "defcon_rule_change.png")


def leakage():
    df = pd.read_csv(REPORTS_DIR / "leakage_check.csv")
    fig, ax = plt.subplots(figsize=(8, 3.8))
    y = range(len(df))
    for i, r in df.iterrows():
        ax.plot([r.corr_next_gw, r.corr_this_gw], [i, i], color="#d9d8d3", lw=2, zorder=1)
    ax.scatter(df.corr_next_gw, y, color=ORANGE, s=70, zorder=2, label="next gameweek's points",
               edgecolors=SURFACE, linewidths=2)
    ax.scatter(df.corr_this_gw, y, color=BLUE, s=70, zorder=3, label="this gameweek's points",
               edgecolors=SURFACE, linewidths=2)
    ax.set_yticks(list(y), df["column"])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    ax.set_xlabel("Correlation (starters who played 60+ min both weeks)")
    ax.set_title("Leakage test: fpl_xp 'knows' the result of the week it predicts")
    ax.legend(frameon=False, loc="lower right")
    _save(fig, "leakage_check.png")


def main():
    model_vs_baselines()
    feature_importance()
    form_regression()
    defcon_rule_change()
    leakage()
    print(f"[report] figures written to {FIGURES_DIR}")


if __name__ == "__main__":
    main()
