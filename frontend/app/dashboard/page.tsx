"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

export default function Dashboard() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        router.replace("/");
        return;
      }

      setUser(data.user);
      setLoading(false);
    });
  }, [router]);

  async function logout() {
    const supabase = createClient();

    await supabase.auth.signOut();

    router.replace("/");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        Loading...
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-xl border p-8 text-center">
        {user.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            className="mx-auto mb-4 h-20 w-20 rounded-full"
          />
        )}

        <h1 className="mb-2 text-2xl font-bold">
          Welcome to Placement AI
        </h1>

        <p className="mb-1">
          {user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            "User"}
        </p>

        <p className="mb-6 text-gray-500">
          {user.email || "No email available"}
        </p>

        <button
          onClick={logout}
          className="rounded-lg border px-6 py-3"
        >
          Logout
        </button>
      </div>
    </main>
  );
}