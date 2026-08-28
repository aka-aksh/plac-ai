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
    <main className="relative isolate min-h-screen overflow-hidden bg-[#070b14] px-6 text-white before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_15%_15%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,0.16),transparent_28%)] flex items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/80 p-8 sm:p-10 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="mb-6 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-300 to-cyan-400 font-black text-slate-950 text-2xl shadow-lg shadow-emerald-500/20">
            P
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
          Your next role starts with <span className="text-emerald-300">AI</span>
        </h1>

        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          Connect your Google account to discover, organize, and act on placement opportunities in one focused dashboard.
        </p>

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
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>
          <p className="mt-5 text-xs leading-5 text-slate-500">Read-only Gmail access is used only to organize placement emails. You stay in control.</p>
          </>
        )}
      </div>
    </main>
  );
}
