import { Link } from "react-router-dom";
import {
  Mic,
  ArrowRight,
  Play,
  Heart,
  Users,
  Clock,
  BookOpen,
  Star,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { FamoirLogo } from "@/components/Navbar";

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */
const steps = [
  {
    emoji: "📸",
    title: "Share",
    description: "Upload photos to give the AI context about your memories.",
    color: "hsl(var(--terracotta))",
    bg: "hsl(var(--light-peach))",
  },
  {
    emoji: "🎙️",
    title: "Tell",
    description: "Our AI guides a warm conversation. Just speak naturally.",
    color: "hsl(var(--amber))",
    bg: "hsl(36 54% 94%)",
  },
  {
    emoji: "📖",
    title: "Keep",
    description: "A polished memoir chapter to read, share, and treasure forever.",
    color: "hsl(var(--sage))",
    bg: "hsl(115 12% 92%)",
  },
];

const benefits = [
  {
    icon: Heart,
    title: "Preserve What Matters Most",
    description: "Every laugh, every lesson — captured before they fade.",
  },
  {
    icon: Users,
    title: "Connect Generations",
    description: "Give grandchildren a window into the lives that shaped their family.",
  },
  {
    icon: Clock,
    title: "Before It's Too Late",
    description: "67% of family stories are lost within three generations. Start today.",
  },
  {
    icon: BookOpen,
    title: "A Gift That Lasts Forever",
    description: "More than a photo album — a living record of your family's legacy.",
  },
];

const testimonials = [
  {
    quote: "I was in tears reading the chapter about my father's childhood. Famoir captured his voice perfectly.",
    name: "Sarah M.",
    relation: "Daughter",
    stars: 5,
  },
  {
    quote: "My grandmother has dementia but she could still tell stories. This app saved them all.",
    name: "Carlos R.",
    relation: "Grandson",
    stars: 5,
  },
  {
    quote: "We gave this as a gift and my parents cried happy tears. Best gift I've ever given.",
    name: "Priya K.",
    relation: "Daughter",
    stars: 5,
  },
];

const sampleMessages = [
  { role: "ai", text: "Tell me about your childhood home. What was the kitchen like?" },
  { role: "user", text: "Oh, it had these yellow curtains my mother sewed herself, and the smell of bread baking every Sunday morning..." },
  { role: "ai", text: "That sounds so warm and full of love. Who taught your mother to bake?" },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--cream))" }}>
      <Navbar />

      {/* ===== HERO ===== */}
      <section
        className="relative overflow-hidden pt-8 pb-10 md:pt-20 md:pb-24"
        style={{ background: "var(--gradient-hero)" }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(var(--amber)), transparent)" }}
        />
        <div
          className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(var(--terracotta)), transparent)" }}
        />

        <div className="max-w-6xl mx-auto px-6 md:px-12">
          <div className="hidden md:grid md:grid-cols-2 gap-12 items-center">
            {/* Left: copy */}
            <div className="animate-fade-in-up">
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6 text-sm font-semibold font-body"
                style={{ background: "hsl(var(--light-peach))", color: "hsl(var(--terracotta))" }}
              >
                <span className="w-2 h-2 rounded-full bg-terracotta inline-block" />
                AI-Powered Family Memoir
              </div>

              <h1
                className="font-display font-bold leading-[1.12] mb-6"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", color: "hsl(var(--deep-brown))" }}
              >
                Turn a Simple Conversation Into a{" "}
                <span style={{ color: "hsl(var(--terracotta))" }}>Family Treasure</span>
              </h1>

              <p
                className="font-body mb-8 leading-relaxed"
                style={{ fontSize: "1.15rem", color: "hsl(var(--warm-gray))", maxWidth: "520px" }}
              >
                Talk with your loved ones. Our AI turns their stories into a beautiful, illustrated memoir — instantly.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <Link to="/dashboard" className="btn-primary text-lg gap-2">
                  Start a Conversation — Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>

              <p className="mt-4 font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                No credit card · Ready in 30 seconds
              </p>
            </div>

            {/* Right: hero image placeholder */}
            <div className="relative animate-scale-in">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: "var(--shadow-elevated)" }}
              >
                <img
                  src="/images/hero.jpg"
                  alt="Family gathered together, grandparent sharing stories with warm golden light"
                  className="w-full h-auto"
                  style={{ aspectRatio: "4/3", objectFit: "cover" }}
                />
              </div>

              {/* Floating badge – bottom-left */}
              <div
                className="absolute -bottom-4 -left-4 card-warm px-4 py-3 flex items-center gap-3 animate-fade-in-up"
                style={{ animationDelay: "0.3s", opacity: 0 }}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--light-peach))" }}>
                  <FamoirLogo size={20} />
                </div>
                <div>
                  <p className="font-semibold font-body text-sm" style={{ color: "hsl(var(--deep-brown))" }}>Chapter Ready!</p>
                  <p className="text-xs font-body" style={{ color: "hsl(var(--warm-gray))" }}>The Kitchen on Elm Street</p>
                </div>
              </div>

              {/* Floating badge – top-right */}
              <div
                className="absolute -top-3 -right-3 card-warm px-3 py-2 flex items-center gap-2 animate-fade-in-up"
                style={{ animationDelay: "0.5s", opacity: 0 }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "hsl(115 12% 92%)" }}>
                  <Mic className="w-4 h-4" style={{ color: "hsl(var(--sage))" }} />
                </div>
                <div>
                  <p className="font-semibold font-body text-xs" style={{ color: "hsl(var(--deep-brown))" }}>Recording...</p>
                  <p className="text-xs font-body" style={{ color: "hsl(var(--warm-gray))" }}>12:34</p>
                </div>
              </div>
            </div>
          </div>

          {/* ---- Mobile: image-first compact layout ---- */}
          <div className="md:hidden">
            <h1
              className="font-display font-bold leading-[1.1] mb-4"
              style={{ fontSize: "1.85rem", color: "hsl(var(--deep-brown))" }}
            >
              Conversations Become{" "}
              <span style={{ color: "hsl(var(--terracotta))" }}>Family Treasures</span>
            </h1>

            <div className="relative my-5">
              <div
                className="rounded-2xl overflow-hidden"
                style={{ boxShadow: "var(--shadow-elevated)" }}
              >
                <img
                  src="/images/hero.jpg"
                  alt="Family gathered together, grandparent sharing stories with warm golden light"
                  className="w-full h-auto"
                  style={{ aspectRatio: "4/3", objectFit: "cover" }}
                />
              </div>

              <div
                className="absolute -bottom-3 -left-2 card-warm px-3 py-2 flex items-center gap-2 animate-fade-in-up"
                style={{ animationDelay: "0.3s", opacity: 0 }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--light-peach))" }}>
                  <FamoirLogo size={16} />
                </div>
                <div>
                  <p className="font-semibold font-body text-xs" style={{ color: "hsl(var(--deep-brown))" }}>Chapter Ready!</p>
                  <p className="text-[11px] font-body" style={{ color: "hsl(var(--warm-gray))" }}>The Kitchen on Elm Street</p>
                </div>
              </div>

              <div
                className="absolute -top-2 -right-2 card-warm px-2 py-1.5 flex items-center gap-1.5 animate-fade-in-up"
                style={{ animationDelay: "0.5s", opacity: 0 }}
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "hsl(115 12% 92%)" }}>
                  <Mic className="w-3 h-3" style={{ color: "hsl(var(--sage))" }} />
                </div>
                <div>
                  <p className="font-semibold font-body text-[11px]" style={{ color: "hsl(var(--deep-brown))" }}>Recording...</p>
                  <p className="text-[10px] font-body" style={{ color: "hsl(var(--warm-gray))" }}>12:34</p>
                </div>
              </div>
            </div>

            <p
              className="font-body text-sm mb-5 leading-relaxed"
              style={{ color: "hsl(var(--warm-gray))" }}
            >
              Our AI turns spoken stories into a beautiful memoir — instantly.
            </p>

            <Link to="/dashboard" className="btn-primary text-base gap-2 w-full justify-center">
              Start Free
              <ArrowRight className="w-5 h-5" />
            </Link>

            <p className="mt-3 font-body text-xs text-center" style={{ color: "hsl(var(--warm-gray))" }}>
              No credit card · Ready in 30 seconds
            </p>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF BANNER ===== */}
      <section className="py-8 px-6" style={{ background: "hsl(var(--terracotta))" }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 text-center">
          <div>
            <p className="font-display font-bold text-3xl" style={{ color: "hsl(var(--cream))" }}>67%</p>
            <p className="font-body text-sm mt-1" style={{ color: "hsl(33 40% 85%)" }}>of family stories lost in 3 generations</p>
          </div>
          <div className="hidden md:block w-px h-12" style={{ background: "hsl(33 40% 85% / 0.3)" }} />
          <div>
            <p className="font-display font-bold text-3xl" style={{ color: "hsl(var(--cream))" }}>30 min</p>
            <p className="font-body text-sm mt-1" style={{ color: "hsl(33 40% 85%)" }}>one conversation, one chapter</p>
          </div>
          <div className="hidden md:block w-px h-12" style={{ background: "hsl(33 40% 85% / 0.3)" }} />
          <div>
            <p className="font-display font-bold text-3xl" style={{ color: "hsl(var(--cream))" }}>Forever</p>
            <p className="font-body text-sm mt-1" style={{ color: "hsl(33 40% 85%)" }}>a legacy your family can treasure</p>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS (alternating layout) ===== */}
      <section id="how-it-works" className="py-14 md:py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 md:mb-16">
            <p className="font-body text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: "hsl(var(--terracotta))" }}>
              How It Works
            </p>
            <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", color: "hsl(var(--deep-brown))" }}>
              Three Steps to a Family Memoir
            </h2>
            <p className="font-body mx-auto" style={{ fontSize: "1.1rem", color: "hsl(var(--warm-gray))", maxWidth: "560px" }}>
              No writing needed. Just a conversation with someone you love.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-3 md:gap-6">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="card-warm p-4 md:p-8 flex items-start gap-4 md:flex-col md:items-center md:text-center animate-fade-in-up"
                style={{ animationDelay: `${i * 0.12}s` }}
              >
                <div
                  className="w-12 h-12 md:w-16 md:h-16 rounded-2xl flex items-center justify-center shrink-0 md:mx-auto md:mb-5"
                  style={{ background: step.bg }}
                >
                  <span className="text-2xl md:text-3xl">{step.emoji}</span>
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg md:text-2xl mb-1 md:mb-3" style={{ color: "hsl(var(--deep-brown))" }}>
                    {step.title}
                  </h3>
                  <p className="font-body leading-relaxed text-sm md:text-base" style={{ color: "hsl(var(--warm-gray))" }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHY FAMOIR / BENEFITS ===== */}
      <section id="why-famoir" className="py-20 px-6 md:px-12" style={{ background: "hsl(33 40% 96%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: benefit image */}
            <div className="rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-elevated)" }}>
              <img
                src="/images/family-legacy.jpg"
                alt="Three generations looking through a memoir together"
                className="w-full h-auto"
                style={{ aspectRatio: "4/3", objectFit: "cover" }}
              />
            </div>

            {/* Right: benefits list */}
            <div>
              <p className="font-body text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: "hsl(var(--terracotta))" }}>
                Why Famoir
              </p>
              <h2 className="font-display font-bold mb-8" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.4rem)", color: "hsl(var(--deep-brown))" }}>
                More Than Memories — A Family Legacy
              </h2>

              <div className="flex flex-col gap-6">
                {benefits.map((b) => (
                  <div key={b.title} className="flex gap-4 items-start">
                    <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: "hsl(var(--light-peach))" }}>
                      <b.icon className="w-5 h-5" style={{ color: "hsl(var(--terracotta))" }} />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-lg mb-1" style={{ color: "hsl(var(--deep-brown))" }}>
                        {b.title}
                      </h4>
                      <p className="font-body text-sm leading-relaxed" style={{ color: "hsl(var(--warm-gray))" }}>
                        {b.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SEE THE MAGIC / SAMPLE ===== */}
      <section id="sample" className="py-24 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="font-body text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: "hsl(var(--terracotta))" }}>
              See It in Action
            </p>
            <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.8rem, 4vw, 2.6rem)", color: "hsl(var(--deep-brown))" }}>
              From Conversation to Memoir
            </h2>
            <p className="font-body mx-auto" style={{ fontSize: "1.1rem", color: "hsl(var(--warm-gray))", maxWidth: "560px" }}>
              A conversation on the left, the memoir it became on the right.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-10 items-start">
            {/* Conversation preview */}
            <div className="card-warm p-6">
              <div className="flex items-center gap-3 mb-6 pb-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                <div className="w-3 h-3 rounded-full bg-terracotta animate-pulse" />
                <span className="font-body font-semibold text-sm" style={{ color: "hsl(var(--warm-gray))" }}>
                  Live Interview
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {sampleMessages.map((msg, i) => (
                  <div key={i} className={msg.role === "ai" ? "flex justify-start" : "flex justify-end"}>
                    <div className={msg.role === "ai" ? "bubble-ai" : "bubble-user"} style={{ fontSize: "1.05rem" }}>
                      {msg.role === "ai" && (
                        <span className="block text-xs font-semibold mb-1" style={{ color: "hsl(var(--terracotta))" }}>
                          Famoir AI
                        </span>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Memoir chapter preview */}
            <div className="card-warm p-8">
              <div className="flex items-center gap-2 mb-4">
                <FamoirLogo size={20} />
                <span className="font-body font-semibold text-sm" style={{ color: "hsl(var(--terracotta))" }}>
                  Generated Chapter
                </span>
              </div>
              <h3 className="font-display font-bold text-2xl mb-4" style={{ color: "hsl(var(--deep-brown))" }}>
                Chapter 1: The Kitchen on Elm Street
              </h3>

              {/* Chapter illustration */}
              <div className="rounded-xl overflow-hidden mb-4">
                <img
                  src="/images/gallery-kitchen.jpg"
                  alt="Warm vintage kitchen with golden afternoon light"
                  className="w-full h-auto"
                  style={{ aspectRatio: "16/9", objectFit: "cover" }}
                />
              </div>

              <p className="font-body leading-relaxed mb-4" style={{ fontSize: "1rem", color: "hsl(var(--warm-gray))" }}>
                My mother's kitchen was a world unto itself. The yellow curtains she'd sewn by hand caught the morning light in a way that made everything glow...
              </p>

              {/* Mini audio player */}
              <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "hsl(var(--light-peach))" }}>
                <button
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "hsl(var(--terracotta))", color: "hsl(var(--cream))" }}
                  aria-label="Play audio"
                >
                  <Play className="w-4 h-4 ml-0.5" />
                </button>
                <div className="flex-1">
                  <p className="font-body text-sm font-semibold" style={{ color: "hsl(var(--deep-brown))" }}>
                    Hear this in Grandma's own words
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-full"
                        style={{
                          width: "3px",
                          height: `${6 + Math.sin(i * 0.8) * 6}px`,
                          background: i < 8 ? "hsl(var(--terracotta))" : "hsl(var(--border))",
                        }}
                      />
                    ))}
                  </div>
                </div>
                <span className="font-body text-sm" style={{ color: "hsl(var(--warm-gray))" }}>2:34</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== GALLERY — Stories Brought to Life ===== */}
      <section className="py-16 px-6 md:px-12" style={{ background: "hsl(33 40% 96%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-body text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: "hsl(var(--terracotta))" }}>
              Stories Brought to Life
            </p>
            <h2 className="font-display font-bold mb-4" style={{ fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)", color: "hsl(var(--deep-brown))" }}>
              Every Memory Becomes a Masterpiece
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { src: "/images/gallery-kitchen.jpg", alt: "Warm vintage kitchen with golden afternoon light", caption: "The Kitchen on Elm Street" },
              { src: "/images/gallery-childhood.jpg", alt: "Children playing in sunlit fields, nostalgic summer", caption: "School Days & Summer Freedoms" },
              { src: "/images/gallery-wedding.jpg", alt: "Joyful wedding celebration with family dancing", caption: "A Love That Changed Everything" },
            ].map((item, i) => (
              <div key={i} className="group">
                <div
                  className="rounded-2xl overflow-hidden mb-3 transition-transform duration-300 group-hover:scale-[1.02]"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="w-full h-auto"
                    style={{ aspectRatio: "4/3", objectFit: "cover" }}
                  />
                </div>
                <p className="font-display font-semibold text-center" style={{ color: "hsl(var(--deep-brown))", fontSize: "1rem" }}>
                  {item.caption}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-20 px-6 md:px-12" style={{ background: "hsl(var(--background))" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="font-body text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "hsl(var(--terracotta))" }}>
              Trusted by 2,400+ Families
            </p>
            <h2 className="font-display font-bold" style={{ fontSize: "clamp(1.8rem, 4vw, 2.4rem)", color: "hsl(var(--deep-brown))" }}>
              Stories that change everything
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="card-warm p-6 flex flex-col gap-4">
                <div className="flex gap-1">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <Star key={s} className="w-4 h-4 fill-current" style={{ color: "hsl(var(--amber))" }} />
                  ))}
                </div>
                <p className="font-display leading-relaxed flex-1" style={{ fontSize: "1.05rem", color: "hsl(var(--deep-brown))", fontStyle: "italic" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm" style={{ background: "hsl(var(--light-peach))", color: "hsl(var(--terracotta))" }}>
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="font-body font-semibold text-sm" style={{ color: "hsl(var(--deep-brown))" }}>{t.name}</p>
                    <p className="font-body text-xs" style={{ color: "hsl(var(--warm-gray))" }}>{t.relation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <section className="py-24 px-6 text-center" style={{ background: "var(--gradient-hero)" }}>
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display font-bold mb-6" style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", color: "hsl(var(--deep-brown))" }}>
            Every Story Deserves to Be Remembered.
          </h2>
          <p className="font-body mb-8 text-xl" style={{ color: "hsl(var(--warm-gray))" }}>
            Start a conversation today — free, takes 30 seconds to set up.
          </p>
          <Link to="/dashboard" className="btn-primary text-xl gap-2 mx-auto">
            Start Your First Conversation
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
