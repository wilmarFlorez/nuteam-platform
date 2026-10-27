import json
import logging
import secrets
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

import httpx
import sentry_sdk
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from postgrest.exceptions import APIError
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from redis.exceptions import RedisError
from starlette.exceptions import HTTPException
from supabase_auth.errors import AuthRetryableError

from app.api.routes import access, members, organizations
from app.core.config import get_settings
from app.core.errors import api_error, database_error_handler, http_exception_handler
from app.core.observability import LATENCY, REQUESTS, anonymous_id, sanitize_event
from app.core.rate_limit import RateLimiter

logging.basicConfig(level=logging.INFO, format="%(message)s")
# HTTP clients otherwise log Auth query strings, which can contain credentials.
for name in ("httpx", "httpcore"):
    logging.getLogger(name).setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
settings = get_settings()
limiter = RateLimiter(settings.redis_url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.sentry_dsn:
        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment,
                        send_default_pii=False, include_local_variables=False,
                        before_send=sanitize_event, default_integrations=False)
    yield
    await limiter.close()


app = FastAPI(title="SaaS API", version="0.2.0", openapi_url="/api/v1/openapi.json", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-Organization-Id"],
                   expose_headers=["X-Request-Id", "Retry-After"])


@app.middleware("http")
async def observe_request(request: Request, call_next):
    request_id = str(uuid4())  # Never log untrusted header text.
    started_at = perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001 - final HTTP boundary must redact every unexpected failure.
        sentry_sdk.capture_exception(exc)
        logger.error(json.dumps({"event": "unhandled_error", "request_id": request_id,
                                 "error_type": type(exc).__name__}))
        response = JSONResponse(status_code=500, content={"code": "internal_error", "message": "An unexpected error occurred.", "details": None})
        if request.headers.get("origin") in settings.cors_origins:
            response.headers["Access-Control-Allow-Origin"] = request.headers["origin"]
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Expose-Headers"] = "X-Request-Id"
    elapsed = perf_counter() - started_at
    route = getattr(request.scope.get("route"), "path", "unmatched")
    REQUESTS.labels(request.method, route, str(response.status_code)).inc()
    LATENCY.labels(request.method, route).observe(elapsed)
    user_id = getattr(request.state, "user_id", None)
    logger.info(json.dumps({"event": "request", "request_id": request_id,
                            "method": request.method, "route": route, "status": response.status_code,
                            "duration_ms": round(elapsed * 1000, 2),
                            "user": anonymous_id(user_id, settings.log_hash_key) if user_id else None}))
    response.headers["X-Request-Id"] = request_id
    response.headers["Cache-Control"] = "no-store"
    return response


async def rate_limit(request: Request):
    if request.method == "OPTIONS":
        return
    identity = anonymous_id(request.client.host if request.client else "unknown", settings.log_hash_key)
    try:
        allowed = await limiter.allow(identity, settings.rate_limit_per_minute)
        if allowed and request.method in {"POST", "PATCH", "DELETE"}:
            allowed = await limiter.allow(identity, settings.rate_limit_writes_per_minute, "writes")
    except RedisError as exc:
        raise api_error(503, "rate_limiter_unavailable", "The service is temporarily unavailable.") from exc
    if not allowed:
        error = api_error(429, "rate_limited", "Too many requests. Try again in a minute.")
        error.headers = {"Retry-After": "60"}
        raise error


for router in (organizations.router, members.router, access.router):
    app.include_router(router, prefix="/api/v1", dependencies=[Depends(rate_limit)])


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    # Pydantic input/ctx may contain passwords or non-serializable exceptions.
    details = [{"loc": e["loc"], "type": e["type"], "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"code": "validation_error", "message": "The request is invalid.", "details": details})


app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(APIError, database_error_handler)


async def upstream_unavailable(request: Request, exc: Exception):
    return await http_exception_handler(request, api_error(503, "upstream_unavailable", "A dependency is temporarily unavailable."))


app.add_exception_handler(httpx.HTTPError, upstream_unavailable)
app.add_exception_handler(AuthRetryableError, upstream_unavailable)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok"}


@app.get("/ready", tags=["health"])
async def ready():
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            for path in ("/auth/v1/health", "/rest/v1/"):
                response = await client.get(f"{settings.supabase_url}{path}", headers={"apikey": settings.supabase_anon_key})
                response.raise_for_status()
        if limiter.redis:
            await limiter.redis.ping()
    except Exception:  # noqa: BLE001 - readiness must report any dependency failure.
        return await http_exception_handler(None, api_error(503, "not_ready", "A dependency is unavailable."))
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def metrics(request: Request):
    if not settings.metrics_token or not secrets.compare_digest(request.headers.get("Authorization", ""), f"Bearer {settings.metrics_token}"):
        raise api_error(401, "metrics_unauthorized", "Metrics authentication required.")
    return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})
