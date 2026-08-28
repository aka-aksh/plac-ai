"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";

type SyncedMessage = {
  id: string;
  gmail_message_id: string;
  sender: string | null;
  subject: string | null;
  received_at: string | null;
  relevance_status: string;
  ai_relevant: boolean | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_reason: string | null;
  ai_classified_at: string | null;
};

export default function ActivityLogPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<SyncedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "relevant" | "irrelevant" | "pending">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadActivity() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      setUserEmail(user.email ?? null);

      try {
        const response = await fetch("/api/gmail/messages");
        const data = await response.json();
        if (data.success && data.messages) {
          setMessages(data.messages);
        }
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      } finally {
        setLoading(false);
      }
    }

    loadActivity();
  }, [router]);

  const filteredMessages = messages.filter((m) => {
    if (filter === "relevant" && m.ai_relevant !== true) return false;
    if (filter === "irrelevant" && (m.ai_relevant !== false || m.ai_classified_at === null)) return false;
    if (filter === "pending" && m.ai_classified_at !== null) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchSender = m.sender?.toLowerCase().includes(q) ?? false;
      const matchSubject = m.subject?.toLowerCase().includes(q) ?? false;
      const matchReason = m.ai_reason?.toLowerCase().includes(q) ?? false;
      return matchSender || matchSubject || matchReason;
    }

    return true;
  });

  const relevantCount = messages.filter((m) => m.ai_relevant === true).length;
  const irrelevantCount = messages.filter((m) => m.ai_relevant === false && m.ai_classified_at !== null).length;
  const pendingCount = messages.filter((m) => m.ai_classified_at === null).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar userEmail={userEmail} />
        <div className="flex h-[80vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
            <p className="text-sm text-gray-400">Loading synced emails & AI log...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar userEmail={userEmail} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
              Gmail Sync & AI Activity
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Live audit of emails fetched from your Gmail inbox and Gemini AI classification results.
            </p>
          </div>

          <button
            onClick={() => router.push("/dashboard")}
            className="self-start sm:self-auto rounded-xl border border-gray-750 bg-gray-900 px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Stats Row */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Synced</p>
            <p className="mt-2 text-2xl font-black text-white">{messages.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">AI Relevant</p>
            <p className="mt-2 text-2xl font-black text-emerald-400">{relevantCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filtered Out</p>
            <p className="mt-2 text-2xl font-black text-gray-400">{irrelevantCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">Awaiting AI</p>
            <p className="mt-2 text-2xl font-black text-amber-400">{pendingCount}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sender, subject, AI reason..."
              className="w-full rounded-xl border border-gray-800 bg-gray-900/90 pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-500">🔍</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === "all" ? "bg-emerald-400 text-black" : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              All ({messages.length})
            </button>
            <button
              onClick={() => setFilter("relevant")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === "relevant"
                  ? "bg-emerald-400 text-black"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Relevant ({relevantCount})
            </button>
            <button
              onClick={() => setFilter("irrelevant")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === "irrelevant"
                  ? "bg-emerald-400 text-black"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Filtered ({irrelevantCount})
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === "pending"
                  ? "bg-emerald-400 text-black"
                  : "bg-gray-900 text-gray-400 hover:text-white"
              }`}
            >
              Pending ({pendingCount})
            </button>
          </div>
        </div>

        {/* Message Table */}
        {filteredMessages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center bg-gray-950/40">
            <p className="text-3xl mb-2">📬</p>
            <p className="text-sm font-semibold text-gray-300">No emails match the current view</p>
            <p className="text-xs text-gray-500 mt-1">
              {messages.length === 0
                ? "Click 'Sync & Process' on the Dashboard to fetch your placement emails from Gmail."
                : "Try clearing your search or selecting 'All'."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/80 shadow-xl">
            <div className="divide-y divide-gray-850">
              {filteredMessages.map((msg) => {
                const dateStr = msg.received_at
                  ? new Date(msg.received_at).toLocaleString()
                  : "Unknown date";

                return (
                  <div key={msg.id} className="p-4 sm:p-5 hover:bg-gray-900/40 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {msg.ai_classified_at === null ? (
                          <span className="rounded-full bg-amber-950/80 border border-amber-800 text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">
                            ⏳ Pending AI
                          </span>
                        ) : msg.ai_relevant ? (
                          <span className="rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 px-2.5 py-0.5 text-[11px] font-bold">
                            🟢 Placement Relevant ({msg.ai_category || "Opportunity"})
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-900 border border-gray-700 text-gray-400 px-2.5 py-0.5 text-[11px] font-medium">
                            ⚪ Not Placement Relevant
                          </span>
                        )}

                        {msg.ai_confidence !== null && (
                          <span className="text-[11px] font-mono text-gray-400">
                            Confidence: {Math.round(msg.ai_confidence * 100)}%
                          </span>
                        )}
                      </div>

                      <span className="text-xs font-mono text-gray-400">{dateStr}</span>
                    </div>

                    <h3 className="text-sm font-bold text-white mb-1">{msg.subject || "(No Subject)"}</h3>
                    <p className="text-xs font-mono text-gray-400 truncate mb-2">From: {msg.sender || "Unknown"}</p>

                    {msg.ai_reason && (
                      <div className="rounded-lg bg-gray-900/80 border border-gray-800 p-2.5 text-xs text-gray-300 mt-2">
                        <span className="font-semibold text-emerald-400">Gemini AI Reasoning: </span>
                        {msg.ai_reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
