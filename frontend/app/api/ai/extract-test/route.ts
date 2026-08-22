import { NextResponse } from "next/server";
import { extractOpportunity } from "@/lib/gemini-extract";

const SAMPLE_EMAIL = {
  sender: "careers@example.com",
  subject: "Software Engineer Campus Hiring 2027",
  body: `
Hello Students,

Example Technologies is inviting applications for the
Software Engineer role for the 2027 graduating batch.

Eligibility:
- B.Tech CSE/IT
- Minimum CGPA: 7.5
- No active backlogs

Salary: ₹12 LPA

The online assessment will be conducted on 30 August 2026.

Apply before 27 August 2026.

Apply here:
https://example.com/apply

Regards,
Campus Recruitment Team
Example Technologies
`,
};

export async function GET() {
  try {
    const result = await extractOpportunity(
      SAMPLE_EMAIL.sender,
      SAMPLE_EMAIL.subject,
      SAMPLE_EMAIL.body
    );

    return NextResponse.json({
      success: true,
      test: "sample-placement-email",
      extraction: result,
    });
  } catch (error) {
    console.error(
      "Extraction test error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Opportunity extraction test failed",
      },
      { status: 500 }
    );
  }
}