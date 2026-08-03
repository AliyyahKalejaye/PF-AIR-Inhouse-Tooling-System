from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import (
    auth,
    bom,
    bulk_import,
    categories,
    components,
    health,
    notifications,
    projects,
)
from app.core.config import get_settings
from app.core.logging import configure_logging, logger
from app.core.middleware import RequestContextMiddleware, SecurityHeadersMiddleware

settings = get_settings()
configure_logging("INFO" if settings.is_production else "DEBUG")

app = FastAPI(
    title="Proforce Tooling API",
    description="Unified backend for the Proforce Airsystems in-house tooling suite.",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
)

# Order here is outer-to-inner (first added = outermost, wraps everything
# else, so its headers land on every response including error ones):
# CORS first so allow-origin headers reach even 4xx/5xx bodies, then the
# request-id/access-log layer, then security headers closest to the
# response actually being built.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for anything that isn't an HTTPException or a validation
    error (those already have their own well-formed responses via
    FastAPI's defaults) — logs the real error server-side with the
    request id for correlation, and returns a generic message instead of
    leaking a stack trace to the client."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on our end. Please try again."},
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Re-declared (rather than left to FastAPI's default) purely to add
    logging — a 4xx/5xx raised deliberately by a route (e.g. 404, 409) is
    still worth a log line for debugging, just at a lower severity than
    the catch-all above since it's an expected, handled outcome."""
    logger.info(
        "%s %s -> HTTPException %d: %s",
        request.method,
        request.url.path,
        exc.status_code,
        exc.detail,
    )
    return JSONResponse(
        status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Same re-declaration-for-logging as above, for Pydantic/FastAPI
    request validation failures (malformed body, wrong type, etc.)."""
    logger.info("%s %s -> validation error: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(components.router, prefix=settings.api_prefix)
app.include_router(categories.router, prefix=settings.api_prefix)
app.include_router(bom.router, prefix=settings.api_prefix)
app.include_router(bulk_import.router, prefix=settings.api_prefix)
app.include_router(projects.router, prefix=settings.api_prefix)
app.include_router(notifications.router, prefix=settings.api_prefix)
