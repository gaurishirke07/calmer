"""
Plots the readiness weight-sensitivity study as a VECTOR PDF.

    node --no-warnings scripts/weight-sensitivity.mjs
    python scripts/plot-weight-sensitivity.py

Writes fig_weight_sensitivity.pdf (gitignored like the other figure outputs).

(a) For 1,000 random weight vectors that KEEP the prior ordering and 1,000 that
    BREAK it, drawn from the same magnitude distribution: the share of contested
    decision points (signals on both sides of the threshold) whose handoff
    verdict matches the prior weights. Tests "order, not magnitude".
(b) Ablation: share of verdicts unchanged when each signal is removed wherever
    it was present.

Styled to sit beside Fig. 3 (plot-fig3.py): IEEE single-column width, 8pt
serif, near-black for the emphasised series and mid-gray for the contrast
series. Grayscale is deliberate (print); every series is direct-labelled, so
identity never rests on shade alone.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

INK = "#1a1a1a"      # emphasis: matches Fig. 3's sensing curve
CONTEXT = "#888888"  # contrast: matches Fig. 3's software curve
MUTED = "#555555"    # secondary text

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(root, "weight-sensitivity-data.json")
if not os.path.exists(data_path):
    sys.exit("weight-sensitivity-data.json not found — run scripts/weight-sensitivity.mjs first.")
d = json.load(open(data_path, encoding="utf-8"))

plt.rcParams.update({
    "font.size": 8,
    "font.family": "serif",
    "axes.linewidth": 0.6,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "xtick.major.width": 0.6,
    "ytick.major.width": 0.6,
})


def pct(xs):
    return [100 * x for x in xs if x is not None]


def median(xs):
    a = sorted(xs)
    return a[len(a) // 2]


fig = plt.figure(figsize=(3.22, 3.1))  # + y-labels -> ~3.45in, inside the 3.5in column
# row 2 is an empty spacer: room for (a)'s axis label and (b)'s title
gs = fig.add_gridspec(4, 1, height_ratios=[1, 1, 0.95, 1.5], hspace=0.12)
ax_keep = fig.add_subplot(gs[0])
ax_break = fig.add_subplot(gs[1], sharex=ax_keep)
ax_abl = fig.add_subplot(gs[3])

# ── (a) order kept vs order broken ───────────────────────────────────────────
bins = list(range(0, 101, 5))
n_contested = d["counts"]["contested"]
for ax, key, colour, label in [
    (ax_keep, "keep", INK, "Order kept"),
    (ax_break, "break", CONTEXT, "Order broken"),
]:
    xs = pct(d["random"][key])
    ax.hist(xs, bins=bins, color=colour, edgecolor="white", linewidth=0.5)
    ax.text(0.01, 0.9, label, transform=ax.transAxes, va="top", ha="left", color=INK)
    ax.text(0.01, 0.52, f"median {median(xs):.0f}%, worst {min(xs):.0f}%", transform=ax.transAxes,
            va="top", ha="left", color=MUTED, fontsize=7)
    ax.set_xlim(0, 100)
    ax.set_yticks([])
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
plt.setp(ax_keep.get_xticklabels(), visible=False)
ax_keep.tick_params(axis="x", length=0)
ax_break.set_xlabel("Verdicts matching the prior weights (%)")
ax_keep.set_title(f"(a) Random weights, {n_contested:,} contested points", loc="left", fontsize=8)

# ── (b) ablation ─────────────────────────────────────────────────────────────
names = {
    "ventingTrend": "Venting (0.35)",
    "biometricTrend": "Biometric (0.30)",
    "sentiment": "Sentiment (0.20)",
    "sessionContext": "Time (0.15)",
}
rows = [a for a in d["ablation"] if a["agree"] is not None]
labels = [names[a["signal"]] for a in rows][::-1]
values = [100 * a["agree"] for a in rows][::-1]
counts = [a["points"] for a in rows][::-1]
y = range(len(rows))
ax_abl.barh(y, values, height=0.6, color=INK, edgecolor="white", linewidth=0.5)
for yi, v, n in zip(y, values, counts):
    ax_abl.text(v + 1.2, yi, f"{v:.0f}%", va="center", ha="left", color=INK, fontsize=7)
    ax_abl.text(1.5, yi, f"n={n:,}", va="center", ha="left", color="white", fontsize=6)
ax_abl.set_yticks(list(y))
ax_abl.set_yticklabels(labels)
ax_abl.tick_params(axis="y", length=0)
ax_abl.set_xlim(0, 112)
ax_abl.set_xticks([0, 25, 50, 75, 100])
ax_abl.set_xlabel("Verdicts unchanged (%)")
ax_abl.set_title("(b) Ablation, one signal removed", loc="left", fontsize=8)
for side in ("top", "right"):
    ax_abl.spines[side].set_visible(False)

out = os.path.join(root, "fig_weight_sensitivity.pdf")
fig.savefig(out, format="pdf", bbox_inches="tight", pad_inches=0.02)
print("wrote", out)
