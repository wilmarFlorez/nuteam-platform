import hashlib
import hmac

from prometheus_client import Counter, Histogram

REQUESTS = Counter("api_requests_total", "API requests", ["method", "route", "status"])
LATENCY = Histogram("api_request_duration_seconds", "API latency", ["method", "route"])


def anonymous_id(value: str, key: str) -> str:
    return hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()[:24]


def sanitize_event(event, hint):
    # Error tracking must not capture JWTs, request payloads, email or local vars.
    for key in ("request", "user", "breadcrumbs", "extra"):
        event.pop(key, None)
    for exception in event.get("exception", {}).get("values", []):
        exception["value"] = exception.get("type", "Unhandled exception")
        for frame in exception.get("stacktrace", {}).get("frames", []):
            frame.pop("vars", None)
    return event
