"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type RelevanceMode = "strict" | "ai" | "smart";

type Settings = {
  mode: RelevanceMode;
  allowed_senders: string[];
  setup_completed: boolean;
};

export default function RelevanceSettingsPage() {
  const router = useRouter();

  const [settings, setSettings] = useState<Settings>({
    mode: "strict",
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

      const { data, error } = await supabase
        .from("gmail_relevance_settings")
        .select(
          "mode, allowed_senders, setup_completed"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error(
          "Relevance settings loading error:",
          error
        );

        setLoading(false);
        return;
      }

      if (data) {
        setSettings({
          mode: data.mode as RelevanceMode,
          allowed_senders:
            data.allowed_senders ?? [],
          setup_completed:
            data.setup_completed ?? false,
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

    if (!normalized) {
      return;
    }

    if (
      normalized.includes(" ") ||
      normalized.includes("@") &&
        normalized.split("@").length > 2
    ) {
      setMessage(
        "Enter a valid email address or domain."
      );
      return;
    }

    if (
      !normalized.includes("@") &&
      !normalized.includes(".")
    ) {
      setMessage(
        "Enter an email address or domain such as google.com."
      );
      return;
    }

    if (
      settings.allowed_senders.includes(
        normalized
      )
    ) {
      setMessage("That entry is already added.");
      return;
    }

    setSettings((current) => ({
      ...current,
      allowed_senders: [
        ...current.allowed_senders,
        normalized,
      ],
    }));

    setInput("");
    setMessage("");
  }

  function removeEntry(entry: string) {
    setSettings((current) => ({
      ...current,
      allowed_senders:
        current.allowed_senders.filter(
          (item) => item !== entry
        ),
    }));
  }

  async function saveSettings() {
    if (
      settings.mode === "strict" &&
      settings.allowed_senders.length === 0
    ) {
      setMessage(
        "Add at least one sender or domain for strict mode."
      );
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

    const { error } = await supabase
      .from("gmail_relevance_settings")
      .upsert(
        {
          user_id: user.id,
          mode: settings.mode,
          allowed_senders:
            settings.allowed_senders,
          setup_completed: true,
          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict: "user_id",
        }
      );

    if (error) {
      console.error(
        "Relevance settings save error:",
        error
      );

      setMessage(
        "Could not save settings."
      );

      setSaving(false);
      return;
    }

    setMessage(
      "Settings saved successfully."
    );

    setSaving(false);

    setTimeout(() => {
      router.replace("/dashboard");
    }, 500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">
          Email Relevance Setup
        </h1>

        <p className="text-gray-400 mb-8">
          Tell Placement AI which senders or domains
          should be considered relevant to your
          placement search.
        </p>

        <div className="space-y-4 mb-10">
          <label className="block border rounded-lg p-4 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="strict"
              checked={
                settings.mode === "strict"
              }
              onChange={() =>
                setSettings((current) => ({
                  ...current,
                  mode: "strict",
                }))
              }
              className="mr-3"
            />

            <strong>
              Specific senders/domains only
            </strong>

            <p className="text-sm text-gray-400 mt-1 ml-6">
              Only emails matching your list are
              considered relevant.
            </p>
          </label>

          <label className="block border rounded-lg p-4 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="ai"
              checked={settings.mode === "ai"}
              onChange={() =>
                setSettings((current) => ({
                  ...current,
                  mode: "ai",
                }))
              }
              className="mr-3"
            />

            <strong>
              AI decides later
            </strong>

            <p className="text-sm text-gray-400 mt-1 ml-6">
              Keep emails available for the future
              AI relevance classifier.
            </p>
          </label>

          <label className="block border rounded-lg p-4 cursor-pointer">
            <input
              type="radio"
              name="mode"
              value="smart"
              checked={
                settings.mode === "smart"
              }
              onChange={() =>
                setSettings((current) => ({
                  ...current,
                  mode: "smart",
                }))
              }
              className="mr-3"
            />

            <strong>
              Smart mode
            </strong>

            <p className="text-sm text-gray-400 mt-1 ml-6">
              Your sender/domain list is a strong
              signal; ambiguous emails can later go
              through AI.
            </p>
          </label>
        </div>

        <div className="mb-4">
          <label className="block font-semibold mb-2">
            Relevant senders or domains
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) =>
                setInput(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addEntry();
                }
              }}
              placeholder="careers@google.com or google.com"
              className="flex-1 rounded-lg border border-gray-500 bg-transparent p-3"
            />

            <button
              type="button"
              onClick={addEntry}
              className="rounded-lg border px-5"
            >
              Add
            </button>
          </div>
        </div>

        <div className="space-y-2 mb-8">
          {settings.allowed_senders.length ===
          0 ? (
            <p className="text-gray-500">
              No senders or domains added yet.
            </p>
          ) : (
            settings.allowed_senders.map(
              (entry) => (
                <div
                  key={entry}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span>{entry}</span>

                  <button
                    type="button"
                    onClick={() =>
                      removeEntry(entry)
                    }
                    className="text-red-400"
                  >
                    Remove
                  </button>
                </div>
              )
            )
          )}
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="rounded-lg border px-6 py-3 font-semibold hover:bg-white hover:text-black disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : "Save & Continue"}
        </button>

        {message && (
          <p className="mt-5 font-semibold">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}