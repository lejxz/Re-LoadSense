# Re-LoadSense

> **Real information. Safer rides. Smarter cities.** — a personal portfolio project that recreates and improves upon a hackathon PUV occupancy intelligence submission.

Re-LoadSense is a ground-up recreation of the original [LoadSense](https://github.com/lejxz/LoadSense) hackathon project. The old project's **HTML/CSS/JS frontend is kept and improved**; the **Python/FastAPI backend is replaced** by a **Next.js 16 full-stack** backend (TypeScript, Prisma, Vercel-native deployment).

## The 7 problems this project fixes

| # | Original problem | How this project fixes it |
|---|---|---|
| 1 | Chatbot engineering messy (5 files, 2 dead) | One consolidated grounded heuristic in TypeScript |
| 2 | Calculations were wrong (ETA, demand, occupancy) | Correct, deterministic, tested formulas |
| 3 | Server was slow (N+1, 5-file fan-out, no cache) | Prisma + Redis cache, no fan-out |
| 4 | Map had route flicker + blue color + no direction arrows | Fix polyline redraw; teal color; direction arrows; 4-tier legend; 6 themes |
| 5 | Design/UI was rough | Keep existing CSS + add dark mode + 5th Menu tab |
| 6 | Fake edge CV (webcam mode ignored pixels) | Honest simulation — labeled "SIM", real counting algorithm |
| 7 | No real-time updates (polled 3-30s) | socket.io live updates |

## Tech stack

- **Frontend:** Existing HTML/CSS/JS (from old LoadSense project)
- **Backend:** Next.js 16 API routes (TypeScript, Prisma ORM)
- **Database:** SQLite (dev) / Vercel Postgres (deploy)
- **Cache:** Vercel KV (Redis)
- **Real-time:** socket.io mini-service (port 3001)
- **Scheduler:** Vercel Cron (sim-tick every minute)
- **Hosting:** Vercel (region sin1)

## Quick start

```bash
bun install
bun run db:push    # create SQLite DB
bun run db:seed    # seed 8 Cebu routes + 16 vehicles
bun run dev        # start Next.js on :3000
# In another terminal:
bun run dev:ws     # start socket.io on :3001
```

Open `http://localhost:3000/app/mobile.html` for the commuter app.
Open `http://localhost:3000/app/operator.html` for the operator console.

## Demo login

- Commuter: any phone number (demo mode)
- Operator: `operator@demo.com` / `demo123`

## Project structure

```
public/app/     — old LoadSense UI (HTML/CSS/JS, kept + improved)
src/app/api/    — Next.js API routes (replaces FastAPI)
src/lib/        — backend services (simulator, calcs, chatbot, etc.)
prisma/         — database schema + seed
mini-services/  — socket.io mini-service
concept/        — planning documentation
```

## License

MIT
