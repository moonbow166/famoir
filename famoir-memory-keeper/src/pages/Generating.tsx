import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { CheckCircle, Clock, ImageIcon, Sparkles, Home } from "lucide-react";

const STAGES = [
  { id: "transcribing", label: "Transcribing", desc: "Converting your voice to text", icon: "🎙️" },
  { id: "writing", label: "Writing", desc: "Crafting your narrative chapter", icon: "✍️" },
  { id: "illustrating", label: "Illustrating", desc: "Generating memory illustrations", icon: "🎨" },
  { id: "ready", label: "Almost Ready", desc: "Putting the final touches", icon: "✨" },
];

export default function GeneratingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionState = location.state as {
    sessionId?: string;
    chapter?: string;
    images?: string[];
    storytellerName?: string;
    seconds?: number;
    sceneCount?: number;
    photoCount?: number;
    topic?: string;
    book_id?: string;
    chapter_id?: string;
    user_id?: string;
  } | null;

  const [currentStage, setCurrentStage] = useState(0);
  const [done, setDone] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("Your Chapter");

  // If we already have chapter data from Session page (came via WebSocket), process immediately
  const hasChapter = !!sessionState?.chapter;

  // Format duration
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    return mins > 0 ? `${mins} min` : `${s} sec`;
  };

  // Parse chapter title from chapter JSON if available
  useEffect(() => {
    if (sessionState?.chapter) {
      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(sessionState.chapter);
        if (parsed.title) setChapterTitle(parsed.title);
      } catch {
        // Try to extract title from text
        const titleMatch = sessionState.chapter.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch) setChapterTitle(titleMatch[1]);
      }
    }
  }, [sessionState?.chapter]);

  // Animate through stages (faster if we already have the chapter)
  useEffect(() => {
    const interval = hasChapter ? 800 : 2800;
    const stageTimer = setInterval(() => {
      setCurrentStage((s) => {
        if (s >= STAGES.length - 1) {
          clearInterval(stageTimer);
          setTimeout(() => setDone(true), hasChapter ? 500 : 1200);
          return s;
        }
        return s + 1;
      });
    }, interval);

    return () => clearInterval(stageTimer);
  }, [hasChapter]);

  const handleViewChapter = () => {
    navigate("/memoir", {
      state: {
        sessionId: sessionState?.sessionId,
        chapter: sessionState?.chapter,
        images: sessionState?.images,
        storytellerName: sessionState?.storytellerName,
        book_id: sessionState?.book_id,
        chapter_id: sessionState?.chapter_id,
        user_id: sessionState?.user_id,
      },
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="absolute top-5 left-6">
        <Link
          to="/"
          className="flex items-center gap-1.5 font-body text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          style={{ color: "hsl(var(--warm-gray))", background: "hsl(var(--warm-white))", border: "1px solid hsl(var(--border))" }}
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
      </div>

      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="text-5xl mb-4">📖</div>
          <h1
            className="font-display font-bold mb-3"
            style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", color: "hsl(var(--deep-brown))" }}
          >
            {done ? "Your Chapter Is Ready! 🎉" : "What a wonderful conversation!"}
          </h1>
          {!done && (
            <p className="font-body" style={{ fontSize: "1.1rem", color: "hsl(var(--warm-gray))" }}>
              We're crafting your illustrated memoir chapter right now...
            </p>
          )}
        </div>

        {/* Session stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { icon: Clock, label: "Duration", value: sessionState?.seconds ? formatDuration(sessionState.seconds) : "—" },
            { icon: ImageIcon, label: "Photos", value: sessionState?.photoCount ? `${sessionState.photoCount} photo${sessionState.photoCount !== 1 ? "s" : ""}` : "None" },
            { icon: Sparkles, label: "Topics", value: sessionState?.topic || "Free" },
          ].map((stat) => (
            <div key={stat.label} className="card-warm p-5 text-center animate-fade-in-up">
              <stat.icon className="w-6 h-6 mx-auto mb-2" style={{ color: "hsl(var(--terracotta))" }} />
              <p className="font-display font-bold text-xl" style={{ color: "hsl(var(--deep-brown))" }}>{stat.value}</p>
              <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Image carousel - show real session images if available */}
        {sessionState?.images && sessionState.images.length > 0 && (
          <div className="card-warm p-4 mb-8 animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <p className="font-body text-sm font-semibold mb-3 px-2" style={{ color: "hsl(var(--warm-gray))" }}>
              Scenes from your story
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {sessionState.images.map((img, i) => (
                <div
                  key={i}
                  className="shrink-0 rounded-xl overflow-hidden"
                  style={{
                    width: "160px",
                    height: "120px",
                    boxShadow: "var(--shadow-card)",
                    border: "2px solid hsl(var(--border))",
                  }}
                >
                  <img src={img} alt={`Memory ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage progress */}
        {!done ? (
          <div className="card-warm p-6 mb-8 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <p className="font-body text-sm font-semibold mb-5" style={{ color: "hsl(var(--warm-gray))" }}>
              Creating your chapter...
            </p>
            {/* Vertical stepper on mobile, horizontal on md+ */}
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
              {STAGES.map((stage, i) => {
                const isComplete = i < currentStage;
                const isActive = i === currentStage;
                const dotColor = isComplete
                  ? "hsl(var(--sage))"
                  : isActive
                  ? "hsl(var(--terracotta))"
                  : "hsl(var(--muted))";
                return (
                  <div key={stage.id} className="flex items-center gap-3 md:flex-1 md:flex-col md:text-center">
                    {/* Dot */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-500"
                      style={{
                        background: dotColor,
                        boxShadow: isActive ? "0 0 0 4px hsl(var(--terracotta) / 0.2)" : "none",
                      }}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-5 h-5" style={{ color: "hsl(var(--cream))" }} />
                      ) : (
                        <span className="text-lg">{stage.icon}</span>
                      )}
                    </div>
                    {/* Label + description */}
                    <div className="md:mt-2">
                      <p
                        className="font-body font-semibold text-sm transition-colors"
                        style={{ color: isActive ? "hsl(var(--terracotta))" : isComplete ? "hsl(var(--sage))" : "hsl(var(--warm-gray))" }}
                      >
                        {stage.label}
                      </p>
                      {isActive && (
                        <p className="font-body text-xs mt-0.5 animate-fade-in" style={{ color: "hsl(var(--warm-gray))" }}>
                          {stage.desc}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card-warm p-6 mb-8 text-center animate-scale-in" style={{ border: "2px solid hsl(var(--terracotta))" }}>
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-body text-lg font-semibold" style={{ color: "hsl(var(--deep-brown))" }}>
              "{chapterTitle}" is ready!
            </p>
          </div>
        )}

        {/* Fun fact */}
        {!done && (
          <div
            className="rounded-xl p-5 text-center animate-fade-in"
            style={{ background: "hsl(var(--light-peach))", border: "1px solid hsl(var(--amber))" }}
          >
            <p className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
              <span className="font-semibold" style={{ color: "hsl(var(--deep-brown))" }}>Did you know?</span>{" "}
              The average Famoir interview uncovers 3–5× more details than a written questionnaire.
            </p>
          </div>
        )}

        {/* CTA */}
        {done && (
          <button
            onClick={handleViewChapter}
            className="btn-primary w-full text-xl justify-center gap-3 animate-scale-in"
            style={{ boxShadow: "0 0 32px hsl(var(--terracotta) / 0.4)" }}
          >
            View Your Chapter ✨
          </button>
        )}
      </div>
    </div>
  );
}
