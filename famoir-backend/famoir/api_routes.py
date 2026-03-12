"""REST API routes for Famoir — CRUD for users, books, sessions, chapters.

Mounted on the FastAPI app as /api prefix.
All routes are async and use Firestore via firestore_service.
Auth: every route verifies the Firebase ID token (skipped in DEV_MODE).
"""

import json
import re

from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional

from famoir import firestore_service as fs
from famoir.auth_middleware import verify_firebase_token
from famoir.pdf_export import generate_memoir_pdf

router = APIRouter(prefix="/api", tags=["famoir"])


async def _enrich_chapter_photos(
    chapter: dict, user_id: str, book_id: str,
    photo_cache: dict | None = None,
) -> dict:
    """Inject photo data URLs into chapter sections based on photo_index.

    The Narrator references photos by 1-based ``photo_index``.  This helper
    fetches the actual data URLs from the session's photo subcollection and
    sets ``image_url`` on each matching section so the frontend can render
    them inline.
    """
    content = chapter.get("content", "")
    session_id = chapter.get("session_id", "")
    if not content or not session_id:
        return chapter

    try:
        parsed = json.loads(content) if isinstance(content, str) else content
        sections = parsed.get("sections", [])
        if not any(s.get("photo_index") for s in sections):
            return chapter

        # Use cache to avoid re-fetching photos for the same session
        if photo_cache is not None and session_id in photo_cache:
            photos = photo_cache[session_id]
        else:
            photos = await fs.get_session_photos(user_id, book_id, session_id)
            if photo_cache is not None:
                photo_cache[session_id] = photos

        if not photos:
            return chapter

        for section in sections:
            idx = section.get("photo_index")
            if idx and 0 < idx <= len(photos):
                section["image_url"] = photos[idx - 1]

        parsed["sections"] = sections
        chapter["content"] = json.dumps(parsed, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError):
        pass

    return chapter


def _clean_chapter(ch: dict) -> dict:
    """Fix chapter titles that were saved with code-fence artifacts."""
    title = ch.get("title", "")
    if title.startswith("```") or not title.strip():
        # Try to extract real title from the content JSON
        content = ch.get("content", "")
        # Strip code fences from content
        text = content.strip()
        if text.startswith("```"):
            first_nl = text.find("\n")
            text = text[first_nl + 1:] if first_nl != -1 else text
        if text.endswith("```"):
            text = text[:-3].strip()
        try:
            parsed = json.loads(text)
            if parsed.get("title"):
                ch["title"] = parsed["title"]
            if parsed.get("epigraph") and not ch.get("epigraph"):
                ch["epigraph"] = parsed["epigraph"]
        except (json.JSONDecodeError, TypeError):
            # Try regex fallback
            m = re.search(r'"title"\s*:\s*"([^"]+)"', text)
            if m:
                ch["title"] = m.group(1)
    return ch


# ---------------------------------------------------------------------------
# Auth dependency — validates token and ensures user can only access own data
# ---------------------------------------------------------------------------

async def get_current_user(request: Request) -> dict:
    """Dependency that returns the authenticated user dict."""
    return await verify_firebase_token(request)


def _check_user_access(user_id_param: str, current_user: dict):
    """Ensure the authenticated user matches the user_id in the URL path."""
    if current_user["uid"] != user_id_param:
        raise HTTPException(403, "Access denied: user_id mismatch")


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    user_id: str
    display_name: str = ""
    email: str = ""

class CreateBookRequest(BaseModel):
    title: str = "My Memoir"
    storyteller_name: str = ""

class CreateSessionRequest(BaseModel):
    storyteller_name: str = ""
    relationship: str = ""
    topic: str = ""
    photo_count: int = 0

class CompleteSessionRequest(BaseModel):
    transcript: str
    duration_seconds: int = 0
    chapter_id: Optional[str] = None

class CreateChapterRequest(BaseModel):
    session_id: str
    title: str
    content: str
    epigraph: str = ""
    order: Optional[int] = None

class UpdateChapterRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    epigraph: Optional[str] = None
    order: Optional[int] = None


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.post("/users")
async def create_user(req: CreateUserRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(req.user_id, current_user)
    return await fs.create_or_get_user(req.user_id, req.display_name, req.email)

@router.get("/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    user = await fs.get_user(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user


# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------

@router.post("/users/{user_id}/books")
async def create_book(user_id: str, req: CreateBookRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.create_book(user_id, req.title, req.storyteller_name)

@router.get("/users/{user_id}/books")
async def get_books(user_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.get_books(user_id)

@router.get("/users/{user_id}/books/{book_id}")
async def get_book(user_id: str, book_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    book = await fs.get_book(user_id, book_id)
    if not book:
        raise HTTPException(404, "Book not found")
    return book


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.post("/users/{user_id}/books/{book_id}/sessions")
async def create_session(user_id: str, book_id: str, req: CreateSessionRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.create_session(
        user_id, book_id, req.storyteller_name, req.relationship, req.topic, req.photo_count,
    )

@router.get("/users/{user_id}/books/{book_id}/sessions")
async def get_sessions(user_id: str, book_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.get_sessions(user_id, book_id)

@router.put("/users/{user_id}/books/{book_id}/sessions/{session_id}/complete")
async def complete_session(user_id: str, book_id: str, session_id: str, req: CompleteSessionRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.complete_session(
        user_id, book_id, session_id, req.transcript, req.duration_seconds, req.chapter_id,
    )


# ---------------------------------------------------------------------------
# Chapters
# ---------------------------------------------------------------------------

@router.post("/users/{user_id}/books/{book_id}/chapters")
async def create_chapter(user_id: str, book_id: str, req: CreateChapterRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    return await fs.create_chapter(
        user_id, book_id, req.session_id, req.title, req.content, req.epigraph, req.order,
    )

@router.get("/users/{user_id}/books/{book_id}/chapters")
async def get_chapters(user_id: str, book_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    chapters = await fs.get_chapters(user_id, book_id)
    photo_cache: dict = {}
    result = []
    for ch in chapters:
        ch = _clean_chapter(ch)
        ch = await _enrich_chapter_photos(ch, user_id, book_id, photo_cache)
        result.append(ch)
    return result

@router.get("/users/{user_id}/books/{book_id}/chapters/{chapter_id}")
async def get_chapter(user_id: str, book_id: str, chapter_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    chapter = await fs.get_chapter(user_id, book_id, chapter_id)
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    chapter = _clean_chapter(chapter)
    chapter = await _enrich_chapter_photos(chapter, user_id, book_id)
    return chapter

@router.patch("/users/{user_id}/books/{book_id}/chapters/{chapter_id}")
async def update_chapter(user_id: str, book_id: str, chapter_id: str, req: UpdateChapterRequest, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    return await fs.update_chapter(user_id, book_id, chapter_id, **fields)

@router.delete("/users/{user_id}/books/{book_id}/chapters/{chapter_id}")
async def delete_chapter(user_id: str, book_id: str, chapter_id: str, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    await fs.delete_chapter(user_id, book_id, chapter_id)
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# PDF Export
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/books/{book_id}/export-pdf")
async def export_book_pdf(user_id: str, book_id: str, current_user: dict = Depends(get_current_user)):
    """Export all chapters in a book as a beautifully formatted PDF memoir."""
    _check_user_access(user_id, current_user)

    # Fetch book metadata
    book = await fs.get_book(user_id, book_id)
    if not book:
        raise HTTPException(404, "Book not found")

    # Fetch all chapters (enriched with photos)
    chapters = await fs.get_chapters(user_id, book_id)
    if not chapters:
        raise HTTPException(404, "No chapters found in this book")
    photo_cache: dict = {}
    chapters = [
        await _enrich_chapter_photos(_clean_chapter(ch), user_id, book_id, photo_cache)
        for ch in chapters
    ]

    storyteller_name = book.get("storyteller_name", "")
    book_title = book.get("title", "My Memoir")

    # Generate PDF
    try:
        pdf_bytes = generate_memoir_pdf(
            chapters=chapters,
            storyteller_name=storyteller_name,
            book_title=book_title,
        )
    except Exception as e:
        print(f"⚠️ PDF generation failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"PDF generation failed: {str(e)}")

    # Build filename
    safe_name = "".join(c for c in storyteller_name if c.isalnum() or c in " _-").strip() or "memoir"
    filename = f"Famoir_{safe_name}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ---------------------------------------------------------------------------
# Cross-session history
# ---------------------------------------------------------------------------

@router.get("/users/{user_id}/books/{book_id}/history")
async def get_history(user_id: str, book_id: str, limit: int = 5, current_user: dict = Depends(get_current_user)):
    _check_user_access(user_id, current_user)
    """Get previous chapter summaries for context injection."""
    history = await fs.get_session_history(user_id, book_id, limit)
    return {"history": history}
