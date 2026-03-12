"""Firebase Auth middleware for Famoir API routes.

Verifies Firebase ID tokens from the Authorization header.
In DEV_MODE, all requests are allowed with a mock user identity.
"""

import logging
from fastapi import Request, HTTPException
from firebase_admin import auth

from famoir.config import DEV_MODE

logger = logging.getLogger(__name__)


async def verify_firebase_token(request: Request) -> dict:
    """Verify the Firebase ID token from the Authorization header.

    Returns a dict with at least {"uid": str, "email": str | None}.
    In DEV_MODE, returns a mock user without checking the token.
    """
    if DEV_MODE:
        return {"uid": "dev_user_local", "email": "dev@famoir.local"}

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split("Bearer ", 1)[1]
    try:
        decoded = auth.verify_id_token(token)
        return {
            "uid": decoded["uid"],
            "email": decoded.get("email"),
        }
    except auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.warning("Token verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Authentication failed")
