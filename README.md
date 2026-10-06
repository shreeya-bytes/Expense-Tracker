# Urban Flood Nowcasting Simulator — software-only mini project

A beginner-friendly, **100% software** flood-monitoring simulation inspired by SIH 2026
Problem Statement **26085 — "Urban Flood Nowcasting System (Drainage and Rainfall
Coupling)"** (Ministry of Earth Sciences / NCMRWF). No hardware, no sensors, no wiring —
just HTML, CSS and JavaScript running in a browser.

> **Assumption stated up front:** the reference video shows a live GIS map with a
> drainage-network overlay and a rainfall heat layer — that needs real map tiles, real
> sensor feeds, and a lot of backend plumbing. The closest honest software equivalent for
> a mini project is a **grid of city zones** that each carry their own terrain data and
> flood independently based on rainfall — same underlying idea (rain + terrain + drainage
> → localized flooding), fully simulate-able, and far more reliable to demo on a laptop
> with no internet.

---

## 1. Project folder structure

```
flood-grid-simulator/
├── index.html   → the two screens: city picker + grid simulator
├── style.css    → all styling (dark "control room" theme)
├── script.js    → terrain generation, simulation, evacuation logic, rendering
└── README.md    → this file
```

That's it — 3 code files. Nothing nested, nothing to configure.

## 2. Libraries required

**One: Three.js (r128)**, loaded via a `<script>` tag from a CDN in `index.html` — nothing
to install, no npm, no build step. There's also a Google Fonts link for the display
typeface. Both need internet **the first time** the page loads in a browser; after that,
most browsers cache them.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

If you need a guaranteed fully-offline demo (no WiFi at the venue at all), say so and I can
either point you to downloading `three.min.js` locally next to your project, or give you a
flat-2D fallback version with zero external dependencies. If the CDN fails to load for any
reason, the app shows an on-screen message instead of silently breaking.

Everything else — the whole simulation engine, UI, camera controls — is hand-written vanilla
JS. No React, no build tools, no package.json.

## 3. Exact VS Code setup and run commands

1. Create a folder `flood-grid-simulator` and put the three files (`index.html`,
   `style.css`, `script.js`) inside it, exactly as named.
2. Open that folder in VS Code: `File → Open Folder…`
3. Easiest run method — just open the file:
   - Right-click `index.html` in the VS Code file explorer → **"Reveal in File Explorer"**
     → double-click it → opens in your default browser. Done.
4. Slightly nicer run method (auto-refreshes when you edit code) — **Live Server extension**:
   ```
   1. In VS Code, go to Extensions (Ctrl+Shift+X), search "Live Server" (by Ritwick Dey), Install.
   2. Right-click index.html → "Open with Live Server".
   3. It opens at http://127.0.0.1:5500/ and reloads automatically whenever you save a file.
   ```
5. No Live Server extension and prefer a terminal command instead:
   ```bash
   cd flood-grid-simulator
   python -m http.server 8000
   # then open http://localhost:8000 in your browser
   ```
   (Any method works — the app has no backend, so it genuinely doesn't matter how the HTML
   file reaches the browser.)

## 4. How to use it

1. Pick a city (Bengaluru / Mumbai / Chennai / Delhi) on the landing screen.
2. You land on a live, rotatable **3D terrain** — an 8×8 field of blocks whose *height is
   the real elevation* of that zone. Drag to orbit around it, scroll to zoom; it also
   auto-rotates slowly on its own, like a tabletop hologram.
3. Drag **Intensity** (mm/hr) and it immediately starts raining over the terrain — the
   particle density is tied directly to the slider, so you get visual feedback the instant
   you touch it, before any flooding even happens.
4. Drag **Hours of rain** — the grid recalculates instantly for whatever combination you set.
   Watch translucent "water" blocks rise out of the low-lying terrain and change colour.
5. Click **▶ Run simulation** to auto-advance "Hours of rain" by 0.5 hr every ~1.2
   seconds — watch zones turn Warning → Critical live, which is your best demo moment.
6. **Step +15 min** advances one simulation step at a time if you want to narrate it
   slowly. **Reset** zeroes everything.
7. Click any terrain block to see its stats (elevation, imperviousness, drainage) in the
   side panel — this is how you explain *why* one zone floods before another.
8. Once a zone goes Critical, a small pulsing arrow floats above it pointing toward the
   safest neighbour, with a glowing line showing water actively spilling that direction —
   and the Alerts panel logs a message like *"Silk Board reached CRITICAL — Evacuate West
   toward Zone C2."* Named real-world hotspots (Silk Board, Hindmata, Velachery, ITO…)
   show as floating labels directly on their block.

## 5. The algorithm — plain-English explanation

**Terrain.** Each of the 64 cells gets three fixed numbers, generated once per city from a
seeded random generator (so the same city always produces the same layout):
- `elevation` (0–1, lower = low-lying)
- `imperviousness` (0–1, higher = more concrete/paving, less soil to absorb water)
- `drainage` (0–1, higher = better stormwater drains)

A handful of **named hotspot cells per city** (Silk Board, Hindmata, Velachery, ITO, etc. —
real, well-known waterlogging-prone localities) are deliberately given low elevation, high
imperviousness and poor drainage, so they reliably flood first in the simulation — matching
real life, and matching the real problem statement's point that flooding is about
*hyper-local terrain*, not just "how much rain fell."

**Step-by-step water balance.** Time moves in 15-minute steps. For every cell, every step:

```
inflow  = rainfall(mm/hr) × step_hours × impervious_factor(cell)
outflow = current_level × drainage(cell) × step_hours × outflow_rate
new_level = current_level + inflow − outflow
```

This is a simple **"leaky bucket" / first-order system** — the same structure as an RC
circuit charging and discharging, or a water tank with an inflow pipe and an outflow valve.
High imperviousness → more inflow (water runs off straight into the street instead of
soaking into ground). High drainage → faster outflow (better stormwater pipes carry it
away).

**Overflow / spreading.** If a cell's level is already above the Critical threshold, a
fraction of its *excess* spills into any neighbouring cell that sits at the same or lower
elevation — a simple model of a flooded street overflowing into the next block downhill.

**Classification.**
| Water level | Status |
|---|---|
| below 30% | 🟢 Normal |
| 30% – 69% | 🟡 Warning |
| 70% and above | 🔴 Critical / Flooded |

**Evacuation suggestion.** For every Critical cell, look at its 4 neighbours (N/S/E/W) and
recommend moving toward whichever one currently has the *lowest* water level. If every
neighbour is equally bad, the app reports "Surrounded — shelter in place, await rescue"
instead of suggesting a route into more floodwater.

## 6. Example data you can quote in your report

Terrain ranges used (Bengaluru, seed 44):
| Zone type | Elevation | Imperviousness | Drainage |
|---|---|---|---|
| Hotspot (e.g. Silk Board) | 5–15% | 80–95% | 8–18% |
| Ordinary zone | 30–95% | 25–70% | 30–85% |

Sample simulation outputs (from the actual code, via `node` test run):

| Rainfall | Duration | Normal | Warning | Critical |
|---|---|---|---|---|
| 0 mm/hr | 0 h | 64 | 0 | 0 |
| 40 mm/hr | 3 h | 61 | 3 | 0 |
| 70 mm/hr | 5 h | 44 | 17 | 3 |
| 100 mm/hr | 8 h | 30 | 31 | 3 |

Rainfall qualitative bands shown under the slider: <15 mm/hr Light · 15–39 Moderate ·
40–64 Heavy · 65–89 Very heavy · 90+ Extreme/cloudburst — these are the commonly used
descriptive bands for hourly rain intensity, included for narration, not an official IMD
cutoff table.

## 7. Step-by-step demo script for your presentation

1. **Open on the city screen.** Say: *"This is a software-only simulation of an urban
   flood nowcasting system — inspired by SIH 2026's Urban Flood Nowcasting System problem
   statement. No hardware, pure simulation logic."*
2. **Pick Bengaluru** (or your own city). Point out the three named hotspots in the card.
3. **With sliders at 0**, let the 3D terrain auto-rotate for a second before you touch
   anything. *"This is the baseline — dry terrain, every block at its real elevation, no
   water anywhere."* Give it a drag to show it's a live, rotatable model, not a picture.
4. **Drag rainfall to ~40 mm/hr.** Rain starts falling immediately — pause here, this is the
   moment that visually sells it. Then push duration to ~2 hr and point out 2–3 blocks
   growing a coloured "water" layer — specifically the named hotspots. *"Notice it's not
   random — the same few low-lying, poorly-drained blocks are the first to react, exactly
   like real monsoon flooding."*
5. **Click a yellow/hotspot cell** to open its terrain detail panel. Read out its
   elevation/imperviousness/drainage numbers as the *reason* it's struggling.
6. **Hit ▶ Run simulation.** Let it auto-advance for ~15–20 seconds. Narrate as cells flip
   to red and arrows appear. *"Each critical zone now shows its recommended evacuation
   direction, computed by comparing it to its neighbours in real time."*
7. **Open the Alerts panel** and read 1–2 of the auto-generated alert messages aloud.
8. **Hit Reset**, then show the **← back button** to demonstrate multi-city support
   (switch to Mumbai or Chennai to show the same logic drives a different layout).
9. **Close** by stating the one-line limitation honestly: *"Rainfall and terrain here are
   simulated, not live-sensed — the same scoring and evacuation logic would run unchanged
   on real rain-gauge and drainage-sensor data in a full deployment."*

## 8. ECE concepts represented in the software

| Concept from your ECE coursework | Where it shows up here |
|---|---|
| **First-order system response** (RC charging/discharging) | `new_level = current_level + inflow − outflow` per cell, per step — identical structure to a capacitor charging through a resistor. |
| **Discrete-time simulation / sampling** | Continuous rainfall is simulated in fixed 15-minute time steps — the same idea as sampling a continuous signal at a fixed interval. |
| **Thresholding / signal classification** | The 30% / 70% cutoffs that turn a continuous water-level signal into three discrete states (Normal/Warning/Critical) — basic comparator-style logic. |
| **Spatial systems / diffusion** | The overflow step, where "excess" spreads to neighbouring cells, is a simplified discrete diffusion process — the same mathematical family as heat or signal spreading across a medium. |
| **State machines** | Each zone's Normal → Warning → Critical progression is a simple finite-state machine driven by a continuous input. |
| **Sensor-to-decision pipeline (the real-world mapping)** | The simulated "rainfall input" stands in for a rain-gauge/tipping-bucket sensor reading; swap that one function for a real ADC/sensor read and the rest of the pipeline (scoring, thresholds, alerts) is unchanged — a natural way to describe how this would become a real embedded + software system. |

---

### If you ever want to extend this to real hardware later (optional, not required)

Swap the `rainfall` variable from a slider value to a real reading from a rain-gauge/tipping
bucket sensor on a microcontroller (e.g. ESP32) sent over WiFi to a small backend, and feed
it into the exact same `simulate()` function. Every other line of code — thresholds,
classification, evacuation logic, rendering — stays identical. Good one-line answer if a
judge asks "how would you make this real?"
