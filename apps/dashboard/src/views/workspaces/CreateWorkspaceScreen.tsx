import { useState } from "react";
import { useAuth } from "../../state/auth";
import { navigate } from "../../App";
import { Button, Input, Card, ErrorBox } from "../../components/ui";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http:

export function CreateWorkspaceScreen() {
  const { data, setActiveWorkspace, setWorkspaces } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url = `${DEFAULT_BASE.replace(/\/$/, "")}/api/v1/workspaces`;
      const res = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${data?.token}`
        },
        body: JSON.stringify({ name }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create workspace");
        return;
      }

      setApiKey(json.apiKey);
      setWorkspaces([{ id: json.tenant.id, name: json.tenant.name, role: "owner" }]);
      setActiveWorkspace(json.tenant.id);
    } catch (err) {
      setError("Network error. Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  if (apiKey) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-dash-bg">
        <div className="w-full max-w-[500px] px-4">
          <Card className="p-6 shadow-md text-center">
            <h2 className="text-xl font-semibold text-dash-text-strong mb-2">Workspace Created!</h2>
            <p className="text-dash-text-body text-[14px] mb-4">
              Your workspace is ready. Save this API key to send events from your application.
            </p>
            <div className="bg-[#1a1c1e] border border-dash-border rounded p-4 mb-6">
              <code className="text-dash-text-strong font-mono">{apiKey}</code>
            </div>
            <Button variant="primary" onClick={() => navigate("/fingerprints")} className="w-full justify-center">
              Go to Dashboard
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-dash-bg">
      <div className="w-full max-w-[400px] px-4">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.019em] text-dash-text-strong">
            Create a Workspace
          </h1>
          <p className="text-[14px] leading-[20px] tracking-[-0.09px] text-dash-text-body">
            You need a workspace to start tracking events
          </p>
        </div>
        <Card className="p-5 md:p-6 shadow-md">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-dash-text-strong">Workspace Name</span>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome App"
                required
              />
            </label>
            {error && <ErrorBox message={error} />}
            <Button type="submit" variant="primary" className="mt-2 w-full justify-center" disabled={loading}>
              {loading ? "Creating..." : "Create Workspace"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
