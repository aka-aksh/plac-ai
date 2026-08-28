"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          router.replace("/dashboard");
          return;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("Missing Supabase configuration")) {
          setConfigError(msg);
        } else {
          console.error("Session check failed:", error);
        }
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, [router]);

  async function signInWithGoogle() {
    try {
      setSigningIn(true);
      setConfigError(null);

      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "https://www.googleapis.com/auth/gmail.readonly",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        console.error("Google sign-in error:", error);
        setConfigError(error.message);
        setSigningIn(false);
      }
    } catch (error) {
      console.error("Google sign-in failed:", error);
      setConfigError(error instanceof Error ? error.message : "Google sign-in failed.");
      setSigningIn(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#070b14] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
          <p className="text-sm text-gray-400">Checking session...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-6 py-12 text-white before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.16),transparent_28%)]">
      <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/80 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-12">
        <div className="mb-5 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-300 to-cyan-400 font-black text-3xl text-slate-950 shadow-lg shadow-emerald-500/20">
            P
          </span>
        </div>

        <h1 className="mb-2 text-4xl font-black tracking-tight text-white sm:text-5xl">
          Placement<span className="text-emerald-300">AI</span>
        </h1>

        <p className="mb-8 text-sm font-semibold text-emerald-300 sm:text-base">
          Your AI-powered placement companion
        </p>

        <p className="mx-auto max-w-md text-sm leading-7 text-slate-400 sm:text-base">
          PlacementAI helps students discover, organize, and track placement opportunities in one focused dashboard.
        </p>

        <ul className="mx-auto my-8 grid max-w-sm gap-3 text-left text-sm font-medium text-slate-200 sm:text-base">
          {[
            "Track placement opportunities",
            "Organize company deadlines",
            "Find relevant opportunities",
            "Prepare smarter for placements",
          ].map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-xs text-emerald-300">✓</span>
              {feature}
            </li>
          ))}
        </ul>

        {configError ? (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-left text-xs text-amber-100">
            <p className="font-bold text-sm text-amber-300 mb-2">⚙️ Setup Required</p>
            <p className="mb-3 text-gray-300">
              Create a <code className="bg-black/60 px-1.5 py-0.5 rounded text-amber-300">frontend/.env.local</code> file with your Supabase credentials:
            </p>
            <pre className="bg-black/80 rounded-lg p-3 font-mono text-[11px] text-gray-300 overflow-x-auto select-all">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ENCRYPTION_KEY=your-32-byte-base64-key
GEMINI_API_KEY=your-gemini-api-key`}
            </pre>
            <p className="mt-3 text-[11px] text-gray-400">
              See <code className="text-gray-300">frontend/.env.example</code> for complete details.
            </p>
          </div>
        ) : (
          <>
          <button
            onClick={signInWithGoogle}
            disabled={signingIn}
            className="w-full rounded-xl bg-white text-slate-950 px-5 py-4 font-bold hover:-translate-y-0.5 hover:bg-emerald-50 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {signingIn ? (
              <span>Connecting to Google...</span>
            ) : (
              <span>Get Started <span aria-hidden="true">→</span></span>
            )}
          </button>
          <p className="mt-5 text-xs leading-5 text-slate-500">Read-only Gmail access is used only to organize placement emails. You stay in control.</p>
          </>
        )}
        <footer className="mt-8 flex items-center justify-center gap-5 text-xs text-slate-500">
          <a href="/privacy" className="transition-colors hover:text-emerald-300">Privacy Policy</a>
          <a href="/terms" className="transition-colors hover:text-emerald-300">Terms of Service</a>
        </footer>
      </div>
    </main>
  );
}
