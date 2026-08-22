import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    test: "attachment-processing-route-ready",
    message:
      "Real Gmail attachment testing requires a Gmail message with a PDF or DOCX.",
  });
}
