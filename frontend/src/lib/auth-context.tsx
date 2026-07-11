"use client";

// Shared auth state for the whole suite — every tool that gets added later
// reads from this same context instead of re-implementing login/token
// handling. Token lives in localStorage (this is a real deployed app, not
// a Claude-authored artifact, so browser storage is the right call here).
//
// Initial state is always "loading" on both the server-rendered HTML and
// the first client render — localStorage is only read inside useEffect,
// which never runs during static export's build-time render. Reading it
// any earlier would produce a hydration mismatch.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiGet, apiPost, apiPostForm, ApiError } from "./api";

const TOKEN_STORAGE_KEY = "pf_auth_token";

export type UserRole = "engineer" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  staff_id: string;
  role: UserRole;
}

interface Token {
  access_token: string;
  token_type: string;
}

export interface SignupPayload {
  name: string;
  email: string;
  staff_id: string;
  password: string;
}

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const hydrateFromToken = useCallback(async (candidateToken: string) => {
    try {
      const me = await apiGet<AuthUser>("/api/v1/auth/me", candidateToken);
      setToken(candidateToken);
      setUser(me);
      setStatus("authenticated");
    } catch {
      // Token expired/invalid — don't leave a dead token sitting around.
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      setToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      void hydrateFromToken(stored);
    } else {
      setStatus("unauthenticated");
    }
  }, [hydrateFromToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const tokenRes = await apiPostForm<Token>("/api/v1/auth/login", {
        username: email,
        password,
      });
      window.localStorage.setItem(TOKEN_STORAGE_KEY, tokenRes.access_token);
      await hydrateFromToken(tokenRes.access_token);
    },
    [hydrateFromToken]
  );

  const signup = useCallback(
    async (payload: SignupPayload) => {
      await apiPost<AuthUser>("/api/v1/auth/signup", payload);
      // Signup doesn't return a token — log in immediately after so the
      // new user lands in the hub already authenticated, not back at login.
      await login(payload.email, payload.password);
    },
    [login]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, token, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
