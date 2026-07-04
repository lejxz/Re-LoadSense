# Re-LoadSense — Planning

> **Real information. Safer rides. Smarter cities.** — a personal portfolio project that
> recreates and improves upon a hackathon PUV occupancy intelligence submission.

This folder is the **complete planning** for Re-LoadSense. No code yet — this is the planning
pass. The next session builds the full-stack simulation website from these docs, top to bottom.

---

## What this project is

Re-LoadSense is a solo portfolio recreation of a hackathon project (LoadSense) that put an
overhead camera + YOLOv8-nano on a jeepney to count passengers, classified occupancy into four
tiers (🟢 available / 🟡 filling / 🔴 at capacity / 🔴-blink overloaded), displayed it on a
windshield LED strip, and sent telemetry to a cloud backend that predicted ETA, detected
anomalies, forecast demand, and powered a boarding-assistant chatbot.

The original had the right mission but specific, visible problems: a hallucinating chatbot,
wrong calculations, a slow server, an ugly flickering map, rough design, fake computer vision,
and no real-time updates. **This project exists to fix those seven problems** while keeping the
same concept and feature set — built solo, deployed on Vercel, honestly simulated.

---

## Folder structure

```
concept/
├── README.md                      ← you are here (master index)
├── 01-overview.md                 the problem, the mission, the 7 fixes, scope
├── 02-architecture.md             system architecture (mermaid diagrams)
├── 03-data-model.md               ★ every table, every field, types, relationships, how stored + fetched
├── 04-features.md                 the features (matching the original concept), with variables + calculations
├── 05-tech-stack.md               exact Vercel-native stack + package.json + vercel.json
├── 06-project-structure.md        monorepo directory tree with file purposes
├── 07-ui-ux-design.md             UI layout, feature placement, mermaid nav flowcharts
├── 08-implementation-checklist.md ordered build steps (~60 steps, 7 phases)
├── 09-finalization-audit.md       ★ planning sign-off: verification + consistency audit + groundedness check
└── legacy-analysis/
    ├── README.md
    └── lessons-learned.md         forensic audit of the original hackathon submission
```

---

## How to read this folder

**Read in order for the full picture:**

1. [`01-overview.md`](./01-overview.md) — *what* we're building and *why* (the 7 fixes)
2. [`02-architecture.md`](./02-architecture.md) — *how* the system is structured
3. [`03-data-model.md`](./03-data-model.md) — *the little things*: every field, every type, how data is stored and fetched
4. [`04-features.md`](./04-features.md) — *what each feature does* and the variables/data it needs
5. [`05-tech-stack.md`](./05-tech-stack.md) → [`06-project-structure.md`](./06-project-structure.md) → [`07-ui-ux-design.md`](./07-ui-ux-design.md) — *the build setup*
6. [`08-implementation-checklist.md`](./08-implementation-checklist.md) — *the step-by-step build order*
7. [`09-finalization-audit.md`](./09-finalization-audit.md) — *the planning sign-off*

**If you just want the critique of the original:** [`legacy-analysis/lessons-learned.md`](./legacy-analysis/lessons-learned.md)

**If you want the planning sign-off:** [`09-finalization-audit.md`](./09-finalization-audit.md)

**If you're building the next session:** start at [`01-overview.md`](./01-overview.md), then jump to [`08-implementation-checklist.md`](./08-implementation-checklist.md).

---

## The seven problems this project fixes

This is the portfolio story. Every feature in this planning traces back to fixing one of these:

| # | Original problem | How this project fixes it |
|---|---|---|
| 1 | **Chatbot engineering messy** (5 files, 2 dead; latent hallucination risk) | One consolidated grounded heuristic; RAG-guarded LLM if added; PII redaction |
| 2 | **Calculations were wrong** (ETA, demand, occupancy) | Correct, deterministic, tested formulas |
| 3 | **Server was slow** (N+1, fan-out, no cache) | Indexed DB, Redis cache, Edge runtime, no fan-out |
| 4 | **Map had route flicker + blue color + no direction arrows** | Fix polyline redraw; teal color; direction arrows; 4-tier legend; 5 themes |
| 5 | **Design/UI was rough** (no design system) | Tailwind 4 + shadcn/ui + dark mode + responsive |
| 6 | **Fake edge CV** (webcam mode ignored pixels) | Honest simulation — labeled "SIM", never claims real CV |
| 7 | **No real-time updates** (frontend polled) | socket.io live updates, markers move smoothly |

---

## Same concept, better implementation

This project keeps the original concept intact:

- **Four-tier occupancy** (🟢 / 🟡 / 🔴 / 🔴-blink) — the core visual language, unchanged
- **Edge → cloud → clients** three-tier architecture — same shape, simulated edge
- **ETA prediction** — same intent, correct formula
- **Demand forecasting** — same intent, deterministic seeded data
- **Route deviation + driving anomaly alerts** — same intent, correct geofence math
- **Operator-first alert verification** (ack → verify → false-alarm) — same workflow
- **Boarding-assistant chatbot** — same intent, grounded (no hallucination)
- **Commuter app + operator console** — same two surfaces

What changes is the **implementation quality**: honest simulation, correct math, fast server,
good map, clean design, real-time updates.

---

## Scope

This is a **solo portfolio project**, not a production system. Buildable in ~8 days of
part-time work. See [`01-overview.md §Scope`](./01-overview.md#scope) for the full in/out list.

**In scope:** one Next.js app (commuter + operator + optional regulator), real backend (API
routes + Prisma + Vercel Postgres + KV), socket.io live updates, honest seeded simulation,
Vercel deployment.

**Out of scope:** real edge CV/hardware, device management/OTA, MLflow/Feast, k8s, comprehensive
tests, ADRs/runbooks, multi-country, i18n (English only), PWA (optional), rate limiting,
complex RBAC, OpenAPI spec, Dockerfile.

---

## Status

| Aspect | Status |
|---|---|
| Planning | **Complete + audited** — this folder + [`09-finalization-audit.md`](./09-finalization-audit.md) |
| Implementation | **Not started** — next session |

---

## Acknowledgements

This project recreates and improves upon a hackathon submission. The original was built under
extreme time pressure and achieved a working end-to-end demo — a real accomplishment. The
[`legacy-analysis/`](./legacy-analysis/) folder critiques the *code*, not the effort: a
hackathon weekend is not the right unit of time to build production transit infrastructure.
This project gives the same mission the time and rigor to fix what the hackathon couldn't.
