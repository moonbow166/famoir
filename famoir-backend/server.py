"""Famoir Backend Server - FastAPI + Gemini Live API for real-time voice interviews.

Architecture (v4):
  PreSessionPipeline (SequentialAgent) → Interviewer (run_live) → PostSessionPipeline (SequentialAgent)
  See README.md for full architecture diagram.
"""

import json
import uuid
import asyncio
import base64
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv


# ---------------------------------------------------------------------------
# Custom JSON response that handles Firestore DatetimeWithNanoseconds
# ---------------------------------------------------------------------------
class FirestoreSafeJSONResponse(JSONResponse):
    """JSONResponse that can serialize Firestore datetime types."""

    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            default=self._default_encoder,
        ).encode("utf-8")

    @staticmethod
    def _default_encoder(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

load_dotenv()

from google.adk.runners import Runner
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.sessions import InMemorySessionService
from google.genai import types

from famoir.agent import (
    create_interviewer,
    create_post_session_pipeline,
)
from famoir.config import PORT, FRONTEND_URL, VOICE_NAME
from famoir.api_routes import router as api_router
from famoir import firestore_service as fs
from famoir.firebase_config import ensure_firebase_app


# --- Session Management ---
session_service = InMemorySessionService()
APP_NAME = "famoir"

# Store session data for chapter retrieval
session_store: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    ensure_firebase_app()
    print("🟢 Famoir backend starting (Gemini Live voice mode)...")
    yield
    print("🔴 Famoir backend shutting down...")


app = FastAPI(
    title="Famoir Backend",
    lifespan=lifespan,
    default_response_class=FirestoreSafeJSONResponse,
)
app.include_router(api_router)

# CORS — production: same-origin (no CORS needed); dev: allow localhost variants
_cors_origins = [FRONTEND_URL]
if FRONTEND_URL == "*":
    _cors_origins = ["*"]
else:
    _cors_origins += ["http://localhost:5173", "http://localhost:5174",
                      "http://localhost:8080", "http://localhost:8081"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health Check ---
@app.get("/health")
async def health():
    return {"status": "ok", "service": "famoir-backend", "mode": "gemini-live-voice"}


# --- Mid-session Photo Analysis Helper ---
from famoir.agent import create_photo_analyst

async def analyze_mid_session_photo(
    photo_b64: str,
    storyteller_name: str,
    websocket: WebSocket,
    live_queue: LiveRequestQueue,
    user_id: str,
):
    """Analyze a photo uploaded mid-session and inject context into the live conversation."""
    try:
        photo_analyst = create_photo_analyst()
        photo_session = await session_service.create_session(
            app_name=APP_NAME, user_id=user_id,
        )
        photo_runner = Runner(
            agent=photo_analyst,
            app_name=APP_NAME,
            session_service=session_service,
        )

        photo_bytes = base64.b64decode(photo_b64)
        parts = [
            types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=photo_bytes)),
            types.Part(text=f"Analyze this photo uploaded by {storyteller_name} during the interview."),
        ]

        analysis_text = ""
        async for event in photo_runner.run_async(
            user_id=user_id,
            session_id=photo_session.id,
            new_message=types.Content(role="user", parts=parts),
        ):
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        analysis_text += part.text

        if analysis_text:
            # Inject photo analysis into the live conversation as a system hint
            hint = (
                f"[System — NEW PHOTO: The storyteller just shared a new photo. "
                f"Here's what you can see: {analysis_text[:600]} "
                f"ACTION: In your next response, mention a specific detail from "
                f"the photo and ask about it. For example: 'Oh, I can see... "
                f"Tell me about that.' Be warm and curious.]"
            )
            live_queue.send_content(types.Content(
                role="user",
                parts=[types.Part(text=hint)],
            ))
            await websocket.send_text(json.dumps({
                "type": "photo_analyzed",
                "analysis": analysis_text[:500],
            }))
            print(f"📸 Mid-session photo analyzed ({len(analysis_text)} chars)")

    except Exception as e:
        print(f"⚠️ Mid-session photo analysis failed: {e}")


# --- WebSocket Chat Endpoint (Gemini Live API - Bidi Streaming) ---
@app.websocket("/chat")
async def chat_websocket(websocket: WebSocket):
    await websocket.accept()

    session_id = str(uuid.uuid4())
    user_id = f"user_{session_id[:8]}"

    # These will be set after receiving setup message
    runner = None
    session = None
    live_queue = None
    storyteller_name = ""
    relationship = ""
    topic_preference = ""

    # Track conversation for narrator
    transcript_parts = []

    try:
        # ===== PHASE 1: Wait for setup message (JSON text) =====
        raw = await websocket.receive_text()
        data = json.loads(raw)

        if data.get("type") != "setup":
            await websocket.send_text(json.dumps({
                "type": "error",
                "content": "First message must be setup"
            }))
            return

        storyteller_name = data.get("name", "")
        relationship = data.get("relationship", "myself")
        topic_preference = data.get("topic", "")

        # --- Firestore: create user + book + session (best-effort, with timeout) ---
        book_id = data.get("book_id", "")
        fs_session_id = ""
        fs_user_id = data.get("user_id", user_id)  # Use auth user_id if provided

        async def _firestore_init():
            """Run Firestore init with a hard timeout so it never blocks voice."""
            nonlocal book_id, fs_session_id
            await fs.create_or_get_user(fs_user_id, display_name=storyteller_name)
            if not book_id:
                book = await fs.create_book(fs_user_id, storyteller_name=storyteller_name)
                book_id = book["id"]
            fs_session_rec = await fs.create_session(
                fs_user_id, book_id,
                storyteller_name=storyteller_name,
                relationship=relationship,
                topic=topic_preference,
                photo_count=len(data.get("photos", [])),
            )
            fs_session_id = fs_session_rec["id"]
            # Persist photos as subcollection (for chapter embedding later)
            _photos_raw = data.get("photos", [])
            if _photos_raw:
                photo_data_urls = [
                    f"data:image/jpeg;base64,{b}" if not b.startswith("data:") else b
                    for b in _photos_raw
                ]
                await fs.save_session_photos(
                    fs_user_id, book_id, fs_session_id, photo_data_urls
                )
            print(f"🔥 Firestore: user={fs_user_id}, book={book_id}, session={fs_session_id}")

        try:
            await asyncio.wait_for(_firestore_init(), timeout=8.0)
        except asyncio.TimeoutError:
            print("⚠️ Firestore init timed out after 8s (non-fatal, continuing)")
        except Exception as e:
            print(f"⚠️ Firestore init skipped (non-fatal): {e}")

        # --- Prepare photos (analyze BEFORE starting voice session) ---
        photos_b64 = data.get("photos", [])  # list of base64 strings
        has_photos = len(photos_b64) > 0
        photo_context = ""  # will be filled by analysis

        if has_photos:
            await websocket.send_text(json.dumps({
                "type": "photos_received",
                "count": len(photos_b64),
            }))

            # Analyze photos NOW, before starting the voice session
            try:
                print(f"📸 Analyzing {len(photos_b64)} pre-session photo(s)...")
                photo_analyst = create_photo_analyst()
                photo_session = await session_service.create_session(
                    app_name=APP_NAME, user_id=user_id,
                )
                photo_runner = Runner(
                    agent=photo_analyst,
                    app_name=APP_NAME,
                    session_service=session_service,
                )

                photo_parts = []
                for b64_str in photos_b64:
                    photo_bytes = base64.b64decode(b64_str)
                    photo_parts.append(types.Part(
                        inline_data=types.Blob(mime_type="image/jpeg", data=photo_bytes)
                    ))
                photo_parts.append(types.Part(
                    text=f"Analyze these {len(photos_b64)} photo(s) uploaded by {storyteller_name}."
                ))

                async for event in photo_runner.run_async(
                    user_id=user_id,
                    session_id=photo_session.id,
                    new_message=types.Content(role="user", parts=photo_parts),
                ):
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                photo_context += part.text

                print(f"📸 Photo analysis complete ({len(photo_context)} chars)")

                await websocket.send_text(json.dumps({
                    "type": "photos_analyzed",
                    "count": len(photos_b64),
                }))
            except Exception as e:
                print(f"⚠️ Pre-session photo analysis failed: {e}")

        # Transition to voice interview
        await websocket.send_text(json.dumps({
            "type": "phase",
            "phase": "interviewer",
        }))

        print(f"🎙️ Starting voice session: {storyteller_name} ({relationship}), topic: {topic_preference}")

        # Create agent with session-specific context
        interviewer = create_interviewer(storyteller_name, relationship, topic_preference)

        # Create ADK session
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
        )

        # Create runner
        runner = Runner(
            agent=interviewer,
            app_name=APP_NAME,
            session_service=session_service,
        )

        run_config = RunConfig(
            response_modalities=["AUDIO"],
            streaming_mode=StreamingMode.BIDI,
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_NAME,
                    )
                )
            ),
            output_audio_transcription=types.AudioTranscriptionConfig(),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                    prefix_padding_ms=20,
                    silence_duration_ms=500,
                ),
            ),
            # Compress context earlier to reduce latency on long conversations
            context_window_compression=types.ContextWindowCompressionConfig(
                trigger_tokens=60000,
                sliding_window=types.SlidingWindow(target_tokens=40000),
            ),
            # Auto-resume when the ~10 min connection resets
            session_resumption=types.SessionResumptionConfig(),
        )

        # Create LiveRequestQueue for bidi streaming
        live_queue = LiveRequestQueue()

        # Send setup_ready so frontend can start streaming audio immediately
        await websocket.send_text(json.dumps({
            "type": "setup_ready",
            "session_id": session_id,
            "mode": "voice",
        }))

        # --- Fetch cross-session history concurrently (with timeout) ---
        history_context = ""
        if book_id:
            try:
                history_context = await asyncio.wait_for(
                    fs.get_session_history(fs_user_id, book_id),
                    timeout=3.0,
                )
            except asyncio.TimeoutError:
                print("⚠️ History fetch timed out (3s), skipping for this session")
            except Exception as e:
                print(f"⚠️ History fetch skipped: {e}")

        # --- Initial greeting: AI introduces itself FIRST, then we handle photos ---
        history_inject = f"\n\n{history_context}" if history_context else ""

        if has_photos and photo_context:
            # Greeting + photo details already analyzed
            orientation_hint = (
                f"[System: Begin the interview now. "
                f"Start with a brief, warm self-introduction (2-3 sentences): you are "
                f"{storyteller_name}'s storytelling companion from Famoir. Explain simply "
                f"that you'll chat, they'll share memories, and you'll turn them into a "
                f"beautiful memoir their family can treasure. "
                f"You have ALREADY SEEN their {len(photos_b64)} photo(s). "
                f"Here is what you observed:\n{photo_context[:1200]}\n"
                f"Mention ONE specific detail from the photos to show you can see them, "
                f"then ask about the story behind it. "
                f"NEVER say you cannot see the photos — you CAN and already have. "
                f"Weave other photo details naturally as the conversation progresses. "
                f"Speak naturally.]{history_inject}"
            )
        elif has_photos:
            # Photos were uploaded but analysis failed — still acknowledge them
            orientation_hint = (
                f"[System: Begin the interview now. "
                f"Start with a brief, warm self-introduction (2-3 sentences): you are "
                f"{storyteller_name}'s storytelling companion from Famoir. Explain simply "
                f"that you'll chat, they'll share memories, and you'll turn them into a "
                f"beautiful memoir their family can treasure. "
                f"They shared {len(photos_b64)} photo(s). You weren't able to see the "
                f"details clearly. Ask them to tell you about what's in the photos. "
                f"Speak naturally.]{history_inject}"
            )
        elif topic_preference:
            orientation_hint = (
                f"[System: Begin the interview now. "
                f"Start with a brief, warm self-introduction (2-3 sentences): you are "
                f"{storyteller_name}'s storytelling companion from Famoir. Explain simply "
                f"that you'll chat, they'll share memories, and you'll turn them into a "
                f"beautiful memoir their family can treasure. "
                f"Then acknowledge their topic interest ({topic_preference}) and ask ONE "
                f"specific, concrete question to get them started. "
                f"Speak naturally.]{history_inject}"
            )
        else:
            orientation_hint = (
                f"[System: Begin the interview now. "
                f"Start with a brief, warm self-introduction (2-3 sentences): you are "
                f"{storyteller_name}'s storytelling companion from Famoir. Explain simply "
                f"that you'll chat, they'll share memories, and you'll turn them into a "
                f"beautiful memoir their family can treasure. "
                f"Then ask what story, memory, or part of their life they'd like to "
                f"explore today. Keep it open and inviting. "
                f"Speak naturally.]{history_inject}"
            )

        live_queue.send_content(types.Content(
            role="user",
            parts=[types.Part(text=orientation_hint)]
        ))

        # ===== PHASE 2: Concurrent bidi streaming =====
        # Upstream: WebSocket → LiveRequestQueue (audio from browser)
        # Downstream: run_live() events → WebSocket (audio + text)

        async def upstream_task():
            """Receive audio/text from WebSocket, forward to LiveRequestQueue."""
            try:
                while True:
                    message = await websocket.receive()

                    if message["type"] == "websocket.disconnect":
                        print(f"🛑 WebSocket disconnected")
                        return

                    if message["type"] == "websocket.receive":
                        # Binary data = raw PCM audio from mic
                        if "bytes" in message and message["bytes"]:
                            raw_bytes = message["bytes"]
                            audio_blob = types.Blob(
                                mime_type="audio/pcm;rate=16000",
                                data=raw_bytes,
                            )
                            live_queue.send_realtime(audio_blob)

                        # Text data = JSON control messages
                        elif "text" in message and message["text"]:
                            try:
                                msg = json.loads(message["text"])

                                if msg.get("type") == "text":
                                    user_text = msg.get("content", "")
                                    transcript_parts.append(f"{storyteller_name}: {user_text}")
                                    live_queue.send_content(types.Content(
                                        role="user",
                                        parts=[types.Part(text=user_text)]
                                    ))
                                elif msg.get("type") == "end_session":
                                    print(f"🛑 Session end requested by user")
                                    return
                                elif msg.get("type") == "audio":
                                    audio_data = base64.b64decode(msg["data"])
                                    audio_blob = types.Blob(
                                        mime_type="audio/pcm;rate=16000",
                                        data=audio_data,
                                    )
                                    live_queue.send_realtime(audio_blob)
                                elif msg.get("type") == "activity_start":
                                    live_queue.send_activity_start()
                                elif msg.get("type") == "activity_end":
                                    live_queue.send_activity_end()
                                elif msg.get("type") == "photo":
                                    photo_data = msg.get("data", "")
                                    if photo_data:
                                        asyncio.create_task(analyze_mid_session_photo(
                                            photo_b64=photo_data,
                                            storyteller_name=storyteller_name,
                                            websocket=websocket,
                                            live_queue=live_queue,
                                            user_id=user_id,
                                        ))

                            except json.JSONDecodeError as e:
                                print(f"⚠️ Invalid JSON from client: {e}")
                                continue

            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"⚠️ Upstream task ended: {e}")

        async def downstream_task():
            """Receive events from run_live(), forward audio/text to WebSocket."""
            try:
                async for event in runner.run_live(
                    user_id=user_id,
                    session_id=session.id,
                    live_request_queue=live_queue,
                    run_config=run_config,
                ):
                    # --- Handle audio response chunks ---
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.inline_data and part.inline_data.data:
                                # Send audio as raw binary WebSocket frame
                                await websocket.send_bytes(part.inline_data.data)
                            elif part.text:
                                await websocket.send_text(json.dumps({
                                    "type": "text",
                                    "content": part.text,
                                    "agent": event.author or "Interviewer",
                                }))
                                transcript_parts.append(f"Interviewer: {part.text}")

                    # --- Handle transcriptions ---
                    if hasattr(event, 'input_transcription') and event.input_transcription:
                        text = event.input_transcription
                        if hasattr(text, 'text'):
                            text = text.text
                        if text:
                            finished = getattr(event.input_transcription, 'finished', False)
                            print(f"🎤 input_transcription [fin={finished}] ({len(text)} chars): {text[:80]!r}")
                            await websocket.send_text(json.dumps({
                                "type": "input_transcription",
                                "text": text,
                                "finished": finished,
                            }))
                            if finished:
                                transcript_parts.append(f"{storyteller_name}: {text}")

                    if hasattr(event, 'output_transcription') and event.output_transcription:
                        text = event.output_transcription
                        if hasattr(text, 'text'):
                            text = text.text
                        if text:
                            finished_out = getattr(event.output_transcription, 'finished', False)
                            print(f"🔊 output_transcription [fin={finished_out}] ({len(text)} chars): {text[:80]!r}")
                            await websocket.send_text(json.dumps({
                                "type": "output_transcription",
                                "text": text,
                                "finished": finished_out,
                            }))
                            if getattr(event.output_transcription, 'finished', False):
                                transcript_parts.append(f"Interviewer: {text}")

                    # --- Handle turn completion ---
                    if hasattr(event, 'turn_complete') and event.turn_complete:
                        await websocket.send_text(json.dumps({
                            "type": "turn_complete",
                        }))

                    # --- Handle interruption ---
                    if hasattr(event, 'interrupted') and event.interrupted:
                        await websocket.send_text(json.dumps({
                            "type": "interrupted",
                        }))

            except Exception as e:
                print(f"⚠️ Downstream task ended: {e}")
                import traceback
                traceback.print_exc()

        # Run upstream and downstream concurrently
        upstream = asyncio.create_task(upstream_task())
        downstream = asyncio.create_task(downstream_task())

        try:
            await upstream
        except Exception as e:
            print(f"⚠️ Upstream exception: {e}")
        finally:
            live_queue.close()

        try:
            await asyncio.wait_for(downstream, timeout=30.0)
        except asyncio.TimeoutError:
            print("⚠️ Downstream timed out after 30s, cancelling")
            downstream.cancel()
        except Exception as e:
            print(f"⚠️ Downstream exception: {e}")

        # ===== PHASE 3: Post-session — PostSessionPipeline (Narrator → QualityChecker → EscalationChecker) =====
        if len(transcript_parts) <= 2:
            # Too-short conversation — tell frontend so it doesn't hang
            print(f"⚠️ Session too short ({len(transcript_parts)} parts), skipping chapter generation")
            try:
                await websocket.send_text(json.dumps({
                    "type": "session_too_short",
                    "content": "The conversation was too short to create a chapter. Try having a longer chat next time!",
                }))
            except Exception:
                pass

        if len(transcript_parts) > 2:
            print(f"📖 Running PostSessionPipeline ({len(transcript_parts)} transcript parts)...")
            await websocket.send_text(json.dumps({
                "type": "status",
                "content": "generating_chapter"
            }))

            full_transcript = "\n".join(transcript_parts)

            post_pipeline = create_post_session_pipeline()
            pipeline_session = await session_service.create_session(
                app_name=APP_NAME,
                user_id=user_id,
            )

            # Pre-populate session state for the pipeline agents
            pipeline_session.state["storyteller_name"] = storyteller_name
            pipeline_session.state["relationship"] = relationship
            pipeline_session.state["topic_preference"] = topic_preference or "general life stories"
            pipeline_session.state["transcript"] = full_transcript

            post_runner = Runner(
                agent=post_pipeline,
                app_name=APP_NAME,
                session_service=session_service,
            )

            chapter_content = ""
            async for event in post_runner.run_async(
                user_id=user_id,
                session_id=pipeline_session.id,
                new_message=types.Content(
                    role="user",
                    parts=[types.Part(text=
                        f"Process this interview session.\n\n"
                        f"STORYTELLER: {storyteller_name}\n"
                        f"TOPIC: {pipeline_session.state['topic_preference']}\n\n"
                        f"TRANSCRIPT:\n{full_transcript}\n\n"
                        f"Transform this interview into a beautiful memoir chapter. "
                        f"Write REAL memoir prose, not a cleaned-up transcript."
                    )]
                ),
            ):
                # Collect Narrator output (may come from multiple iterations)
                if event.author == "Narrator" and event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            chapter_content = part.text  # Use latest (possibly revised) version

            # Also check session.state for the final chapter (output_key="chapter_content")
            updated_post_session = await session_service.get_session(
                app_name=APP_NAME, user_id=user_id, session_id=pipeline_session.id
            )
            state_chapter = updated_post_session.state.get("chapter_content", "")
            if state_chapter and len(state_chapter) > len(chapter_content):
                chapter_content = state_chapter

            # Clean up markdown code fences if present (apply after state override)
            def strip_code_fences(text: str) -> str:
                text = text.strip()
                if text.startswith("```"):
                    first_nl = text.find("\n")
                    text = text[first_nl + 1:] if first_nl != -1 else text
                if text.endswith("```"):
                    text = text[:-3].strip()
                return text

            chapter_content = strip_code_fences(chapter_content)

            session_store[session_id] = {
                "chapter": chapter_content,
                "transcript": full_transcript,
                "storyteller_name": storyteller_name,
            }

            # --- Persist to Firestore (best-effort) ---
            fs_chapter_id = ""
            if book_id and fs_session_id:
                try:
                    # Extract title and epigraph — try JSON first, fall back to text
                    chapter_title = "Untitled Chapter"
                    chapter_epigraph = ""
                    try:
                        parsed = json.loads(chapter_content)
                        chapter_title = parsed.get("title", chapter_title)
                        chapter_epigraph = parsed.get("epigraph", "")
                    except (json.JSONDecodeError, TypeError):
                        for line in chapter_content.split("\n"):
                            stripped = line.strip()
                            if stripped.startswith("#"):
                                chapter_title = stripped.lstrip("#").strip()
                                break
                            elif stripped.startswith('"') or stripped.startswith("\u201c"):
                                chapter_epigraph = stripped.strip('""\u201c\u201d')
                                continue
                            elif stripped and chapter_title == "Untitled Chapter":
                                chapter_title = stripped[:80]
                                break

                    ch = await fs.create_chapter(
                        fs_user_id, book_id, fs_session_id,
                        title=chapter_title,
                        content=chapter_content,
                        epigraph=chapter_epigraph,
                    )
                    fs_chapter_id = ch["id"]
                    await fs.complete_session(
                        fs_user_id, book_id, fs_session_id,
                        transcript=full_transcript,
                        duration_seconds=seconds if 'seconds' in dir() else 0,
                        chapter_id=fs_chapter_id,
                    )
                    print(f"🔥 Firestore: chapter={fs_chapter_id} saved")
                except Exception as e:
                    print(f"⚠️ Firestore save skipped (non-fatal): {e}")

            await websocket.send_text(json.dumps({
                "type": "chapter_ready",
                "session_id": session_id,
                "chapter": chapter_content,
                "book_id": book_id,
                "chapter_id": fs_chapter_id,
            }))
            print(f"✅ Chapter complete for session {session_id} (PostSessionPipeline)")

    except WebSocketDisconnect:
        print(f"Session {session_id} disconnected")
    except Exception as e:
        print(f"Error in session {session_id}: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_text(json.dumps({
                "type": "error",
                "content": str(e)
            }))
        except:
            pass
    finally:
        if live_queue:
            live_queue.close()


# --- REST API for Chapter Retrieval ---
@app.get("/api/chapter/{session_id}")
async def get_chapter(session_id: str):
    if session_id in session_store:
        return session_store[session_id]
    return {"error": "Session not found"}, 404


@app.get("/api/chapter-status/{session_id}")
async def chapter_status(session_id: str):
    if session_id in session_store:
        return {"status": "ready", "session_id": session_id}
    return {"status": "generating", "session_id": session_id}


# --- Optional: Serve frontend static files (for single-container deployment) ---
FRONTEND_DIST = Path(__file__).parent / "static"
if FRONTEND_DIST.exists() and FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA index.html for all non-API routes."""
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=True)
