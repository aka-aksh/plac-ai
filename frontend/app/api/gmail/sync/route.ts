import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { gmailFetch } from "@/lib/gmail-client";
import {
  extractSupportedAttachments,
} from "@/lib/gmail-attachments";

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: {
    data?: string;
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailPart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & {
    headers?: GmailHeader[];
  };
};

type GmailMessageList = {
  messages?: Array<{
    id: string;
    threadId?: string;
  }>;
  nextPageToken?: string;
};

type GmailHistoryResponse = {
  history?: Array<{
    messagesAdded?: Array<{
      message?: {
        id?: string;
        threadId?: string;
      };
    }>;
  }>;
  nextPageToken?: string;
  historyId?: string;
};

function decodeBase64Url(value: string): string {
  const normalized = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized +
    "=".repeat(
      (4 - (normalized.length % 4)) % 4
    );

  return Buffer.from(
    padded,
    "base64"
  ).toString("utf8");
}

function findHeader(
  message: GmailMessage,
  name: string
): string | null {
  const header =
    message.payload?.headers?.find(
      (item) =>
        item.name?.toLowerCase() ===
        name.toLowerCase()
    );

  return header?.value ?? null;
}

function extractTextFromPart(
  part?: GmailPart
): string {
  if (!part) {
    return "";
  }

  if (
    part.mimeType === "text/plain" &&
    part.body?.data
  ) {
    return decodeBase64Url(
      part.body.data
    );
  }

  if (part.parts?.length) {
    for (const child of part.parts) {
      const text =
        extractTextFromPart(child);

      if (text.trim()) {
        return text;
      }
    }
  }

  return "";
}

function fallbackHtmlToText(
  html: string
): string {
  return html
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBody(
  message: GmailMessage
): string {
  const plainText =
    extractTextFromPart(
      message.payload
    );

  if (plainText.trim()) {
    return plainText.trim();
  }

  const root = message.payload;

  if (
    root?.mimeType === "text/html" &&
    root.body?.data
  ) {
    return fallbackHtmlToText(
      decodeBase64Url(
        root.body.data
      )
    );
  }

  return message.snippet ?? "";
}

async function getGmailMessage(
  userId: string,
  messageId: string
): Promise<GmailMessage> {
  const result = await gmailFetch(
    userId,
    `/messages/${messageId}?format=full`
  );

  if (!result.response.ok) {
    const errorText =
      await result.response.text();

    throw new Error(
      `Failed to fetch Gmail message ${messageId}: ${errorText}`
    );
  }

  return result.response.json();
}

async function getProfileHistoryId(
  userId: string
): Promise<string> {
  const result = await gmailFetch(
    userId,
    "/profile"
  );

  if (!result.response.ok) {
    throw new Error(
      "Unable to retrieve Gmail profile"
    );
  }

  const data =
    await result.response.json();

  if (!data.historyId) {
    throw new Error(
      "Gmail profile did not return historyId"
    );
  }

  return String(data.historyId);
}

async function saveMessage(
  supabase: Awaited<
    ReturnType<typeof createServerSupabaseClient>
  >,
  userId: string,
  message: GmailMessage
) {
  const sender =
    findHeader(message, "From");

  const subject =
    findHeader(message, "Subject");

  const receivedAt =
    message.internalDate
      ? new Date(
          Number(message.internalDate)
        ).toISOString()
      : null;

  const bodyText =
    extractBody(message).slice(
      0,
      100_000
    );

  /*
   * Save the Gmail message.
   */
  const { error } =
    await supabase
      .from("gmail_messages")
      .upsert(
        {
          user_id: userId,

          gmail_message_id:
            message.id,

          gmail_thread_id:
            message.threadId ?? null,

          sender,

          subject,

          received_at:
            receivedAt,

          body_text:
            bodyText,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "user_id,gmail_message_id",

          ignoreDuplicates: true,
        }
      );

  if (error) {
    throw new Error(
      `Failed to save Gmail message: ${error.message}`
    );
  }

  /*
   * Get the database ID of the saved message.
   */
  const {
    data: savedMessage,
    error: savedMessageError,
  } =
    await supabase
      .from("gmail_messages")
      .select("id")
      .eq("user_id", userId)
      .eq(
        "gmail_message_id",
        message.id
      )
      .single();

  if (
    savedMessageError ||
    !savedMessage
  ) {
    throw new Error(
      `Failed to load saved Gmail message: ${
        savedMessageError?.message ??
        "message not found"
      }`
    );
  }

  /*
   * Detect supported attachments.
   *
   * We only store metadata here.
   * We do NOT download the attachment yet.
   */
  const attachments =
    extractSupportedAttachments(
      message.payload
    );

  for (const attachment of attachments) {
    const {
      error: attachmentError,
    } = await supabase
      .from("gmail_attachments")
      .upsert(
        {
          user_id: userId,

          gmail_message_id:
            savedMessage.id,

          gmail_attachment_id:
            attachment.attachmentId,

          filename:
            attachment.filename,

          mime_type:
            attachment.mimeType,

          size_bytes:
            attachment.sizeBytes,

          updated_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            "gmail_message_id,filename",
        }
      );

    if (attachmentError) {
      throw new Error(
        `Failed to save Gmail attachment: ${attachmentError.message}`
      );
    }
  }
}

async function performInitialSync(
  supabase: Awaited<
    ReturnType<typeof createServerSupabaseClient>
  >,
  userId: string
) {
  let pageToken:
    | string
    | undefined;

  let processed = 0;

  do {
    const query =
      `/messages?maxResults=100&q=newer_than:90d` +
      (pageToken
        ? `&pageToken=${encodeURIComponent(
            pageToken
          )}`
        : "");

    const result =
      await gmailFetch(
        userId,
        query
      );

    if (!result.response.ok) {
      throw new Error(
        "Initial Gmail message listing failed"
      );
    }

    const list =
      (await result.response.json()) as GmailMessageList;

    for (const item of
      list.messages ?? []) {
      const exists =
        await supabase
          .from("gmail_messages")
          .select("id")
          .eq(
            "user_id",
            userId
          )
          .eq(
            "gmail_message_id",
            item.id
          )
          .maybeSingle();

      if (exists.data) {
        /*
         * The message is already in our database.
         *
         * We still continue without refetching it.
         */
        continue;
      }

      const message =
        await getGmailMessage(
          userId,
          item.id
        );

      await saveMessage(
        supabase,
        userId,
        message
      );

      processed += 1;
    }

    pageToken =
      list.nextPageToken;
  } while (
    pageToken &&
    processed < 500
  );

  const historyId =
    await getProfileHistoryId(
      userId
    );

  await supabase
    .from("gmail_sync_state")
    .upsert(
      {
        user_id:
          userId,

        history_id:
          historyId,

        last_synced_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "user_id",
      }
    );

  return {
    mode: "initial",
    processed,
    historyId,
  };
}

async function performIncrementalSync(
  supabase: Awaited<
    ReturnType<typeof createServerSupabaseClient>
  >,
  userId: string,
  startHistoryId: string
) {
  let pageToken:
    | string
    | undefined;

  let newestHistoryId =
    startHistoryId;

  const messageIds =
    new Set<string>();

  do {
    const params =
      new URLSearchParams({
        startHistoryId,
        historyTypes:
          "messageAdded",
        maxResults: "100",
      });

    if (pageToken) {
      params.set(
        "pageToken",
        pageToken
      );
    }

    const result =
      await gmailFetch(
        userId,
        `/history?${params.toString()}`
      );

    if (
      result.response.status ===
      404
    ) {
      return null;
    }

    if (!result.response.ok) {
      throw new Error(
        "Gmail history sync failed"
      );
    }

    const history =
      (await result.response.json()) as GmailHistoryResponse;

    for (const historyRecord of
      history.history ?? []) {
      for (const added of
        historyRecord.messagesAdded ??
        []) {
        const id =
          added.message?.id;

        if (id) {
          messageIds.add(id);
        }
      }
    }

    if (history.historyId) {
      newestHistoryId =
        String(
          history.historyId
        );
    }

    pageToken =
      history.nextPageToken;
  } while (pageToken);

  let processed = 0;

  for (const messageId of
    messageIds) {
    const message =
      await getGmailMessage(
        userId,
        messageId
      );

    await saveMessage(
      supabase,
      userId,
      message
    );

    processed += 1;
  }

  await supabase
    .from("gmail_sync_state")
    .upsert(
      {
        user_id:
          userId,

        history_id:
          newestHistoryId,

        last_synced_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),
      },
      {
        onConflict:
          "user_id",
      }
    );

  return {
    mode: "incremental",
    processed,
    historyId:
      newestHistoryId,
  };
}

export async function GET() {
  try {
    const supabase =
      await createServerSupabaseClient();

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const {
      data: state,
      error,
    } =
      await supabase
        .from(
          "gmail_sync_state"
        )
        .select("history_id")
        .eq(
          "user_id",
          user.id
        )
        .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error:
            "Failed to load Gmail sync state",
        },
        {
          status: 500,
        }
      );
    }

    let result;

    if (!state?.history_id) {
      result =
        await performInitialSync(
          supabase,
          user.id
        );
    } else {
      result =
        await performIncrementalSync(
          supabase,
          user.id,
          state.history_id
        );

      if (!result) {
        result =
          await performInitialSync(
            supabase,
            user.id
          );
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Gmail sync error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Gmail synchronization failed",

        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}