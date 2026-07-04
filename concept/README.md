# Re-LoadSense — Planning

> **Real information. Safer rides. Smarter cities.** — a personal portfolio project that
> recreates and improves upon a hackathon PUV occupancy intelligence submission.

This folder is the **complete planning** for Re-LoadSense. No code yet — this is the planning
pass. The next session implements the project from these docs, top to bottom.

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
same concept and feature set.

---

## Approach: hybrid (old UI + new backend)

The old LoadSense project's **frontend** (HTML/CSS/JS) is **kept and improved**. The
**backend** is **rewritten** from Python/FastAPI to **Next.js 16 full-stack** (API routes in
TypeScript, Prisma ORM, Vercel-native deployment). This gives us:

- The polished UI that already works (phone-frame mockup, rounded cards, chat, map)
- A modern, type-safe, Vercel-deployable backend that fixes the 50 production-readiness failures
- Same `/api/...` paths so the old JS needs minimal changes

---

## Folder structure

```
concept/
├── README.md                      ← you are here (master index)
├── 01-overview.md                 the problem, the mission, the 7 fixes, scope
├── 02-architecture.md             system architecture (mermaid diagrams)
├── 03-data-model.md               ★ every table, every field, types, relationships
├── 04-features.md                 the features, with variables + calculations
├── 05-tech-stack.md               exact stack (Next.js backend + existing HTML/CSS/JS frontend)
├── 06-project-structure.md        project directory tree
├── 07-ui-ux-design.md             UI layout, feature placement, mermaid nav flowcharts
├── 08-implementation-checklist.md ordered build steps (~49 steps, 7 phases)
├── 09-finalization-audit.md       planning sign-off: verification + consistency audit
└── legacy-analysis/
    ├── README.md
    └── lessons-learned.md         forensic audit of the original hackathon submission
```

---

## The seven problems this project fixes

| # | Original problem | How this project fixes it |
|---|---|---|
| 1 | **Chatbot engineering messy** (5 files, 2 dead; latent hallucination risk) | One consolidated grounded heuristic; RAG-guarded LLM if added; PII redaction |
| 2 | **Calculations were wrong** (ETA, demand, occupancy) | Correct, deterministic, tested formulas |
| 3 | **Server was slow** (N+1, fan-out, no cache) | Prisma + Redis cache, no fan-out |
| 4 | **Map had route flicker + blue color + no direction arrows** | Fix polyline redraw; teal color; direction arrows; 4-tier legend; 5 themes |
| 5 | **Design/UI was rough** (no design system) | Keep existing CSS + improve (dark mode, Menu tab) |
| 6 | **Fake edge CV** (webcam mode ignored pixels) | Honest simulation — labeled "SIM", never claims real CV |
| 7 | **No real-time updates** (frontend polled) | socket.io live updates, markers move smoothly |

---

## Status

| Aspect | Status |
|---|---|
| Planning | **Complete + audited** — this folder |
| Implementation | **Not started** — next session |

---

## Acknowledgements

The original LoadSense was built for the ASEAN AI Hackathon 2026. The legacy analysis
critiques the *code*, not the effort. Re-LoadSense is the same mission, given the time and
rigor to fix what the hackathon couldn't.
