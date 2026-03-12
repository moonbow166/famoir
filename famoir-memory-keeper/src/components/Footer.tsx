import { FamoirLogo } from "./Navbar";

export default function Footer() {
  return (
    <footer
      className="py-14 px-6 md:px-12 mt-0"
      style={{ background: "hsl(var(--deep-brown))", color: "hsl(33 40% 85%)" }}
    >
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">
        {/* Logo + brand name */}
        <div className="flex items-center gap-2.5">
          <FamoirLogo size={32} />
          <span className="font-display font-bold text-xl">
            <span style={{ color: "hsl(33 40% 90%)" }}>Fam</span>
            <span style={{ color: "hsl(14 56% 63%)" }}>oir</span>
          </span>
        </div>

        {/* Tagline */}
        <p
          className="font-display font-semibold text-lg"
          style={{ color: "hsl(33 40% 78%)", fontStyle: "italic" }}
        >
          Turn Conversations Into Family Treasures
        </p>

        <div className="flex items-center gap-6 text-sm font-body">
          <a href="#" className="transition-colors hover:text-white" style={{ color: "hsl(33 30% 70%)" }}>Privacy</a>
          <span style={{ color: "hsl(33 20% 50%)" }}>·</span>
          <a href="#" className="transition-colors hover:text-white" style={{ color: "hsl(33 30% 70%)" }}>Terms</a>
          <span style={{ color: "hsl(33 20% 50%)" }}>·</span>
          <a href="#" className="transition-colors hover:text-white" style={{ color: "hsl(33 30% 70%)" }}>Contact</a>
        </div>

        <div className="text-sm font-body pt-2" style={{ borderTop: "1px solid hsl(33 20% 30%)", width: "100%" }}>
          <span style={{ color: "hsl(33 30% 60%)" }}>© 2026 Famoir · </span>
          <span style={{ color: "hsl(36 54% 64%)" }}>Built with Google Gemini</span>
        </div>
      </div>
    </footer>
  );
}
