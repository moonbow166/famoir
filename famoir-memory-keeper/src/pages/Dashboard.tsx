import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { BookOpen, Plus, Clock, FileText, ChevronRight, Loader2, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:8000"
);

type Chapter = {
  id: string;
  title: string;
  epigraph: string;
  order: number;
  created_at: string;
  session_id: string;
};

type Book = {
  id: string;
  title: string;
  storyteller_name: string;
  chapter_count: number;
  session_count: number;
  created_at: string;
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, signOut, isDevMode, getToken } = useAuth();
  const userId = user?.uid ?? "";

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  /** Build auth headers for API calls. */
  const authHeaders = async (): Promise<HeadersInit> => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Ensure user exists in Firestore, then fetch books
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setFetchError("");
        const headers = await authHeaders();

        // Auto-create user in Firestore if needed (idempotent)
        try {
          await fetch(`${API_BASE}/api/users`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              display_name: user?.displayName || "",
              email: user?.email || "",
            }),
          });
        } catch (e) {
          console.warn("User ensure failed (non-fatal):", e);
        }

        const res = await fetch(`${API_BASE}/api/users/${userId}/books`, { headers });
        if (!res.ok) {
          const errBody = await res.text();
          console.warn(`Books fetch failed (${res.status}):`, errBody);
          setFetchError(`Could not load books (${res.status})`);
          return;
        }
        const data = await res.json();
        if (!Array.isArray(data)) {
          console.warn("Unexpected books response:", data);
          setBooks([]);
          return;
        }
        setBooks(data);
        if (data.length > 0) {
          setActiveBookId(data[0].id);
        }
      } catch (e) {
        console.warn("Failed to fetch books:", e);
        setFetchError("Network error loading books");
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Fetch chapters when active book changes
  useEffect(() => {
    if (!activeBookId) return;
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch(`${API_BASE}/api/users/${userId}/books/${activeBookId}/chapters`, { headers });
        if (!res.ok) {
          console.warn(`Chapters fetch failed (${res.status})`);
          setChapters([]);
          return;
        }
        const data = await res.json();
        setChapters(Array.isArray(data) ? data : []);
      } catch (e) {
        console.warn("Failed to fetch chapters:", e);
        setChapters([]);
      }
    })();
  }, [userId, activeBookId]);

  const activeBook = books.find((b) => b.id === activeBookId);

  const handleNewSession = () => {
    // Pass book_id + user_id so the session can persist to the right book
    navigate("/setup", { state: { book_id: activeBookId, user_id: userId } });
  };

  const handleDeleteChapter = async (chapterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this chapter? This cannot be undone.")) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `${API_BASE}/api/users/${userId}/books/${activeBookId}/chapters/${chapterId}`,
        { method: "DELETE", headers }
      );
      if (res.ok) {
        setChapters((prev) => prev.filter((c) => c.id !== chapterId));
      }
    } catch (err) {
      console.warn("Delete failed:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)" }}
      >
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "hsl(var(--terracotta))" }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: "hsl(var(--terracotta))" }} />
          <span className="font-display font-bold text-lg" style={{ color: "hsl(var(--deep-brown))" }}>Famoir</span>
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 font-body text-sm"
          style={{ color: "hsl(var(--warm-gray))" }}
          title={user?.email || "Sign out"}
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-10 flex flex-col items-center">
        <div className="w-full max-w-lg flex flex-col gap-6">

          {/* Title */}
          <div className="text-center pt-2 pb-4 animate-fade-in-up">
            <h1
              className="font-display font-bold mb-2"
              style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", color: "hsl(var(--deep-brown))" }}
            >
              {activeBook ? activeBook.title || `${activeBook.storyteller_name}'s Memoir` : "Your Memoir"}
            </h1>
            {activeBook && (
              <p className="font-body" style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}>
                {activeBook.chapter_count} chapter{activeBook.chapter_count !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Error banner */}
          {fetchError && (
            <div
              className="px-4 py-3 rounded-xl font-body text-sm text-center"
              style={{ background: "hsl(0 70% 95%)", color: "#c0392b", border: "1px solid hsl(0 60% 85%)" }}
            >
              {fetchError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
            <button
              onClick={handleNewSession}
              className="btn-primary flex-1 justify-center gap-3"
              style={{ fontSize: "1rem", height: 48, borderRadius: "16px" }}
            >
              <Plus className="w-5 h-5" />
              New Story
            </button>
            {chapters.length > 0 && (
              <button
                onClick={() =>
                  navigate("/book-preview", {
                    state: {
                      book_id: activeBookId,
                      user_id: userId,
                      storyteller_name: activeBook?.storyteller_name || "",
                      book_title: activeBook?.title || `${activeBook?.storyteller_name || "My"}'s Memoir`,
                    },
                  })
                }
                className="flex items-center justify-center gap-2 px-5 rounded-2xl font-body font-semibold transition-all"
                style={{
                  height: 56,
                  fontSize: "0.95rem",
                  background: "hsl(var(--warm-white))",
                  color: "hsl(var(--deep-brown))",
                  border: "2px solid hsl(var(--border))",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <BookOpen className="w-5 h-5" />
                Preview
              </button>
            )}
          </div>

          {/* Chapters list */}
          {chapters.length === 0 ? (
            <div
              className="text-center py-12 rounded-2xl animate-fade-in-up"
              style={{
                animationDelay: "0.1s",
                background: "hsl(var(--warm-white))",
                border: "2px dashed hsl(var(--border))",
              }}
            >
              <div className="text-5xl mb-4">📖</div>
              <p className="font-body font-semibold mb-1" style={{ color: "hsl(var(--deep-brown))", fontSize: "1.1rem" }}>
                No chapters yet
              </p>
              <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                Start a conversation to create your first memoir chapter.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="font-body font-semibold" style={{ color: "hsl(var(--deep-brown))", fontSize: "1.05rem" }}>
                Chapters
              </p>
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  onClick={() => navigate("/book-preview", {
                    state: {
                      book_id: activeBookId,
                      user_id: userId,
                      storyteller_name: activeBook?.storyteller_name || "",
                      book_title: activeBook?.title || `${activeBook?.storyteller_name || "My"}'s Memoir`,
                      scroll_to_chapter: i,
                    },
                  })}
                  className="relative flex items-start gap-4 px-5 py-4 pr-10 rounded-2xl text-left transition-all w-full animate-fade-in-up"
                  style={{
                    animationDelay: `${0.1 + i * 0.05}s`,
                    background: "hsl(var(--warm-white))",
                    border: "2px solid hsl(var(--border))",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "hsl(var(--light-peach))", color: "hsl(var(--terracotta))" }}
                  >
                    <span className="font-display font-bold text-sm">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-semibold truncate" style={{ color: "hsl(var(--deep-brown))", fontSize: "1.05rem" }}>
                      {ch.title}
                    </p>
                    {ch.epigraph && (
                      <p className="font-body text-sm mt-1 italic line-clamp-2" style={{ color: "hsl(var(--warm-gray))" }}>
                        "{ch.epigraph}"
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="w-3.5 h-3.5" style={{ color: "hsl(var(--warm-gray))" }} />
                      <span className="font-body text-xs" style={{ color: "hsl(var(--warm-gray))" }}>
                        {formatDate(ch.created_at)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0 mt-2" style={{ color: "hsl(var(--warm-gray))" }} />
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDeleteChapter(ch.id, e)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-30 hover:opacity-100 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" style={{ color: "hsl(0 60% 50%)" }} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Multiple books selector (if user has more than one) */}
          {books.length > 1 && (
            <div className="mt-4">
              <p className="font-body text-sm font-semibold mb-2" style={{ color: "hsl(var(--warm-gray))" }}>
                Your Books
              </p>
              <div className="flex gap-2 flex-wrap">
                {books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setActiveBookId(b.id)}
                    className="px-4 py-2 rounded-xl font-body text-sm transition-all"
                    style={{
                      background: b.id === activeBookId ? "hsl(var(--terracotta))" : "hsl(var(--warm-white))",
                      color: b.id === activeBookId ? "white" : "hsl(var(--deep-brown))",
                      border: `2px solid ${b.id === activeBookId ? "hsl(var(--terracotta))" : "hsl(var(--border))"}`,
                    }}
                  >
                    {b.storyteller_name || b.title}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
