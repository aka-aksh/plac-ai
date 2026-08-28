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
  received_at?: string | null;
  sender?: string | null;
  attachments: Attachment[];
};

type ProcessedOpportunity = Opportunity & {
  eligibilityResult: EligibilityResult;
  isHackathon: boolean;
  isPinned: boolean;
  fullEmail: string;
  course: string;
  testSchedule: string;
  smartStatus: { label: string; badgeClass: string };
  deadlineInfo: { text: string; isPast: boolean; isUrgent: boolean };
  arrivalDateTime: { date: string; time: string };
};

type PipelineResult = {
  processed?: boolean;
  count?: number;
  error?: string;
  details?: string;
  summary?: {
    created: number;
    updated: number;
    notCreated: number;
    failed: number;
  };
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

const MAX_ATTACHMENTS_PER_RUN = 20;

// Company Avatar Colors based on name hash
function getCompanyAvatarGradient(company: string) {
  const gradients = [
    "from-emerald-500 to-teal-700",
    "from-blue-500 to-indigo-700",
    "from-purple-500 to-pink-700",
    "from-amber-500 to-orange-700",
    "from-rose-500 to-red-700",
    "from-cyan-500 to-blue-700",
    "from-violet-500 to-purple-800",
    "from-fuchsia-500 to-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = company.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

// 1. Extract Clean Full Email Address
function extractFullEmail(sender: string | null | undefined): string {
  if (!sender) return "N/A";
  const match = sender.match(/<([^>]+)>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  const emailMatch = sender.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch && emailMatch[0]) {
    return emailMatch[0].trim();
  }
  return sender.trim() || "N/A";
}

// 2. Extract Course / Branch
function extractCourse(
  eligibility: string | null | undefined,
  role: string | null | undefined
): string {
  if (!eligibility && !role) return "N/A";
  const text = `${eligibility || ""} ${role || ""}`.toLowerCase();

  const courses: string[] = [];
  if (
    text.includes("aiml") ||
    text.includes("ai & ml") ||
    text.includes("artificial intelligence") ||
    text.includes("ai / ml")
  ) {
    courses.push("AIML");
  }
  if (
    text.includes("cse") ||
    text.includes("computer science") ||
    text.includes(" cs ") ||
    text.includes("cs/") ||
    text.includes("b-tech cs")
  ) {
    courses.push("CS");
  }
  if (text.includes("it") || text.includes("information technology")) {
    courses.push("IT");
  }
  if (text.includes("msc") || text.includes("m.sc")) {
    courses.push("MSc");
  }
  if (text.includes("mca")) {
    courses.push("MCA");
  }
  if (text.includes("ece") || text.includes("electronics")) {
    courses.push("ECE");
  }
  if (text.includes("mechanical") || text.includes("mech")) {
    courses.push("Mech");
  }
  if (text.includes("non-cs") || text.includes("non cs")) {
    courses.push("Non-CS");
  }
  if (
    text.includes("all branches") ||
    text.includes("any branch") ||
    text.includes("open for all") ||
    text.includes("all stream")
  ) {
    return "All Branches";
  }

  if (courses.length > 0) {
    return Array.from(new Set(courses)).join(" / ");
  }

  if (eligibility && eligibility.length < 25) {
    return eligibility.trim();
  }

  return "CS / IT";
}

// 3. Extract Test Schedule / Exam Date
function extractTestSchedule(
  nextAction: string | null | undefined,
  notes: string | null | undefined,
  status: string | null | undefined
): string {
  const combined = `${nextAction || ""} ${notes || ""} ${status || ""}`;
  if (!combined.trim()) return "N/A";

  const dateMatch = combined.match(
    /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(?:by|at|on)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?)?\b/i
  );
  if (dateMatch) {
    return dateMatch[0];
  }

  if (
    nextAction &&
    (nextAction.toLowerCase().includes("test") ||
      nextAction.toLowerCase().includes("assessment") ||
      nextAction.toLowerCase().includes("exam") ||
      nextAction.toLowerCase().includes("interview"))
  ) {
    return nextAction.length > 28
      ? nextAction.slice(0, 25) + "..."
      : nextAction;
  }

  return "N/A";
}

// 4. Smart Status badge
function getSmartStatus(
  status: string | null | undefined,
  applicationStatus: string | null | undefined
) {
  const s = (applicationStatus || status || "").toLowerCase();
  if (
    s.includes("offer") ||
    s.includes("selected") ||
    s.includes("hired") ||
    s.includes("congrat")
  ) {
    return {
      label: "Selected 🏆",
      badgeClass:
        "bg-emerald-950/90 text-emerald-300 border border-emerald-700/80 font-bold",
    };
  }
  if (s.includes("interview") || s.includes("round")) {
    return {
      label: "Interview 🎯",
      badgeClass:
        "bg-purple-950/90 text-purple-300 border border-purple-700/80 font-bold",
    };
  }
  if (
    s.includes("assessment") ||
    s.includes("test") ||
    s.includes("exam")
  ) {
    return {
      label: "Assessment 📝",
      badgeClass:
        "bg-blue-950/90 text-blue-300 border border-blue-700/80 font-bold",
    };
  }
  if (
    s.includes("reject") ||
    s.includes("closed") ||
    s.includes("not interested")
  ) {
    return {
      label: "Not Active ⚪",
      badgeClass: "bg-gray-900 text-gray-500 border border-gray-800",
    };
  }
  return {
    label: "Active 🟢",
    badgeClass:
      "bg-emerald-950/60 text-emerald-400 border border-emerald-800/70 font-semibold",
  };
}

// 5. Deadline Formatting
function getDeadlineDisplay(value: string | null | undefined) {
  if (!value) return { text: "N/A", isPast: false, isUrgent: false };
  const date = new Date(`${value}T23:59:59`);
  if (Number.isNaN(date.getTime())) {
    return { text: value, isPast: false, isUrgent: false };
  }

  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return {
      text: `${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} (Passed)`,
      isPast: true,
      isUrgent: false,
    };
  }
  if (diffDays === 0) {
    return {
      text: `Today!`,
      isPast: false,
      isUrgent: true,
    };
  }
  if (diffDays <= 3) {
    return {
      text: `${diffDays}d left (${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })})`,
      isPast: false,
      isUrgent: true,
    };
  }

  return {
    text: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    isPast: false,
    isUrgent: false,
  };
}

// 6. Format Email Arrival Date & Time
function formatArrivalDateTime(dateStr: string | null | undefined): {
  date: string;
  time: string;
} {
  if (!dateStr) return { date: "N/A", time: "" };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return { date: dateStr, time: "" };

  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, time };
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");

  // Primary Section: Placements vs Hackathons
  const [activeTab, setActiveTab] = useState<"placements" | "hackathons">(
    "placements"
  );

  // Pinning feature (persisted in localStorage)
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "CDC" | "Non-CDC">(
    "all"
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eligibilityFilter, setEligibilityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"deadline" | "received" | "received_oldest" | "company">(
    "received"
  );

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<Opportunity | null>(null);

  // Details drawer
  const [activeDetailsOpp, setActiveDetailsOpp] =
    useState<ProcessedOpportunity | null>(null);

  // Load pinned state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("placement_pinned_ids");
      if (saved) {
        setPinnedIds(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  function togglePin(id: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setPinnedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem("placement_pinned_ids", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

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
      .select(
        "cgpa, branch, graduation_year, marks_10, marks_12, skills, university"
      )
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData);
    }

    // Load opportunities (with automatic fallback)
    let rows: any[] = [];
    const { data: primaryRows, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select(
        "id, company, role, source_type, category, status, application_status, deadline, apply_link, eligibility, next_action, ai_confidence, notes, updated_at, created_at"
      )
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (opportunitiesError) {
      if (opportunitiesError.message.includes("notes")) {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from("opportunities")
          .select(
            "id, company, role, source_type, category, status, application_status, deadline, apply_link, eligibility, next_action, ai_confidence, updated_at, created_at"
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
    const senderByOpportunity = new Map<string, string>();
    const receivedAtByOpportunity = new Map<string, string>();

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
          // Fetch attachments
          const { data: attachments } = await supabase
            .from("gmail_attachments")
            .select("id, gmail_message_id, filename, processed, extracted_summary")
            .eq("user_id", currentUser.id)
            .in("gmail_message_id", messageIds);

          for (const attachment of attachments ?? []) {
            const oppId = messageToOpportunity.get(attachment.gmail_message_id);
            if (!oppId) continue;
            const current = attachmentsByOpportunity.get(oppId) ?? [];
            current.push({
              id: attachment.id,
              filename: attachment.filename,
              processed: attachment.processed ?? false,
              extracted_summary: attachment.extracted_summary ?? null,
            });
            attachmentsByOpportunity.set(oppId, current);
          }

          // Fetch message metadata (sender and exact arrival timestamp)
          const { data: messages } = await supabase
            .from("gmail_messages")
            .select("id, sender, received_at")
            .in("id", messageIds);

          for (const msg of messages ?? []) {
            const oppId = messageToOpportunity.get(msg.id);
            if (oppId) {
              if (msg.sender && !senderByOpportunity.has(oppId)) {
                senderByOpportunity.set(oppId, msg.sender);
              }
              if (msg.received_at && !receivedAtByOpportunity.has(oppId)) {
                receivedAtByOpportunity.set(oppId, msg.received_at);
              }
            }
          }
        }
      }
    }

    setOpportunities(
      rows.map((row) => ({
        ...row,
        source_type: row.source_type || "Non-CDC",
        application_status: row.application_status || "Not Decided",
        sender: senderByOpportunity.get(row.id) ?? null,
        received_at: receivedAtByOpportunity.get(row.id) ?? row.created_at ?? null,
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
    if (!response.ok)
      throw new Error(result.details || result.error || "Request failed");
    return result;
  }

  async function syncAndProcess() {
    setProcessing(true);
    setNotice("⚡ Step 1/3: Fetching placement emails from Gmail...");

    try {
      await requestPipeline("/api/gmail/sync?force=1");

      let emailsProcessed = 0;
      let opportunitiesCreated = 0;
      let opportunitiesUpdated = 0;
      let emailsWithoutOpportunity = 0;
      let failedEmails = 0;
      setNotice(
        "⚡ Step 2/3: AI Classifying & Extracting companies in parallel..."
      );
      for (let run = 0; run < 10; run += 1) {
        setNotice(
          `⚡ Step 2/3: AI analyzing batch ${run + 1} (${emailsProcessed} emails completed)...`
        );
        const result = await requestPipeline("/api/ai/process?batch=5");
        const count = result.count ?? 0;
        opportunitiesCreated += result.summary?.created ?? 0;
        opportunitiesUpdated += result.summary?.updated ?? 0;
        emailsWithoutOpportunity += result.summary?.notCreated ?? 0;
        failedEmails += result.summary?.failed ?? 0;
        if (!result.processed || count === 0) break;
        emailsProcessed += count;
        if (count < 5) break;
      }

      let attachmentsProcessed = 0;
      setNotice("⚡ Step 3/3: Parsing attachments and JDs...");
      for (
        ;
        attachmentsProcessed < MAX_ATTACHMENTS_PER_RUN;
        attachmentsProcessed += 1
      ) {
        const result = await requestPipeline("/api/attachments/process");
        if (!result.processed) break;
      }

      await loadDashboard();
      const skippedDetail = emailsWithoutOpportunity
        ? ` ${emailsWithoutOpportunity} relevant email(s) did not name a company and remain in Activity.`
        : "";
      const failedDetail = failedEmails
        ? ` ${failedEmails} email(s) failed; check the server logs for the database error.`
        : "";
      setNotice(
        `✓ Sync complete! Created ${opportunitiesCreated} new opportunity row(s) and updated ${opportunitiesUpdated} existing row(s) from ${emailsProcessed} analyzed email(s), with ${attachmentsProcessed} attachment(s) processed.${skippedDetail}${failedDetail}`
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The Gmail processing run failed."
      );
    } finally {
      setProcessing(false);
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
      if (!response.ok)
        throw new Error(result.error || "Failed to create opportunity");
    } else {
      const response = await fetch("/api/opportunities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Failed to update opportunity");
    }

    await loadDashboard();
    setNotice(
      modalMode === "create"
        ? "✓ Opportunity added successfully."
        : "✓ Opportunity updated successfully."
    );
  }

  // Delete Opportunity
  async function handleDeleteOpportunity(
    opportunityId: string,
    companyName: string
  ) {
    if (
      !window.confirm(
        `Are you sure you want to delete the opportunity for "${companyName}"?`
      )
    ) {
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
      if (activeDetailsOpp?.id === opportunityId) {
        setActiveDetailsOpp(null);
      }
      setNotice(`✓ Deleted opportunity for ${companyName}.`);
    } catch (error) {
      console.error("Delete error:", error);
      setNotice("Failed to delete opportunity.");
    }
  }

  // Processed & Filtered Opportunities
  const processedOpportunities = useMemo(() => {
    return opportunities
      .map((opp) => {
        const extraContext = opp.attachments
          .map((a) => a.extracted_summary)
          .filter(Boolean)
          .join(" ");
        const eligibilityResult: EligibilityResult = evaluateEligibility(
          opp.eligibility,
          profile,
          `${opp.role ?? ""} ${extraContext}`
        );

        const isHackathon =
          opp.category?.toLowerCase().includes("hackathon") ||
          opp.role?.toLowerCase().includes("hackathon") ||
          opp.company.toLowerCase().includes("hackathon");

        const isPinned = pinnedIds.includes(opp.id);

        return {
          ...opp,
          eligibilityResult,
          isHackathon,
          isPinned,
          fullEmail: extractFullEmail(opp.sender),
          course: extractCourse(opp.eligibility, opp.role),
          testSchedule: extractTestSchedule(
            opp.next_action,
            opp.notes,
            opp.status
          ),
          smartStatus: getSmartStatus(opp.status, opp.application_status),
          deadlineInfo: getDeadlineDisplay(opp.deadline),
          arrivalDateTime: formatArrivalDateTime(opp.received_at),
        };
      })
      .filter((opp) => {
        // Tab Filter: Placements vs Hackathons
        if (activeTab === "hackathons" && !opp.isHackathon) return false;
        if (activeTab === "placements" && opp.isHackathon) return false;

        // Source Filter
        if (sourceFilter !== "all" && opp.source_type !== sourceFilter)
          return false;
        if (statusFilter !== "all" && opp.application_status !== statusFilter)
          return false;
        if (
          eligibilityFilter === "eligible" &&
          opp.eligibilityResult.status !== "eligible"
        )
          return false;
        if (
          eligibilityFilter === "ineligible" &&
          opp.eligibilityResult.status !== "ineligible"
        )
          return false;
        if (
          eligibilityFilter === "has_attachments" &&
          opp.attachments.length === 0
        )
          return false;
        if (eligibilityFilter === "pinned" && !opp.isPinned)
          return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            opp.company.toLowerCase().includes(q) ||
            (opp.role && opp.role.toLowerCase().includes(q)) ||
            (opp.fullEmail && opp.fullEmail.toLowerCase().includes(q)) ||
            (opp.course && opp.course.toLowerCase().includes(q)) ||
            (opp.notes && opp.notes.toLowerCase().includes(q)) ||
            (opp.next_action && opp.next_action.toLowerCase().includes(q)) ||
            opp.eligibilityResult.matchedSkills.some((s) =>
              s.toLowerCase().includes(q)
            );
          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned opportunities always rank at top!
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        if (sortBy === "company") {
          return a.company.localeCompare(b.company);
        }
        if (sortBy === "received") {
          return (
            new Date(b.received_at || b.updated_at).getTime() -
            new Date(a.received_at || a.updated_at).getTime()
          );
        }
        if (sortBy === "received_oldest") {
          return (
            new Date(a.received_at || a.updated_at).getTime() -
            new Date(b.received_at || b.updated_at).getTime()
          );
        }
        // deadline
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      });
  }, [
    opportunities,
    profile,
    activeTab,
    pinnedIds,
    sourceFilter,
    statusFilter,
    eligibilityFilter,
    searchQuery,
    sortBy,
  ]);

  const placementsCount = opportunities.filter(
    (o) => !o.category?.toLowerCase().includes("hackathon")
  ).length;

  const hackathonsCount = opportunities.filter(
    (o) => o.category?.toLowerCase().includes("hackathon")
  ).length;

  const eligibleCount = opportunities.filter((opp) => {
    const res = evaluateEligibility(opp.eligibility, profile);
    return res.status === "eligible";
  }).length;

  const totalAttachments = opportunities.reduce(
    (acc, opp) => acc + opp.attachments.length,
    0
  );

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
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500 selection:text-black">
      <Navbar userEmail={user?.email} />

      <main className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Navigation & Section Switcher */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            {/* Tab Selector: Placements vs Hackathons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("placements")}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-base sm:text-lg font-black transition-all ${
                  activeTab === "placements"
                    ? "bg-emerald-400 text-black shadow-lg shadow-emerald-950/60"
                    : "border border-gray-800 bg-gray-950 text-gray-400 hover:text-white"
                }`}
              >
                <span>💼 Placements & Drives</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    activeTab === "placements"
                      ? "bg-black/20 text-black"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {placementsCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("hackathons")}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-base sm:text-lg font-black transition-all ${
                  activeTab === "hackathons"
                    ? "bg-purple-500 text-black shadow-lg shadow-purple-950/60"
                    : "border border-gray-800 bg-gray-950 text-gray-400 hover:text-white"
                }`}
              >
                <span>⚡ Hackathons & Challenges</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    activeTab === "hackathons"
                      ? "bg-black/20 text-black"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {hackathonsCount}
                </span>
              </button>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-gray-400">
              Live extracted corporate drives, multi-role recruitment, test schedules, and student eligibility.
            </p>
          </div>

          {/* Top Quick Stats & Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 border border-gray-800/90 rounded-2xl bg-gray-950/80 px-4 py-2 text-xs">
              <span className="text-gray-400">Student Profile:</span>
              <span className="font-semibold text-white">
                {profile?.cgpa
                  ? `${profile.cgpa} CGPA • ${profile.branch || "AIML"}`
                  : "Configuring..."}
              </span>
              <span className="text-gray-700">|</span>
              <span className="text-emerald-400 font-bold">
                {eligibleCount} Eligible
              </span>
            </div>

            <button
              onClick={() => {
                setSelectedOpportunity(null);
                setModalMode("create");
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-gray-800 bg-gray-900 px-3.5 py-2.5 text-xs font-bold text-white hover:border-emerald-500 hover:text-emerald-400 transition-all shadow-sm"
            >
              <span>+ Add Manual</span>
            </button>

            <button
              onClick={syncAndProcess}
              disabled={processing}
              className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-black text-black hover:bg-emerald-300 disabled:opacity-50 transition-all shadow-lg shadow-emerald-950/50"
            >
              <span>{processing ? "Syncing..." : "⚡ Sync & Process"}</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-xs sm:text-sm text-emerald-300 shadow-md">
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              className="text-gray-400 hover:text-white ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Bar (Collection-Style Pills & Search) */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-2xl border border-gray-850 bg-gray-950/90 p-3 shadow-lg">
          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => {
                setSourceFilter("all");
                setEligibilityFilter("all");
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                sourceFilter === "all" && eligibilityFilter === "all"
                  ? "bg-gray-800 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              All ({processedOpportunities.length})
            </button>

            <button
              onClick={() => setEligibilityFilter("pinned")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                eligibilityFilter === "pinned"
                  ? "bg-amber-950 border border-amber-700 text-amber-300"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              📌 Pinned ({pinnedIds.length})
            </button>

            <button
              onClick={() => {
                setSourceFilter("CDC");
                setEligibilityFilter("all");
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                sourceFilter === "CDC"
                  ? "bg-purple-950 border border-purple-800 text-purple-300"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              CDC (Campus)
            </button>

            <button
              onClick={() => {
                setSourceFilter("Non-CDC");
                setEligibilityFilter("all");
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                sourceFilter === "Non-CDC"
                  ? "bg-blue-950 border border-blue-800 text-blue-300"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Non-CDC
            </button>

            <button
              onClick={() => setEligibilityFilter("eligible")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                eligibilityFilter === "eligible"
                  ? "bg-emerald-950 border border-emerald-700 text-emerald-300"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Eligible (YES) 🟢
            </button>

            <button
              onClick={() => setEligibilityFilter("has_attachments")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                eligibilityFilter === "has_attachments"
                  ? "bg-gray-800 text-emerald-400"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              JDs / Files 📄 ({totalAttachments})
            </button>
          </div>

          {/* Search and Sorters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search company, role, email, notes..."
                className="w-full rounded-xl border border-gray-800 bg-gray-900/90 pl-9 pr-4 py-1.5 text-xs text-white placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <span className="absolute left-3 top-2 text-xs text-gray-500">
                🔍
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-[10px] text-gray-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 focus:border-emerald-500 focus:outline-none"
            >
              <option value="received">Sort by Date: Newest First</option>
              <option value="received_oldest">Sort by Date: Oldest First</option>
              <option value="deadline">Sort: Nearest Deadline</option>
              <option value="company">Sort: Company (A-Z)</option>
            </select>
          </div>
        </div>

        {/* 11-Column Table Layout (NFT-Table Styled) */}
        {processedOpportunities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 p-16 text-center bg-gray-950/40">
            <p className="text-4xl mb-3">
              {activeTab === "hackathons" ? "⚡" : "💼"}
            </p>
            <h3 className="text-lg font-bold text-white">
              {activeTab === "hackathons"
                ? "No hackathons found"
                : "No placement opportunities found"}
            </h3>
            <p className="mt-1 text-xs text-gray-400 max-w-md mx-auto">
              {opportunities.length === 0
                ? "Click '⚡ Sync & Process' to fetch and extract emails from your Gmail inbox."
                : "No entries match your search query or selected filter."}
            </p>
            {opportunities.length === 0 && (
              <button
                onClick={syncAndProcess}
                disabled={processing}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-bold text-black hover:bg-emerald-300 shadow-lg shadow-emerald-950/50"
              >
                <span>⚡ Sync & Process Inbox</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-850 bg-gray-950 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                {/* Table Header */}
                <thead>
                  <tr className="border-b border-gray-850 bg-gray-900/70 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                    <th
                      scope="col"
                      className="py-4 pl-4 pr-3 sticky left-0 z-10 bg-gray-900/90 backdrop-blur-sm sm:pl-6 min-w-[260px]"
                    >
                      # & Company Name
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[150px]">
                      Email Arrival Time
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[110px]">
                      CDC / Non-CDC
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[220px]">
                      Role(s)
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[140px]">
                      For Course
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[110px]">
                      Eligibility
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[130px]">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[150px]">
                      Test Schedule
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[140px]">
                      Deadline
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[110px]">
                      Apply Link
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[220px]">
                      Email Address
                    </th>
                    <th scope="col" className="px-3 py-4 min-w-[140px]">
                      Attachments
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-4 text-right pr-6 min-w-[120px]"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-gray-850/70">
                  {processedOpportunities.map((opp, idx) => {
                    const avatarGradient = getCompanyAvatarGradient(
                      opp.company
                    );
                    const elig = opp.eligibilityResult;
                    const isPinned = opp.isPinned;

                    return (
                      <tr
                        key={opp.id}
                        className={`transition-colors group cursor-pointer ${
                          isPinned
                            ? "bg-amber-950/20 hover:bg-amber-950/30 border-l-2 border-l-amber-400"
                            : "hover:bg-gray-900/50"
                        }`}
                        onClick={() => setActiveDetailsOpp(opp)}
                      >
                        {/* 1. PIN Icon + Rank + Avatar + Company Name (Row Header Part) */}
                        <td className="py-3.5 pl-4 pr-3 sticky left-0 z-10 bg-gray-950 group-hover:bg-gray-900/90 transition-colors sm:pl-6">
                          <div className="flex items-center gap-2.5">
                            {/* Pin Button */}
                            <button
                              onClick={(e) => togglePin(opp.id, e)}
                              title={isPinned ? "Unpin Company" : "Pin Company to Top"}
                              className={`p-1 rounded-lg transition-transform hover:scale-125 ${
                                isPinned
                                  ? "text-amber-400 font-bold"
                                  : "text-gray-600 hover:text-gray-400"
                              }`}
                            >
                              📌
                            </button>

                            <span className="font-mono text-xs font-bold text-gray-500 w-4">
                              {idx + 1}
                            </span>

                            <div
                              className={`h-9 w-9 flex-shrink-0 rounded-xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center font-black text-white text-xs shadow-md border border-white/10`}
                            >
                              {opp.company.charAt(0).toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors truncate max-w-[150px] sm:max-w-[200px]" title={opp.company}>
                                  {opp.company}
                                </span>
                              </div>
                              <span className="text-[11px] text-gray-400 block truncate">
                                {opp.category || "Full-Time"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Email Arrival Date & Time */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-mono">
                          {opp.arrivalDateTime.date !== "N/A" ? (
                            <div>
                              <span className="text-gray-200 font-semibold block">
                                {opp.arrivalDateTime.date}
                              </span>
                              <span className="text-gray-500 text-[10px] block">
                                🕒 {opp.arrivalDateTime.time}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>

                        {/* 3. CDC / Non-CDC */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                              opp.source_type === "CDC"
                                ? "bg-purple-950/80 text-purple-300 border border-purple-700/60"
                                : "bg-blue-950/80 text-blue-300 border border-blue-700/60"
                            }`}
                          >
                            {opp.source_type}
                          </span>
                        </td>

                        {/* 4. Multiple Roles (Handled inside single row) */}
                        <td className="px-3 py-3.5">
                          {opp.role ? (
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {opp.role.includes("•") ? (
                                opp.role.split("•").map((r, i) => (
                                  <span
                                    key={i}
                                    className="inline-block rounded-md bg-gray-900 border border-gray-800 px-2 py-0.5 text-[10px] font-semibold text-gray-300 truncate max-w-[190px]"
                                    title={r.trim()}
                                  >
                                    {r.trim()}
                                  </span>
                                ))
                              ) : (
                                <span className="font-semibold text-gray-200 text-xs">
                                  {opp.role}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 font-mono">N/A</span>
                          )}
                        </td>

                        {/* 5. For Which Course */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {opp.course !== "N/A" ? (
                            <span className="rounded-lg bg-gray-900 border border-gray-800 px-2 py-0.5 font-mono text-[11px] text-gray-300">
                              {opp.course}
                            </span>
                          ) : (
                            <span className="text-gray-500 font-mono">N/A</span>
                          )}
                        </td>

                        {/* 6. Eligibility Checker (YES / NO) */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {elig.status === "eligible" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/90 border border-emerald-600/80 px-2.5 py-0.5 font-black text-[11px] text-emerald-300 shadow-sm">
                              YES 🟢
                            </span>
                          ) : elig.status === "ineligible" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-950/90 border border-red-700/80 px-2.5 py-0.5 font-black text-[11px] text-red-300 shadow-sm">
                              NO 🔴
                            </span>
                          ) : elig.status === "review" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/90 border border-amber-700/80 px-2.5 py-0.5 font-bold text-[11px] text-amber-300">
                              REVIEW 🟡
                            </span>
                          ) : (
                            <span className="text-gray-500 font-mono">N/A</span>
                          )}
                        </td>

                        {/* 7. Status */}
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] ${opp.smartStatus.badgeClass}`}
                          >
                            {opp.smartStatus.label}
                          </span>
                        </td>

                        {/* 8. Test Schedule */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-mono text-gray-300">
                          {opp.testSchedule !== "N/A" ? (
                            <span className="text-amber-300 font-medium truncate max-w-[150px] block" title={opp.testSchedule}>
                              📅 {opp.testSchedule}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>

                        {/* 9. Deadline */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-mono">
                          {opp.deadlineInfo.text !== "N/A" ? (
                            <span
                              className={`font-semibold ${
                                opp.deadlineInfo.isUrgent
                                  ? "text-amber-400 animate-pulse"
                                  : opp.deadlineInfo.isPast
                                  ? "text-gray-500 line-through"
                                  : "text-gray-200"
                              }`}
                            >
                              {opp.deadlineInfo.text}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>

                        {/* 10. Apply Link */}
                        <td
                          className="px-3 py-3.5 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {opp.apply_link ? (
                            <a
                              href={opp.apply_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-2.5 py-1 text-[11px] font-black text-black hover:bg-emerald-300 transition-colors shadow-sm"
                            >
                              <span>Apply</span>
                              <span>↗</span>
                            </a>
                          ) : (
                            <span className="text-gray-500 font-mono">N/A</span>
                          )}
                        </td>

                        {/* 11. Full Email Address */}
                        <td className="px-3 py-3.5 whitespace-nowrap font-mono text-gray-400">
                          {opp.fullEmail !== "N/A" ? (
                            <span
                              className="truncate max-w-[200px] block text-[11px] hover:text-white"
                              title={opp.fullEmail}
                            >
                              📧 {opp.fullEmail}
                            </span>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </td>

                        {/* 12. Attachments */}
                        <td
                          className="px-3 py-3.5 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {opp.attachments.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <a
                                href={`/api/attachments/${opp.attachments[0].id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-gray-200 hover:border-emerald-500 hover:text-emerald-400 transition-colors truncate max-w-[120px]"
                                title={opp.attachments[0].filename}
                              >
                                <span>📄</span>
                                <span className="truncate">
                                  {opp.attachments[0].filename}
                                </span>
                              </a>
                              {opp.attachments.length > 1 && (
                                <span className="rounded-full bg-gray-800 text-gray-300 px-1.5 py-0.2 text-[10px] font-mono">
                                  +{opp.attachments.length - 1}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 font-mono">N/A</span>
                          )}
                        </td>

                        {/* Actions (Edit / Delete) */}
                        <td
                          className="px-3 py-3.5 text-right pr-6 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setSelectedOpportunity(opp);
                                setModalMode("edit");
                                setIsModalOpen(true);
                              }}
                              title="Edit Opportunity"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteOpportunity(opp.id, opp.company)
                              }
                              title="Delete Opportunity"
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-950/60 hover:text-red-400 transition-colors"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Detailed Inspection Drawer / Modal when clicking a company row */}
        {activeDetailsOpp && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setActiveDetailsOpp(null)}
          >
            <div
              className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 p-6 sm:p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-850 pb-4 mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${getCompanyAvatarGradient(
                      activeDetailsOpp.company
                    )} flex items-center justify-center font-black text-white text-lg shadow-md`}
                  >
                    {activeDetailsOpp.company.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-white">
                        {activeDetailsOpp.company}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          activeDetailsOpp.source_type === "CDC"
                            ? "bg-purple-950 text-purple-300 border border-purple-700"
                            : "bg-blue-950 text-blue-300 border border-blue-700"
                        }`}
                      >
                        {activeDetailsOpp.source_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-medium mt-0.5">
                      {activeDetailsOpp.role || "Role Not Specified"} •{" "}
                      {activeDetailsOpp.category || "Full-Time"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveDetailsOpp(null)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* Meta Grid (Arrival time, domain, etc.) */}
                <div className="grid grid-cols-2 gap-3 bg-gray-900/60 rounded-xl p-3 border border-gray-850">
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Email Received At</span>
                    <span className="text-gray-200 font-mono font-semibold">
                      {activeDetailsOpp.arrivalDateTime.date} {activeDetailsOpp.arrivalDateTime.time}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px] uppercase font-bold">Sender Email</span>
                    <span className="text-gray-200 font-mono truncate block" title={activeDetailsOpp.fullEmail}>
                      {activeDetailsOpp.fullEmail}
                    </span>
                  </div>
                </div>

                {/* Eligibility Breakdown */}
                <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-300 uppercase tracking-wider text-[11px]">
                      Eligibility Assessment
                    </span>
                    <span className="font-bold">
                      {activeDetailsOpp.eligibilityResult.status === "eligible"
                        ? "YES 🟢 (Eligible for your profile)"
                        : activeDetailsOpp.eligibilityResult.status === "ineligible"
                        ? "NO 🔴 (Criteria mismatch)"
                        : "REVIEW NEEDED 🟡"}
                    </span>
                  </div>
                  <p className="text-gray-300">
                    {activeDetailsOpp.eligibilityResult.summary}
                  </p>

                  {activeDetailsOpp.eligibilityResult.criteria.length > 0 && (
                    <div className="divide-y divide-gray-800 pt-2">
                      {activeDetailsOpp.eligibilityResult.criteria.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-1.5"
                        >
                          <span className="text-gray-400">
                            {c.name} ({c.required}):
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              c.passed === true
                                ? "text-emerald-400"
                                : c.passed === false
                                ? "text-red-400"
                                : "text-amber-400"
                            }`}
                          >
                            {c.userValue}{" "}
                            {c.passed === true
                              ? "✓"
                              : c.passed === false
                              ? "✗"
                              : "?"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Important Notes, CTC & Next Action */}
                {(activeDetailsOpp.next_action || activeDetailsOpp.notes) && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-1">
                      Important Note / Schedule / CTC
                    </p>
                    <p className="text-sm text-gray-200 leading-relaxed font-medium">
                      {activeDetailsOpp.next_action || activeDetailsOpp.notes}
                    </p>
                  </div>
                )}

                {/* Attachments */}
                {activeDetailsOpp.attachments.length > 0 && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                    <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-2">
                      Extracted Attachments & JDs ({activeDetailsOpp.attachments.length})
                    </p>
                    <div className="space-y-2">
                      {activeDetailsOpp.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-950 p-2.5"
                        >
                          <span className="font-mono text-gray-300 truncate max-w-sm">
                            📄 {att.filename}
                          </span>
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/attachments/${att.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 hover:underline text-xs font-semibold"
                            >
                              View
                            </a>
                            <a
                              href={`/api/attachments/${att.id}?download=1`}
                              className="text-gray-400 hover:text-white text-xs"
                            >
                              Download ⬇
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="mt-6 flex items-center justify-between border-t border-gray-850 pt-4">
                <div className="flex items-center gap-2">
                  {activeDetailsOpp.apply_link && (
                    <a
                      href={activeDetailsOpp.apply_link}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-emerald-400 px-5 py-2 text-xs font-black text-black hover:bg-emerald-300 transition-all shadow-md"
                    >
                      Apply Now ↗
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const opp = activeDetailsOpp;
                      setActiveDetailsOpp(null);
                      setSelectedOpportunity(opp);
                      setModalMode("edit");
                      setIsModalOpen(true);
                    }}
                    className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:border-gray-500"
                  >
                    Edit Details
                  </button>
                  <button
                    onClick={() => setActiveDetailsOpp(null)}
                    className="rounded-xl bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create / Edit Modal */}
        <OpportunityModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveOpportunity}
          initialValues={selectedOpportunity}
          mode={modalMode}
        />
      </main>
    </div>
  );
}
