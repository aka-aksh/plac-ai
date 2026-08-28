"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";

type Profile = {
  user_id: string;
  name: string | null;
  email: string | null;
  cgpa: number | null;
  neo_id: string | null;
  marks_10: number | null;
  marks_12: number | null;
  registration_number: string | null;
  branch: string | null;
  university: string | null;
  graduation_year: number | null;
  skills: string[] | null;
  resume_url: string | null;
  avatar_url: string | null;
};

type FormData = {
  name: string;
  university: string;
  branch: string;
  graduation_year: string;
  cgpa: string;
  marks_10: string;
  marks_12: string;
  registration_number: string;
  neo_id: string;
  skills: string;
  resume_url: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [form, setForm] = useState<FormData>({
    name: "",
    university: "",
    branch: "",
    graduation_year: "",
    cgpa: "",
    marks_10: "",
    marks_12: "",
    registration_number: "",
    neo_id: "",
    skills: "",
    resume_url: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
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

      const { data: existingProfile, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) {
        console.error("Profile loading error:", fetchError);
        setLoading(false);
        return;
      }

      let currentProfile = existingProfile;

      // Create a profile only when one doesn't exist.
      if (!currentProfile) {
        const newProfile = {
          user_id: user.id,
          name:
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            "",
          email: user.email ?? "",
          avatar_url:
            user.user_metadata?.avatar_url ??
            user.user_metadata?.picture ??
            null,
        };

        const { data: createdProfile, error: insertError } = await supabase
          .from("profiles")
          .insert(newProfile)
          .select()
          .single();

        if (insertError) {
          const { data: profileAfterInsert } = await supabase
            .from("profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          currentProfile = profileAfterInsert;
        } else {
          currentProfile = createdProfile;
        }
      }

      if (currentProfile) {
        setProfile(currentProfile);
        setForm({
          name: currentProfile.name ?? "",
          university: currentProfile.university ?? "",
          branch: currentProfile.branch ?? "",
          graduation_year: currentProfile.graduation_year?.toString() ?? "",
          cgpa: currentProfile.cgpa?.toString() ?? "",
          marks_10: currentProfile.marks_10?.toString() ?? "",
          marks_12: currentProfile.marks_12?.toString() ?? "",
          registration_number: currentProfile.registration_number ?? "",
          neo_id: currentProfile.neo_id ?? "",
          skills: currentProfile.skills?.join(", ") ?? "",
          resume_url: currentProfile.resume_url ?? "",
        });
      }

      setLoading(false);
    }

    loadProfile();
  }, [router]);

  function updateField(field: keyof FormData, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile() {
    if (!profile) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const skillsArray = form.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    const updates = {
      name: form.name || null,
      university: form.university || null,
      branch: form.branch || null,
      graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
      cgpa: form.cgpa ? Number(form.cgpa) : null,
      marks_10: form.marks_10 ? Number(form.marks_10) : null,
      marks_12: form.marks_12 ? Number(form.marks_12) : null,
      registration_number: form.registration_number || null,
      neo_id: form.neo_id || null,
      skills: skillsArray,
      resume_url: form.resume_url || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", profile.user_id)
      .select()
      .single();

    if (error) {
      console.error("Profile update error:", error);
      setMessage("Failed to save profile: " + error.message);
    } else {
      setProfile(data);
      setMessage("✓ Profile saved successfully! Your eligibility will now be automatically matched.");
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar userEmail={userEmail} />
        <div className="flex h-[80vh] items-center justify-center">
          <p className="text-sm text-gray-400">Loading student profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar userEmail={userEmail} />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
            Student Profile
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Keep your academic and skill information updated for accurate placement eligibility matching.
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
          {/* Section 1: Basic Info */}
          <div>
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-3 mb-5">
              Personal & University Information
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. Alex Johnson"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Google Account Email
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed"
                  value={profile?.email ?? ""}
                  disabled
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  University / College Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.university}
                  onChange={(e) => updateField("university", e.target.value)}
                  placeholder="e.g. Indian Institute of Technology"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Degree & Branch / Major
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.branch}
                  onChange={(e) => updateField("branch", e.target.value)}
                  placeholder="e.g. Computer Science and Engineering (CSE)"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Graduation Year (Batch)
                </label>
                <input
                  type="number"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.graduation_year}
                  onChange={(e) => updateField("graduation_year", e.target.value)}
                  placeholder="2026"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  College Registration / Roll Number
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.registration_number}
                  onChange={(e) => updateField("registration_number", e.target.value)}
                  placeholder="e.g. 21BCSE042"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  NEO ID / Placement Portal ID
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.neo_id}
                  onChange={(e) => updateField("neo_id", e.target.value)}
                  placeholder="e.g. NEO-8492"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  Resume / Portfolio URL
                </label>
                <input
                  type="url"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  value={form.resume_url}
                  onChange={(e) => updateField("resume_url", e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>
            </div>
          </div>

          {/* Section 2: Academic Scores for Cutoff Matching */}
          <div>
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-3 mb-5">
              Academic Scores (For Eligibility Cutoffs)
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
                  Current College CGPA (0 - 10) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  className="w-full rounded-xl border border-emerald-700/60 bg-emerald-950/20 px-4 py-2.5 text-sm font-mono font-bold text-white focus:border-emerald-400 focus:outline-none"
                  value={form.cgpa}
                  onChange={(e) => updateField("cgpa", e.target.value)}
                  placeholder="8.50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  10th Standard Marks (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                  value={form.marks_10}
                  onChange={(e) => updateField("marks_10", e.target.value)}
                  placeholder="92.4"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  12th Standard Marks (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
                  value={form.marks_12}
                  onChange={(e) => updateField("marks_12", e.target.value)}
                  placeholder="89.6"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Technical Skills */}
          <div>
            <h2 className="text-lg font-bold text-white border-b border-gray-800 pb-3 mb-5">
              Skills & Tech Stack
            </h2>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Technical Skills (Comma-separated)
              </label>
              <textarea
                rows={3}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 p-4 text-sm text-white focus:border-emerald-500 focus:outline-none"
                value={form.skills}
                onChange={(e) => updateField("skills", e.target.value)}
                placeholder="Python, React, TypeScript, Java, SQL, Node.js, AWS, Machine Learning"
              />
              <p className="mt-2 text-xs text-gray-500">
                These skills will be automatically matched against incoming placement JDs and role requirements.
              </p>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-800">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-xs font-semibold text-gray-400 hover:text-white"
            >
              ← Back to Opportunities
            </button>

            <button
              onClick={saveProfile}
              disabled={saving}
              className="rounded-xl bg-emerald-400 px-8 py-3 text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-emerald-950/40"
            >
              {saving ? "Saving Profile..." : "Save Profile"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}