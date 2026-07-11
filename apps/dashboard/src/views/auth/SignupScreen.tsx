import { useState } from "react";
import { useAuth } from "../../state/auth";
import { navigate } from "../../navigation";
import { Button, Input, Card, ErrorBox } from "../../components/ui";

const DEFAULT_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http:

export function SignupScreen() {
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url = `${DEFAULT_BASE.replace(/\/$/, "")}/api/v1/auth/signup`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }

      setAuth({
        token: data.token,
        user: data.user,
        activeWorkspaceId: null,
      });
      
    } catch (err) {
      setError("Network error. Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-dash-bg">
      <div className="w-full max-w-[400px] px-4">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.019em] text-dash-text-strong">
            Create an Account
          </h1>
          <p className="text-[14px] leading-[20px] tracking-[-0.09px] text-dash-text-body">
            Get started with Arbiger
          </p>
        </div>
        <Card className="p-5 md:p-6 shadow-md">
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-dash-text-strong">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-dash-text-strong">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </label>
            {error && <ErrorBox message={error} />}
            <Button type="submit" variant="primary" className="mt-2 w-full justify-center" disabled={loading}>
              {loading ? "Creating..." : "Sign Up"}
            </Button>
          </form>
          <div className="mt-4 text-center text-[13px] text-dash-text-body">
            Already have an account?{" "}
            <a href="#login" className="text-dash-text-strong hover:underline font-medium">Log in</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
