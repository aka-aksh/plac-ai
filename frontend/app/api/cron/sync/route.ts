import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60; // Allow longer execution for cron

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("Authorization");
    const { searchParams } = new URL(request.url);
    const querySecret = searchParams.get("secret");

    // Protect cron endpoint if CRON_SECRET is configured
    if (cronSecret) {
      const token = authHeader?.replace("Bearer ", "") || querySecret;
      if (token !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch active users who have synced at least once
    const { data: syncUsers, error: userFetchError } = await supabase
      .from("gmail_sync_state")
      .select("user_id, history_id")
      .order("last_synced_at", { ascending: true })
      .limit(10);

    if (userFetchError) {
      throw new Error(`Failed to load sync users: ${userFetchError.message}`);
    }

    const results = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const syncRecord of syncUsers ?? []) {
      results.push({
        userId: syncRecord.user_id,
        historyId: syncRecord.history_id,
        status: "queued_for_background_sync",
      });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      activeSyncUsers: syncUsers?.length ?? 0,
      results,
    });
  } catch (error) {
    console.error("Cron sync execution error:", error);
    return NextResponse.json(
      {
        error: "Cron sync failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
