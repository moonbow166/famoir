"""Famoir agent definitions using Google ADK.

Architecture (v4 — 5 agents + 2 workflow agents):

  PreSessionPipeline (SequentialAgent)
    ├── PhotoAnalyst (LlmAgent, Vision)
    └── ContextBuilder (BaseAgent)

  Interviewer (LlmAgent + Gemini Live API)

  PostSessionPipeline (SequentialAgent)
    └── memoir_quality_loop (LoopAgent)
          ├── Narrator (LlmAgent)
          ├── QualityChecker (LlmAgent)
          └── EscalationChecker (BaseAgent)
"""

from typing import AsyncGenerator

from google.adk.agents import LlmAgent, BaseAgent, SequentialAgent, LoopAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions

from .prompts import (
    PHOTO_ANALYST_PROMPT,
    NARRATOR_PROMPT,
    QUALITY_CHECKER_PROMPT,
    get_interviewer_prompt,
)
from .models import PhotoAnalysis, MemoirChapter, QualityFeedback
from .config import MODEL_NAME, LIVE_MODEL_NAME


# ---------------------------------------------------------------------------
# Photo Analyst — pre-interview photo analysis (Vision)
# ---------------------------------------------------------------------------

def create_photo_analyst() -> LlmAgent:
    """Create a Photo Analyst agent for analyzing uploaded photos.

    Uses Gemini's Vision capabilities to analyze personal photos and
    produce structured descriptions that help the Interviewer ask
    meaningful, personal questions.
    """
    return LlmAgent(
        name="PhotoAnalyst",
        model=MODEL_NAME,
        description="Analyzes uploaded photos to extract people, era, setting, and emotional context.",
        instruction=PHOTO_ANALYST_PROMPT,
        output_key="photo_analysis",
    )


# ---------------------------------------------------------------------------
# ContextBuilder — formats photo analysis for Interviewer (BaseAgent)
# ---------------------------------------------------------------------------

class ContextBuilder(BaseAgent):
    """Pure Python agent that formats PhotoAnalyst output into Interviewer-ready context.

    Reads session.state["photo_analysis"] (from PhotoAnalyst) and writes
    session.state["photo_context"] as a human-readable string the
    Interviewer can reference during conversation.

    This is a BaseAgent (no LLM) — follows the EscalationChecker pattern
    from the Google ADK Codelab.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        analysis_raw = ctx.session.state.get("photo_analysis", "")

        if not analysis_raw:
            # No photos uploaded — set empty context
            ctx.session.state["photo_context"] = ""
            yield Event(author=self.name)
            return

        # Format the analysis into a natural prompt injection for Interviewer
        context_lines = [
            "PHOTO CONTEXT (from PhotoAnalyst — use naturally in conversation):"
        ]

        # Handle both string and dict formats
        if isinstance(analysis_raw, str):
            context_lines.append(analysis_raw)
        elif isinstance(analysis_raw, dict):
            photos = analysis_raw.get("photos", [])
            for p in photos:
                idx = p.get("photo_index", "?")
                era = p.get("era", "unknown era")
                setting = p.get("setting", "")
                people = ", ".join(p.get("people", []))
                mood = p.get("mood", "")
                question = p.get("suggested_question", "")
                context_lines.append(
                    f"  Photo {idx}: {era}, {setting}. "
                    f"People: {people}. Mood: {mood}. "
                    f"Suggested question: {question}"
                )
            summary = analysis_raw.get("summary", "")
            if summary:
                context_lines.append(f"  Summary: {summary}")

        ctx.session.state["photo_context"] = "\n".join(context_lines)
        yield Event(author=self.name)


# ---------------------------------------------------------------------------
# Interviewer — Gemini Live voice conversation
# ---------------------------------------------------------------------------

def create_interviewer(storyteller_name: str, relationship: str = "myself", topic_preference: str = "") -> LlmAgent:
    """Create an Interviewer agent with session-specific context.

    Uses the native audio model for Gemini Live API voice conversation.
    No tools — the Interviewer is a pure conversational agent.
    Photo context is injected via session.state from PreSessionPipeline.
    """
    prompt = get_interviewer_prompt(storyteller_name, relationship, topic_preference)

    return LlmAgent(
        name="Interviewer",
        model=LIVE_MODEL_NAME,
        description="Conducts warm oral history interviews via voice.",
        instruction=prompt,
        output_key="interview_response",
    )


# ---------------------------------------------------------------------------
# Narrator — post-session memoir chapter generation
# ---------------------------------------------------------------------------

def create_narrator() -> LlmAgent:
    """Create a Narrator agent for post-session chapter generation."""
    return LlmAgent(
        name="Narrator",
        model=MODEL_NAME,
        description="Converts interview transcripts into structured memoir chapters.",
        instruction=NARRATOR_PROMPT,
        output_key="chapter_content",
    )


# ---------------------------------------------------------------------------
# QualityChecker — evaluates Narrator output (LlmAgent + output_schema)
# ---------------------------------------------------------------------------

def create_quality_checker() -> LlmAgent:
    """Create a QualityChecker agent that evaluates memoir chapter quality.

    Uses output_schema (Pydantic) to force structured pass/fail output.
    Follows the Judge pattern from Google ADK Codelab.
    """
    return LlmAgent(
        name="QualityChecker",
        model=MODEL_NAME,
        description="Evaluates memoir chapter quality and provides pass/fail feedback.",
        instruction=QUALITY_CHECKER_PROMPT,
        output_schema=QualityFeedback,
        disallow_transfer_to_parent=True,
        disallow_transfer_to_peers=True,
        output_key="quality_feedback",
    )


# ---------------------------------------------------------------------------
# EscalationChecker — pass/fail control flow (BaseAgent)
# ---------------------------------------------------------------------------

class EscalationChecker(BaseAgent):
    """Checks QualityChecker feedback and escalates (breaks loop) if passed.

    Follows the EscalationChecker pattern from Google ADK Codelab.
    Reads session.state["quality_feedback"] and:
    - If status="pass": yields Event(escalate=True) → LoopAgent stops
    - If status="fail": yields Event() → LoopAgent continues with feedback
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        feedback = ctx.session.state.get("quality_feedback")
        print(f"[EscalationChecker] Feedback: {feedback}")

        is_pass = False
        if isinstance(feedback, dict) and feedback.get("status") == "pass":
            is_pass = True
        elif isinstance(feedback, str) and '"status": "pass"' in feedback:
            is_pass = True

        if is_pass:
            print("[EscalationChecker] ✅ Quality passed — breaking loop")
            yield Event(author=self.name, actions=EventActions(escalate=True))
        else:
            print("[EscalationChecker] ❌ Quality failed — loop continues")
            yield Event(author=self.name)


# ---------------------------------------------------------------------------
# PreSessionPipeline — SequentialAgent (PhotoAnalyst → ContextBuilder)
# ---------------------------------------------------------------------------

def create_pre_session_pipeline() -> SequentialAgent:
    """Create the pre-session pipeline that processes uploaded photos.

    Flow: PhotoAnalyst analyzes photos → ContextBuilder formats for Interviewer.
    Result is stored in session.state["photo_context"].
    """
    photo_analyst = create_photo_analyst()
    context_builder = ContextBuilder(name="ContextBuilder")

    return SequentialAgent(
        name="PreSessionPipeline",
        description="Analyzes uploaded photos and prepares context for the Interviewer.",
        sub_agents=[photo_analyst, context_builder],
    )


# ---------------------------------------------------------------------------
# PostSessionPipeline — SequentialAgent → LoopAgent (quality control)
# ---------------------------------------------------------------------------

def create_post_session_pipeline() -> SequentialAgent:
    """Create the post-session pipeline with quality control loop.

    Flow: Narrator writes chapter → QualityChecker evaluates →
          EscalationChecker decides pass/fail → loop or exit.
    Max 2 iterations (first draft + one revision if needed).
    """
    narrator = create_narrator()
    quality_checker = create_quality_checker()
    escalation_checker = EscalationChecker(name="EscalationChecker")

    memoir_quality_loop = LoopAgent(
        name="memoir_quality_loop",
        description="Iteratively writes and reviews memoir chapter until quality standards are met.",
        sub_agents=[narrator, quality_checker, escalation_checker],
        max_iterations=2,
    )

    return SequentialAgent(
        name="PostSessionPipeline",
        description="Generates and quality-checks a memoir chapter from interview transcript.",
        sub_agents=[memoir_quality_loop],
    )
