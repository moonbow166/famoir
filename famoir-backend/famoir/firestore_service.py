"""Firestore CRUD service for Famoir.

Collections:
  users/{user_id}
  users/{user_id}/books/{book_id}
  users/{user_id}/books/{book_id}/sessions/{session_id}
  users/{user_id}/books/{book_id}/chapters/{chapter_id}

Design decisions:
  - Each user can have multiple "books" (memoir projects)
  - Each book contains sessions (interview recordings) and chapters (narrated output)
  - Photos are stored as base64 in a subcollection under sessions (avoids 1MiB doc limit)
  - Chapter ordering uses an `order` field for manual reordering later
"""

import asyncio
from datetime import datetime, timezone
from functools import partial
from typing import Optional
from google.cloud.firestore_v1 import FieldFilter

from famoir.firebase_config import get_db


# ---------------------------------------------------------------------------
# Helper: run synchronous Firestore calls off the event loop
# ---------------------------------------------------------------------------
# The google-cloud-firestore SDK used here is synchronous. Wrapping each call
# in asyncio.to_thread() prevents blocking the event loop so the WebSocket
# handler stays responsive during Firestore I/O.

async def _run_sync(fn, *args, **kwargs):
    """Run a synchronous function in a thread so it doesn't block asyncio."""
    return await asyncio.to_thread(partial(fn, *args, **kwargs))


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def _create_or_get_user_sync(user_id: str, display_name: str = "", email: str = "") -> dict:
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    doc = user_ref.get()
    if doc.exists:
        return doc.to_dict()
    user_data = {
        "display_name": display_name,
        "email": email,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    user_ref.set(user_data)
    return user_data

async def create_or_get_user(user_id: str, display_name: str = "", email: str = "") -> dict:
    """Create user doc if not exists, return user data."""
    return await _run_sync(_create_or_get_user_sync, user_id, display_name, email)


async def get_user(user_id: str) -> Optional[dict]:
    def _sync():
        db = get_db()
        doc = db.collection("users").document(user_id).get()
        return doc.to_dict() if doc.exists else None
    return await _run_sync(_sync)


# ---------------------------------------------------------------------------
# Books (memoir projects)
# ---------------------------------------------------------------------------

async def create_book(user_id: str, title: str = "My Memoir", storyteller_name: str = "") -> dict:
    """Create a new book/memoir project."""
    def _sync():
        db = get_db()
        book_ref = db.collection("users").document(user_id).collection("books").document()
        book_data = {
            "title": title,
            "storyteller_name": storyteller_name,
            "chapter_count": 0,
            "session_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        book_ref.set(book_data)
        return {"id": book_ref.id, **book_data}
    return await _run_sync(_sync)


async def get_books(user_id: str) -> list[dict]:
    """Get all books for a user."""
    def _sync():
        db = get_db()
        docs = db.collection("users").document(user_id).collection("books") \
            .order_by("created_at").stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return await _run_sync(_sync)


async def get_book(user_id: str, book_id: str) -> Optional[dict]:
    def _sync():
        db = get_db()
        doc = db.collection("users").document(user_id).collection("books").document(book_id).get()
        return {"id": doc.id, **doc.to_dict()} if doc.exists else None
    return await _run_sync(_sync)


# ---------------------------------------------------------------------------
# Sessions (interview recordings)
# ---------------------------------------------------------------------------

async def create_session(
    user_id: str,
    book_id: str,
    storyteller_name: str = "",
    relationship: str = "",
    topic: str = "",
    photo_count: int = 0,
) -> dict:
    """Record a new interview session."""
    def _sync():
        db = get_db()
        session_ref = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("sessions").document()
        session_data = {
            "storyteller_name": storyteller_name,
            "relationship": relationship,
            "topic": topic,
            "photo_count": photo_count,
            "transcript": "",
            "duration_seconds": 0,
            "chapter_id": None,
            "status": "active",
            "created_at": datetime.now(timezone.utc),
            "completed_at": None,
        }
        session_ref.set(session_data)

        from google.cloud.firestore_v1 import transforms
        book_ref = db.collection("users").document(user_id).collection("books").document(book_id)
        book_ref.update({"session_count": transforms.Increment(1), "updated_at": datetime.now(timezone.utc)})

        return {"id": session_ref.id, **session_data}
    return await _run_sync(_sync)


async def complete_session(
    user_id: str,
    book_id: str,
    session_id: str,
    transcript: str,
    duration_seconds: int,
    chapter_id: Optional[str] = None,
) -> dict:
    """Mark session as completed with transcript."""
    def _sync():
        db = get_db()
        session_ref = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("sessions").document(session_id)
        update_data = {
            "transcript": transcript,
            "duration_seconds": duration_seconds,
            "chapter_id": chapter_id,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc),
        }
        session_ref.update(update_data)
        return update_data
    return await _run_sync(_sync)


async def save_session_photos(
    user_id: str, book_id: str, session_id: str, photos: list[str]
) -> int:
    """Save photo data URLs as a subcollection under the session.

    Each photo is stored in its own document to stay well under the 1MiB
    Firestore document size limit.  Returns the number of photos saved.
    """
    def _sync():
        db = get_db()
        photos_col = (
            db.collection("users").document(user_id)
            .collection("books").document(book_id)
            .collection("sessions").document(session_id)
            .collection("photos")
        )
        for idx, data_url in enumerate(photos):
            photos_col.document(str(idx)).set({
                "index": idx,
                "data_url": data_url,
            })
        return len(photos)
    return await _run_sync(_sync)


async def get_session_photos(
    user_id: str, book_id: str, session_id: str
) -> list[str]:
    """Retrieve photo data URLs for a session, ordered by index."""
    def _sync():
        db = get_db()
        docs = (
            db.collection("users").document(user_id)
            .collection("books").document(book_id)
            .collection("sessions").document(session_id)
            .collection("photos")
            .order_by("index")
            .stream()
        )
        return [doc.to_dict().get("data_url", "") for doc in docs]
    return await _run_sync(_sync)


async def get_sessions(user_id: str, book_id: str) -> list[dict]:
    """Get all sessions for a book."""
    def _sync():
        db = get_db()
        docs = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("sessions").order_by("created_at").stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return await _run_sync(_sync)


# ---------------------------------------------------------------------------
# Chapters (narrated memoir output)
# ---------------------------------------------------------------------------

async def create_chapter(
    user_id: str,
    book_id: str,
    session_id: str,
    title: str,
    content: str,
    epigraph: str = "",
    order: Optional[int] = None,
) -> dict:
    """Save a narrated memoir chapter."""
    def _sync():
        db = get_db()

        nonlocal order
        if order is None:
            existing = db.collection("users").document(user_id) \
                .collection("books").document(book_id) \
                .collection("chapters").count().get()
            order = existing[0][0].value + 1 if existing else 1

        chapter_ref = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").document()
        chapter_data = {
            "session_id": session_id,
            "title": title,
            "content": content,
            "epigraph": epigraph,
            "order": order,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        chapter_ref.set(chapter_data)

        from google.cloud.firestore_v1 import transforms
        book_ref = db.collection("users").document(user_id).collection("books").document(book_id)
        book_ref.update({"chapter_count": transforms.Increment(1), "updated_at": datetime.now(timezone.utc)})

        return {"id": chapter_ref.id, **chapter_data}
    return await _run_sync(_sync)


async def get_chapters(user_id: str, book_id: str) -> list[dict]:
    """Get all chapters for a book, ordered by chapter order."""
    def _sync():
        db = get_db()
        docs = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").order_by("order").stream()
        return [{"id": doc.id, **doc.to_dict()} for doc in docs]
    return await _run_sync(_sync)


async def get_chapter(user_id: str, book_id: str, chapter_id: str) -> Optional[dict]:
    def _sync():
        db = get_db()
        doc = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").document(chapter_id).get()
        return {"id": doc.id, **doc.to_dict()} if doc.exists else None
    return await _run_sync(_sync)


async def update_chapter(user_id: str, book_id: str, chapter_id: str, **fields) -> dict:
    """Update specific fields on a chapter."""
    def _sync():
        db = get_db()
        chapter_ref = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").document(chapter_id)
        fields["updated_at"] = datetime.now(timezone.utc)
        chapter_ref.update(fields)
        return fields
    return await _run_sync(_sync)


async def delete_chapter(user_id: str, book_id: str, chapter_id: str):
    """Delete a chapter from a book."""
    def _sync():
        db = get_db()
        db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").document(chapter_id).delete()
    await _run_sync(_sync)


# ---------------------------------------------------------------------------
# Cross-session history (for Interviewer + Narrator context)
# ---------------------------------------------------------------------------

async def get_session_history(user_id: str, book_id: str, limit: int = 5) -> str:
    """Get summary of previous sessions for context injection.

    Returns a formatted string the Interviewer/Narrator can use to understand
    what stories have already been told, avoiding repetition and building on
    previous conversations.
    """
    def _sync():
        db = get_db()
        chapters = db.collection("users").document(user_id) \
            .collection("books").document(book_id) \
            .collection("chapters").order_by("order").limit(limit).stream()

        history_parts = []
        for doc in chapters:
            ch = doc.to_dict()
            history_parts.append(
                f"Chapter {ch.get('order', '?')}: \"{ch.get('title', 'Untitled')}\"\n"
                f"  Quote: \"{ch.get('epigraph', '')}\"\n"
                f"  (Session: {ch.get('session_id', 'unknown')})"
            )

        if not history_parts:
            return ""

        return (
            "═══ PREVIOUS CHAPTERS (for context — do NOT repeat these stories) ═══\n"
            + "\n\n".join(history_parts)
            + "\n═══ END PREVIOUS CHAPTERS ═══"
        )
    return await _run_sync(_sync)
