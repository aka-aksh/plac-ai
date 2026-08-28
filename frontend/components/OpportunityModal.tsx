"use client";

import { useState } from "react";

export type OpportunityFormValues = {
  id?: string;
  company: string;
  role?: string | null;
  source_type: "CDC" | "Non-CDC";
  category?: string | null;
  status?: string | null;
  application_status?: string | null;
  deadline?: string | null;
  apply_link?: string | null;
  eligibility?: string | null;
  next_action?: string | null;
  notes?: string | null;
};

type OpportunityModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: OpportunityFormValues) => Promise<void>;
  initialValues?: Partial<OpportunityFormValues> | null;
  mode: "create" | "edit";
};

const APPLICATION_STATUSES = [
  "Not Decided",
  "Applied",
  "Assessment",
  "Interview",
  "Offer Received",
  "Rejected",
  "Not Interested",
];

const STAGE_STATUSES = [
  "New",
  "Applied",
  "Assessment",
  "Interview",
  "Selected",
  "Rejected",
  "Withdrawn",
  "Closed",
];

export default function OpportunityModal({
  isOpen,
  onClose,
  onSave,
  initialValues,
  mode,
}: OpportunityModalProps) {
  const [form, setForm] = useState<OpportunityFormValues>({
    id: initialValues?.id,
    company: initialValues?.company || "",
    role: initialValues?.role || "",
    source_type: (initialValues?.source_type as "CDC" | "Non-CDC") || "Non-CDC",
    category: initialValues?.category || "Full-Time",
    status: initialValues?.status || "New",
    application_status: initialValues?.application_status || "Not Decided",
    deadline: initialValues?.deadline || "",
    apply_link: initialValues?.apply_link || "",
    eligibility: initialValues?.eligibility || "",
    next_action: initialValues?.next_action || "",
    notes: initialValues?.notes || "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  function updateField<K extends keyof OpportunityFormValues>(field: K, value: OpportunityFormValues[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim()) {
      setError("Company name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save opportunity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 p-6 sm:p-8 text-white shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
          <h2 className="text-xl font-bold">
            {mode === "create" ? "Add Placement Opportunity" : "Edit Opportunity Details"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-950/40 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Company Name *
              </label>
              <input
                type="text"
                required
                value={form.company}
                onChange={(e) => updateField("company", e.target.value)}
                placeholder="e.g., Google, Microsoft, Adobe"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Role / Title
              </label>
              <input
                type="text"
                value={form.role || ""}
                onChange={(e) => updateField("role", e.target.value)}
                placeholder="e.g., Software Development Engineer"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Source
              </label>
              <select
                value={form.source_type}
                onChange={(e) => updateField("source_type", e.target.value as "CDC" | "Non-CDC")}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                <option value="CDC">CDC (Campus)</option>
                <option value="Non-CDC">Non-CDC (Off-campus)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Category
              </label>
              <input
                type="text"
                value={form.category || ""}
                onChange={(e) => updateField("category", e.target.value)}
                placeholder="e.g., Full-Time, Internship"
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Application Status
              </label>
              <select
                value={form.application_status || "Not Decided"}
                onChange={(e) => updateField("application_status", e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Application Deadline (YYYY-MM-DD)
              </label>
              <input
                type="date"
                value={form.deadline || ""}
                onChange={(e) => updateField("deadline", e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                Drive Stage
              </label>
              <select
                value={form.status || "New"}
                onChange={(e) => updateField("status", e.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {STAGE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Apply Link
            </label>
            <input
              type="url"
              value={form.apply_link || ""}
              onChange={(e) => updateField("apply_link", e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Eligibility Criteria
            </label>
            <textarea
              rows={2}
              value={form.eligibility || ""}
              onChange={(e) => updateField("eligibility", e.target.value)}
              placeholder="e.g., Min 7.5 CGPA, CSE/IT branches only, No active backlogs"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Next Action / Important Instructions
            </label>
            <input
              type="text"
              value={form.next_action || ""}
              onChange={(e) => updateField("next_action", e.target.value)}
              placeholder="e.g., Fill Google Form before 5 PM today"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Personal Notes
            </label>
            <textarea
              rows={2}
              value={form.notes || ""}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Private notes (referral contact, test pattern, etc.)"
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-400 px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-300 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : mode === "create" ? "Add Opportunity" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
