/**
 * BookPreview.tsx — Full-screen book-like preview with Download PDF button.
 *
 * Displays cover page + all chapters in a beautiful reading layout.
 * Accessed from Dashboard "Preview & Download" button.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Download, BookOpen, Loader2 } from "lucide-react";
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
  title: string;
  epigraph?: string;
  sections: ChapterSection[];
  order?: number;
};

export default function BookPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, getToken } = useAuth();

  const locState = location.state as {
    book_id?: string;
    user_id?: string;
    storyteller_name?: string;
    book_title?: string;
    scroll_to_chapter?: number;
  } | null;

  const scrollTarget = useRef(locState?.scroll_to_chapter ?? -1);

  const bookId = locState?.book_id || "";
  const userId = locState?.user_id || user?.uid || "";
  const storytellerName = locState?.storyteller_name || "My";
  const bookTitle = locState?.book_title || `${storytellerName}'s Memoir`;

  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const parseChapter = (raw: string | undefined, meta?: any): ChapterData => {
    if (!raw) return { title: "Untitled", sections: [{ heading: "", text: "No content." }] };
    try {
      const parsed = JSON.parse(raw);
      if (parsed.title && parsed.sections) return { ...parsed, id: meta?.id, order: meta?.order };
    } catch {}
    try {
      const match = raw.match(/\{[\s\S]*"title"[\s\S]*"sections"[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.title && parsed.sections) return { ...parsed, id: meta?.id, order: meta?.order };
      }
    } catch {}
    return { id: meta?.id, title: meta?.title || "Untitled", order: meta?.order, sections: [{ heading: "", text: raw }] };
  };

  useEffect(() => {
    if (!bookId || !userId) { setLoading(false); return; }
    (async () => {
      try {
        const token = await getToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/users/${userId}/books/${bookId}/chapters`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setChapters(data.map((ch: any) => parseChapter(ch.content, ch)));
          }
        }
      } catch (e) {
        console.warn("Failed to fetch chapters:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId, userId]);

  // Auto-scroll to a specific chapter if requested (e.g., from Dashboard chapter click)
  useEffect(() => {
    if (scrollTarget.current >= 0 && chapters.length > 0) {
      const el = document.getElementById(`chapter-${scrollTarget.current}`);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
      scrollTarget.current = -1;
    }
  }, [chapters]);

  const handleDownloadPdf = async () => {
    if (!bookId || !userId) return;
    setExporting(true);
    try {
      const token = await getToken();
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/users/${userId}/books/${bookId}/export-pdf`, { headers });
      if (!res.ok) { alert("PDF export failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Famoir_${storytellerName.replace(/[^a-zA-Z0-9 _-]/g, "")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Could not download PDF.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--cream))" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "hsl(var(--terracotta))" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--cream))" }}>
      {/* Top bar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: "hsl(var(--warm-white))", borderBottom: "1px solid hsl(var(--border))", boxShadow: "0 2px 8px rgba(61,44,46,0.06)" }}
      >
        <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2" style={{ color: "hsl(var(--warm-gray))" }}>
          <ArrowLeft className="w-5 h-5" />
          <span className="font-body text-sm">Dashboard</span>
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={exporting || !bookId}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-body font-semibold text-sm transition-all"
          style={{
            background: "hsl(var(--terracotta))",
            color: "white",
            opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download PDF
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-5 md:px-8 pb-20">
        {/* ===== BOOK COVER ===== */}
        <div
          className="my-12 mx-auto rounded-3xl overflow-hidden"
          style={{
            maxWidth: 420,
            background: "var(--gradient-hero)",
            border: "2px solid hsl(var(--border))",
            boxShadow: "0 12px 40px rgba(61,44,46,0.15)",
          }}
        >
          <div className="px-10 py-16 text-center">
            <BookOpen className="w-10 h-10 mx-auto mb-6" style={{ color: "hsl(var(--terracotta))" }} />
            <h1
              className="font-display font-bold leading-tight mb-4"
              style={{ fontSize: "clamp(1.8rem, 5vw, 2.4rem)", color: "hsl(var(--deep-brown))" }}
            >
              {bookTitle}
            </h1>
            <div className="w-16 h-0.5 mx-auto mb-4" style={{ background: "hsl(var(--terracotta))" }} />
            <p className="font-body" style={{ color: "hsl(var(--warm-gray))", fontSize: "1.05rem" }}>
              {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
            </p>
            <p className="font-body text-sm mt-6" style={{ color: "hsl(var(--warm-gray) / 0.7)" }}>
              Created with Famoir
            </p>
          </div>
        </div>

        {/* ===== TABLE OF CONTENTS ===== */}
        {chapters.length > 1 && (
          <div className="mb-12">
            <h2 className="font-display font-bold text-xl mb-4" style={{ color: "hsl(var(--deep-brown))" }}>
              Contents
            </h2>
            <div className="flex flex-col gap-2">
              {chapters.map((ch, i) => (
                <a
                  key={i}
                  href={`#chapter-${i}`}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl transition-colors"
                  style={{ color: "hsl(var(--deep-brown))" }}
                >
                  <span className="font-display font-bold text-lg w-8 text-center" style={{ color: "hsl(var(--terracotta))" }}>
                    {i + 1}
                  </span>
                  <span className="font-body text-base">{ch.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ===== CHAPTERS ===== */}
        {chapters.map((ch, i) => (
          <div key={i} id={`chapter-${i}`} className="mb-16">
            {/* Chapter divider */}
            <div className="flex items-center gap-4 mb-8">
              <div className="h-px flex-1" style={{ background: "hsl(var(--border))" }} />
              <span className="font-body text-xs font-semibold tracking-widest uppercase" style={{ color: "hsl(var(--warm-gray))" }}>
                Chapter {ch.order || i + 1}
              </span>
              <div className="h-px flex-1" style={{ background: "hsl(var(--border))" }} />
            </div>

            {/* Epigraph */}
            {ch.epigraph && (
              <blockquote
                className="mb-6 pl-5 italic"
                style={{
                  borderLeft: "3px solid hsl(var(--terracotta))",
                  color: "hsl(var(--warm-gray))",
                  fontFamily: "'Lora', Georgia, serif",
                  fontSize: "1.05rem",
                  lineHeight: 1.8,
                }}
              >
                "{ch.epigraph}"
              </blockquote>
            )}

            {/* Title */}
            <h2
              className="font-display font-bold mb-6 leading-tight"
              style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", color: "hsl(var(--deep-brown))" }}
            >
              {ch.title}
            </h2>

            {/* Sections */}
            {ch.sections.map((sec, j) => (
              <div key={j} className="mb-6">
                {sec.heading && (
                  <h3 className="font-display font-bold mb-3" style={{ fontSize: "1.2rem", color: "hsl(var(--deep-brown))" }}>
                    {sec.heading}
                  </h3>
                )}
                {sec.image_url && (
                  <figure className="my-4">
                    <img
                      src={sec.image_url}
                      alt=""
                      className="w-full rounded-2xl shadow-md"
                      style={{ maxHeight: 280, objectFit: "cover" }}
                    />
                  </figure>
                )}
                {sec.text.split("\n\n").map((para, k) => (
                  <p
                    key={k}
                    className="leading-relaxed mb-4"
                    style={{
                      fontFamily: "'Lora', Georgia, serif",
                      fontSize: "1.05rem",
                      color: "hsl(var(--deep-brown))",
                      lineHeight: 1.85,
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* ===== COLOPHON ===== */}
        <div className="text-center py-12">
          <div className="w-16 h-0.5 mx-auto mb-6" style={{ background: "hsl(var(--border))" }} />
          <BookOpen className="w-6 h-6 mx-auto mb-3" style={{ color: "hsl(var(--terracotta) / 0.5)" }} />
          <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray) / 0.6)" }}>
            Preserved with Famoir
          </p>
        </div>
      </div>
    </div>
  );
}
