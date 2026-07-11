from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, bom, bulk_import, categories, components, health
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Proforce Tooling API",
    description="Unified backend for the Proforce Airsystems in-house tooling suite.",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(components.router, prefix=settings.api_prefix)
app.include_router(categories.router, prefix=settings.api_prefix)
app.include_router(bom.router, prefix=settings.api_prefix)
app.include_router(bulk_import.router, prefix=settings.api_prefix)

# Phase 6+ will add:
#   app.include_router(projects.router, prefix=settings.api_prefix)
#   ...one router per module, per the pluggable-backend architecture.
