import { useState } from "react";
import { useAuth } from "../state/auth";
import { navigate } from "../App";
import { Button, Input, Card, ErrorBox } from "../components/ui";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http:

export function ConnectScreen() {
  const { setConnection } = useAuth();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const url = baseUrl.replace(/\/$/, "");
    try {
      const res = await fetch(`${url}/api/v1/fingerprints?limit=1`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        setError(`Connection failed (${res.status}). Check the API URL and key.`);
        return;
      }
      setConnection({ baseUrl: url, apiKey });
      navigate("/fingerprints");
    } catch {
      setError("Could not reach the API. Check the base URL and your network.");
    }
  }

  return (
    <div className="w-full max-w-[400px] px-4">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.019em] text-dash-text-strong">
          Connect to Arbiger
        </h1>
        <p className="text-[14px] leading-[20px] tracking-[-0.09px] text-dash-text-body">
          Enter your dead-letter console credentials
        </p>
      </div>
      <Card className="p-5 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
        <form onSubmit={connect} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium tracking-[-0.09px] text-dash-text-strong">API URL</span>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http:
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium tracking-[-0.09px] text-dash-text-strong">API Key</span>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="••••••••"
              autoComplete="off"
            />
          </label>
          {error && <ErrorBox message={error} />}
          <Button type="submit" variant="primary" className="mt-2 w-full justify-center">
            Connect
          </Button>
        </form>
      </Card>
    </div>
  );
}
