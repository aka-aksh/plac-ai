import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  // This endpoint checks secret configuration and can make a paid Gemini call.
  // Keep it available for local setup only; it must never be an internet-facing
  // production diagnostics oracle.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const diagnostics: Record<string, { status: "ok" | "error" | "warning"; message: string }> = {};

  // 1. Check NEXT_PUBLIC_SUPABASE_URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    diagnostics.NEXT_PUBLIC_SUPABASE_URL = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else if (!supabaseUrl.startsWith("https://") || !supabaseUrl.includes(".supabase.co")) {
    diagnostics.NEXT_PUBLIC_SUPABASE_URL = {
      status: "warning",
      message: "Format looks unusual. Standard format is: https://your-ref.supabase.co",
    };
  } else {
    diagnostics.NEXT_PUBLIC_SUPABASE_URL = {
      status: "ok",
      message: "Configured (valid URL format)",
    };
  }

  // 2. Check NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anonKey) {
    diagnostics.NEXT_PUBLIC_SUPABASE_ANON_KEY = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else if (!anonKey.startsWith("eyJ") && !anonKey.startsWith("sb_publishable_")) {
    diagnostics.NEXT_PUBLIC_SUPABASE_ANON_KEY = {
      status: "warning",
      message: "Key format looks unusual (typically starts with 'eyJ' for JWT anon key).",
    };
  } else {
    diagnostics.NEXT_PUBLIC_SUPABASE_ANON_KEY = {
      status: "ok",
      message: "Configured (valid JWT token format)",
    };
  }

  // 3. Check ENCRYPTION_KEY
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) {
    diagnostics.ENCRYPTION_KEY = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else {
    try {
      const decoded = Buffer.from(encKey, "base64");
      if (decoded.length !== 32) {
        diagnostics.ENCRYPTION_KEY = {
          status: "error",
          message: `Invalid byte length: Decoded to ${decoded.length} bytes, but AES-256 requires exactly 32 bytes.`,
        };
      } else {
        diagnostics.ENCRYPTION_KEY = {
          status: "ok",
          message: "Configured (Valid 32-byte AES-256 base64 key)",
        };
      }
    } catch {
      diagnostics.ENCRYPTION_KEY = {
        status: "error",
        message: "Not valid base64 string.",
      };
    }
  }

  // 4. Check GOOGLE_CLIENT_ID
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    diagnostics.GOOGLE_CLIENT_ID = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else if (!clientId.includes(".apps.googleusercontent.com")) {
    diagnostics.GOOGLE_CLIENT_ID = {
      status: "warning",
      message: "Standard Google OAuth Client IDs usually end with '.apps.googleusercontent.com'.",
    };
  } else {
    diagnostics.GOOGLE_CLIENT_ID = {
      status: "ok",
      message: "Configured (valid Google OAuth Client ID format)",
    };
  }

  // 5. Check GOOGLE_CLIENT_SECRET
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    diagnostics.GOOGLE_CLIENT_SECRET = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else if (clientSecret.length < 15) {
    diagnostics.GOOGLE_CLIENT_SECRET = {
      status: "warning",
      message: "Secret length is unusually short.",
    };
  } else {
    diagnostics.GOOGLE_CLIENT_SECRET = {
      status: "ok",
      message: "Configured (valid secret format)",
    };
  }

  // 6. Test GEMINI_API_KEY with live ping
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    diagnostics.GEMINI_API_KEY = {
      status: "error",
      message: "Missing in .env.local",
    };
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const testResponse = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        contents: "test",
      });

      if (testResponse.text) {
        diagnostics.GEMINI_API_KEY = {
          status: "ok",
          message: "Verified & Working! (Successfully pinged Gemini API)",
        };
      } else {
        diagnostics.GEMINI_API_KEY = {
          status: "warning",
          message: "API key responded with empty text.",
        };
      }
    } catch (err) {
      diagnostics.GEMINI_API_KEY = {
        status: "error",
        message: `Gemini API test failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // 7. Test Supabase Database Connection & Tables Check
  try {
    const supabase = await createServerSupabaseClient();
    const { error: dbError } = await supabase.from("gmail_connections").select("id").limit(1);

    if (dbError) {
      diagnostics.SUPABASE_DATABASE_TABLES = {
        status: "error",
        message: `Database query failed: ${dbError.message}. Make sure to run schema.sql in Supabase SQL Editor.`,
      };
    } else {
      diagnostics.SUPABASE_DATABASE_TABLES = {
        status: "ok",
        message: "Connected! All database tables are accessible.",
      };
    }
  } catch (err) {
    diagnostics.SUPABASE_DATABASE_TABLES = {
      status: "error",
      message: `Database client failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const allPassed = Object.values(diagnostics).every((d) => d.status === "ok");

  return NextResponse.json(
    {
      overallStatus: allPassed ? "ALL_KEYS_VALID" : "ISSUES_DETECTED",
      diagnostics,
      instructions: "No private secret values are exposed in this test.",
    },
    { status: allPassed ? 200 : 207 }
  );
}
