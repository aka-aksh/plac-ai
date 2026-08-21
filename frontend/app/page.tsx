"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();

      const { data, error } = await supabase.auth.getUser();

      // No logged-in user is completely normal.
      if (error || !data.user) {
        setLoading(false);
        return;
      }

      // User is already logged in.
      router.replace("/dashboard");
    }

    loadUser();
  }, [router]);

  async function loginWithGoogle() {
    setLoggingIn(true);

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,

        // Request read-only Gmail access.
        scopes: "https://www.googleapis.com/auth/gmail.readonly",

        // Request offline access so the authorization
        // can be used for backend Gmail processing.
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("Google login error:", error);
      setLoggingIn(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white p-8">
      <div className="w-full max-w-md text-center">
        <h1 className="text-4xl font-bold mb-4">
          Placement AI
        </h1>

        <p className="text-gray-400 mb-8">
          Your AI-powered placement assistant.
        </p>

        <button
          onClick={loginWithGoogle}
          disabled={loggingIn}
          className="w-full px-6 py-3 rounded border border-gray-400 font-semibold hover:bg-white hover:text-black disabled:opacity-50"
        >
          {loggingIn
            ? "Connecting..."
            : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}