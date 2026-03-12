/**
 * ProtectedRoute — wraps routes that require authentication.
 *
 * - If loading, shows a spinner.
 * - If not authenticated, redirects to /login.
 * - Otherwise renders children.
 */

import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(160deg, hsl(var(--cream)) 0%, hsl(var(--light-peach)) 60%, hsl(var(--amber) / 0.2) 100%)",
        }}
      >
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "hsl(var(--terracotta))" }}
        />
      </div>
    );
  }

  if (!user) {
    // Save where the user was trying to go so we can redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
