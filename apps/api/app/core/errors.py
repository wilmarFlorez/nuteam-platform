from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError


def api_error(status_code: int, code: str, message: str, details: Any = None) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, "details": details},
    )


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    if not isinstance(detail, dict) or "code" not in detail:
        detail = {"code": "http_error", "message": str(detail), "details": None}
    return JSONResponse(status_code=exc.status_code, content=detail, headers=exc.headers)


async def database_error_handler(request: Request, exc: APIError) -> JSONResponse:
    errors = {
        "23505": (409, "resource_conflict", "The resource already exists."),
        "23503": (422, "invalid_reference", "The referenced account or resource does not exist."),
        "23514": (422, "validation_error", "The request violates a data constraint."),
        "22023": (422, "validation_error", "The request is invalid."),
        "42501": (403, "permission_denied", "You do not have permission for this operation."),
        "40001": (409, "concurrent_change", "A concurrent change occurred. Reload and try again."),
        "40P01": (409, "concurrent_change", "A concurrent change occurred. Reload and try again."),
        "PGRST301": (401, "invalid_token", "The bearer token is invalid or expired."),
        "PGRST303": (401, "invalid_token", "The bearer token is invalid or expired."),
    }
    if exc.code == "P0001" and exc.message == "last_owner":
        error = (409, "last_owner", "La organización debe conservar al menos un propietario activo.")
    else:
        error = errors.get(exc.code, (503, "database_unavailable", "The database is temporarily unavailable."))
    return await http_exception_handler(request, api_error(*error))
