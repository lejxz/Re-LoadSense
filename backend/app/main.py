from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from .api.routes import router as api_router
from .core.config import config_value, is_demo_mode
from .core.demo_simulator import SyntheticFleetSimulator
from .core.state import fleet_store


demo_simulator = SyntheticFleetSimulator(fleet_store)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler — replaces deprecated on_event."""
    if is_demo_mode():
        demo_simulator.start()
    yield
    demo_simulator.stop()


app = FastAPI(
    title=config_value("project", "api_title", default="LoadSense Backend"),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=config_value("server", "api_prefix", default="/api"))


@app.get("/health")
def health():
    return {"status": "ok"}


APP_DIR = Path(__file__).resolve().parents[2] / "app"
if APP_DIR.exists():
    app.mount("/", StaticFiles(directory=APP_DIR, html=True), name="loadsense_app")






