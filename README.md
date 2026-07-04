# Re-LoadSense

> **Real information. Safer rides. Smarter cities.** — re-imagined as a production-grade platform.
> **#Sense the Load**
 
Re-LoadSense is a ground-up recreation of the original
[LoadSense](https://github.com/lejxz/LoadSense) hackathon project — a dual-layer intelligent
transportation platform that turns every public utility vehicle (PUV) into a real-time
occupancy sensor for ASEAN cities.

The original LoadSense was a ASEAN AI Hackathon 2026 submission that placed in the
top 6 of its track. It had the right mission and the right high-level architecture — and
roughly fifty concrete production-readiness failures spanning backend, frontend, edge, ML,
docs, tests, security, and operability.

**Re-LoadSense** keeps the original mission and rebuilds everything else to near-production
quality with a defensible architecture, honest scope, and a clear path from pilot to scale.

---

## Current status

| Aspect | Status |
|---|---|
| Concept & planning | **Complete** — see [`concept/`](./concept) |
| Implementation | **Not started** — this pass is planning only |

This repository currently contains **only planning documentation**. The concept folder holds
the complete technical roadmap; no code has been written yet. Subsequent passes will implement
the platform described in the concept.

---

## Concept folder

The [`concept/`](./concept) folder contains the complete planning documentation:

| Document | Purpose |
|---|---|
| [`concept/README.md`](./concept/README.md) | Index, guiding principles, and how to navigate the concept |
| [`concept/01-lessons-learned.md`](./concept/01-lessons-learned.md) | Forensic audit of the original LoadSense repo — the empirical foundation for every improvement |
| [`concept/02-improved-concept.md`](./concept/02-improved-concept.md) | **(2A)** The full improved technical concept, written to near-production standard |
| [`concept/03-features-list.md`](./concept/03-features-list.md) | **(2B)** The complete, prioritized feature list — 80 features with acceptance criteria |
| [`concept/04-roadmap-and-milestones.md`](./concept/04-roadmap-and-milestones.md) | A phased delivery plan that turns the concept into 5 shippable milestones |

**Start here:** [`concept/README.md`](./concept/README.md)

---

## The problem (unchanged from the original — it was correct)

Cebu's commuters, operators, and regulators all operate blind on the one variable that
matters most: **how full is the next jeepney?**

- Commuters wait 20+ minutes for rides that may already be full.
- Drivers exceed legal capacity (*sabit* overloading) because there is no live capacity
  signal.
- Operators allocate fleets by gut-feel; LGUs have no compliance dashboard.
- Traffic congestion costs the Philippine economy PHP 3.5 billion daily.

Google Maps shows *where* a jeepney is; none of them show *whether you can fit inside it*.
Re-LoadSense closes that gap.

---

## What changed from the original

| Dimension | Original LoadSense | Re-LoadSense |
|---|---|---|
| Edge CV | Fake (`frame.mean() % 17`) | Real YOLOv8-nano + ByteTrack, or honestly-labeled `sim` |
| Backend | FastAPI + 5 SQLite files, no auth | FastAPI + PostgreSQL + Redis, JWT/RBAC, mTLS for edge |
| Architecture | Routes with inline business logic; 1,860-line god-module | Layered: routes → services → repositories; split modules |
| ML | pickle.load, target leakage, train/serve mismatch, no MLOps | MLflow registry, Feast feature parity, evidently drift, ONNX serving |
| Frontend | Vanilla HTML/CSS/JS, no build, no a11y, no i18n | Next.js + TypeScript + Tailwind + shadcn/ui, PWA, i18n, a11y |
| Security | CORS `*`, no auth, no rate limit, no headers | Authn/authz, RBAC, rate limit, CSP, SAST/DAST, threat model |
| Observability | `print()`, no metrics, no traces | structlog + Prometheus + OTel + Sentry + Grafana |
| Testing | 3 real pytest assertions, no CI | pytest + Playwright + k6, ≥80% coverage gate, CI on every PR |
| Docs | 9+ ghost citations, drift | Generated from code; CI docs-drift check; ADRs; model cards |
| Operability | Single-stage Docker, root, no backups, no runbooks | Multi-stage non-root, Helm/k8s, backups, runbooks, SLOs |

See [`concept/01-lessons-learned.md`](./concept/01-lessons-learned.md) for the full forensic
audit and [`concept/02-improved-concept.md`](./concept/02-improved-concept.md) for the
complete improved design.

---

## Acknowledgements

The original LoadSense was built by **Team FlowerBoys** (University of San Jose–Recoletos,
Cebu) for the ASEAN AI Hackathon 2026. The lessons-learned document critiques the *code*, not
the *team* — a hackathon weekend is not the right unit of time to build production transit
infrastructure, and the original submission was a strong achievement under those constraints.

Re-LoadSense is the same mission, given the time and rigor it deserves.

---

## License

See [`LICENSE`](./LICENSE).
