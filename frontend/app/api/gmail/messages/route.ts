import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: messages, error: messagesError } = await supabase
      .from("gmail_messages")
      .select(`
        id,
        gmail_message_id,
        sender,
        subject,
        received_at,
        relevance_status,
        ai_relevant,
        ai_category,
        ai_confidence,
        ai_reason,
        ai_classified_at
      `)
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(100);

    if (messagesError) {
      throw new Error(messagesError.message);
    }

    return NextResponse.json({
      success: true,
      count: messages?.length ?? 0,
      messages: messages ?? [],
    });
  } catch (error) {
    console.error("Failed to fetch gmail messages:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load emails" },
      { status: 500 }
    );
  }
}
