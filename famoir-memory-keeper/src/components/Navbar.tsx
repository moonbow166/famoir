import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState } from "react";

function FamoirLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Book left page */}
      <path
        d="M4 8 C4 7 5 6 6 6.5 L17 10 L17 28 L6 24.5 C5 24 4 23 4 22 Z"
        fill="hsl(14 46% 53%)"
      />
      {/* Book right page */}
      <path
        d="M19 10 L30 6.5 C31 6 32 7 32 8 L32 22 C32 23 31 24 30 24.5 L19 28 Z"
        fill="hsl(14 46% 44%)"
      />
      {/* Spine */}
      <rect x="17" y="9" width="2" height="20" rx="1" fill="hsl(33 100% 92%)" />
      {/* Speech bubble */}
      <ellipse cx="27" cy="8" rx="6" ry="5" fill="hsl(33 100% 98%)" />
      <path d="M24 12 L23 16 L28 13" fill="hsl(33 100% 98%)" />
      {/* Bubble dots */}
      <circle cx="24.5" cy="8" r="1" fill="hsl(14 46% 53%)" />
      <circle cx="27" cy="8" r="1" fill="hsl(14 46% 53%)" />
      <circle cx="29.5" cy="8" r="1" fill="hsl(14 46% 53%)" />
    </svg>
  );
}

export { FamoirLogo };

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <nav
      className="sticky top-0 z-50 h-16 flex items-center px-6 md:px-12"
      style={{
        background: "hsl(var(--background) / 0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid hsl(var(--border))",
      }}
    >
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <FamoirLogo size={36} />
          <span className="font-display font-bold text-xl tracking-tight">
            <span style={{ color: "hsl(var(--deep-brown))" }}>Fam</span>
            <span style={{ color: "hsl(var(--terracotta))" }}>oir</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {isLanding && (
            <>
              <a
                href="#how-it-works"
                className="font-body font-medium transition-colors"
                style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "hsl(var(--terracotta))")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "hsl(var(--warm-gray))")}
              >
                How It Works
              </a>
              <a
                href="#sample"
                className="font-body font-medium transition-colors"
                style={{ color: "hsl(var(--warm-gray))", fontSize: "1rem" }}
                onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "hsl(var(--terracotta))")}
                onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "hsl(var(--warm-gray))")}
              >
                Pricing
              </a>
            </>
          )}
          <Link to="/dashboard" className="btn-primary" style={{ minHeight: "44px", padding: "0 1.5rem", fontSize: "1rem" }}>
            Start Free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 rounded-lg"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          style={{ minWidth: 48, minHeight: 48 }}
        >
          {mobileOpen
            ? <X className="w-6 h-6" style={{ color: "hsl(var(--deep-brown))" }} />
            : <Menu className="w-6 h-6" style={{ color: "hsl(var(--deep-brown))" }} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="absolute top-16 left-0 right-0 p-6 flex flex-col gap-3 md:hidden"
          style={{ background: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))" }}
        >
          {isLanding && (
            <>
              <a
                href="#how-it-works"
                className="font-body font-medium py-2"
                style={{ color: "hsl(var(--deep-brown))" }}
                onClick={() => setMobileOpen(false)}
              >
                How It Works
              </a>
              <a
                href="#why-famoir"
                className="font-body font-medium py-2"
                style={{ color: "hsl(var(--deep-brown))" }}
                onClick={() => setMobileOpen(false)}
              >
                Why Famoir
              </a>
              <a
                href="#sample"
                className="font-body font-medium py-2"
                style={{ color: "hsl(var(--deep-brown))" }}
                onClick={() => setMobileOpen(false)}
              >
                See It in Action
              </a>
            </>
          )}
          <Link to="/dashboard" className="btn-primary text-center mt-1" onClick={() => setMobileOpen(false)}>
            Start Free
          </Link>
        </div>
      )}
    </nav>
  );
}
