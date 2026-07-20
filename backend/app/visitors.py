from dataclasses import dataclass
from hashlib import sha256
from ipaddress import ip_address
from secrets import token_urlsafe

from fastapi import Request, Response, WebSocket


VISITOR_COOKIE_NAME = "empathy_visitor"
VISITOR_COOKIE_MAX_AGE = 86_400


@dataclass(frozen=True)
class VisitorIdentity:
    subject: str
    network_subject: str = ""
    namespace: str = "anonymous"


def _normalize_address(value: str) -> str:
    candidate = value.strip()
    try:
        return ip_address(candidate).compressed
    except ValueError:
        pass

    if candidate.startswith("["):
        host, separator, suffix = candidate[1:].partition("]")
        if separator and (
            not suffix or (suffix.startswith(":") and suffix[1:].isdigit())
        ):
            try:
                return ip_address(host).compressed
            except ValueError:
                return "unknown"

    host, separator, port = candidate.rpartition(":")
    if separator and port.isdigit():
        try:
            parsed = ip_address(host)
            if parsed.version == 4:
                return parsed.compressed
        except ValueError:
            pass
    return "unknown"


def _client_address(request: Request | WebSocket) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return _normalize_address(forwarded_for.rsplit(",", 1)[-1])
    if request.client:
        return _normalize_address(request.client.host)
    return "unknown"


def _valid_visitor_id(value: str) -> bool:
    return 32 <= len(value) <= 64 and all(
        character.isalnum() or character in "-_" for character in value
    )


def _visitor_identity(visitor_id: str, address: str) -> VisitorIdentity:
    subject = sha256(f"empathy-poc:visitor:{visitor_id}".encode()).hexdigest()[:24]
    network_subject = sha256(f"empathy-poc:network:{address}".encode()).hexdigest()[:24]
    return VisitorIdentity(subject=subject, network_subject=network_subject)


async def identify_visitor(request: Request, response: Response) -> VisitorIdentity:
    address = _client_address(request)
    visitor_id = request.cookies.get(VISITOR_COOKIE_NAME, "")
    if not _valid_visitor_id(visitor_id):
        visitor_id = token_urlsafe(24)
        forwarded_proto = request.headers.get("x-forwarded-proto", "")
        response.set_cookie(
            VISITOR_COOKIE_NAME,
            visitor_id,
            max_age=VISITOR_COOKIE_MAX_AGE,
            httponly=True,
            secure=request.url.scheme == "https"
            or forwarded_proto.split(",", 1)[0].strip() == "https",
            samesite="strict",
            path="/",
        )
    return _visitor_identity(visitor_id, address)


def identify_websocket_visitor(websocket: WebSocket) -> VisitorIdentity | None:
    visitor_id = websocket.cookies.get(VISITOR_COOKIE_NAME, "")
    if not _valid_visitor_id(visitor_id):
        return None
    return _visitor_identity(visitor_id, _client_address(websocket))
