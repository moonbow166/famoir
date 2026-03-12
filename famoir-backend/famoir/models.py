"""Pydantic schemas for structured agent outputs.

These schemas enforce predictable, machine-readable output from agents,
enabling programmatic workflow decisions (e.g., LoopAgent quality control).
See Reference_Google_ADK_Codelab.md for the pattern reference.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Photo Analyst output
# ---------------------------------------------------------------------------

class PhotoDetail(BaseModel):
    """Analysis of a single uploaded photo."""
    photo_index: int = Field(description="1-based index of the photo")
    people: list[str] = Field(description="People visible (e.g., 'elderly woman (~70s)', 'young girl (~8)')")
    era: str = Field(description="Estimated time period (e.g., '1960s', '1990s', '2010s')")
    setting: str = Field(description="Where the photo seems to be taken (e.g., 'kitchen', 'beach')")
    objects: list[str] = Field(description="Notable objects (e.g., 'birthday cake', 'military uniform')")
    mood: str = Field(description="Emotional tone (e.g., 'joyful celebration', 'quiet moment')")
    notable_details: str = Field(description="Anything unusual or meaningful the interviewer could ask about")
    suggested_question: str = Field(description="ONE specific question the interviewer could ask about this photo")


class PhotoAnalysis(BaseModel):
    """Structured output from the PhotoAnalyst agent."""
    photos: list[PhotoDetail] = Field(description="Analysis of each uploaded photo")
    summary: str = Field(description="Brief overview connecting the photos (themes, timeline, relationships)")


# ---------------------------------------------------------------------------
# Narrator output (memoir chapter)
# ---------------------------------------------------------------------------

class ChapterSection(BaseModel):
    """A section within a memoir chapter."""
    heading: str = Field(description="Evocative section title")
    text: str = Field(description="2-4 paragraphs of polished memoir prose, separated by \\n\\n")
    photo_index: Optional[int] = Field(default=None, description="Index of related photo, or null")


class MemoirChapter(BaseModel):
    """Structured output from the Narrator agent."""
    epigraph: str = Field(description="Powerful direct quote from the storyteller (1-2 sentences)")
    title: str = Field(description="Evocative chapter title specific to THIS story")
    sections: list[ChapterSection] = Field(description="2-4 memoir sections")


# ---------------------------------------------------------------------------
# QualityChecker output (pass/fail feedback)
# ---------------------------------------------------------------------------

class QualityFeedback(BaseModel):
    """Structured output from the QualityChecker agent.

    Follows the Judge pattern from Google ADK Codelab:
    status='pass' triggers EscalationChecker to break the LoopAgent.
    status='fail' causes the loop to continue with feedback for Narrator.
    """
    status: Literal["pass", "fail"] = Field(
        description="Whether the memoir chapter meets quality standards ('pass') or needs revision ('fail')."
    )
    feedback: str = Field(
        description="If 'fail': specific issues to fix. If 'pass': brief confirmation of quality."
    )
