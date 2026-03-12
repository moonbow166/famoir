import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Download, PlusCircle, BookOpen, ArrowLeft, ChevronLeft, ChevronRight, List, Loader2, Home } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:8000"
);

type ChapterSection = {
  heading: string;
  text: string;
  image_url?: string | null;
};

type ChapterData = {
  id?: string;
  epigraph?: string;
  title: string;
  sections: ChapterSection[];
  order?: number;
};

export default function MemoirPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, getToken } = useAuth();
  const sessionState = location.state as {
    sessionId?: string;
    chapter?: string | ChapterData;
    images?: string[];
    storytellerName?: string;
    book_id?: string;
    chapter_id?: string;
    user_id?: string;
  } | null;

  const [allChapters, setAllChapters] = useState<ChapterData[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const [exporting, setExporting] = useState(false);

  const storytellerName = sessionState?.storytellerName || "Rose";
  const bookId = sessionState?.book_id || "";
  // Fall back to auth user id if not in route state
  const userId = sessionState?.user_id || user?.uid || "";

  const parseChapter = (raw: string | undefined, meta?: any): ChapterData => {
    if (!raw) return { title: "Untitled", sections: [{ heading: "", text: "No content available." }] };

    // Try JSON parse
    try {
      const parsed = JSON.parse(raw);
      if (parsed.title && parsed.sections) {
        return { ...parsed, id: meta?.id, order: meta?.order };
      }
    } catch {}

    // Try extracting JSON from text
    try {
      const match = raw.match(/\{[\s\S]*"title"[\s\S]*"sections"[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.title && parsed.sections) {
          return { ...parsed, id: meta?.id, order: meta?.order };
        }
      }
    } catch {}

    // Fallback: raw text as single section
    return {
      id: meta?.id,
      title: meta?.title || "Your Memoir Chapter",
      epigraph: meta?.epigraph || "",
      order: meta?.order,
      sections: [{ heading: "", text: raw }],
    };
  };

  const loadFromSessionState = () => {
    if (!sessionState?.chapter) return;
    if (typeof sessionState.chapter === "object" && "title" in sessionState.chapter) {
      setAllChapters([sessionState.chapter as ChapterData]);
    } else if (typeof sessionState.chapter === "string") {
      setAllChapters([parseChapter(sessionState.chapter)]);
    }
  };

  // Parse chapter data from various sources
  useEffect(() => {
    if (bookId && userId) {
      (async () => {
        try {
          const token = await getToken();
          const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(`${API_BASE}/api/users/${userId}/books/${bookId}/chapters`, { headers });
          if (!res.ok) {
            console.warn(`Memoir chapters fetch failed (${res.status})`);
            loadFromSessionState();
            return;
          }
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const parsed = data.map((ch: any) => parseChapter(ch.content, ch));
            setAllChapters(parsed);
            if (sessionState?.chapter_id) {
              const idx = data.findIndex((c: any) => c.id === sessionState.chapter_id);
              if (idx >= 0) setActiveIndex(idx);
            }
            return;
          }
        } catch (e) {
          console.warn("Failed to fetch chapters from API:", e);
        }
        loadFromSessionState();
      })();
    } else {
      loadFromSessionState();
    }
  }, [bookId, userId]);

  const chapter = allChapters[activeIndex] || { title: "Loading...", sections: [] };
  const hasMultiple = allChapters.length > 1;

  const goToChapter = (idx: number) => {
    setActiveIndex(idx);
    setShowToc(false);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDownloadPdf = async () => {
    if (!bookId || !userId) {
      alert("To export PDF, please start a new conversation from the Dashboard. This chapter will then be saved and exportable.");
      return;
    }
    setExporting(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/users/${userId}/books/${bookId}/export-pdf`, { headers });
      if (!res.ok) {
        console.error(`PDF export failed: ${res.status}`);
        alert("PDF export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Famoir_${storytellerName.replace(/[^a-zA-Z0-9 _-]/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF download error:", e);
      alert("Could not download PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--cream))" }}>
      {/* ===== TOP BAR ===== */}
      <div
        className="flex items-center justify-between px-5 py-3 gap-3 shrink-0 sticky top-0 z-20"
        style={{ background: "hsl(var(--warm-white))", borderBottom: "1px solid hsl(var(--border))", boxShadow: "0 2px 8px rgba(61,44,46,0.06)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => bookId ? navigate("/dashboard") : navigate("/")}
            className="shrink-0"
            style={{ color: "hsl(var(--warm-gray))" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <BookOpen className="w-5 h-5 shrink-0" style={{ color: "hsl(var(--terracotta))" }} />
          <div className="min-w-0">
            <p className="font-body text-xs font-semibold truncate" style={{ color: "hsl(var(--warm-gray))" }}>
              {hasMultiple ? `Chapter ${activeIndex + 1} of ${allChapters.length}` : "Memoir"}
            </p>
            <p className="font-display font-bold text-base leading-tight truncate" style={{ color: "hsl(var(--deep-brown))" }}>
              {chapter.title}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasMultiple && (
            <button
              onClick={() => setShowToc(!showToc)}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: showToc ? "hsl(var(--terracotta))" : "hsl(var(--muted))",
                color: showToc ? "white" : "hsl(var(--warm-gray))",
              }}
              aria-label="Table of Contents"
            >
              <List className="w-4 h-4" />
            </button>
          )}
          <button
              onClick={handleDownloadPdf}
              disabled={exporting}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              style={{
                background: exporting ? "hsl(var(--terracotta))" : "hsl(var(--muted))",
                color: exporting ? "white" : "hsl(var(--warm-gray))",
                opacity: exporting ? 0.8 : 1,
              }}
              aria-label="Download PDF"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
        </div>
      </div>

      {/* ===== TABLE OF CONTENTS DRAWER ===== */}
      {showToc && (
        <div
          className="sticky top-[57px] z-10 px-5 py-4 overflow-y-auto"
          style={{
            maxHeight: "50vh",
            background: "hsl(var(--warm-white))",
            borderBottom: "1px solid hsl(var(--border))",
            boxShadow: "0 4px 16px rgba(61,44,46,0.1)",
          }}
        >
          <p className="font-body text-sm font-semibold mb-3" style={{ color: "hsl(var(--warm-gray))" }}>
            Table of Contents
          </p>
          <div className="flex flex-col gap-1">
            {allChapters.map((ch, i) => (
              <button
                key={i}
                onClick={() => goToChapter(i)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all w-full"
                style={{
                  background: i === activeIndex ? "hsl(var(--light-peach))" : "transparent",
                  color: i === activeIndex ? "hsl(var(--terracotta))" : "hsl(var(--deep-brown))",
                }}
              >
                <span className="font-display font-bold text-sm shrink-0 w-6 text-center">{ch.order || i + 1}</span>
                <span className="font-body text-sm truncate">{ch.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex flex-1">
        <div ref={contentRef} className="flex-1 overflow-y-auto pb-24">
          <div className="max-w-2xl mx-auto px-5 md:px-8 py-8">
            {/* Epigraph */}
            {chapter.epigraph && (
              <blockquote
                className="mb-6 pl-5 italic"
                style={{
                  borderLeft: "3px solid hsl(var(--terracotta))",
                  color: "hsl(var(--warm-gray))",
                  fontFamily: "'Lora', Georgia, serif",
                  fontSize: "1.1rem",
                  lineHeight: 1.8,
                }}
              >
                "{chapter.epigraph}"
              </blockquote>
            )}

            {/* Chapter title */}
            <h1
              className="font-display font-bold mb-6 leading-tight"
              style={{ fontSize: "clamp(1.7rem, 5vw, 2.4rem)", color: "hsl(var(--deep-brown))" }}
            >
              {chapter.title}
            </h1>

            {/* Chapter sections */}
            {chapter.sections.map((section, i) => (
              <div key={i} className="mb-8">
                {section.heading && (
                  <h2
                    className="font-display font-bold mb-4"
                    style={{ fontSize: "1.4rem", color: "hsl(var(--deep-brown))" }}
                  >
                    {section.heading}
                  </h2>
                )}

                {section.image_url && (
                  <figure className="mb-6 rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
                    <img
                      src={section.image_url}
                      alt={`Illustration for ${section.heading || "this section"}`}
                      className="w-full"
                      style={{ maxHeight: 280, objectFit: "cover" }}
                    />
                  </figure>
                )}

                {section.text.split("\n\n").map((para, j) => (
                  <p
                    key={j}
                    className="leading-relaxed mb-5"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      fontSize: "1.1rem",
                      color: "hsl(var(--deep-brown))",
                      lineHeight: 1.9,
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            ))}

            {/* Chapter navigation (prev/next) — desktop */}
            {hasMultiple && (
              <div className="hidden md:flex items-center justify-between mt-10 mb-6">
                <button
                  onClick={() => goToChapter(activeIndex - 1)}
                  disabled={activeIndex === 0}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl font-body font-semibold text-sm transition-all"
                  style={{
                    background: "hsl(var(--warm-white))",
                    color: activeIndex === 0 ? "hsl(var(--warm-gray) / 0.4)" : "hsl(var(--deep-brown))",
                    border: "2px solid hsl(var(--border))",
                    opacity: activeIndex === 0 ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                  {activeIndex + 1} / {allChapters.length}
                </span>
                <button
                  onClick={() => goToChapter(activeIndex + 1)}
                  disabled={activeIndex === allChapters.length - 1}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl font-body font-semibold text-sm transition-all"
                  style={{
                    background: "hsl(var(--warm-white))",
                    color: activeIndex === allChapters.length - 1 ? "hsl(var(--warm-gray) / 0.4)" : "hsl(var(--deep-brown))",
                    border: "2px solid hsl(var(--border))",
                    opacity: activeIndex === allChapters.length - 1 ? 0.5 : 1,
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Continue story CTA — desktop only */}
            <div
              className="hidden md:block rounded-2xl p-8 text-center mt-6"
              style={{ background: "var(--gradient-hero)", border: "1px solid hsl(var(--border))" }}
            >
              <h3 className="font-display font-bold text-2xl mb-3" style={{ color: "hsl(var(--deep-brown))" }}>
                Continue {storytellerName}'s Story
              </h3>
              <p className="font-body mb-6" style={{ fontSize: "1rem", color: "hsl(var(--warm-gray))" }}>
                There are more chapters waiting to be told.
              </p>
              <button
                onClick={() => bookId ? navigate("/dashboard") : navigate("/setup")}
                className="btn-primary gap-2"
                style={{ minHeight: 52 }}
              >
                {bookId ? <Home className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                {bookId ? "Back to Dashboard" : "New Conversation"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== STICKY BOTTOM BAR (mobile) ===== */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between px-5 gap-4 md:hidden"
        style={{
          height: 72,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "hsl(var(--warm-white))",
          borderTop: "1px solid hsl(var(--border))",
          boxShadow: "0 -4px 20px rgba(61,44,46,0.08)",
        }}
      >
        {hasMultiple && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToChapter(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--warm-gray))", opacity: activeIndex === 0 ? 0.4 : 1 }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-body text-xs" style={{ color: "hsl(var(--warm-gray))" }}>{activeIndex + 1}/{allChapters.length}</span>
            <button
              onClick={() => goToChapter(Math.min(allChapters.length - 1, activeIndex + 1))}
              disabled={activeIndex === allChapters.length - 1}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "hsl(var(--muted))", color: "hsl(var(--warm-gray))", opacity: activeIndex === allChapters.length - 1 ? 0.4 : 1 }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
        <button
          onClick={() => bookId ? navigate("/dashboard") : navigate("/setup")}
          className="btn-primary flex-1 justify-center gap-2"
          style={{ height: 48, fontSize: "1rem" }}
        >
          {bookId ? <Home className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
          {bookId ? "Back to Dashboard" : "New Conversation"}
        </button>
      </div>
    </div>
  );
}
