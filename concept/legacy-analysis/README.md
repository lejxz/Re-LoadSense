# Legacy Analysis

> The old project's problems, kept separate from the new project's planning.

This folder contains the forensic audit of the original LoadSense hackathon repository. It is
deliberately **separated** from the new project's planning so that the planning stands on its
own, grounded in — but not tangled with — the legacy critique.

---

## Why separate?

The original was a hackathon prototype built under extreme time pressure. It had the right
mission and a sound high-level architecture, but it accumulated roughly **fifty concrete
production-readiness failures** across backend, frontend, edge, ML, docs, tests, security, and
operability.

Re-LoadSense is an **independent recreation**, not a refactor. By keeping the legacy analysis
in its own folder:

1. The new planning docs can reference lessons by number without re-explaining the old code.
2. A reader who only cares about the new design can skip the critique entirely.
3. The critique remains a stable reference — it documents a fixed point in time and won't drift
   as the new project evolves.

---

## Document

| Document | Purpose |
|---|---|
| [`lessons-learned.md`](./lessons-learned.md) | Forensic audit of the original repo: what it got right, what it got wrong (50 failures with file:line evidence), and a consolidated mistake → remediation matrix that drives every decision in the new planning. |

---

## How the new docs reference this folder

Throughout the planning docs, you'll see references like:

> *Lesson: `legacy-analysis/lessons-learned.md §2.1 (5 dead chatbot files)*

These trace new design decisions back to a specific legacy failure, so the reasoning is always
auditable. The consolidated matrix at the end of `lessons-learned.md` (§10) is the single most
important artifact — every row maps a concrete failure to a concrete remediation, and every
remediation is satisfied by an explicit design decision in the new data model, features, or
build plan.

---

## Summary of key legacy failures (for quick reference)

The full detail is in [`lessons-learned.md`](./lessons-learned.md). The headline failures:

1. **Fake computer vision** — the edge `webcam`/`video` modes opened a camera and ignored every
   pixel, using `frame.mean() % 17` as "movement."
2. **Zero authentication** — no auth on any endpoint, including destructive `/database/reset`.
3. **5 SQLite files with per-country fan-out** — N+5 queries on every read/write.
4. **1,860-line god-module** (`transit.py`) — no service layer separation.
5. **`pickle.load` RCE** on a model artifact that didn't even exist in the repo.
6. **Target leakage** in ETA training; **train/serve path mismatch** for demand forecast.
7. **9+ ghost documentation citations** — files and endpoints that don't exist.
8. **Only 3 real pytest assertions** in the entire repo; no CI.
9. **Vanilla HTML/CSS/JS frontend** — no build step, XSS risks, no a11y, no i18n, no PWA.
10. **No MLOps** — no registry, no tracking, no drift detection, no monitoring.

Every one of these is fixed by an explicit design decision in
[`02-architecture.md`](../02-architecture.md), [`03-data-model.md`](../03-data-model.md), and
[`04-features.md`](../04-features.md), and built via the steps in
[`08-implementation-checklist.md`](../08-implementation-checklist.md).
