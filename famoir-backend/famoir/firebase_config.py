"""Firebase Admin SDK initialization.

Uses Application Default Credentials (ADC) — works with:
  - Local dev: `gcloud auth application-default login`
  - Cloud Run: automatic via service account
  - Testing: GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account JSON

Firestore is the primary database for Famoir (users, sessions, chapters, photos).
"""

import firebase_admin
from firebase_admin import credentials, firestore
from famoir.config import GOOGLE_CLOUD_PROJECT

_app = None
_db = None


def ensure_firebase_app():
    """Initialize the Firebase Admin SDK if not already done.

    Must be called before any Firebase service (Auth, Firestore, etc.) is used.
    """
    global _app
    if firebase_admin._apps:
        return
    try:
        cred = credentials.ApplicationDefault()
        _app = firebase_admin.initialize_app(cred, {
            "projectId": GOOGLE_CLOUD_PROJECT,
        })
    except Exception:
        if not firebase_admin._apps:
            _app = firebase_admin.initialize_app(options={
                "projectId": GOOGLE_CLOUD_PROJECT,
            })


def get_db() -> firestore.Client:
    """Get (or lazily initialize) the Firestore client."""
    global _db
    if _db is None:
        ensure_firebase_app()
        _db = firestore.client()
    return _db
