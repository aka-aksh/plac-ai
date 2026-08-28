"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import Navbar from "@/components/Navbar";
import OpportunityModal, {
  OpportunityFormValues,
} from "@/components/OpportunityModal";
import {
  evaluateEligibility,
  StudentProfile,
  EligibilityResult,
} from "@/lib/eligibility-matcher";

type Attachment = {
  id: string;
  filename: string;
  processed: boolean;
  extracted_summary: string | null;
};

type Opportunity = {
  id: string;
  company: string;
  role: string | null;
  source_type: "CDC" | "Non-CDC";
  category: string | null;
  status: string | null;
  application_status: string;
  deadline: string | null;
  apply_link: string | null;
  eligibility: string | null;
  next_action: string | null;
  ai_confidence: number | null;
  notes: string | null;
  updated_at: string;
  attachments: Attachment[];
};

type PipelineResult = {
  processed?: boolean;
  error?: string;
  details?: string;
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

const MAX_EMAILS_PER_RUN = 30;
const MAX_ATTACHMENTS_PER_RUN = 20;

function display(value: string | null | undefined) {
  return value?.trim() || "Not mentioned";
}

function getDeadlineInfo(value: string | null) {
  if (!value) return { text: "Not mentioned", isPast: false, isUrgent: false };
  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) {
    return { text: value, isPast: false, isUrgent: false };
  }

  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return { text: `${date.toLocaleDateString()} (Passed)`, isPast: true, isUrgent: false };
  }
  if (diffDays === 0) {
    return { text: `Today (${date.toLocaleDateString()})`, isPast: false, isUrgent: true };
  }
  if (diffDays <= 3) {
    return { text: `${diffDays}d left (${date.toLocaleDateString()})`, isPast: false, isUrgent: true };
  }

  return { text: date.toLocaleDateString(), isPast: false, isUrgent: false };
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "CDC" | "Non-CDC">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eligibilityFilter, setEligibilityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"deadline" | "updated" | "confidence">("deadline");

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);

  // Criteria popup expand states
  const [expandedCriteria, setExpandedCriteria] = useState<Record<string, boolean>>({});

  const loadDashboard = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: currentUser },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !currentUser) {
      router.replace("/");
      return;
    }

    setUser(currentUser);

    // Load student profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("cgpa, branch, graduation_year, marks_10, marks_12, skills, university")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData);
    }

    // Load opportunities (with automatic fallback if notes column is not created yet)
    let rows: any[] = [];
    const { data: primaryRows, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select(
        "id, company, role, source_type, category, status, application_status, deadline, apply_link, eligibility, next_action, ai_confidence, notes, updated_at"
      )
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (opportunitiesError) {
      if (opportunitiesError.message.includes("notes")) {
        // Fallback without notes column
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("opportunities")
          .select(
            "id, company, role, source_type, category, status, application_status, deadline, apply_link, eligibility, next_action, ai_confidence, updated_at"
          )
          .eq("user_id", currentUser.id)
          .order("updated_at", { ascending: false });

        if (fallbackError) {
          setNotice(`Could not load opportunities: ${fallbackError.message}`);
          setLoading(false);
          return;
        }
        rows = (fallbackRows ?? []).map((r) => ({ ...r, notes: null }));
      } else {
        setNotice(`Could not load opportunities: ${opportunitiesError.message}`);
        setLoading(false);
        return;
      }
    } else {
      rows = primaryRows ?? [];
    }

    const opportunityIds = rows.map((row) => row.id);
    const attachmentsByOpportunity = new Map<string, Attachment[]>();

    if (opportunityIds.length) {
      const { data: links } = await supabase
        .from("opportunity_messages")
        .select("opportunity_id, gmail_message_id")
        .in("opportunity_id", opportunityIds);

      if (links) {
        const messageToOpportunity = new Map<string, string>();
        for (const link of links) {
          messageToOpportunity.set(link.gmail_message_id, link.opportunity_id);
        }

        const messageIds = Array.from(messageToOpportunity.keys());
        if (messageIds.length) {
          const { data: attachments } = await supabase
            .from("gmail_attachments")
            .select("id, gmail_message_id, filename, processed, extracted_summary")
            .eq("user_id", currentUser.id)
            .in("gmail_message_id", messageIds);

          for (const attachment of attachments ?? []) {
            const opportunityId = messageToOpportunity.get(attachment.gmail_message_id);
            if (!opportunityId) continue;
            const current = attachmentsByOpportunity.get(opportunityId) ?? [];
            current.push({
              id: attachment.id,
              filename: attachment.filename,
              processed: attachment.processed ?? false,
              extracted_summary: attachment.extracted_summary ?? null,
            });
            attachmentsByOpportunity.set(opportunityId, current);
          }
        }
      }
    }

    setOpportunities(
      rows.map((row) => ({
        ...row,
        source_type: row.source_type || "Non-CDC",
        application_status: row.application_status || "Not Decided",
        attachments: attachmentsByOpportunity.get(row.id) ?? [],
      }))
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  async function requestPipeline(path: string): Promise<PipelineResult> {
    const response = await fetch(path, { cache: "no-store" });
    const result = (await response.json()) as PipelineResult;
    if (!response.ok) throw new Error(result.details || result.error || "Request failed");
    return result;
  }

  async function syncAndProcess() {
    setProcessing(true);
    setNotice("⚡ Step 1/3: Fetching emails from Gmail inbox...");

    try {
      await requestPipeline("/api/gmail/sync");

      let emailsProcessed = 0;
      setNotice("⚡ Step 2/3: AI Classifying & Extracting companies from emails...");
      for (; emailsProcessed < MAX_EMAILS_PER_RUN; emailsProcessed += 1) {
        setNotice(`⚡ Step 2/3: Processing email ${emailsProcessed + 1}...`);
        const result = await requestPipeline("/api/ai/process");
        if (!result.processed) break;
      }

      let attachmentsProcessed = 0;
      setNotice("⚡ Step 3/3: Parsing attachments and JDs...");
      for (; attachmentsProcessed < MAX_ATTACHMENTS_PER_RUN; attachmentsProcessed += 1) {
        setNotice(`⚡ Step 3/3: Processing attachment ${attachmentsProcessed + 1}...`);
        const result = await requestPipeline("/api/attachments/process");
        if (!result.processed) break;
      }

      await loadDashboard();
      setNotice(
        `✓ Sync & extraction complete! Evaluated ${emailsProcessed} email${
          emailsProcessed === 1 ? "" : "s"
        } and ${attachmentsProcessed} attachment${attachmentsProcessed === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Gmail processing run failed.");
    } finally {
      setProcessing(false);
    }
  }

  // Update Application Status in real time
  async function handleStatusChange(opportunityId: string, newStatus: string) {
    // Optimistic update
    setOpportunities((prev) =>
      prev.map((opp) =>
        opp.id === opportunityId ? { ...opp, application_status: newStatus } : opp
      )
    );

    try {
      const response = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: opportunityId,
          application_status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }
    } catch (error) {
      console.error("Status update error:", error);
      setNotice("Failed to save application status update.");
      await loadDashboard();
    }
  }

  // Save Modal (Create / Edit)
  async function handleSaveOpportunity(values: OpportunityFormValues) {
    if (modalMode === "create") {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to create opportunity");
    } else {
      const response = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update opportunity");
    }

    await loadDashboard();
    setNotice(
      modalMode === "create"
        ? "✓ Opportunity added successfully."
        : "✓ Opportunity updated successfully."
    );
  }

  // Delete Opportunity
  async function handleDeleteOpportunity(opportunityId: string, companyName: string) {
    if (!window.confirm(`Are you sure you want to delete the opportunity for "${companyName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/opportunities?id=${opportunityId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete opportunity");
      }

      setOpportunities((prev) => prev.filter((opp) => opp.id !== opportunityId));
      setNotice(`✓ Deleted opportunity for ${companyName}.`);
    } catch (error) {
      console.error("Delete error:", error);
      setNotice("Failed to delete opportunity.");
    }
  }

  // Open Edit Modal
  function handleOpenEdit(opp: Opportunity) {
    setSelectedOpportunity(opp);
    setModalMode("edit");
    setIsModalOpen(true);
  }

  // Open Create Modal
  function handleOpenCreate() {
    setSelectedOpportunity(null);
    setModalMode("create");
    setIsModalOpen(true);
  }

  // Toggle criteria expansion
  function toggleCriteria(id: string) {
    setExpandedCriteria((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Filter and Sort opportunities
  const processedOpportunities = useMemo(() => {
    return opportunities
      .map((opp) => {
        const extraContext = opp.attachments.map((a) => a.extracted_summary).filter(Boolean).join(" ");
        const eligibilityResult: EligibilityResult = evaluateEligibility(
          opp.eligibility,
          profile,
          `${opp.role ?? ""} ${extraContext}`
        );
        return { ...opp, eligibilityResult };
      })
      .filter((opp) => {
        // Source Filter
        if (sourceFilter !== "all" && opp.source_type !== sourceFilter) return false;

        // Application Status Filter
        if (statusFilter !== "all" && opp.application_status !== statusFilter) return false;

        // Eligibility Filter
        if (eligibilityFilter !== "all" && opp.eligibilityResult.status !== eligibilityFilter) return false;

        // Search Query Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            opp.company.toLowerCase().includes(q) ||
            (opp.role && opp.role.toLowerCase().includes(q)) ||
            (opp.category && opp.category.toLowerCase().includes(q)) ||
            (opp.eligibility && opp.eligibility.toLowerCase().includes(q)) ||
            (opp.notes && opp.notes.toLowerCase().includes(q)) ||
            opp.eligibilityResult.matchedSkills.some((s) => s.toLowerCase().includes(q));
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "deadline") {
          // Sort by nearest upcoming deadline first, then missing deadlines
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return a.deadline.localeCompare(b.deadline);
        }
        if (sortBy === "confidence") {
          return (b.ai_confidence ?? 0) - (a.ai_confidence ?? 0);
        }
        // updated_at
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [opportunities, profile, sourceFilter, statusFilter, eligibilityFilter, searchQuery, sortBy]);

  const totalAttachments = opportunities.reduce(
    (acc, opp) => acc + opp.attachments.filter((a) => a.processed).length,
    0
  );

  const eligibleCount = opportunities.filter((opp) => {
    const res = evaluateEligibility(opp.eligibility, profile);
    return res.status === "eligible";
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar userEmail={user?.email} />
        <div className="flex h-[80vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"></div>
            <p className="text-sm text-gray-400">Loading placement dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar userEmail={user?.email} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Header & Overview Stats */}
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl text-white">
              Placement Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-400">
              Track, organize, and match opportunities extracted from your placement emails.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:border-emerald-500 hover:text-emerald-400 transition-all shadow-sm"
            >
              <span>+ Add Opportunity</span>
            </button>
            <button
              onClick={syncAndProcess}
              disabled={processing}
              className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-emerald-950/40"
            >
              <span>{processing ? "Syncing Inbox..." : "⚡ Sync & Process"}</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total Opportunities
            </p>
            <p className="mt-2 text-3xl font-black text-white">{opportunities.length}</p>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Eligible for You
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-400">{eligibleCount}</p>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Processed JDs / Attachments
            </p>
            <p className="mt-2 text-3xl font-black text-white">{totalAttachments}</p>
          </div>

          <div className="rounded-2xl border border-gray-800/80 bg-gray-950/60 p-5 backdrop-blur-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Student Profile
            </p>
            <p className="mt-2 text-sm font-medium text-gray-300">
              {profile?.cgpa ? `CGPA: ${profile.cgpa} • ${profile.branch || "General"}` : (
                <button
                  onClick={() => router.push("/profile")}
                  className="text-emerald-400 hover:underline"
                >
                  Configure Profile →
                </button>
              )}
            </p>
          </div>
        </div>

        {notice && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900/80 px-4 py-3 text-sm text-gray-200 shadow-md">
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter, Search & Sort Control Bar */}
        <div className="mb-8 rounded-2xl border border-gray-800 bg-gray-950/90 p-4 sm:p-5 shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company, role, skills, keywords..."
                className="w-full rounded-xl border border-gray-700 bg-gray-900/90 pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <span className="absolute left-3.5 top-3 text-gray-500">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as "all" | "CDC" | "Non-CDC")}
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Sources</option>
                <option value="CDC">CDC (Campus)</option>
                <option value="Non-CDC">Non-CDC (Off-Campus)</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                {APPLICATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              {/* Eligibility Filter */}
              <select
                value={eligibilityFilter}
                onChange={(e) => setEligibilityFilter(e.target.value)}
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="all">All Eligibility</option>
                <option value="eligible">Eligible Only 🟢</option>
                <option value="ineligible">Ineligible 🔴</option>
                <option value="review">Needs Review 🟡</option>
              </select>

              {/* Sort By */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "deadline" | "updated" | "confidence")}
                className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-emerald-400 focus:border-emerald-500 focus:outline-none"
              >
                <option value="deadline">Sort: Nearest Deadline</option>
                <option value="updated">Sort: Recently Updated</option>
                <option value="confidence">Sort: AI Confidence</option>
              </select>
            </div>
          </div>
        </div>

        {/* Opportunity Cards List */}
        {processedOpportunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center bg-gray-950/40">
            <p className="text-4xl mb-3">📭</p>
            <h3 className="text-lg font-bold text-white">No opportunities found</h3>
            <p className="mt-1 text-sm text-gray-400 max-w-md mx-auto">
              {opportunities.length === 0
                ? "Click 'Sync & Process' to fetch opportunities from your Gmail inbox, or add an opportunity manually."
                : "No opportunities match your search query and filters."}
            </p>
            {opportunities.length === 0 && (
              <button
                onClick={handleOpenCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
              >
                + Add Manual Opportunity
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {processedOpportunities.map((opportunity) => {
              const deadlineInfo = getDeadlineInfo(opportunity.deadline);
              const elig = opportunity.eligibilityResult;
              const isCriteriaExpanded = expandedCriteria[opportunity.id] ?? false;

              return (
                <article
                  key={opportunity.id}
                  className="flex flex-col justify-between rounded-2xl border border-gray-800/90 bg-gray-950/70 p-5 hover:border-gray-700 transition-all shadow-md group relative"
                >
                  <div>
                    {/* Header: Source, Stage & Action Buttons */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                            opportunity.source_type === "CDC"
                              ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
                              : "bg-blue-950/80 text-blue-300 border border-blue-800/60"
                          }`}
                        >
                          {opportunity.source_type}
                        </span>

                        <span className="rounded-full border border-gray-800 bg-gray-900/90 px-2.5 py-0.5 text-[11px] font-medium text-gray-300">
                          {display(opportunity.category)}
                        </span>
                      </div>

                      {/* Card Action Menu */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(opportunity)}
                          title="Edit Opportunity"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() =>
                            handleDeleteOpportunity(opportunity.id, opportunity.company)
                          }
                          title="Delete Opportunity"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-950/60 hover:text-red-400 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Company & Role */}
                    <h2 className="text-xl font-bold text-white tracking-tight group-hover:text-emerald-400 transition-colors">
                      {opportunity.company}
                    </h2>
                    <p className="text-sm font-medium text-gray-300 mt-0.5">
                      {display(opportunity.role)}
                    </p>

                    {/* Smart Eligibility Badge */}
                    <div className="mt-3.5">
                      <div
                        onClick={() => toggleCriteria(opportunity.id)}
                        className={`cursor-pointer inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                          elig.status === "eligible"
                            ? "bg-emerald-950/40 border-emerald-800/70 text-emerald-300 hover:bg-emerald-900/50"
                            : elig.status === "ineligible"
                            ? "bg-red-950/40 border-red-800/70 text-red-300 hover:bg-red-900/50"
                            : elig.status === "review"
                            ? "bg-amber-950/40 border-amber-800/70 text-amber-300 hover:bg-amber-900/50"
                            : "bg-gray-900 border-gray-800 text-gray-400"
                        }`}
                      >
                        <span>
                          {elig.status === "eligible"
                            ? "🟢 Eligible"
                            : elig.status === "ineligible"
                            ? "🔴 Ineligible"
                            : elig.status === "review"
                            ? "🟡 Review Needed"
                            : "⚪ Eligibility Not Specified"}
                        </span>
                        {elig.criteria.length > 0 && (
                          <span className="text-[10px] opacity-70 underline">
                            {isCriteriaExpanded ? "Hide Details" : "View Criteria"}
                          </span>
                        )}
                      </div>

                      {/* Expandable Criteria Breakdown */}
                      {isCriteriaExpanded && elig.criteria.length > 0 && (
                        <div className="mt-2.5 rounded-xl border border-gray-800 bg-gray-900/90 p-3 text-xs space-y-2">
                          <p className="font-semibold text-gray-300 border-b border-gray-800 pb-1">
                            {elig.summary}
                          </p>
                          {elig.criteria.map((c, i) => (
                            <div key={i} className="flex items-start justify-between gap-2">
                              <span className="text-gray-400">
                                {c.name} ({c.required}):
                              </span>
                              <span
                                className={`font-mono text-right ${
                                  c.passed === true
                                    ? "text-emerald-400 font-semibold"
                                    : c.passed === false
                                    ? "text-red-400 font-semibold"
                                    : "text-amber-400"
                                }`}
                              >
                                {c.userValue} {c.passed === true ? "✓" : c.passed === false ? "✗" : "?"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Matched Skills Tags */}
                    {elig.matchedSkills.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-gray-500 font-semibold">Matched Skills:</span>
                        {elig.matchedSkills.map((sk) => (
                          <span
                            key={sk}
                            className="rounded-md bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 text-[10px] font-mono text-emerald-300"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Deadline & Next Action */}
                    <div className="mt-4 space-y-2 border-t border-gray-850 pt-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Deadline:</span>
                        <span
                          className={`font-semibold font-mono ${
                            deadlineInfo.isUrgent
                              ? "text-amber-400 animate-pulse"
                              : deadlineInfo.isPast
                              ? "text-gray-500 line-through"
                              : "text-gray-200"
                          }`}
                        >
                          {deadlineInfo.text}
                        </span>
                      </div>

                      {opportunity.next_action && (
                        <div className="rounded-lg bg-gray-900/60 p-2 text-gray-300">
                          <span className="font-semibold text-emerald-400">Action: </span>
                          {opportunity.next_action}
                        </div>
                      )}
                    </div>

                    {/* Attachments Section */}
                    {opportunity.attachments.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t border-gray-850 pt-3">
                        <p className="text-[11px] font-semibold text-gray-400">Attachments:</p>
                        <div className="flex flex-wrap gap-2">
                          {opportunity.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/80 px-2.5 py-1 text-xs text-gray-300"
                            >
                              <span className="truncate max-w-[120px]" title={att.filename}>
                                📄 {att.filename}
                              </span>
                              <a
                                href={`/api/attachments/${att.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-400 hover:underline text-[11px]"
                              >
                                View
                              </a>
                              <a
                                href={`/api/attachments/${att.id}?download=1`}
                                className="text-gray-400 hover:text-white text-[11px]"
                              >
                                ⬇
                              </a>
                            </div>
                          ))}
                        </div>

                        {/* Attachment Summaries */}
                        {opportunity.attachments
                          .filter((a) => a.extracted_summary)
                          .map((att) => (
                            <p
                              key={`${att.id}-summary`}
                              className="mt-2 rounded-lg border border-gray-800 bg-gray-900/40 p-2.5 text-xs text-gray-300"
                            >
                              <span className="font-semibold text-emerald-400">JD Summary: </span>
                              {att.extracted_summary}
                            </p>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Footer: Application Status Dropdown & Apply Button */}
                  <div className="mt-5 pt-3 border-t border-gray-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] font-medium text-gray-400">You:</label>
                      <select
                        value={opportunity.application_status}
                        onChange={(e) => handleStatusChange(opportunity.id, e.target.value)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold focus:outline-none transition-colors ${
                          opportunity.application_status === "Applied"
                            ? "border-blue-700 bg-blue-950/60 text-blue-300"
                            : opportunity.application_status === "Interview" ||
                              opportunity.application_status === "Offer Received"
                            ? "border-emerald-700 bg-emerald-950/60 text-emerald-300"
                            : opportunity.application_status === "Rejected" ||
                              opportunity.application_status === "Not Interested"
                            ? "border-red-900 bg-red-950/40 text-red-400"
                            : "border-gray-700 bg-gray-900 text-gray-200"
                        }`}
                      >
                        {APPLICATION_STATUSES.map((st) => (
                          <option key={st} value={st} className="bg-gray-900 text-white">
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <a
                      href={opportunity.apply_link || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        opportunity.apply_link
                          ? "bg-emerald-400 text-black hover:bg-emerald-300 shadow-sm"
                          : "pointer-events-none border border-gray-800 text-gray-600"
                      }`}
                    >
                      {opportunity.apply_link ? "Apply Now ↗" : "No Link"}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <OpportunityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveOpportunity}
          initialValues={selectedOpportunity}
          mode={modalMode}
        />
      )}
    </div>
  );
}
