import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ApiConfig } from "../lib/api";

const STORAGE_KEY = "arbiger.auth";

export interface User {
  id: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
  role: "owner" | "member";
}

interface AuthData {
  token: string;
  user: User;
  activeWorkspaceId: string | null;
}

interface AuthState {
  data: AuthData | null;
  setAuth: (data: AuthData) => void;
  setActiveWorkspace: (id: string) => void;
  clear: () => void;
  workspaces: Workspace[];
  setWorkspaces: (ws: Workspace[]) => void;
}

const Ctx = createContext<AuthState | null>(null);

function load(): AuthData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthData;
    if (parsed.token && parsed.user) return parsed;
  } catch {
    
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AuthData | null>(() => load());
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    else localStorage.removeItem(STORAGE_KEY);
  }, [data]);

  const value: AuthState = {
    data,
    setAuth: (d) => setData(d),
    setActiveWorkspace: (id) => setData((prev) => prev ? { ...prev, activeWorkspaceId: id } : null),
    clear: () => {
      setData(null);
      setWorkspaces([]);
    },
    workspaces,
    setWorkspaces,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function apiConfig(data: AuthData): ApiConfig {
  const baseUrl = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http:
  return { 
    baseUrl: baseUrl.replace(/\/$/, ""), 
    apiKey: data.token, 
    tenantId: data.activeWorkspaceId ?? undefined 
  };
}
