"""Famoir PDF Export — generates a beautiful memoir-style PDF from book chapters.

Uses reportlab Platypus for flowing content with custom styles:
- Lora-like serif typography (using built-in Times as fallback)
- Warm terracotta accent colors matching the Famoir brand
- Elegant chapter title pages with epigraphs
- Proper pagination with page numbers
"""

import io
import base64
import json
from typing import List, Optional

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Frame,
    PageTemplate, BaseDocTemplate, NextPageTemplate, FrameBreak,
    Image,
)
from reportlab.pdfgen import canvas


# ---------------------------------------------------------------------------
# Famoir Brand Colors
# ---------------------------------------------------------------------------
DEEP_BROWN = HexColor("#3D2C2E")
TERRACOTTA = HexColor("#C47D5A")
WARM_GRAY = HexColor("#8B7E7A")
CREAM = HexColor("#FBF7F4")
LIGHT_PEACH = HexColor("#F5EDE8")


# ---------------------------------------------------------------------------
# Chapter data parser (same logic as frontend Memoir.tsx)
# ---------------------------------------------------------------------------

def parse_chapter_content(content: str, meta: Optional[dict] = None) -> dict:
    """Parse chapter content from various formats (JSON, embedded JSON, raw text).

    Handles edge cases from Narrator output:
    - Valid JSON string
    - JSON with unescaped newlines inside string values
    - JSON embedded in markdown code fences
    - Raw prose text (fallback)
    """
    if not content:
        return {
            "title": meta.get("title", "Untitled") if meta else "Untitled",
            "epigraph": meta.get("epigraph", "") if meta else "",
            "sections": [{"heading": "", "text": "No content available."}],
        }

    def _try_parse(s: str) -> Optional[dict]:
        """Try JSON parse and validate it has title + sections."""
        try:
            parsed = json.loads(s)
            if isinstance(parsed, dict) and parsed.get("title") and parsed.get("sections"):
                return parsed
        except (json.JSONDecodeError, TypeError, ValueError):
            pass
        return None

    # 1) Direct JSON parse
    result = _try_parse(content)
    if result:
        return result

    # 2) Strip markdown code fences (```json ... ```)
    stripped = content.strip()
    if stripped.startswith("```"):
        first_nl = stripped.find("\n")
        if first_nl > 0:
            stripped = stripped[first_nl + 1:]
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
        result = _try_parse(stripped)
        if result:
            return result

    # 3) Fix unescaped newlines inside JSON string values
    #    Replace raw newlines with \\n so JSON parser accepts them
    import re
    fixed = re.sub(r'(?<!\\)\n', r'\\n', content)
    result = _try_parse(fixed)
    if result:
        return result

    # 4) Try extracting JSON object from surrounding text
    match = re.search(r'\{[^{}]*"title"[^{}]*"sections"\s*:\s*\[.*\]\s*\}', content, re.DOTALL)
    if match:
        candidate = match.group(0)
        result = _try_parse(candidate)
        if not result:
            fixed_candidate = re.sub(r'(?<!\\)\n', r'\\n', candidate)
            result = _try_parse(fixed_candidate)
        if result:
            return result

    # 5) Fallback: raw text as single section
    return {
        "title": meta.get("title", "Your Memoir Chapter") if meta else "Your Memoir Chapter",
        "epigraph": meta.get("epigraph", "") if meta else "",
        "sections": [{"heading": "", "text": content}],
    }


# ---------------------------------------------------------------------------
# Custom page templates
# ---------------------------------------------------------------------------

class FamoirDocTemplate(BaseDocTemplate):
    """Custom document template with Famoir branding."""

    def __init__(self, filename, storyteller_name: str = "", **kwargs):
        self.storyteller_name = storyteller_name
        self._page_count = 0
        super().__init__(filename, **kwargs)

    def afterPage(self):
        """Called after each page is drawn."""
        self._page_count += 1


def _draw_content_page(canvas_obj, doc):
    """Draw header/footer on content pages."""
    canvas_obj.saveState()

    # Page number at bottom center
    canvas_obj.setFont("Times-Roman", 9)
    canvas_obj.setFillColor(WARM_GRAY)
    page_num = canvas_obj.getPageNumber()
    canvas_obj.drawCentredString(
        doc.pagesize[0] / 2, 0.6 * inch,
        str(page_num)
    )

    # Subtle top rule
    canvas_obj.setStrokeColor(LIGHT_PEACH)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(
        1 * inch, doc.pagesize[1] - 0.65 * inch,
        doc.pagesize[0] - 1 * inch, doc.pagesize[1] - 0.65 * inch,
    )

    # Header: "Famoir" on the left
    canvas_obj.setFont("Times-Italic", 8)
    canvas_obj.setFillColor(WARM_GRAY)
    canvas_obj.drawString(1 * inch, doc.pagesize[1] - 0.55 * inch, "Famoir")

    # Header: storyteller name on the right
    if hasattr(doc, 'storyteller_name') and doc.storyteller_name:
        canvas_obj.drawRightString(
            doc.pagesize[0] - 1 * inch, doc.pagesize[1] - 0.55 * inch,
            doc.storyteller_name
        )

    canvas_obj.restoreState()


def _draw_title_page(canvas_obj, doc):
    """Title page has no header/footer."""
    pass


# ---------------------------------------------------------------------------
# Style definitions
# ---------------------------------------------------------------------------

def get_memoir_styles() -> dict:
    """Create Famoir memoir paragraph styles."""
    return {
        # Cover / title page
        "book_title": ParagraphStyle(
            "BookTitle",
            fontName="Times-Bold",
            fontSize=32,
            leading=40,
            textColor=DEEP_BROWN,
            alignment=TA_CENTER,
            spaceAfter=16,
        ),
        "book_subtitle": ParagraphStyle(
            "BookSubtitle",
            fontName="Times-Italic",
            fontSize=14,
            leading=20,
            textColor=WARM_GRAY,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "book_author": ParagraphStyle(
            "BookAuthor",
            fontName="Times-Roman",
            fontSize=16,
            leading=22,
            textColor=TERRACOTTA,
            alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "famoir_tagline": ParagraphStyle(
            "FamoirTagline",
            fontName="Times-Italic",
            fontSize=10,
            leading=14,
            textColor=WARM_GRAY,
            alignment=TA_CENTER,
        ),

        # Chapter elements
        "chapter_number": ParagraphStyle(
            "ChapterNumber",
            fontName="Times-Roman",
            fontSize=12,
            leading=16,
            textColor=TERRACOTTA,
            alignment=TA_CENTER,
            spaceBefore=72,
            spaceAfter=8,
        ),
        "chapter_title": ParagraphStyle(
            "ChapterTitle",
            fontName="Times-Bold",
            fontSize=24,
            leading=30,
            textColor=DEEP_BROWN,
            alignment=TA_CENTER,
            spaceAfter=20,
        ),
        "epigraph": ParagraphStyle(
            "Epigraph",
            fontName="Times-Italic",
            fontSize=12,
            leading=18,
            textColor=WARM_GRAY,
            alignment=TA_CENTER,
            leftIndent=48,
            rightIndent=48,
            spaceBefore=12,
            spaceAfter=36,
        ),

        # Section heading
        "section_heading": ParagraphStyle(
            "SectionHeading",
            fontName="Times-Bold",
            fontSize=16,
            leading=22,
            textColor=DEEP_BROWN,
            alignment=TA_LEFT,
            spaceBefore=24,
            spaceAfter=12,
        ),

        # Body text
        "body": ParagraphStyle(
            "MemoirBody",
            fontName="Times-Roman",
            fontSize=11.5,
            leading=18,
            textColor=DEEP_BROWN,
            alignment=TA_JUSTIFY,
            firstLineIndent=24,
            spaceAfter=10,
        ),
        "body_first": ParagraphStyle(
            "MemoirBodyFirst",
            fontName="Times-Roman",
            fontSize=11.5,
            leading=18,
            textColor=DEEP_BROWN,
            alignment=TA_JUSTIFY,
            firstLineIndent=0,  # No indent on first paragraph of section
            spaceAfter=10,
        ),

        # Decorative divider (used as text)
        "divider": ParagraphStyle(
            "Divider",
            fontName="Times-Roman",
            fontSize=14,
            leading=20,
            textColor=TERRACOTTA,
            alignment=TA_CENTER,
            spaceBefore=16,
            spaceAfter=16,
        ),
    }


# ---------------------------------------------------------------------------
# PDF generation
# ---------------------------------------------------------------------------

def generate_memoir_pdf(
    chapters: List[dict],
    storyteller_name: str = "",
    book_title: str = "My Memoir",
) -> bytes:
    """Generate a complete memoir PDF from chapter data.

    Args:
        chapters: List of chapter dicts from Firestore (with 'content', 'title', etc.)
        storyteller_name: Name displayed on cover and headers
        book_title: Book title for the cover page

    Returns:
        PDF file contents as bytes
    """
    buffer = io.BytesIO()
    page_size = letter
    margin = 1 * inch

    doc = FamoirDocTemplate(
        buffer,
        storyteller_name=storyteller_name,
        pagesize=page_size,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=0.85 * inch,
        bottomMargin=0.85 * inch,
        title=book_title,
        author=storyteller_name,
        subject=f"A memoir by {storyteller_name}, created with Famoir",
        creator="Famoir — AI-powered memoir platform",
    )

    # Define page templates
    content_frame = Frame(
        margin, 0.85 * inch,
        page_size[0] - 2 * margin, page_size[1] - 1.7 * inch,
        id="content",
    )
    title_frame = Frame(
        margin, 0.85 * inch,
        page_size[0] - 2 * margin, page_size[1] - 1.7 * inch,
        id="title",
    )

    doc.addPageTemplates([
        PageTemplate(id="title_page", frames=[title_frame], onPage=_draw_title_page),
        PageTemplate(id="content_page", frames=[content_frame], onPage=_draw_content_page),
    ])

    styles = get_memoir_styles()
    story = []

    # ===== COVER PAGE =====
    story.append(Spacer(1, 2.2 * inch))
    story.append(Paragraph(
        _escape_xml(book_title),
        styles["book_title"],
    ))
    story.append(Spacer(1, 12))

    if storyteller_name:
        story.append(Paragraph(
            f"The Story of {_escape_xml(storyteller_name)}",
            styles["book_subtitle"],
        ))
    story.append(Spacer(1, 36))
    story.append(Paragraph(
        "\u2014 \u2022 \u2014",
        styles["divider"],
    ))
    story.append(Spacer(1, 36))
    story.append(Paragraph(
        "Created with Famoir",
        styles["famoir_tagline"],
    ))
    story.append(Paragraph(
        "Where every family story becomes a treasure",
        styles["famoir_tagline"],
    ))

    # Switch to content template for remaining pages
    story.append(NextPageTemplate("content_page"))
    story.append(PageBreak())

    # ===== CHAPTERS =====
    for idx, ch_raw in enumerate(chapters):
        ch = parse_chapter_content(
            ch_raw.get("content", ""),
            meta=ch_raw,
        )

        # Chapter number
        story.append(Paragraph(
            f"Chapter {idx + 1}",
            styles["chapter_number"],
        ))

        # Chapter title
        story.append(Paragraph(
            _escape_xml(ch.get("title", f"Chapter {idx + 1}")),
            styles["chapter_title"],
        ))

        # Epigraph
        epigraph = ch.get("epigraph", "") or ch_raw.get("epigraph", "")
        if epigraph:
            story.append(Paragraph(
                f"\u201c{_escape_xml(epigraph)}\u201d",
                styles["epigraph"],
            ))

        # Decorative divider after title block
        story.append(Paragraph(
            "\u2014 \u2022 \u2014",
            styles["divider"],
        ))

        # Sections
        sections = ch.get("sections", [])
        for sec_idx, section in enumerate(sections):
            heading = section.get("heading", "")
            text = section.get("text", "")

            if heading:
                story.append(Paragraph(
                    _escape_xml(heading),
                    styles["section_heading"],
                ))

            # Embed section photo if available
            image_url = section.get("image_url", "")
            if image_url:
                img_flowable = _image_from_data_url(image_url)
                if img_flowable:
                    story.append(Spacer(1, 6))
                    story.append(img_flowable)
                    story.append(Spacer(1, 10))

            # Split text into paragraphs
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            for p_idx, para in enumerate(paragraphs):
                # First paragraph of section: no indent
                style = styles["body_first"] if p_idx == 0 else styles["body"]
                story.append(Paragraph(
                    _escape_xml(para),
                    style,
                ))

            # Add spacing between sections (but not after last)
            if sec_idx < len(sections) - 1:
                story.append(Spacer(1, 12))
                story.append(Paragraph(
                    "\u2022",
                    styles["divider"],
                ))
                story.append(Spacer(1, 6))

        # Page break between chapters (but not after last)
        if idx < len(chapters) - 1:
            story.append(PageBreak())

    # ===== COLOPHON (last page) =====
    story.append(PageBreak())
    story.append(Spacer(1, 2.5 * inch))
    story.append(Paragraph(
        "This memoir was created with Famoir",
        ParagraphStyle(
            "ColophonTitle",
            fontName="Times-Italic",
            fontSize=12,
            leading=18,
            textColor=WARM_GRAY,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
    ))
    story.append(Paragraph(
        "An AI-powered platform that transforms spoken memories<br/>into literary keepsakes for generations to come.",
        ParagraphStyle(
            "ColophonBody",
            fontName="Times-Roman",
            fontSize=10,
            leading=15,
            textColor=WARM_GRAY,
            alignment=TA_CENTER,
            spaceAfter=24,
        ),
    ))
    story.append(Paragraph(
        "\u2014 \u2022 \u2014",
        styles["divider"],
    ))
    story.append(Paragraph(
        "famoir.app",
        ParagraphStyle(
            "ColophonUrl",
            fontName="Times-Roman",
            fontSize=10,
            leading=14,
            textColor=TERRACOTTA,
            alignment=TA_CENTER,
        ),
    ))

    # Build PDF
    doc.build(story)
    return buffer.getvalue()


def _image_from_data_url(data_url: str, max_width: float = 4.0 * inch) -> Optional[Image]:
    """Decode a base64 data URL and return a reportlab Image flowable."""
    try:
        if "," in data_url:
            b64_part = data_url.split(",", 1)[1]
        else:
            b64_part = data_url
        img_bytes = base64.b64decode(b64_part)
        img_buf = io.BytesIO(img_bytes)

        # Read dimensions to compute aspect ratio
        from reportlab.lib.utils import ImageReader
        reader = ImageReader(img_buf)
        iw, ih = reader.getSize()
        aspect = ih / iw if iw else 1.0
        display_w = min(max_width, iw)
        display_h = display_w * aspect
        # Cap height to avoid dominating the page
        max_h = 3.0 * inch
        if display_h > max_h:
            display_h = max_h
            display_w = display_h / aspect

        img_buf.seek(0)
        return Image(img_buf, width=display_w, height=display_h, hAlign="CENTER")
    except Exception as e:
        print(f"⚠️ PDF image embed failed: {e}")
        return None


def _escape_xml(text: str) -> str:
    """Escape XML special characters for reportlab Paragraph objects."""
    if not text:
        return ""
    return (
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
