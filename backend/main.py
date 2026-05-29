from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend.api.schemas import (
    OrderActionRequest,
    RecommendRequest,
    RuntimeUpdateRequest,
    TripCandidatesRequest,
    TripIdRequest,
    TripSelectRequest,
)
from backend.core.env import config_bool, config_value
from backend.clients.llm import load_settings
from backend.orchestrator import TravelOrchestrator
from backend.clients.poster_image import load_poster_image_settings
from backend.api.frontend_routes import attach_orchestrator, router as frontend_router


app = FastAPI(title="Travel AI Backend MVP", version="0.1.0")
orchestrator = TravelOrchestrator()
STATIC_DIR = Path(__file__).resolve().parent / "static"
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /static serves backend-generated assets (e.g. poster PNGs under static/generated/)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# /assets serves Vite build output when the React frontend has been built
if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="dist-assets")
attach_orchestrator(orchestrator)
app.include_router(frontend_router)


@app.get("/")
def index() -> FileResponse:
    """Serve the React app. Run `cd frontend && npm run build` first."""
    if (DIST_DIR / "index.html").exists():
        return FileResponse(DIST_DIR / "index.html")
    raise HTTPException(
        status_code=503,
        detail="Frontend not built. Run `cd frontend && npm run build`.",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/debug/config")
def debug_config() -> dict:
    llm_settings = load_settings()
    poster_image_settings = load_poster_image_settings()
    return {
        "llm": {
            "provider": llm_settings.provider,
            "model": llm_settings.model,
            "base_url": llm_settings.base_url,
            "api_key_configured": llm_settings.enabled,
        },
        "amap_maps": {
            "api_key_configured": config_bool(
                "AMAP_MAP_API_KEY", "AMAP_API_KEY", "AMAP_WEATHER_API_KEY"
            ),
            "mode": "amap_with_mock_fallback",
            "geo": config_value(
                "AMAP_GEO_URL",
                default="https://restapi.amap.com/v3/geocode/geo",
            ),
            "regeo": config_value(
                "AMAP_REGEO_URL",
                default="https://restapi.amap.com/v3/geocode/regeo",
            ),
            "search": config_value(
                "AMAP_PLACE_TEXT_URL",
                default="https://restapi.amap.com/v3/place/text",
            ),
            "routing_walking": config_value(
                "AMAP_ROUTE_WALKING_URL",
                default="https://restapi.amap.com/v3/direction/walking",
            ),
            "routing_driving": config_value(
                "AMAP_ROUTE_DRIVING_URL",
                default="https://restapi.amap.com/v3/direction/driving",
            ),
            "district": config_value(
                "AMAP_DISTRICT_URL",
                default="https://restapi.amap.com/v3/config/district",
            ),
            "mapmatch_enabled": config_bool("AMAP_MAPMATCH_ENABLED"),
            "mapmatch": config_value(
                "AMAP_MAPMATCH_URL",
                default="https://restapi.amap.com/v4/grasproad/driving",
            ),
        },
        "taxi": {
            "provider": "mock",
            "mode": "local_estimate_only",
            "tool": "local_taxi_estimate",
            "external_api": False,
        },
        "orders": {
            "provider": "sqlite",
            "mode": "local_demo_orders",
            "tools": ["OrderStatusTool", "VerificationTool"],
            "external_api": False,
        },
        "runtime_context": {
            "provider": "local_tool",
            "mode": "deterministic_fact_builder",
            "tool": "RuntimeContextTool",
            "subtools": [
                "AMap ReGeo",
                "AMap MapMatch",
                "OrderStatusTool",
                "Check-in Rule",
                "Taxi Mock",
            ],
            "external_api": "via_subtools",
        },
        "poster_image": {
            "provider": poster_image_settings.provider,
            "model": poster_image_settings.model,
            "base_url": poster_image_settings.base_url,
            "api_key_configured": poster_image_settings.enabled,
            "size": poster_image_settings.size,
            "output_format": "png",
            "mode": "model_generated_png_only",
        },
        "weather": {
            "provider": "amap",
            "api_key_configured": config_bool("AMAP_WEATHER_API_KEY", "AMAP_API_KEY"),
            "base_url": config_value(
                "AMAP_WEATHER_BASE_URL",
                default="https://restapi.amap.com/v3/weather/weatherInfo",
            ),
            "mode": "amap_with_mock_fallback",
        },
        "runtime": {
            "orchestrator": "TravelOrchestrator",
            "workflow_engine": "langgraph",
            "supervisor_package": "langgraph-supervisor",
            "state_store": "sqlite",
            "state_store_stats": orchestrator.store.stats(),
            "tool_mode": "real_api_with_mock_fallback",
        },
        "langgraph": orchestrator.graph_runner.describe(),
        "smart_planner": orchestrator.smart_planner.describe(),
    }


@app.get("/debug/state-store")
def debug_state_store() -> dict:
    return orchestrator.store.stats()


@app.get("/debug/langgraph")
def debug_langgraph() -> dict:
    return orchestrator.graph_runner.describe()


@app.post("/trip/smart-plan")
def smart_plan(request: TripCandidatesRequest) -> dict:
    """
    Real LLM supervisor-driven planning.
    Supervisor LLM decides which agents to call and in what order.
    Returns candidates + itinerary in one call (unlike the multi-step /trip/candidates → /trip/plan flow).
    Falls back to sequential execution if LLM_API_KEY is not configured.
    """
    return orchestrator.smart_plan(request.model_dump())


@app.post("/trip/candidates")
def generate_candidates(request: TripCandidatesRequest) -> dict:
    return orchestrator.generate_candidates(request.model_dump())


@app.post("/trip/select")
def select_cards(request: TripSelectRequest) -> dict:
    try:
        return orchestrator.select_cards(request.trip_id, request.selected_card_ids)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/trip/plan")
def plan_trip(request: TripIdRequest) -> dict:
    try:
        return orchestrator.plan_trip(request.trip_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/trip/route")
def build_route(request: TripIdRequest) -> dict:
    try:
        return orchestrator.build_route(request.trip_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/order/create-demo")
def create_demo_orders(request: TripIdRequest) -> dict:
    try:
        return orchestrator.create_demo_orders(request.trip_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/order/pay")
def pay_order(request: OrderActionRequest) -> dict:
    try:
        return orchestrator.pay_order(request.trip_id, request.order_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/order/verify")
def verify_order(request: OrderActionRequest) -> dict:
    try:
        return orchestrator.verify_order(
            request.trip_id,
            order_id=request.order_id,
            card_id=request.card_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/order/status/{trip_id}")
def get_order_status(trip_id: str) -> dict:
    try:
        return orchestrator.get_order_status(trip_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/trip/update")
def update_runtime(request: RuntimeUpdateRequest) -> dict:
    try:
        payload = request.model_dump(exclude={"trip_id"})
        return orchestrator.update_runtime(request.trip_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/trip/recommend")
def recommend(request: RecommendRequest) -> dict:
    try:
        payload = request.model_dump(exclude={"trip_id"})
        return orchestrator.recommend(request.trip_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/trip/poster")
def create_poster(request: TripIdRequest) -> dict:
    try:
        return orchestrator.create_poster(request.trip_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
