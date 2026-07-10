import { useEffect, useState } from "react";
import { useAuth, apiConfig } from "./state/auth";
import { LoginScreen } from "./views/auth/LoginScreen";
import { SignupScreen } from "./views/auth/SignupScreen";
import { CreateWorkspaceScreen } from "./views/workspaces/CreateWorkspaceScreen";
import { FingerprintList } from "./views/FingerprintList";
import { FingerprintDetail } from "./views/FingerprintDetail";
import { EventDetail } from "./views/EventDetail";
import { IncidentList } from "./views/IncidentList";
import { IncidentDetail } from "./views/IncidentDetail";
import { DashboardLayout } from "./components/layout/DashboardLayout";

export interface Route {
  name: "login" | "signup" | "create-workspace" | "fingerprints" | "fingerprint" | "event" | "incidents" | "incident";
  params: { id?: string };
}

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  
  if (parts[0] === "signup") return { name: "signup", params: {} };
  if (parts[0] === "login") return { name: "login", params: {} };

  if (parts[0] === "incidents" && parts[1]) {
    return { name: "incident", params: { id: parts[1] } };
  }
  if (parts[0] === "incidents") {
    return { name: "incidents", params: {} };
  }

  if (parts[0] === "fingerprints" && parts[1]) {
    if (parts[2] === "events" && parts[3]) return { name: "event", params: { id: parts[3] } };
    return { name: "fingerprint", params: { id: parts[1] } };
  }
  if (parts[0] === "fingerprints") return { name: "fingerprints", params: {} };
  return { name: "fingerprints", params: {} };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function App() {
  const { data, setWorkspaces, setActiveWorkspace } = useAuth();
  const [route, setRoute] = useState<Route>(() => parseHash());

  
  useEffect(() => {
    if (data?.token) {
      fetch(`${(import.meta.env.VITE_API_BASE as string || "http:
        headers: { Authorization: `Bearer ${data.token}` }
      })
      .then(r => r.json())
      .then(ws => {
        if (Array.isArray(ws)) {
          setWorkspaces(ws);
          if (ws.length > 0 && !data.activeWorkspaceId) {
            setActiveWorkspace(ws[0].id);
          }
        }
      })
      .catch(() => {});
    }
  }, [data?.token]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const currentPath = window.location.hash.replace(/^#\/?/, "") || "fingerprints";

  if (!data?.token) {
    if (route.name === "signup") return <SignupScreen />;
    return <LoginScreen />;
  }

  if (!data.activeWorkspaceId) {
    return <CreateWorkspaceScreen />;
  }

  const cfg = apiConfig(data);

  return (
    <DashboardLayout currentPath={currentPath}>
      {route.name === "fingerprints" && <FingerprintList cfg={cfg} />}
      {route.name === "fingerprint" && <FingerprintDetail cfg={cfg} id={route.params.id!} />}
      {route.name === "event" && <EventDetail cfg={cfg} id={route.params.id!} />}
      {route.name === "incidents" && <IncidentList cfg={cfg} />}
      {route.name === "incident" && <IncidentDetail cfg={cfg} id={route.params.id!} />}
    </DashboardLayout>
  );
}
