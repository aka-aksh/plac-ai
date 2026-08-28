"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";

type RelevanceMode = "strict" | "ai" | "smart";
type SyncScope = "inbox" | "all";

type Settings = {
  mode: RelevanceMode;
  sync_scope: SyncScope;
  allowed_senders: string[];
  setup_completed: boolean;
};

export default function RelevanceSettingsPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>({
    mode: "smart",
    sync_scope: "all",
    allowed_senders: [],
    setup_completed: false,
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      setUserEmail(user.email ?? null);

      const { data, error } = await supabase
        .from("gmail_relevance_settings")
        .select("mode, sync_scope, allowed_senders, setup_completed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Relevance settings load error:", error);
        setMessage("Email scope settings are unavailable. Run the latest Supabase migration, then reload this page.");
        setLoading(false);
        return;
      }

      if (data) {
        setSettings({
          mode: (data.mode as RelevanceMode) || "smart",
          sync_scope: (data.sync_scope as SyncScope) || "all",
          allowed_senders: data.allowed_senders ?? [],
          setup_completed: data.setup_completed ?? false,
        });
      }

      setLoading(false);
    }

    loadSettings();
  }, [router]);

  function normalizeEntry(value: string) {
    return value.trim().toLowerCase();
  }

  function addEntry() {
    const normalized = normalizeEntry(input);

    if (!normalized) return;

    if (
      normalized.includes(" ") ||
      (normalized.includes("@") && normalized.split("@").length > 2)
    ) {
      setMessage("Enter a valid email address or domain.");
      return;
    }

    if (!normalized.includes("@") && !normalized.includes(".")) {
      setMessage(
        "Enter an email address or domain such as 'google.com' or 'placement@iit.ac.in'."
      );
      return;
    }

    if (settings.allowed_senders.includes(normalized)) {
      setMessage("That sender/domain is already on the whitelist.");
      return;
    }

    setSettings((current) => ({
      ...current,
      allowed_senders: [...current.allowed_senders, normalized],
    }));

    setInput("");
    setMessage("");
  }

  function removeEntry(entry: string) {
    setSettings((current) => ({
      ...current,
      allowed_senders: current.allowed_senders.filter((item) => item !== entry),
    }));
  }

  async function saveSettings() {
    if (settings.mode === "strict" && settings.allowed_senders.length === 0) {
      setMessage("Please add at least one sender or domain for strict mode.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/");
      return;
    }

    const { error } = await supabase.from("gmail_relevance_settings").upsert(
      {
        user_id: user.id,
        mode: settings.mode,
        sync_scope: settings.sync_scope,
        allowed_senders: settings.allowed_senders,
        setup_completed: true,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

    if (error) {
      console.error("Relevance settings save error:", error);
      setMessage("Could not save settings. Run the latest Supabase migration and try again.");
      setSaving(false);
      return;
    }

    setMessage("✓ Settings saved successfully.");
    setSaving(false);

    setTimeout(() => {
      router.replace("/dashboard");
    }, 600);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar userEmail={userEmail} />
        <div className="flex h-[80vh] items-center justify-center">
          <p className="text-sm text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500 selection:text-black">
      <Navbar userEmail={userEmail} />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
            Email Relevance & Scope Settings
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Configure which emails Placement AI reads (INBOX vs ALL) and how relevance is determined.
          </p>
        </div>

        {message && (
          <div
            className={`mb-8 rounded-xl border p-4 text-sm font-medium ${
              message.startsWith("✓")
                ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                : "border-red-800 bg-red-950/40 text-red-300"
            }`}
          >
            {message}
          </div>
        )}

        <div className="rounded-2xl border border-gray-800 bg-gray-950/80 p-6 sm:p-8 space-y-8 shadow-xl">
          {/* 1. Email Scope: INBOX vs ALL */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                1. Email Reading Scope
              </h2>
              <span className="rounded-full bg-emerald-950 border border-emerald-800 px-2 py-0.2 text-[10px] font-bold text-emerald-300">
                New
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Select where Placement AI should fetch your placement and career emails from:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option: INBOX Only */}
              <label
                className={`flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all ${
                  settings.sync_scope === "inbox"
                    ? "border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-950/40"
                    : "border-gray-850 bg-gray-900/40 hover:border-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="sync_scope"
                  value="inbox"
                  checked={settings.sync_scope === "inbox"}
                  onChange={() =>
                    setSettings((c) => ({ ...c, sync_scope: "inbox" }))
                  }
                  className="mt-1 accent-emerald-500 h-4 w-4"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-white text-sm">📥 INBOX Only</strong>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Only reads emails currently in your primary/active Gmail Inbox (`in:inbox`). Ignores archived and categorized mail.
                  </p>
                </div>
              </label>

              {/* Option: ALL Mails */}
              <label
                className={`flex items-start gap-3.5 rounded-xl border p-4 cursor-pointer transition-all ${
                  settings.sync_scope === "all"
                    ? "border-emerald-500 bg-emerald-950/30 shadow-md shadow-emerald-950/40"
                    : "border-gray-850 bg-gray-900/40 hover:border-gray-700"
                }`}
              >
                <input
                  type="radio"
                  name="sync_scope"
                  value="all"
                  checked={settings.sync_scope === "all"}
                  onChange={() =>
                    setSettings((c) => ({ ...c, sync_scope: "all" }))
                  }
                  className="mt-1 accent-emerald-500 h-4 w-4"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-white text-sm">📬 ALL Mails (Recommended)</strong>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Reads all emails across your entire mailbox including archived circulars, Updates, Forums, and custom labels.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 2. Mode Selection */}
          <div className="border-t border-gray-850 pt-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4">
              2. Relevance Classification Mode
            </h2>

            <div className="space-y-3">
              <label
                className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                  settings.mode === "smart"
                    ? "border-emerald-500/80 bg-emerald-950/20"
                    : "border-gray-850 bg-gray-900/40 hover:border-gray-750"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="smart"
                  checked={settings.mode === "smart"}
                  onChange={() => setSettings((c) => ({ ...c, mode: "smart" }))}
                  className="mt-1 accent-emerald-500 h-4 w-4"
                />
                <div>
                  <strong className="text-white text-sm">
                    Smart Hybrid Mode (Recommended)
                  </strong>
                  <p className="text-xs text-gray-400 mt-1">
                    Your whitelist serves as an immediate high-priority rule, while ambiguous emails are evaluated by Gemini AI.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                  settings.mode === "strict"
                    ? "border-emerald-500/80 bg-emerald-950/20"
                    : "border-gray-850 bg-gray-900/40 hover:border-gray-750"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="strict"
                  checked={settings.mode === "strict"}
                  onChange={() => setSettings((c) => ({ ...c, mode: "strict" }))}
                  className="mt-1 accent-emerald-500 h-4 w-4"
                />
                <div>
                  <strong className="text-white text-sm">
                    Whitelist Senders Only (Strict)
                  </strong>
                  <p className="text-xs text-gray-400 mt-1">
                    Only emails originating from your designated list of senders or domains will be processed. All other emails are ignored.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                  settings.mode === "ai"
                    ? "border-emerald-500/80 bg-emerald-950/20"
                    : "border-gray-850 bg-gray-900/40 hover:border-gray-750"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value="ai"
                  checked={settings.mode === "ai"}
                  onChange={() => setSettings((c) => ({ ...c, mode: "ai" }))}
                  className="mt-1 accent-emerald-500 h-4 w-4"
                />
                <div>
                  <strong className="text-white text-sm">
                    Full AI Decision Mode
                  </strong>
                  <p className="text-xs text-gray-400 mt-1">
                    Gemini evaluates every incoming email to automatically classify whether it represents a placement opportunity.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* 3. Senders / Domains Input */}
          <div className="border-t border-gray-850 pt-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-2">
              3. Whitelisted Senders & Domains
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Add your college CDC / placement office email or company domains (e.g. `vitbhopal.ac.in`, `vitlions2027@vitbhopal.ac.in`).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEntry();
                  }
                }}
                placeholder="e.g. vitlions2027@vitbhopal.ac.in, placementoffice@vitbhopal.ac.in"
                className="flex-1 rounded-xl border border-gray-750 bg-gray-900 px-4 py-2.5 text-xs sm:text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={addEntry}
                className="rounded-xl bg-gray-800 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
              >
                Add
              </button>
            </div>

            {/* List of Whitelisted Senders */}
            <div className="mt-4 space-y-2">
              {settings.allowed_senders.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-2">
                  No specific senders or domains added yet. (Smart mode will use Gemini AI).
                </p>
              ) : (
                settings.allowed_senders.map((entry) => (
                  <div
                    key={entry}
                    className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2.5 text-xs text-gray-200"
                  >
                    <span className="font-mono">{entry}</span>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry)}
                      className="text-red-400 hover:text-red-300 font-semibold text-xs"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Save Action */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-850">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-xs font-semibold text-gray-400 hover:text-white"
            >
              ← Back to Dashboard
            </button>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="rounded-xl bg-emerald-400 px-8 py-3 text-xs sm:text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-emerald-950/40"
            >
              {saving ? "Saving Settings..." : "Save Settings"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
