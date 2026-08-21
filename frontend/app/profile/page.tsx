"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

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
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);

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
        console.error("User loading error:", userError);
        setLoading(false);
        return;
      }

      const { data: existingProfile, error: fetchError } =
        await supabase
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

        const { data: createdProfile, error: insertError } =
          await supabase
            .from("profiles")
            .insert(newProfile)
            .select()
            .single();

        if (insertError) {
          // Another request may have created the profile already.
          const { data: profileAfterInsert } =
            await supabase
              .from("profiles")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle();

          if (!profileAfterInsert) {
            console.error(
              "Profile creation error:",
              insertError
            );

            setLoading(false);
            return;
          }

          currentProfile = profileAfterInsert;
        } else {
          currentProfile = createdProfile;
        }
      }

      setProfile(currentProfile);

      setForm({
        name: currentProfile.name ?? "",
        university: currentProfile.university ?? "",
        branch: currentProfile.branch ?? "",
        graduation_year:
          currentProfile.graduation_year?.toString() ?? "",
        cgpa: currentProfile.cgpa?.toString() ?? "",
        marks_10:
          currentProfile.marks_10?.toString() ?? "",
        marks_12:
          currentProfile.marks_12?.toString() ?? "",
        registration_number:
          currentProfile.registration_number ?? "",
        neo_id: currentProfile.neo_id ?? "",
        skills:
          currentProfile.skills?.join(", ") ?? "",
      });

      setLoading(false);
    }

    loadProfile();
  }, []);

  function updateField(
    field: keyof FormData,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveProfile() {
    if (!profile) {
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    // Convert:
    // Python, Java, SQL
    //
    // into:
    // ["Python", "Java", "SQL"]
    const skillsArray = form.skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    const updates = {
      name: form.name || null,

      university:
        form.university || null,

      branch:
        form.branch || null,

      graduation_year:
        form.graduation_year
          ? Number(form.graduation_year)
          : null,

      cgpa:
        form.cgpa
          ? Number(form.cgpa)
          : null,

      marks_10:
        form.marks_10
          ? Number(form.marks_10)
          : null,

      marks_12:
        form.marks_12
          ? Number(form.marks_12)
          : null,

      registration_number:
        form.registration_number || null,

      neo_id:
        form.neo_id || null,

      skills: skillsArray,

      updated_at:
        new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", profile.user_id)
      .select()
      .single();

    if (error) {
      console.error(
        "Profile update error:",
        error
      );

      setMessage(
        "Failed to save profile."
      );
    } else {
      setProfile(data);

      setMessage(
        "Profile saved successfully."
      );
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Loading profile...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>Could not load your profile.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">

        <h1 className="text-4xl font-bold mb-10">
          My Profile
        </h1>

        {/* NAME */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Name
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.name}
            onChange={(e) =>
              updateField(
                "name",
                e.target.value
              )
            }
            placeholder="Enter your name"
          />
        </div>

        {/* EMAIL */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Email
          </label>

          <input
            type="email"
            className="w-full border border-gray-500 rounded p-3 bg-gray-800 text-gray-300"
            value={profile.email ?? ""}
            disabled
          />

          <p className="text-sm text-gray-400 mt-2">
            Email is connected to your Google account.
          </p>
        </div>

        {/* UNIVERSITY */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            University
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.university}
            onChange={(e) =>
              updateField(
                "university",
                e.target.value
              )
            }
            placeholder="Enter university"
          />
        </div>

        {/* BRANCH */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Branch
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.branch}
            onChange={(e) =>
              updateField(
                "branch",
                e.target.value
              )
            }
            placeholder="Enter branch"
          />
        </div>

        {/* GRADUATION YEAR */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Graduation Year
          </label>

          <input
            type="number"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.graduation_year}
            onChange={(e) =>
              updateField(
                "graduation_year",
                e.target.value
              )
            }
            placeholder="2027"
          />
        </div>

        {/* CGPA */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            CGPA
          </label>

          <input
            type="number"
            step="0.01"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.cgpa}
            onChange={(e) =>
              updateField(
                "cgpa",
                e.target.value
              )
            }
            placeholder="8.5"
          />
        </div>

        {/* 10TH MARKS */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            10th Marks
          </label>

          <input
            type="number"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.marks_10}
            onChange={(e) =>
              updateField(
                "marks_10",
                e.target.value
              )
            }
            placeholder="90"
          />
        </div>

        {/* 12TH MARKS */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            12th Marks
          </label>

          <input
            type="number"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.marks_12}
            onChange={(e) =>
              updateField(
                "marks_12",
                e.target.value
              )
            }
            placeholder="90"
          />
        </div>

        {/* REGISTRATION NUMBER */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            Registration Number
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.registration_number}
            onChange={(e) =>
              updateField(
                "registration_number",
                e.target.value
              )
            }
            placeholder="Enter registration number"
          />
        </div>

        {/* NEO ID */}

        <div className="mb-6">
          <label className="block font-semibold mb-2">
            NEO ID
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.neo_id}
            onChange={(e) =>
              updateField(
                "neo_id",
                e.target.value
              )
            }
            placeholder="Enter NEO ID"
          />
        </div>

        {/* SKILLS */}

        <div className="mb-8">
          <label className="block font-semibold mb-2">
            Skills
          </label>

          <input
            type="text"
            className="w-full border border-gray-500 rounded p-3 bg-transparent text-white"
            value={form.skills}
            onChange={(e) =>
              updateField(
                "skills",
                e.target.value
              )
            }
            placeholder="Python, Java, SQL"
          />

          <p className="text-sm text-gray-400 mt-2">
            Separate multiple skills with commas.
          </p>
        </div>

        {/* SAVE */}

        <button
          onClick={saveProfile}
          disabled={saving}
          className="px-6 py-3 rounded border border-gray-400 font-semibold hover:bg-white hover:text-black disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : "Save Profile"}
        </button>

        {/* MESSAGE */}

        {message && (
          <p className="mt-6 font-semibold">
            {message}
          </p>
        )}

      </div>
    </main>
  );
}