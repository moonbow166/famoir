import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Mic, MicOff, Lightbulb, BookOpen, Square, ChevronUp, ChevronDown, X, Loader2, Camera } from "lucide-react";

// Auto-derive WebSocket URL from current page location for production (Cloud Run)
const WS_URL = import.meta.env.VITE_WS_URL || (
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/chat`
    : "ws://localhost:8000/chat"
);
const API_BASE = import.meta.env.VITE_API_BASE || (
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? `${window.location.protocol}//${window.location.host}`
    : "http://localhost:8000"
);

// Target sample rate for Gemini Live API input
const TARGET_SAMPLE_RATE = 16000;
// Output sample rate from Gemini Live API
const OUTPUT_SAMPLE_RATE = 24000;

// Voice Activity Detection (VAD) thresholds
const VAD_SPEECH_THRESHOLD = 0.015;  // RMS level to detect speech
const VAD_SILENCE_TIMEOUT_MS = 1500; // How long silence before end-of-turn

type Message = {
  role: "ai" | "user";
  text: string;
  time: string;
  image?: string; // data URL for inline photo thumbnail
};

const TOPIC_HINTS = [
  "What was school like for you?",
  "Tell me about your best friend growing up",
  "What did your family do for fun?",
  "Describe your neighbourhood",
];

// --- Utility: Resample Float32 audio to 16kHz Int16 PCM ---
function resampleTo16kHz(float32Data: Float32Array, fromSampleRate: number): ArrayBuffer {
  const ratio = fromSampleRate / TARGET_SAMPLE_RATE;
  const newLength = Math.round(float32Data.length / ratio);
  const result = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, float32Data.length - 1);
    const frac = srcIndex - low;
    const sample = float32Data[low] * (1 - frac) + float32Data[high] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return result.buffer;
}

/**
 * Remove spurious spaces between CJK characters inserted by speech recognition.
 * Keeps spaces between CJK and non-CJK (e.g., "hello 你好" stays as-is).
 */
function cleanCJKSpaces(text: string): string {
  return text.replace(
    /([\u2E80-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\u3040-\u30FF])\s+([\u2E80-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF\u3040-\u30FF])/g,
    "$1$2"
  );
}

// --- Ring Buffer Audio Player (AudioWorklet-based) ---
// Uses a ring buffer on the audio thread for smooth, gap-free playback.
// Replaces per-chunk BufferSourceNode scheduling which caused timing drift.
class AudioPlayer {
  private audioCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private onPlayingChange: (playing: boolean) => void;
  private isPlaying = false;
  private playingCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastDataTime = 0;
  private initialized = false;

  constructor(onPlayingChange: (playing: boolean) => void) {
    this.onPlayingChange = onPlayingChange;
  }

  async init() {
    if (this.initialized) return;
    this.audioCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });

    try {
      await this.audioCtx.audioWorklet.addModule("/pcm-player-processor.js");
      this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-player-processor");
      this.workletNode.connect(this.audioCtx.destination);
      this.initialized = true;
    } catch (err) {
      console.warn("PCM Player Worklet unavailable:", err);
      this.initialized = true; // prevent retry loops
    }

    // Poll for isSpeaking: if no new data for 500ms, mark as not speaking
    this.playingCheckInterval = setInterval(() => {
      if (this.isPlaying && Date.now() - this.lastDataTime > 500) {
        this.isPlaying = false;
        this.onPlayingChange(false);
      }
    }, 200);
  }

  /** Play raw PCM audio from an ArrayBuffer (binary WebSocket frame) */
  async playBinaryChunk(pcmArrayBuffer: ArrayBuffer) {
    if (!this.initialized) await this.init();
    const ctx = this.audioCtx!;
    if (ctx.state === "suspended") await ctx.resume();

    if (this.workletNode) {
      // Send raw Int16 PCM directly to ring buffer worklet
      this.workletNode.port.postMessage(pcmArrayBuffer);
    }

    this.lastDataTime = Date.now();
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlayingChange(true);
    }
  }

  /** Play base64-encoded PCM audio (legacy fallback) */
  async playChunk(pcmBase64: string) {
    const binaryStr = atob(pcmBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    await this.playBinaryChunk(bytes.buffer);
  }

  stop() {
    // Send endOfAudio to instantly clear the ring buffer
    if (this.workletNode) {
      this.workletNode.port.postMessage({ command: "endOfAudio" });
    }
    this.isPlaying = false;
    this.onPlayingChange(false);
  }

  destroy() {
    this.stop();
    if (this.playingCheckInterval) {
      clearInterval(this.playingCheckInterval);
      this.playingCheckInterval = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.initialized = false;
  }
}


// Clean mic button — simple circle with subtle ring when active
function WaveformMic({ active, muted, level, onClick }: { active: boolean; muted: boolean; level: number; onClick: () => void }) {
  const color = muted ? "hsl(var(--warm-gray))" : "hsl(var(--terracotta))";
  const ringScale = active && !muted ? 1 + level * 0.15 : 1;
  return (
    <button
      onClick={onClick}
      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
      className="relative flex items-center justify-center transition-transform active:scale-95"
      style={{ width: 72, height: 72 }}
    >
      {/* Subtle expanding ring when speaking */}
      {active && !muted && (
        <span
          className="absolute rounded-full"
          style={{
            width: 64,
            height: 64,
            background: "transparent",
            border: `2px solid hsl(var(--terracotta) / ${0.2 + level * 0.3})`,
            transform: `scale(${ringScale})`,
            transition: "transform 0.1s ease-out, border-color 0.1s ease-out",
          }}
        />
      )}
      {/* Center mic icon */}
      <span
        className="relative z-10 flex items-center justify-center rounded-full transition-all"
        style={{
          width: 56,
          height: 56,
          background: color,
          boxShadow: active && !muted ? `0 0 12px hsl(var(--terracotta) / 0.3)` : "none",
        }}
      >
        {muted ? (
          <MicOff className="w-6 h-6" style={{ color: "hsl(var(--cream))" }} />
        ) : (
          <Mic className="w-6 h-6" style={{ color: "hsl(var(--cream))" }} />
        )}
      </span>
    </button>
  );
}

export default function SessionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { name?: string; relationship?: string; topic?: string; photos?: string[]; photoPreviews?: string[]; book_id?: string; user_id?: string } | null;
  const storytellerName = state?.name || "You";
  const relationship = state?.relationship || "";
  const topicPreference = state?.topic || "";
  const setupPhotos = state?.photos || [];
  const setupPhotoPreviews = state?.photoPreviews || [];
  const bookId = state?.book_id || "";
  const wsUserId = state?.user_id || "";

  // WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);

  // Chat state (transcript display)
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiTyping, setAiTyping] = useState(false);

  // Phase: "receptionist" (text chat) or "interviewer" (voice)
  const [phase, setPhase] = useState<"receptionist" | "interviewer">("interviewer");

  // Session state
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [sessionImages, setSessionImages] = useState<string[]>([]);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageVisible, setImageVisible] = useState(false);

  // Photo background state
  const [photosAnalyzed, setPhotosAnalyzed] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showTopicSheet, setShowTopicSheet] = useState(false);
  const [sceneCount, setSceneCount] = useState(0);
  const [endingSession, setEndingSession] = useState(false);
  const [generationTimedOut, setGenerationTimedOut] = useState(false);
  const generationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice state
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // AI is speaking
  const [interimText, setInterimText] = useState(""); // Partial user transcription
  const [aiStreamingText, setAiStreamingText] = useState(""); // Partial AI transcription (live subtitle)
  const [waitingForAi, setWaitingForAi] = useState(false); // User finished speaking, waiting for AI
  const [audioLevel, setAudioLevel] = useState(0); // 0-1 RMS level for waveform mic

  // Refs to mirror state for use inside closures (fixes stale closure bugs)
  const mutedRef = useRef(false);
  const secondsRef = useRef(0);
  const sessionImagesRef = useRef<string[]>([]);
  const sceneCountRef = useRef(0);
  const startMicStreamRef = useRef<() => void>(() => {});

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);

  // VAD refs (kept for potential manual-mode fallback; server-side VAD is primary)
  const vadActiveRef = useRef(false);
  const vadSilenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Camera viewfinder state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Panel controls
  const [panelSize, setPanelSize] = useState<"closed" | "default" | "max">("default");
  const [panelReveal, setPanelReveal] = useState(false);
  const [overlayHidden, setOverlayHidden] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragStartY = useRef<number | null>(null);
  const inputTranscriptionFinishedRef = useRef(false);
  const hasOutputTranscriptionInTurnRef = useRef(false);
  const suppressAudioRef = useRef(false); // Ignore audio chunks after interruption

  // Keep refs in sync with state (for use inside closures)
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { secondsRef.current = seconds; }, [seconds]);
  useEffect(() => { sessionImagesRef.current = sessionImages; }, [sessionImages]);
  useEffect(() => { sceneCountRef.current = sceneCount; }, [sceneCount]);

  // --- VAD: Voice Activity Detection ---
  // Server-side VAD (Gemini's built-in) handles turn-taking automatically.
  // This client-side function is only for UI feedback (showing speech activity).
  const processVAD = useCallback((int16Data: Int16Array) => {
    // Calculate RMS energy for UI indicator
    let sum = 0;
    for (let i = 0; i < int16Data.length; i++) {
      const normalized = int16Data[i] / 32768;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / int16Data.length);

    // Expose normalized level (0-1) for waveform mic visualization
    setAudioLevel(Math.min(1, rms / 0.08));

    // Update speaking indicator (UI only, no protocol signals sent)
    if (rms > VAD_SPEECH_THRESHOLD) {
      vadActiveRef.current = true;
      if (vadSilenceTimer.current) {
        clearTimeout(vadSilenceTimer.current);
        vadSilenceTimer.current = null;
      }
    } else if (vadActiveRef.current) {
      if (!vadSilenceTimer.current) {
        vadSilenceTimer.current = setTimeout(() => {
          vadActiveRef.current = false;
          vadSilenceTimer.current = null;
        }, VAD_SILENCE_TIMEOUT_MS);
      }
    }
  }, []);

  const panelHeightMap = { closed: "0%", default: "45%", max: "75%" };
  const effectivePanelHeight = panelReveal ? "20%" : panelHeightMap[panelSize];

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // --- Initialize Audio Player ---
  useEffect(() => {
    const player = new AudioPlayer((playing) => {
      setIsSpeaking(playing);
      if (playing) setWaitingForAi(false);
    });
    audioPlayerRef.current = player;
    // Pre-load worklet module so it's ready before first audio chunk
    player.init();
    return () => {
      player.destroy();
    };
  }, []);

  // --- Start microphone capture & streaming ---
  const startMicStream = useCallback(async () => {
    if (isStreaming || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // Create AudioContext
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const actualSampleRate = audioCtx.sampleRate;

      // Load AudioWorklet processor
      try {
        await audioCtx.audioWorklet.addModule("/audio-processor.js");
      } catch {
        // Fallback: use ScriptProcessorNode if AudioWorklet fails
        console.warn("AudioWorklet not available, using ScriptProcessor fallback");
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(1024, 1, 1);

        processor.onaudioprocess = (e) => {
          if (mutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmBuffer = resampleTo16kHz(inputData, actualSampleRate);
          // VAD check
          processVAD(new Int16Array(pcmBuffer));
          // Send as binary WebSocket frame
          wsRef.current.send(new Uint8Array(pcmBuffer));
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        setIsStreaming(true);
        return;
      }

      // Create AudioWorklet node
      const workletNode = new AudioWorkletNode(audioCtx, "audio-capture-processor");
      workletNodeRef.current = workletNode;

      // Handle audio data from worklet
      workletNode.port.onmessage = (e) => {
        if (mutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (e.data.type === "audio") {
          const pcmData = e.data.pcmData as ArrayBuffer;
          const srcRate = e.data.sampleRate as number;

          // Resample to 16kHz if needed
          let sendBuffer: ArrayBuffer;
          if (srcRate !== TARGET_SAMPLE_RATE) {
            const float32 = new Float32Array(pcmData.byteLength / 2);
            const int16View = new Int16Array(pcmData);
            for (let i = 0; i < int16View.length; i++) {
              float32[i] = int16View[i] / 32768;
            }
            sendBuffer = resampleTo16kHz(float32, srcRate);
          } else {
            sendBuffer = pcmData;
          }

          // VAD check on the final 16kHz data
          processVAD(new Int16Array(sendBuffer));
          // Send as binary WebSocket frame
          wsRef.current!.send(new Uint8Array(sendBuffer));
        }
      };

      // Connect: mic → worklet
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(workletNode);
      // Don't connect worklet to destination (we don't want to hear ourselves)

      setIsStreaming(true);
      setMuted(false);
      console.log("🎙️ Mic streaming started (sample rate:", actualSampleRate, "→", TARGET_SAMPLE_RATE, ")");
    } catch (err) {
      console.error("Failed to start mic:", err);
    }
  }, [isStreaming]);

  // --- Stop microphone capture ---
  const stopMicStream = useCallback(() => {
    // Clean up VAD state
    if (vadSilenceTimer.current) {
      clearTimeout(vadSilenceTimer.current);
      vadSilenceTimer.current = null;
    }
    vadActiveRef.current = false;

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsStreaming(false);
    console.log("🎙️ Mic streaming stopped");
  }, []);

  // Toggle mic on/off
  const toggleMic = useCallback(() => {
    if (isStreaming) {
      setMuted((m) => !m);
    } else {
      startMicStream();
    }
  }, [isStreaming, startMicStream]);

  // Keep startMicStream ref in sync
  useEffect(() => { startMicStreamRef.current = startMicStream; }, [startMicStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicStream();
    };
  }, [stopMicStream]);

  // --- Connection timeout state ---
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setupReadyReceived = useRef(false);

  // Retry handler
  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  // --- WebSocket Connection (re-runs on retryCount change) ---
  useEffect(() => {
    setConnecting(true);
    setConnectionFailed(false);
    setupReadyReceived.current = false;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // Hard timeout: if no setup_ready within 20s, show retry
    setupTimeoutRef.current = setTimeout(() => {
      if (!setupReadyReceived.current) {
        console.warn("⏱️ Connection setup timed out (20s)");
        setConnectionFailed(true);
        setConnecting(false);
        try { ws.close(); } catch {}
      }
    }, 20000);

    ws.onopen = () => {
      setConnected(true);
      setConnecting(false);
      // Clear the connection-level timeout (setup_ready timeout still active)
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      // Send setup context — server decides if Receptionist is needed
      ws.send(JSON.stringify({
        type: "setup",
        name: storytellerName,
        relationship: relationship,
        topic: topicPreference,
        photos: setupPhotos,
        book_id: bookId,
        user_id: wsUserId,
      }));
    };

    ws.binaryType = "arraybuffer"; // Receive binary audio as ArrayBuffer

    ws.onmessage = (event) => {
      // --- Binary data = raw PCM audio from AI (Gemini Live) ---
      if (event.data instanceof ArrayBuffer) {
        if (suppressAudioRef.current) return; // Drop audio after interruption
        try {
          audioPlayerRef.current?.playBinaryChunk(event.data);
        } catch (e) {
          console.warn("Audio playback error:", e);
        }
        return;
      }

      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.warn("Non-JSON message from server:", event.data);
        return;
      }

      // --- Phase transition ---
      if (data.type === "phase") {
        setPhase(data.phase);
        if (data.phase === "receptionist") {
          setAiTyping(true); // Receptionist will send a greeting shortly
        }
        if (data.phase === "interviewer") {
          // Voice mode starting — photos are shown in background canvas
        }
      }

      // --- Photos analyzed in background ---
      if (data.type === "photos_analyzed") {
        setPhotosAnalyzed(true);
      }

      // --- Receptionist text message ---
      if (data.type === "receptionist_message") {
        setAiTyping(false);
        if (data.content?.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: data.content, time: formatTime(secondsRef.current) },
          ]);
        }
      }

      // --- Setup ready: start mic streaming ---
      if (data.type === "setup_ready") {
        setupReadyReceived.current = true;
        setAiTyping(false);
        // Clear setup timeout — we're connected and ready
        if (setupTimeoutRef.current) {
          clearTimeout(setupTimeoutRef.current);
          setupTimeoutRef.current = null;
        }
        // Auto-start mic after a brief delay (use ref to get latest version)
        setTimeout(() => {
          startMicStreamRef.current();
        }, 500);
      }

      // --- Text from AI (thinking/model text output) ---
      if (data.type === "text") {
        setAiTyping(false);
        // Don't add thinking text as messages — it's internal
        // Only show actual conversation transcriptions
      }

      // --- User's speech transcribed (if input_audio_transcription enabled) ---
      if (data.type === "input_transcription") {
        // Once input is finalized for this turn, drop straggling partials
        if (inputTranscriptionFinishedRef.current) return;

        if (data.finished) {
          inputTranscriptionFinishedRef.current = true;
          setInterimText("");
          if (data.text?.trim()) {
            setMessages((prev) => [
              ...prev,
              { role: "user", text: cleanCJKSpaces(data.text), time: formatTime(secondsRef.current) },
            ]);
            setWaitingForAi(true);
          }
        } else {
          // Partial: append directly, no debounce (React 18 auto-batches)
          setWaitingForAi(false);
          setInterimText((prev) => prev + cleanCJKSpaces(data.text || ""));
        }
      }

      // --- AI's speech transcribed (streaming subtitle) ---
      if (data.type === "output_transcription") {
        if (!data.text?.trim()) return;
        suppressAudioRef.current = false; // New AI speech: accept audio again

        // First output in turn: auto-finalize any pending input transcription
        if (!hasOutputTranscriptionInTurnRef.current) {
          hasOutputTranscriptionInTurnRef.current = true;
          if (!inputTranscriptionFinishedRef.current) {
            inputTranscriptionFinishedRef.current = true;
            setInterimText((currentInterim) => {
              if (currentInterim.trim()) {
                setMessages((prev) => [
                  ...prev,
                  { role: "user", text: currentInterim, time: formatTime(secondsRef.current) },
                ]);
              }
              return "";
            });
          }
        }

        setWaitingForAi(false);
        setAiTyping(false);

        if (data.finished) {
          // Final: commit to messages, clear streaming text
          setAiStreamingText("");
          setMessages((prev) => [
            ...prev,
            { role: "ai", text: cleanCJKSpaces(data.text), time: formatTime(secondsRef.current) },
          ]);
        } else {
          // Partial: append directly to streaming text
          setAiStreamingText((prev) => prev + cleanCJKSpaces(data.text));
        }
      }

      // --- Turn complete ---
      if (data.type === "turn_complete") {
        setAiTyping(false);
        suppressAudioRef.current = false; // Accept audio for next turn
        // Don't clear aiStreamingText — output_transcription finished already committed it.
        // Only reset per-turn state flags for the next turn.
        inputTranscriptionFinishedRef.current = false;
        hasOutputTranscriptionInTurnRef.current = false;
      }

      // --- Interruption ---
      if (data.type === "interrupted") {
        suppressAudioRef.current = true; // Drop any in-flight audio chunks
        audioPlayerRef.current?.stop(); // sends endOfAudio to ring buffer
        setAiStreamingText(""); // correct: user cut off the AI
        inputTranscriptionFinishedRef.current = false;
        hasOutputTranscriptionInTurnRef.current = false;
      }

      // --- Welcome image ---
      if (data.type === "welcome_image") {
        const fullUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
        setCurrentImageUrl(fullUrl);
        setImageVisible(true);
      }

      // --- Image generating (background, async) ---
      if (data.type === "image_generating") {
        setImageLoading(true);
      }

      // --- Image generated during conversation ---
      // If `replaces` is true, this is a revision of the last image (user asked for changes).
      // Replace the last image in sessionImages instead of adding a new one.
      if (data.type === "image") {
        const fullUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
        const isRevision = data.replaces === true;
        setImageLoading(true);
        setImageVisible(false);
        setTimeout(() => {
          setImageLoading(false);
          setCurrentImageUrl(fullUrl);
          if (isRevision) {
            // Replace the last image (this is a refinement of the same scene)
            setSessionImages((prev) =>
              prev.length > 0 ? [...prev.slice(0, -1), fullUrl] : [fullUrl]
            );
          } else {
            // New scene — add to the collection
            setSessionImages((prev) => [...prev, fullUrl]);
            setSceneCount((n) => n + 1);
          }
          setImageVisible(true);
          setPanelReveal(true);
          setTimeout(() => setPanelReveal(false), 4000);
        }, 1500);
      }

      // --- Chapter ready ---
      if (data.type === "chapter_ready") {
        navigate("/generating", {
          state: {
            sessionId: data.session_id,
            chapter: data.chapter,
            images: sessionImagesRef.current,
            storytellerName,
            seconds: secondsRef.current,
            sceneCount: sceneCountRef.current,
            photoCount: setupPhotoPreviews.length,
            topic: topicPreference,
            book_id: data.book_id || bookId,
            chapter_id: data.chapter_id || "",
            user_id: wsUserId,
          },
        });
      }

      // --- Status: generating chapter ---
      if (data.type === "status" && data.content === "generating_chapter") {
        setEndingSession(true);
      }

      // --- Session too short (no chapter generated) ---
      if (data.type === "session_too_short") {
        setEndingSession(false);
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: data.content || "The conversation was too short to create a chapter. Keep talking!", time: formatTime(secondsRef.current) },
        ]);
      }

      // --- Error ---
      if (data.type === "error") {
        console.error("Backend error:", data.content);
        setAiTyping(false);
        // If we were ending, stop the overlay so user isn't stuck
        setEndingSession(false);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      // If we were generating a chapter and the WebSocket closed unexpectedly,
      // show the timeout UI so the user isn't stuck on "Crafting..." forever
      setEndingSession((wasEnding) => {
        if (wasEnding) {
          setGenerationTimedOut(true);
        }
        return wasEnding;
      });
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setConnected(false);
      setConnecting(false);
      setConnectionFailed(true);
    };

    // Connection-level timeout (WebSocket fails to open at all)
    connectionTimeoutRef.current = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn("⏱️ WebSocket connection timed out (10s)");
        setConnectionFailed(true);
        setConnecting(false);
        try { ws.close(); } catch {}
      }
    }, 10000);

    return () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (setupTimeoutRef.current) clearTimeout(setupTimeoutRef.current);
      ws.close();
    };
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Generation safety timeout: if "Crafting your chapter..." hangs >90s, let user escape ---
  useEffect(() => {
    if (endingSession) {
      generationTimeoutRef.current = setTimeout(() => {
        console.warn("⏱️ Chapter generation timed out (90s)");
        setGenerationTimedOut(true);
      }, 90000);
    } else {
      // Clear if we exit endingSession (e.g. session_too_short reset)
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
      setGenerationTimedOut(false);
    }
    return () => {
      if (generationTimeoutRef.current) {
        clearTimeout(generationTimeoutRef.current);
        generationTimeoutRef.current = null;
      }
    };
  }, [endingSession]);

  // --- Timer ---
  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);


  // --- Auto-scroll transcript to bottom on any content change ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, panelSize, interimText, aiStreamingText]);


  // --- Send topic hint ---
  const sendTopicHint = (hint: string) => {
    setShowTopicSheet(false);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: hint, time: formatTime(seconds) },
    ]);
    setAiTyping(true);
    wsRef.current.send(JSON.stringify({ type: "text", content: hint }));
  };

  // --- Camera viewfinder ---
  const openCamera = useCallback(async () => {
    setCameraError("");
    setShowCamera(true);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1600 }, height: { ideal: 1200 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      // Wait a tick for the video element to mount
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setCameraReady(true);
          };
        }
      });
    } catch {
      setCameraError("Camera access denied");
      setTimeout(() => setShowCamera(false), 1500);
    }
  }, []);

  const closeCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setShowCamera(false);
    setCameraReady(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const canvas = document.createElement("canvas");
    // Capture at video's native resolution, capped at 1600px
    let w = video.videoWidth;
    let h = video.videoHeight;
    const maxDim = 1600;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Get data URL for preview + base64 for WebSocket
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const b64 = dataUrl.split(",")[1];

    // Send to backend
    wsRef.current.send(JSON.stringify({ type: "photo", data: b64 }));

    // Add to chat as user message with photo thumbnail
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "📸 Shared a photo", time: formatTime(secondsRef.current), image: dataUrl },
    ]);

    // Close camera
    closeCamera();
  }, [closeCamera]);

  // --- End session ---
  const handleEndSession = () => {
    setShowEndConfirm(false);
    stopMicStream();
    audioPlayerRef.current?.stop();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Normal path: tell server to generate chapter
      setEndingSession(true);
      try {
        wsRef.current.send(JSON.stringify({ type: "end_session" }));
      } catch (err) {
        console.error("Failed to send end_session:", err);
        // Send failed — WebSocket likely closing; go to dashboard
        setEndingSession(false);
        navigate("/dashboard");
      }
    } else {
      // WebSocket already closed — navigate back to dashboard gracefully
      navigate("/dashboard");
    }
  };

  // Drag to resize panel
  const onDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    dragStartY.current = "touches" in e ? e.touches[0].clientY : e.clientY;
  };
  const onDragEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (dragStartY.current === null) return;
    const endY = "changedTouches" in e ? e.changedTouches[0].clientY : e.clientY;
    const delta = dragStartY.current - endY;
    if (delta > 40) setPanelSize(panelSize === "closed" ? "default" : "max");
    else if (delta < -40) setPanelSize(panelSize === "max" ? "default" : "closed");
    dragStartY.current = null;
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg, hsl(var(--cream)), hsl(var(--light-peach)))" }}
    >
      {/* ========== Z-1: LIVING CANVAS (full-screen background image) ========== */}
      <div className="absolute inset-0 z-0">
        {/* Layer 1: Warm gradient (always present as base) */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-700"
          style={{
            background: "linear-gradient(160deg, hsl(var(--cream)), hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.3))",
            opacity: (setupPhotoPreviews.length > 0 || (currentImageUrl && imageVisible)) ? 0 : 1,
          }}
        >
          <div className="text-center px-8">
            <div className="text-5xl mb-4">🎙️</div>
            <p className="font-display font-bold text-xl" style={{ color: "hsl(var(--deep-brown))" }}>
              {connecting
                ? "Connecting to Famoir..."
                : "Start talking and watch your memories come to life..."}
            </p>
            {connecting && (
              <Loader2 className="w-8 h-8 mx-auto mt-4 animate-spin" style={{ color: "hsl(var(--terracotta))" }} />
            )}
          </div>
        </div>

        {/* Layer 2: Uploaded photos — static collage grid */}
        {setupPhotoPreviews.length > 0 && !currentImageUrl && (
          <>
            <div
              className="absolute z-0"
              style={{
                top: 0, left: 0, right: 0, bottom: 80, /* stop above bottom control bar */
                display: "grid",
                gridTemplateColumns: setupPhotoPreviews.length === 1 ? "1fr"
                  : setupPhotoPreviews.length <= 2 ? "1fr 1fr"
                  : setupPhotoPreviews.length <= 4 ? "1fr 1fr"
                  : "1fr 1fr 1fr",
                gridTemplateRows: setupPhotoPreviews.length <= 2 ? "1fr"
                  : setupPhotoPreviews.length <= 4 ? "1fr 1fr"
                  : "1fr 1fr",
                gap: 2,
              }}
            >
              {setupPhotoPreviews.map((dataUrl, i) => (
                <img
                  key={`bg-photo-${i}`}
                  src={dataUrl}
                  alt={`Memory photo ${i + 1}`}
                  className="w-full h-full"
                  style={{
                    objectFit: "cover",
                    filter: "brightness(0.75) saturate(0.85)",
                  }}
                />
              ))}
            </div>
            {/* Photo count badge */}
            <div
              className="absolute top-16 right-4 z-10 px-3 py-1.5 rounded-full font-body text-xs font-semibold"
              style={{ background: "rgba(0,0,0,0.45)", color: "white", backdropFilter: "blur(6px)" }}
            >
              📸 {setupPhotoPreviews.length} photo{setupPhotoPreviews.length !== 1 ? "s" : ""}
              {!photosAnalyzed ? " · AI is looking..." : " · AI can see ✓"}
            </div>
          </>
        )}

        {/* Layer 3: AI-generated image (overrides uploaded photos when present) */}
        {currentImageUrl && (
          <>
            <img
              key={currentImageUrl}
              src={currentImageUrl}
              alt="AI-generated memory illustration"
              className={`absolute inset-0 w-full h-full ${imageVisible && !imageLoading ? "animate-memory-flashback" : ""}`}
              style={{
                objectFit: "cover",
                opacity: imageVisible && !imageLoading ? undefined : 0,
              }}
            />
            {imageVisible && !imageLoading && (
              <div key={`sepia-${currentImageUrl}`} className="memory-sepia-overlay" />
            )}
          </>
        )}

        {/* Shimmer overlay while generating */}
        {imageLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
            <div className="shimmer absolute inset-0" style={{ opacity: 0.6 }} />
            <div
              className="relative z-10 text-center px-8 py-5 rounded-2xl"
              style={{ background: "hsl(var(--cream) / 0.85)", backdropFilter: "blur(10px)" }}
            >
              <div className="text-3xl mb-2">✨</div>
              <p className="font-display font-semibold text-lg" style={{ color: "hsl(var(--deep-brown))" }}>
                Imagining your scene...
              </p>
            </div>
          </div>
        )}

        {/* Tap image to toggle overlay */}
        <button
          className="absolute inset-0 w-full h-full z-5"
          style={{ background: "transparent" }}
          aria-label="Toggle conversation overlay"
          onClick={() => setOverlayHidden((v) => !v)}
        />
      </div>

      {/* ========== Z-2: Bottom gradient for text readability ========== */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none"
        style={{
          height: "60%",
          background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
        }}
      />

      {/* ========== Z-4: TOP STATUS BAR ========== */}
      <div
        className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-5"
        style={{
          height: 60,
          background: "rgba(0,0,0,0.32)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <Link
          to="/"
          className="flex items-center gap-2"
          style={{ color: "rgba(255,255,255,0.9)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <BookOpen className="w-5 h-5" style={{ color: "hsl(var(--terracotta))" }} />
          <span className="font-display font-bold text-sm">Famoir</span>
        </Link>

        {/* Center: timer + connection status */}
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: !connected ? "hsl(var(--warm-gray))" : isStreaming ? "hsl(var(--terracotta))" : "hsl(var(--warm-gray))",
              animation: connected && isStreaming && !muted ? "pulse 1.5s ease-in-out infinite" : "none",
            }}
          />
          <span className="font-body font-semibold text-base" style={{ color: "white", fontVariantNumeric: "tabular-nums" }}>
            {formatTime(seconds)}
          </span>
          {isStreaming && (
            <span className="font-body text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)" }}>
              🎤 LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {sceneCount > 0 && (
            <span
              className="font-body text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "hsl(var(--terracotta) / 0.85)", color: "white" }}
            >
              {sceneCount} scene{sceneCount !== 1 ? "s" : ""}
            </span>
          )}
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
            onClick={(e) => { e.stopPropagation(); setShowTopicSheet(true); }}
            aria-label="Topic suggestions"
          >
            <Lightbulb className="w-5 h-5" style={{ color: "rgba(255,255,255,0.9)" }} />
          </button>
        </div>
      </div>

      {/* ========== Z-4b: PHOTO THUMBNAIL STRIP (below status bar) ========== */}
      {setupPhotoPreviews.length > 0 && phase === "interviewer" && (
        <div
          className="absolute left-0 right-0 z-40 flex items-center gap-2 px-5 overflow-x-auto no-scrollbar"
          style={{ top: 60, height: 44, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        >
          {setupPhotoPreviews.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Photo ${i + 1}`}
              className="shrink-0 rounded-full border-2 object-cover"
              style={{
                width: 32, height: 32,
                borderColor: photosAnalyzed ? "hsl(var(--terracotta) / 0.7)" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
          <span className="font-body text-xs shrink-0 ml-1" style={{ color: "rgba(255,255,255,0.65)" }}>
            {photosAnalyzed ? "AI can see" : "Analyzing..."}
          </span>
        </div>
      )}

      {/* ========== Z-3: CONVERSATION OVERLAY PANEL (bottom, draggable) ========== */}
      <div
        className="fixed left-0 right-0 z-30 flex justify-center"
        data-spring-panel
        style={{
          bottom: 80,
          height: overlayHidden ? "0%" : effectivePanelHeight,
          overflow: "hidden",
        }}
      >
        <div
          className="flex flex-col h-full rounded-t-[20px] overflow-hidden w-full md:max-w-2xl md:rounded-t-[24px] md:shadow-lg"
          style={{
            background: "rgba(255,249,245,0.92)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {/* Drag handle */}
          <div
            className="shrink-0 flex flex-col items-center py-2 cursor-grab active:cursor-grabbing touch-none"
            onMouseDown={onDragStart}
            onMouseUp={onDragEnd}
            onTouchStart={onDragStart}
            onTouchEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mb-1" style={{ background: "hsl(var(--border))" }} />
            <div className="flex gap-4">
              <button
                className="text-xs flex items-center gap-0.5 font-body"
                style={{ color: "hsl(var(--warm-gray))", fontSize: "0.7rem" }}
                onClick={() => setPanelSize("closed")}
              >
                <ChevronDown className="w-3 h-3" /> Hide
              </button>
              {panelSize !== "max" && (
                <button
                  className="text-xs flex items-center gap-0.5 font-body"
                  style={{ color: "hsl(var(--warm-gray))", fontSize: "0.7rem" }}
                  onClick={() => setPanelSize("max")}
                >
                  <ChevronUp className="w-3 h-3" /> Expand
                </button>
              )}
              {panelSize === "max" && (
                <button
                  className="text-xs flex items-center gap-0.5 font-body"
                  style={{ color: "hsl(var(--warm-gray))", fontSize: "0.7rem" }}
                  onClick={() => setPanelSize("default")}
                >
                  <ChevronDown className="w-3 h-3" /> Smaller
                </button>
              )}
            </div>
          </div>

          {/* Speaking indicator — frosted pill */}
          <div
            className="px-4 py-1.5 shrink-0 flex items-center gap-2.5"
            style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated bars for speaking/listening */}
            <div className="flex items-center gap-[2px] shrink-0" style={{ height: 14 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 3,
                    height: isSpeaking ? 10 + (i % 2) * 4 : isStreaming && !muted ? 6 + (i % 2) * 3 : 4,
                    background: isSpeaking
                      ? "hsl(var(--terracotta))"
                      : isStreaming && !muted
                        ? "hsl(var(--sage))"
                        : "hsl(var(--warm-gray) / 0.5)",
                    transition: "height 0.15s ease-out",
                    animation: (isSpeaking || (isStreaming && !muted))
                      ? `waveform-bar 0.6s ease-in-out ${i * 0.15}s infinite alternate`
                      : "none",
                  }}
                />
              ))}
            </div>
            <span className="font-body text-xs font-semibold" style={{ color: "hsl(var(--warm-gray))" }}>
              {!connected
                ? "Disconnected"
                : phase === "receptionist"
                  ? "Text chat with Famoir"
                  : isSpeaking
                    ? "Famoir is speaking..."
                    : isStreaming && !muted
                      ? `Listening to ${storytellerName}...`
                      : muted
                        ? "Microphone muted"
                        : "Ready to listen"}
            </span>
          </div>

          {/* Messages (transcript) */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {messages.length === 0 && !aiTyping && (
              <div className="flex-1 flex items-center justify-center">
                <p className="font-body text-sm text-center" style={{ color: "hsl(var(--warm-gray))" }}>
                  {connected
                    ? phase === "receptionist"
                      ? "Famoir's receptionist will greet you shortly..."
                      : "Famoir will greet you shortly..."
                    : "Waiting for connection..."}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                {msg.role === "ai" ? (
                  <div className="w-full py-1">
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Shared photo"
                        className="rounded-lg mb-2"
                        style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover" }}
                      />
                    )}
                    <p className="font-body" style={{ fontSize: "1.08rem", lineHeight: 1.7, color: "hsl(var(--deep-brown))" }}>
                      {msg.text}
                    </p>
                  </div>
                ) : (
                  <div
                    className="max-w-[85%] px-4 py-3 rounded-2xl"
                    style={{
                      background: "rgba(250,229,211,0.85)",
                      borderRadius: "20px 20px 4px 20px",
                    }}
                  >
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Shared photo"
                        className="rounded-lg mb-2"
                        style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover" }}
                      />
                    )}
                    <p className="font-body" style={{ fontSize: "1.05rem", lineHeight: 1.6, color: "hsl(var(--deep-brown))" }}>
                      {msg.text}
                    </p>
                  </div>
                )}
              </div>
            ))}
            {/* Voice interim transcript */}
            {interimText && (
              <div className="flex justify-end animate-fade-in">
                <div
                  className="max-w-[85%] px-4 py-3 rounded-2xl"
                  style={{
                    background: "rgba(250,229,211,0.5)",
                    borderRadius: "20px 20px 4px 20px",
                  }}
                >
                  <p className="font-body italic" style={{ fontSize: "1.05rem", lineHeight: 1.6, color: "hsl(var(--deep-brown) / 0.6)" }}>
                    {interimText}
                  </p>
                </div>
              </div>
            )}
            {/* AI streaming subtitle (live, Claude-style) */}
            {aiStreamingText && (
              <div className="flex justify-start animate-fade-in">
                <div className="w-full py-1">
                  <p className="font-body" style={{ fontSize: "1.08rem", lineHeight: 1.7, color: "hsl(var(--deep-brown) / 0.75)" }}>
                    {aiStreamingText}
                    <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "hsl(var(--terracotta))" }} />
                  </p>
                </div>
              </div>
            )}
            {/* Waiting for AI indicator (minimal dots, no "Thinking..." text) */}
            {waitingForAi && !aiStreamingText && (
              <div className="flex justify-start animate-fade-in">
                <div className="flex items-center gap-2 py-2">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(var(--terracotta))", animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(var(--terracotta))", animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "hsl(var(--terracotta))", animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

        </div>
      </div>

      {/* Tap-to-show overlay hint */}
      {overlayHidden && (
        <div
          className="fixed z-30 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-body text-sm font-semibold"
          style={{ bottom: 100, background: "rgba(0,0,0,0.55)", color: "white" }}
        >
          Tap image to show conversation
        </div>
      )}

      {/* Show transcript button when panel is closed */}
      {panelSize === "closed" && (
        <button
          onClick={() => setPanelSize("default")}
          className="fixed z-40 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full font-body text-sm transition-all"
          style={{
            bottom: "calc(88px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(255,249,245,0.9)",
            color: "hsl(var(--warm-gray))",
            border: "1px solid hsl(var(--border))",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          Show transcript
        </button>
      )}

      {/* ========== Z-4: BOTTOM CONTROL BAR ========== */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center"
        style={{
          height: 80,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "rgba(255,253,251,0.97)",
          borderTop: "1px solid hsl(var(--border))",
          boxShadow: "0 -4px 20px rgba(61,44,46,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-around w-full md:max-w-2xl">
        {phase === "receptionist" ? (
          /* Receptionist phase: simple centered label */
          <div className="flex items-center gap-2">
            <span className="font-body text-sm font-semibold" style={{ color: "hsl(var(--warm-gray))" }}>
              💬 Getting to know you...
            </span>
          </div>
        ) : (
          /* Interviewer phase: full voice controls */
          <>
            <button
              className="flex flex-col items-center gap-1"
              style={{ minWidth: 44, minHeight: 48, color: "hsl(var(--warm-gray))" }}
              onClick={openCamera}
              aria-label="Take a photo"
            >
              <Camera className="w-5 h-5" />
              <span className="font-body" style={{ fontSize: "0.65rem" }}>Photo</span>
            </button>

            <WaveformMic
              active={isStreaming}
              muted={muted}
              level={audioLevel}
              onClick={toggleMic}
            />

            <button
              className="flex flex-col items-center gap-1"
              style={{ minWidth: 44, minHeight: 48, color: endingSession ? "hsl(var(--warm-gray))" : "hsl(0 60% 50%)" }}
              onClick={() => !endingSession && setShowEndConfirm(true)}
              disabled={endingSession}
              aria-label="End session"
            >
              {endingSession ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              <span className="font-body font-semibold" style={{ fontSize: "0.65rem" }}>{endingSession ? "Creating..." : "End"}</span>
            </button>
          </>
        )}
        </div>
      </div>

      {/* ========== CONNECTION FAILED / RETRY OVERLAY ========== */}
      {connectionFailed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(61,44,46,0.55)", backdropFilter: "blur(6px)" }}
        >
          <div className="card-warm p-8 max-w-sm w-full mx-4 text-center animate-scale-in">
            <div className="text-5xl mb-4">😔</div>
            <p className="font-display font-bold text-2xl mb-2" style={{ color: "hsl(var(--deep-brown))" }}>
              Connection timed out
            </p>
            <p className="font-body mb-6" style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}>
              Couldn't connect to the voice server. This can happen if the server is waking up — try again!
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handleRetry} className="btn-primary w-full justify-center" style={{ fontSize: "1.1rem", minHeight: 52 }}>
                Try Again
              </button>
              <button onClick={() => navigate("/dashboard")} className="btn-secondary w-full justify-center" style={{ minHeight: 48 }}>
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== ENDING SESSION OVERLAY ========== */}
      {endingSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(61,44,46,0.55)", backdropFilter: "blur(6px)" }}
        >
          <div className="card-warm p-8 max-w-sm w-full mx-4 text-center animate-scale-in">
            {generationTimedOut ? (
              <>
                <div className="text-5xl mb-4">⏱️</div>
                <p className="font-display font-bold text-2xl mb-2" style={{ color: "hsl(var(--deep-brown))" }}>
                  Taking longer than expected
                </p>
                <p className="font-body mb-6" style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}>
                  {connected
                    ? "The chapter is still being crafted. You can keep waiting or go back to the dashboard."
                    : "Lost connection to the server. Your conversation was saved — you can try again from the dashboard."}
                </p>
                <div className="flex flex-col gap-3">
                  {connected && (
                    <button
                      onClick={() => setGenerationTimedOut(false)}
                      className="btn-primary w-full justify-center"
                      style={{ fontSize: "1.1rem", minHeight: 52 }}
                    >
                      Keep Waiting
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="btn-secondary w-full justify-center"
                    style={{ minHeight: 48 }}
                  >
                    Back to Dashboard
                  </button>
                </div>
              </>
            ) : (
              <>
                <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: "hsl(var(--terracotta))" }} />
                <p className="font-display font-bold text-2xl mb-2" style={{ color: "hsl(var(--deep-brown))" }}>
                  Crafting your chapter...
                </p>
                <p className="font-body" style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}>
                  The Narrator is transforming your conversation into a beautiful memoir chapter.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========== END SESSION CONFIRMATION ========== */}
      {showEndConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(61,44,46,0.65)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full sm:max-w-md mx-0 sm:mx-4 p-8 text-center animate-scale-in rounded-t-3xl sm:rounded-2xl"
            style={{ background: "hsl(var(--warm-white))" }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "hsl(var(--light-peach))" }}>
              <BookOpen className="w-8 h-8" style={{ color: "hsl(var(--terracotta))" }} />
            </div>
            <h3 className="font-display font-bold text-2xl mb-3" style={{ color: "hsl(var(--deep-brown))" }}>
              End this conversation?
            </h3>
            <p className="font-body mb-6" style={{ fontSize: "1rem", color: "hsl(var(--warm-gray))" }}>
              Your chapter will be beautifully crafted from this conversation. Are you ready?
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={handleEndSession} className="btn-primary w-full justify-center" style={{ fontSize: "1.1rem", minHeight: 52 }}>
                Create My Chapter ✨
              </button>
              <button onClick={() => setShowEndConfirm(false)} className="btn-secondary w-full justify-center" style={{ minHeight: 48 }}>
                Continue Talking
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  stopMicStream();
                  audioPlayerRef.current?.stop();
                  if (wsRef.current) {
                    try { wsRef.current.close(); } catch {}
                  }
                  navigate("/dashboard");
                }}
                className="font-body font-semibold transition-colors"
                style={{ minHeight: 44, fontSize: "0.95rem", color: "hsl(var(--warm-gray))" }}
              >
                End Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== CAMERA VIEWFINDER OVERLAY ========== */}
      {showCamera && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "black" }}
        >
          {/* Video feed */}
          <video
            ref={videoRef}
            className="flex-1 object-cover"
            autoPlay
            playsInline
            muted
            style={{ width: "100%", transform: "scaleX(1)" }}
          />

          {/* Top bar: close button */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5" style={{ height: 60 }}>
            <button
              onClick={closeCamera}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
            >
              <X className="w-5 h-5" style={{ color: "white" }} />
            </button>
            <span className="font-body text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
              📸 Take a photo to share
            </span>
            <div style={{ width: 40 }} />
          </div>

          {/* Bottom bar: shutter button */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center"
            style={{ height: 120, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}
          >
            {cameraReady ? (
              <button
                onClick={capturePhoto}
                className="relative flex items-center justify-center transition-transform active:scale-90"
                style={{ width: 72, height: 72 }}
                aria-label="Capture photo"
              >
                {/* Outer ring */}
                <span
                  className="absolute rounded-full"
                  style={{ width: 72, height: 72, border: "4px solid white", opacity: 0.9 }}
                />
                {/* Inner fill */}
                <span
                  className="rounded-full"
                  style={{ width: 58, height: 58, background: "white" }}
                />
              </button>
            ) : cameraError ? (
              <span className="font-body text-sm" style={{ color: "rgba(255,100,100,0.9)" }}>
                {cameraError}
              </span>
            ) : (
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "white" }} />
            )}
          </div>
        </div>
      )}

      {/* ========== TOPIC HINTS BOTTOM SHEET ========== */}
      {showTopicSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setShowTopicSheet(false)}
        >
          <div
            className="w-full max-w-lg p-6 rounded-t-3xl animate-scale-in"
            style={{ background: "hsl(var(--warm-white))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-xl" style={{ color: "hsl(var(--deep-brown))" }}>
                Conversation Starters
              </h3>
              <button onClick={() => setShowTopicSheet(false)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--muted))" }}>
                <X className="w-5 h-5" style={{ color: "hsl(var(--warm-gray))" }} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {TOPIC_HINTS.map((hint) => (
                <button
                  key={hint}
                  className="text-left px-5 py-4 rounded-xl font-body transition-colors"
                  style={{
                    background: "hsl(var(--light-peach))",
                    color: "hsl(var(--deep-brown))",
                    fontSize: "1rem",
                    minHeight: 52,
                    border: "1px solid hsl(var(--border))",
                  }}
                  onClick={() => sendTopicHint(hint)}
                >
                  💬 {hint}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
