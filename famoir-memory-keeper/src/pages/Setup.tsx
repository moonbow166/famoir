import { useState, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Mic, MicOff, ChevronRight, Heart, Briefcase, Star, Coffee, MessageCircle, BookOpen, ArrowLeft, Camera, X, Image } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";


const topics = [
  { id: "childhood", icon: Star, label: "Childhood", emoji: "🌟", desc: "Growing up, school days, and early memories" },
  { id: "career", icon: Briefcase, label: "Career", emoji: "💼", desc: "Work life, achievements, and life lessons" },
  { id: "love", icon: Heart, label: "Love Story", emoji: "❤️", desc: "Romance, marriage, and family life" },
  { id: "traditions", icon: Coffee, label: "Family Traditions", emoji: "☕", desc: "Holidays, rituals, and recipes" },
  { id: "free", icon: MessageCircle, label: "Free Conversation", emoji: "💬", desc: "No topic — just talk and see where it goes" },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const incomingState = location.state as { book_id?: string; user_id?: string } | null;
  const [name, setName] = useState(() => localStorage.getItem("famoir_name") || "");
  const [topic, setTopic] = useState("");
  const [showNameEdit, setShowNameEdit] = useState(!localStorage.getItem("famoir_name"));
  const [micState, setMicState] = useState<"idle" | "testing" | "granted" | "denied">("idle");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const testMic = async () => {
    setMicState("testing");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
    } catch {
      setMicState("denied");
    }
  };

  /** Read a File as a stable data URL (more reliable than blob URLs across browsers) */
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /** Compress an image file: resize to max 1600px on longest side, JPEG quality 0.8 */
  const compressImage = (file: File, maxDim = 1600, quality = 0.8): Promise<File> =>
    new Promise((resolve, reject) => {
      // Skip compression for small files (< 500KB) and GIFs
      if (file.size < 500 * 1024 || file.type === "image/gif") {
        resolve(file);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        // Only resize if exceeding maxDim
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
            resolve(compressed);
          },
          "image/jpeg",
          quality
        );
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => { resolve(file); };
      img.src = URL.createObjectURL(file);
    });

  // Supported formats and size limit
  const SUPPORTED_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const MAX_FILE_SIZE_MB = 20; // Raised from 10MB since we compress before sending
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
  const [photoError, setPhotoError] = useState<string>("");

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPhotoError("");

    // Validate each file
    const validFiles: File[] = [];
    for (const file of files) {
      if (!SUPPORTED_FORMATS.includes(file.type)) {
        setPhotoError(`"${file.name}" is not supported. Use JPG, PNG, WebP, or GIF.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setPhotoError(`"${file.name}" is too large (max ${MAX_FILE_SIZE_MB}MB).`);
        continue;
      }
      validFiles.push(file);
    }

    const filesToAdd = validFiles.slice(0, 5 - photos.length);
    const newPhotos = await Promise.all(
      filesToAdd.map(async (file) => {
        const compressed = await compressImage(file);
        return {
          file: compressed,
          preview: await fileToDataUrl(compressed), // data URL — no revocation issues
        };
      })
    );
    setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  /** Extract raw base64 from a data URL for WebSocket transmission */
  const dataUrlToBase64 = (dataUrl: string): string => dataUrl.split(",")[1];

  const canBegin = name.trim().length > 0;

  const handleBegin = async () => {
    // Persist name for future sessions
    if (name.trim()) localStorage.setItem("famoir_name", name.trim());
    // Extract raw base64 from data URLs for WebSocket transmission
    const photosB64 = photos.map((p) => dataUrlToBase64(p.preview));
    const photoPreviews = photos.map((p) => p.preview); // full data URLs for display
    navigate("/session", {
      state: {
        name, relationship: "myself", topic, photos: photosB64,
        photoPreviews,
        book_id: incomingState?.book_id || "",
        user_id: user?.uid || incomingState?.user_id || "",
      },
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)" }}
    >
      {/* Top nav bar */}
      <div className="flex items-center justify-between px-5 py-2.5 shrink-0">
        <Link
          to="/"
          className="flex items-center gap-2 font-body font-semibold"
          style={{ color: "hsl(var(--warm-gray))", fontSize: "0.95rem" }}
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </Link>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: "hsl(var(--terracotta))" }} />
          <span className="font-display font-bold text-lg" style={{ color: "hsl(var(--deep-brown))" }}>Famoir</span>
        </div>
      </div>

      {/* Main content — designed to fit in one viewport */}
      <main className="flex-1 px-5 pb-4 flex flex-col items-center">
        <div className="w-full max-w-lg flex flex-col gap-3">

          {/* Hero + inline name */}
          <div className="text-center pt-2 animate-fade-in-up">
            <h1
              className="font-display font-bold mb-1"
              style={{ fontSize: "clamp(1.5rem, 4.5vw, 2rem)", color: "hsl(var(--deep-brown))", lineHeight: 1.15 }}
            >
              Let's hear your story
            </h1>
            {/* Inline name — shows saved name or editable input */}
            {name && !showNameEdit ? (
              <p className="font-body" style={{ fontSize: "0.95rem", color: "hsl(var(--warm-gray))" }}>
                Hi, <span className="font-semibold" style={{ color: "hsl(var(--terracotta))" }}>{name}</span>!{" "}
                <button
                  onClick={() => setShowNameEdit(true)}
                  className="underline text-sm"
                  style={{ color: "hsl(var(--warm-gray))" }}
                >
                  not you?
                </button>
              </p>
            ) : (
              <div className="flex items-center gap-2 justify-center mt-1.5">
                <input
                  type="text"
                  className="rounded-xl px-4 py-2 font-body outline-none text-center"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  style={{
                    width: 200,
                    fontSize: "1rem",
                    background: "hsl(var(--warm-white))",
                    border: "1.5px solid hsl(var(--border))",
                    color: "hsl(var(--deep-brown))",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "hsl(var(--terracotta))")}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(var(--border))")}
                  autoFocus={!name}
                />
                {name.trim() && showNameEdit && (
                  <button
                    onClick={() => { localStorage.setItem("famoir_name", name.trim()); setShowNameEdit(false); }}
                    className="px-3 py-2 rounded-xl font-body font-semibold text-sm"
                    style={{ background: "hsl(var(--terracotta))", color: "hsl(var(--cream))" }}
                  >
                    OK
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 1. Microphone — required, top priority */}
          <div
            className="rounded-2xl px-4 py-3 animate-fade-in-up"
            style={{
              animationDelay: "0.05s",
              background: micState === "granted"
                ? "hsl(115 12% 94%)"
                : micState === "denied"
                ? "hsl(0 72% 96%)"
                : "hsl(var(--warm-white))",
              border: `1.5px solid ${micState === "granted" ? "hsl(var(--sage))" : micState === "denied" ? "hsl(0 72% 80%)" : "hsl(var(--border))"}`,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: micState === "granted" ? "hsl(var(--sage))" : micState === "denied" ? "hsl(0 65% 55%)" : "hsl(var(--terracotta))",
                }}
              >
                {micState === "denied" ? (
                  <MicOff className="w-[18px] h-[18px]" style={{ color: "white" }} />
                ) : (
                  <Mic className="w-[18px] h-[18px]" style={{ color: "white" }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-body font-semibold text-sm leading-tight" style={{ color: "hsl(var(--deep-brown))" }}>
                  {micState === "idle" && "Microphone access"}
                  {micState === "testing" && "Checking..."}
                  {micState === "granted" && "Microphone ready"}
                  {micState === "denied" && "Microphone blocked"}
                </p>
                <p className="font-body text-xs leading-tight mt-0.5" style={{ color: "hsl(var(--warm-gray))" }}>
                  {micState === "idle" && "Required for voice conversation"}
                  {micState === "testing" && "Allow access when prompted"}
                  {micState === "granted" && "All set — you're good to go"}
                  {micState === "denied" && "Check browser settings to enable"}
                </p>
              </div>
              {micState !== "granted" && (
                <button
                  onClick={testMic}
                  disabled={micState === "testing"}
                  className="shrink-0 px-4 py-2 rounded-xl font-body font-semibold text-sm transition-colors"
                  style={{
                    background: "hsl(var(--terracotta))",
                    color: "white",
                    opacity: micState === "testing" ? 0.6 : 1,
                  }}
                >
                  {micState === "testing" ? "..." : "Test"}
                </button>
              )}
            </div>
          </div>

          {/* 2. Customize session — optional photos + topic grouped */}
          <div
            className="rounded-2xl px-4 py-3 animate-fade-in-up flex flex-col gap-2.5"
            style={{
              animationDelay: "0.1s",
              background: "hsl(var(--warm-white))",
              border: "1.5px solid hsl(var(--border))",
            }}
          >
            <p className="font-body text-[10px] font-semibold" style={{ color: "hsl(var(--warm-gray))", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Optional — customize your session
            </p>

            {/* Photos */}
            <div>
              <p className="font-body font-semibold text-sm mb-1.5" style={{ color: "hsl(var(--deep-brown))" }}>
                Share old photos <span className="font-normal text-xs" style={{ color: "hsl(var(--warm-gray))" }}>up to 5</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div
                    key={i}
                    className="relative rounded-xl overflow-hidden"
                    style={{ width: 52, height: 52, border: "1.5px solid hsl(var(--border))" }}
                  >
                    <img src={p.preview} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: "hsl(0 0% 0% / 0.5)" }}
                    >
                      <X className="w-2.5 h-2.5" style={{ color: "white" }} />
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors"
                    style={{
                      width: 52, height: 52,
                      border: "1.5px dashed hsl(var(--border))",
                      color: "hsl(var(--warm-gray))",
                    }}
                  >
                    <Image className="w-4 h-4" />
                    <span className="text-[10px] font-body">Add</span>
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif" multiple onChange={handlePhotoSelect} className="hidden" />
              {photoError && <p className="font-body text-xs mt-1" style={{ color: "hsl(0 65% 50%)" }}>{photoError}</p>}
              {photos.length > 0 && <p className="font-body text-xs mt-1" style={{ color: "hsl(var(--warm-gray))" }}>{photos.length}/5 photos</p>}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "hsl(var(--border) / 0.6)" }} />

            {/* Topic */}
            <div>
              <p className="font-body font-semibold text-sm mb-1.5" style={{ color: "hsl(var(--deep-brown))" }}>
                Pick a topic
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTopic(topic === t.id ? "" : t.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-150"
                    style={{
                      background: topic === t.id ? "hsl(var(--light-peach))" : "transparent",
                      border: topic === t.id ? "1.5px solid hsl(var(--terracotta))" : "1.5px solid hsl(var(--border))",
                    }}
                  >
                    <span className="text-xs">{t.emoji}</span>
                    <span className="font-body" style={{ fontSize: "0.8rem", color: topic === t.id ? "hsl(var(--terracotta))" : "hsl(var(--deep-brown))" }}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <button
              onClick={handleBegin}
              disabled={!canBegin}
              className="btn-primary w-full justify-center gap-2"
              style={{
                fontSize: "1.05rem",
                height: 50,
                opacity: canBegin ? 1 : 0.45,
                cursor: canBegin ? "pointer" : "not-allowed",
                borderRadius: "14px",
              }}
            >
              Begin Conversation
              <ChevronRight className="w-5 h-5" />
            </button>
            <p className="text-center font-body text-xs mt-1.5" style={{ color: "hsl(var(--warm-gray))" }}>
              ~20–30 min · Pause anytime
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
