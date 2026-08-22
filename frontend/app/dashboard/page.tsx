"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

type Attachment = {
  id: string;
  filename: string;
  processed: boolean;
  extracted_summary: string | null;
};
type Opportunity = {
  id: string;
  company: string | null;
  role: string | null;
  source_type: string | null;
  category: string | null;
  status: string | null;
  application_status: string | null;
  deadline: string | null;
  apply_link: string | null;
  eligibility: string | null;
  next_action: string | null;
  ai_confidence: number | null;
  attachments: Attachment[];
};
type PipelineResult = {
  processed?: boolean;
  error?: string;
  details?: string;
};

const MAX_EMAILS_PER_RUN = 10;
const MAX_ATTACHMENTS_PER_RUN = 10;

function display(value: string | null) {
  return value?.trim() || "Not mentioned";
}

function deadlineLabel(value: string | null) {
  if (!value) return "Not mentioned";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");

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
    const { data: rows, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select(
        "id, company, role, source_type, category, status, application_status, deadline, apply_link, eligibility, next_action, ai_confidence, updated_at"
      )
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false });

    if (opportunitiesError) {
      setNotice(`Could not load opportunities: ${opportunitiesError.message}`);
      setLoading(false);
      return;
    }

    const opportunityIds = (rows ?? []).map((row) => row.id);
    const attachmentsByOpportunity = new Map<string, Attachment[]>();

    if (opportunityIds.length) {
      const { data: links, error: linksError } = await supabase
        .from("opportunity_messages")
        .select("opportunity_id, gmail_message_id")
        .in("opportunity_id", opportunityIds);

      if (linksError) {
        setNotice(`Could not load source emails: ${linksError.message}`);
      } else {
        const messageToOpportunity = new Map<string, string>();
        for (const link of links ?? []) {
          messageToOpportunity.set(link.gmail_message_id, link.opportunity_id);
        }

        const messageIds = Array.from(messageToOpportunity.keys());
        if (messageIds.length) {
          const { data: attachments, error: attachmentsError } = await supabase
            .from("gmail_attachments")
            .select("id, gmail_message_id, filename, processed, extracted_summary")
            .eq("user_id", currentUser.id)
            .in("gmail_message_id", messageIds);

          if (attachmentsError) {
            setNotice(`Could not load attachments: ${attachmentsError.message}`);
          } else {
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
    }

    setOpportunities(
      (rows ?? []).map((row) => ({
        ...row,
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
    setNotice("Syncing Gmail…");

    try {
      await requestPipeline("/api/gmail/sync");

      let emailsProcessed = 0;
      for (; emailsProcessed < MAX_EMAILS_PER_RUN; emailsProcessed += 1) {
        const result = await requestPipeline("/api/ai/process");
        if (!result.processed) break;
      }

      let attachmentsProcessed = 0;
      for (; attachmentsProcessed < MAX_ATTACHMENTS_PER_RUN; attachmentsProcessed += 1) {
        const result = await requestPipeline("/api/attachments/process");
        if (!result.processed) break;
      }

      await loadDashboard();
      setNotice(
        `Updated: ${emailsProcessed} email${emailsProcessed === 1 ? "" : "s"} and ${attachmentsProcessed} attachment${attachmentsProcessed === 1 ? "" : "s"} processed.`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The Gmail processing run failed.");
    } finally {
      setProcessing(false);
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  const processedAttachments = opportunities.reduce(
    (count, opportunity) => count + opportunity.attachments.filter((attachment) => attachment.processed).length,
    0
  );
  const opportunityGroups = [
    {
      id: "cdc",
      title: "CDC opportunities",
      description: "Campus placement and CDC announcements.",
      opportunities: opportunities.filter((opportunity) => opportunity.source_type === "CDC"),
    },
    {
      id: "non-cdc",
      title: "Non-CDC opportunities",
      description: "Relevant opportunities outside the CDC channel.",
      opportunities: opportunities.filter((opportunity) => opportunity.source_type !== "CDC"),
    },
  ];

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-black text-white">Loading dashboard…</main>;
  }

  return (
    <main className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 border-b border-gray-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-emerald-400">Placement AI</p>
            <h1 className="text-3xl font-bold">Your opportunities</h1>
            <p className="mt-2 text-sm text-gray-400">{user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => router.push("/settings/relevance")} className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:border-white">Relevance settings</button>
            <button onClick={logout} className="rounded-lg border border-gray-700 px-4 py-2 text-sm hover:border-white">Log out</button>
          </div>
        </header>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm text-gray-400">Opportunities</p><p className="mt-2 text-3xl font-bold">{opportunities.length}</p></div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm text-gray-400">Processed attachments</p><p className="mt-2 text-3xl font-bold">{processedAttachments}</p></div>
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-5"><p className="text-sm text-gray-400">Processing rule</p><p className="mt-2 text-sm font-medium">Email first, attachment second</p></div>
        </section>

        <section className="mb-8 rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Sync Gmail and extract attachments</h2>
            <p className="mt-1 text-sm text-gray-300">This pass syncs Gmail, creates opportunities from relevant emails, then merges facts found in linked PDF/DOCX attachments.</p>
          </div>
          <button onClick={syncAndProcess} disabled={processing} className="mt-4 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-black hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60 sm:mt-0">{processing ? "Processing…" : "Sync & process"}</button>
        </section>

        {notice && <p className="mb-6 rounded-lg border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-200">{notice}</p>}

        {opportunities.length === 0 ? (
          <section className="rounded-xl border border-dashed border-gray-700 p-10 text-center"><h2 className="text-xl font-semibold">No opportunities yet</h2><p className="mt-2 text-gray-400">Run a sync after you have configured relevant senders or selected AI relevance mode.</p></section>
        ) : (
          <section className="grid gap-8 lg:grid-cols-2">
            {opportunityGroups.map((group) => (
              <div key={group.id}>
                <div className="mb-4 border-b border-gray-800 pb-3">
                  <h2 className="text-xl font-bold">{group.title}</h2>
                  <p className="mt-1 text-sm text-gray-400">{group.description}</p>
                </div>
                {group.opportunities.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-800 p-6 text-sm text-gray-500">No opportunities in this section yet.</p>
                ) : (
                  <div className="grid gap-5">
                    {group.opportunities.map((opportunity) => (
              <article key={opportunity.id} className="rounded-xl border border-gray-800 bg-gray-950 p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm text-emerald-400">{display(opportunity.source_type)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-bold">{display(opportunity.company)}</h2>
                      {opportunity.attachments.map((attachment) => (
                        <span key={attachment.id} className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                          <span>📎 {attachment.filename}</span>
                          <a href={`/api/attachments/${attachment.id}`} target="_blank" rel="noreferrer" className="text-emerald-300 hover:text-emerald-200">View</a>
                          <a href={`/api/attachments/${attachment.id}?download=1`} className="text-emerald-300 hover:text-emerald-200">Download</a>
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-gray-300">{display(opportunity.role)}</p>
                  </div>
                  <div className="flex gap-2 text-xs"><span className="rounded-full border border-gray-700 px-3 py-1">Stage: {display(opportunity.status)}</span><span className="rounded-full border border-gray-700 px-3 py-1">You: {display(opportunity.application_status)}</span></div>
                </div>
                <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                  <div><dt className="text-gray-500">Category</dt><dd className="mt-1">{display(opportunity.category)}</dd></div>
                  <div><dt className="text-gray-500">Deadline</dt><dd className="mt-1">{deadlineLabel(opportunity.deadline)}</dd></div>
                  <div><dt className="text-gray-500">Eligibility</dt><dd className="mt-1">{display(opportunity.eligibility)}</dd></div>
                  <div><dt className="text-gray-500">Next action</dt><dd className="mt-1">{display(opportunity.next_action)}</dd></div>
                  <div><dt className="text-gray-500">AI confidence</dt><dd className="mt-1">{opportunity.ai_confidence == null ? "Not mentioned" : `${Math.round(opportunity.ai_confidence * 100)}%`}</dd></div>
                </dl>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href={opportunity.apply_link || undefined} target="_blank" rel="noreferrer" className={`rounded-lg border px-4 py-2 text-sm ${opportunity.apply_link ? "border-emerald-500 text-emerald-300 hover:bg-emerald-950" : "pointer-events-none border-gray-800 text-gray-600"}`}>Apply link</a>
                </div>
                {opportunity.attachments.filter((attachment) => attachment.extracted_summary).map((attachment) => (
                  <p key={`${attachment.id}-summary`} className="mt-4 rounded-lg border border-gray-800 bg-black/30 p-4 text-sm text-gray-300">
                    <span className="font-semibold text-white">Attachment summary ({attachment.filename}): </span>
                    {attachment.extracted_summary}
                  </p>
                ))}
              </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
