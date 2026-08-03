"""
Plots Fig. 3 from fig3-data.json as a VECTOR PDF for the IEEE paper.

    node scripts/generate-fig3.js --interval 7500 --software-session <UUID>
    python scripts/plot-fig3.py

Writes fig_trajectory.pdf. Upload that to Overleaf; the .tex already points at
it. Vector output matters — IEEE rejects bitmapped line art.

Sizing is deliberate: 3.4in wide is the IEEE single-column text width, and 8pt
type matches the class's figure-label size, so nothing is rescaled at include
time and the labels stay legible.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator

CALM_THRESHOLD = 0.66

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(root, "fig3-data.json")
if not os.path.exists(data_path):
    sys.exit("fig3-data.json not found — run scripts/generate-fig3.js first.")

data = json.load(open(data_path, encoding="utf-8"))

plt.rcParams.update({
    "font.size": 8,
    "font.family": "serif",
    "axes.linewidth": 0.6,
    "xtick.labelsize": 7,
    "ytick.labelsize": 7,
    "legend.fontsize": 7,
    "legend.frameon": False,
})

fig, ax = plt.subplots(figsize=(3.4, 2.0))

series = []
if "softwareOnly" in data:
    series.append(("Software only (venting + context)", data["softwareOnly"]["points"], "#888888", "--"))
if "sensingAttached" in data:
    series.append(("Sensing attached (+ biometrics)", data["sensingAttached"]["points"], "#1a1a1a", "-"))

first_cross = None
for label, points, colour, style in series:
    y = [float(p["readiness_score"]) for p in points]
    x = list(range(1, len(y) + 1))
    ax.plot(x, y, style, color=colour, linewidth=1.2, label=label)

    # Mark the decision point: first crossing of the handoff threshold.
    for i, v in enumerate(y):
        if v >= CALM_THRESHOLD:
            ax.plot(x[i], v, "o", color=colour, markersize=4, zorder=5)
            if first_cross is None:
                first_cross = (x[i], v)
            break

ax.axhline(CALM_THRESHOLD, color="#c02020", linewidth=0.8, linestyle=":", zorder=1)
ax.text(0.99, CALM_THRESHOLD + 0.02, r"handoff threshold $\tau$", color="#c02020",
        fontsize=6.5, ha="right", va="bottom", transform=ax.get_yaxis_transform())

ax.set_xlabel("Emotional-state snapshot")
ax.set_ylabel("Readiness score")
ax.set_ylim(-0.03, 1.05)
ax.xaxis.set_major_locator(MaxNLocator(integer=True))
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.legend(loc="lower right")

fig.tight_layout(pad=0.3)
out = os.path.join(root, "fig_trajectory.pdf")
fig.savefig(out, format="pdf", bbox_inches="tight", pad_inches=0.02)
print("wrote", out)
for label, points, _, _ in series:
    print(f"  {label}: {len(points)} snapshots, "
          f"{float(points[0]['readiness_score']):.2f} -> {float(points[-1]['readiness_score']):.2f}")
if first_cross:
    print(f"  first threshold crossing at snapshot {first_cross[0]} ({first_cross[1]:.2f})")
