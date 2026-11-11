import { useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL } from "../utils/api";

export function StudioAccess({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE_URL}/auth/session`).then(r => r.json()).then(d => {
      if (mounted) setSignedIn(d.authenticated === true);
    }).catch(() => { if (mounted) { setSignedIn(false); setError("Could not connect. Refresh to try again."); } });
    const timer = setInterval(() => {
      fetch(`${API_BASE_URL}/auth/session`).then(r => r.json()).then(d => { if (mounted && !d.authenticated) setSignedIn(false); }).catch(() => {});
    }, 60000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  if (signedIn === null) return <main className="min-h-screen grid place-items-center text-slate-300">Opening your studio…</main>;
  if (!signedIn) return <main className="min-h-screen grid place-items-center p-6 bg-[#0B0F19]">
    <form className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-8 space-y-5" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not sign in.");
        setPassword(""); setSignedIn(true);
      } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
      finally { setBusy(false); }
    }}>
      <div><h1 className="text-2xl font-semibold text-white">Avatar Studio</h1><p className="mt-2 text-sm text-slate-400">Sign in to your private workspace.</p></div>
      <label className="block text-sm text-slate-300">Username<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3" /></label>
      <label className="block text-sm text-slate-300">Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 p-3" /></label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-lg bg-indigo-600 p-3 font-medium text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </main>;
  return <><button className="fixed bottom-4 right-4 z-50 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-slate-300" onClick={async () => {
    try { const response = await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" }); if (!response.ok) throw new Error(); setSignedIn(false); }
    catch { window.alert("Could not sign out. Try again."); }
  }}>Sign out</button>{children}</>;
}
