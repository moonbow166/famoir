/**
 * AuthContext — provides auth state and helpers to the entire app.
 *
 * Supports two modes:
 *   1. Firebase Auth (production): phone number SMS OTP authentication
 *   2. DEV_MODE (local dev): skips auth, uses a mock user — set VITE_DEV_MODE=true
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, signOut as fbSignOut, getIdToken } from "@/lib/firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthUser {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  /** The authenticated user, or null if not signed in. */
  user: AuthUser | null;
  /** True while we're checking the initial auth state. */
  loading: boolean;
  /** Whether we're running in dev-bypass mode. */
  isDevMode: boolean;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
  /** Get the Firebase ID token for backend API calls. Returns "" in dev mode. */
  getToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Dev-mode mock user
// ---------------------------------------------------------------------------

const DEV_MODE = import.meta.env.VITE_DEV_MODE === "true";

const DEV_USER: AuthUser = {
  uid: "dev_user_local",
  email: "dev@famoir.local",
  phoneNumber: "+10000000000",
  displayName: "Dev User",
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(DEV_MODE ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_MODE);

  useEffect(() => {
    if (DEV_MODE) return; // skip listener in dev mode

    const unsubscribe = onAuthStateChanged(auth, (fbUser: User | null) => {
      if (fbUser) {
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          phoneNumber: fbUser.phoneNumber,
          displayName: fbUser.displayName,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    if (DEV_MODE) return;
    await fbSignOut();
    setUser(null);
  };

  const handleGetToken = async (): Promise<string> => {
    if (DEV_MODE) return "";
    return (await getIdToken()) ?? "";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isDevMode: DEV_MODE,
        signOut: handleSignOut,
        getToken: handleGetToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
