"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

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
        console.error(
          "Session check failed:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, [router]);

  async function signInWithGoogle() {
    try {
      setSigningIn(true);

      const supabase = createClient();

      const {
        error,
      } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo:
              `${window.location.origin}/auth/callback`,
            scopes:
              "https://www.googleapis.com/auth/gmail.readonly",
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });

      if (error) {
        console.error(
          "Google sign-in error:",
          error
        );

        setSigningIn(false);
      }
    } catch (error) {
      console.error(
        "Google sign-in failed:",
        error
      );

      setSigningIn(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-white px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-800 p-8 text-center">
        <h1 className="text-4xl font-bold mb-3">
          Placement AI
        </h1>

        <p className="text-gray-400 mb-8">
          Turn placement emails into organized
          opportunities.
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={signingIn}
          className="w-full rounded-lg border border-gray-600 px-5 py-3 font-semibold hover:bg-white hover:text-black disabled:opacity-50"
        >
          {signingIn
            ? "Connecting..."
            : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}
