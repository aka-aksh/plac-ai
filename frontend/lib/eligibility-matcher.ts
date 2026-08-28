export type StudentProfile = {
  cgpa: number | null;
  branch: string | null;
  graduation_year: number | null;
  marks_10: number | null;
  marks_12: number | null;
  skills: string[] | null;
  university?: string | null;
};

export type MatchCriterion = {
  name: string;
  required: string;
  userValue: string;
  passed: boolean | null; // true = passed, false = failed, null = inconclusive / profile field missing
  reason: string;
};

export type EligibilityResult = {
  status: "eligible" | "ineligible" | "review" | "not_specified";
  summary: string;
  criteria: MatchCriterion[];
  matchedSkills: string[];
  missingSkills: string[];
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s.]+/g, " ");
}

/**
 * Extracts CGPA requirement from text like "7.5 CGPA", "min 7.0 cgpa", "cgpa >= 8.0"
 */
function extractMinCgpa(text: string): number | null {
  const normalized = normalizeText(text);

  // Match patterns like "7.5 cgpa", "cgpa of 7.5", "cgpa >= 7.5", "min 7.5 cgpa", "cgpa: 7.5"
  const patterns = [
    /(?:cgpa|gpa|pointer|aggregate)\s*(?:of|is|>=|:|minimum|min)?\s*([0-9]\.[0-9]+|[0-9])/i,
    /([0-9]\.[0-9]+|[0-9])\s*(?:\+|and above)?\s*(?:cgpa|gpa|pointer)/i,
    /(?:minimum|min|at least)\s*([0-9]\.[0-9]+)\s*(?:cgpa|gpa)?/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (val >= 4.0 && val <= 10.0) {
        return val;
      }
    }
  }

  return null;
}

/**
 * Extracts percentage requirements for 10th/12th like "60% in 10th", "70% in 12th"
 */
function extractMarksRequirement(text: string, standard: "10th" | "12th"): number | null {
  const normalized = normalizeText(text);
  const stdPattern = standard === "10th" ? /(?:10th|10 th|ssc|matric)/i : /(?:12th|12 th|hsc|intermediate|inter)/i;

  if (!stdPattern.test(normalized)) return null;

  const match = normalized.match(/([5-9][0-9])\s*%\s*(?:in|and above|minimum|min)?/i);
  if (match && match[1]) {
    return parseFloat(match[1]);
  }
  return null;
}

/**
 * Extracts allowed branches from eligibility text
 */
function extractBranches(text: string): string[] {
  const normalized = normalizeText(text);
  const branchMap: Record<string, string[]> = {
    cse: ["cse", "computer science", "cs", "computer engineering"],
    it: ["it", "information technology"],
    ece: ["ece", "electronics", "electronics and communication", "enc"],
    eee: ["eee", "electrical", "electrical and electronics"],
    mech: ["mech", "mechanical"],
    civil: ["civil"],
    ai_ml: ["ai", "aiml", "artificial intelligence", "data science", "ds"],
    all: ["all branches", "any branch", "all streams", "open for all", "any engineering", "all degrees"],
  };

  const found: string[] = [];

  for (const [canonical, aliases] of Object.entries(branchMap)) {
    for (const alias of aliases) {
      if (new RegExp(`\\b${alias}\\b`, "i").test(normalized)) {
        found.push(canonical);
        break;
      }
    }
  }

  return found;
}

/**
 * Evaluates student eligibility against opportunity requirements
 */
export function evaluateEligibility(
  eligibilityText: string | null | undefined,
  profile: StudentProfile | null | undefined,
  extraContext?: string | null
): EligibilityResult {
  const combinedText = `${eligibilityText ?? ""} ${extraContext ?? ""}`.trim();

  if (!combinedText || combinedText.toLowerCase() === "not mentioned") {
    return {
      status: "not_specified",
      summary: "No specific eligibility criteria mentioned in the opportunity.",
      criteria: [],
      matchedSkills: [],
      missingSkills: [],
    };
  }

  const criteria: MatchCriterion[] = [];
  let hasIneligible = false;
  let hasInconclusive = false;

  // 1. CGPA Check
  const requiredCgpa = extractMinCgpa(combinedText);
  if (requiredCgpa !== null) {
    if (profile?.cgpa != null) {
      const passed = profile.cgpa >= requiredCgpa;
      if (!passed) hasIneligible = true;
      criteria.push({
        name: "CGPA Cutoff",
        required: `Min ${requiredCgpa.toFixed(2)} CGPA`,
        userValue: `${profile.cgpa.toFixed(2)} CGPA`,
        passed,
        reason: passed
          ? `Your CGPA (${profile.cgpa}) meets or exceeds the minimum of ${requiredCgpa}.`
          : `Your CGPA (${profile.cgpa}) is below the required cutoff of ${requiredCgpa}.`,
      });
    } else {
      hasInconclusive = true;
      criteria.push({
        name: "CGPA Cutoff",
        required: `Min ${requiredCgpa.toFixed(2)} CGPA`,
        userValue: "Not set in profile",
        passed: null,
        reason: `Opportunity requires ${requiredCgpa} CGPA, but your profile CGPA is not set.`,
      });
    }
  }

  // 2. 10th Marks Check
  const req10th = extractMarksRequirement(combinedText, "10th");
  if (req10th !== null) {
    if (profile?.marks_10 != null) {
      const passed = profile.marks_10 >= req10th;
      if (!passed) hasIneligible = true;
      criteria.push({
        name: "10th Percentage",
        required: `Min ${req10th}%`,
        userValue: `${profile.marks_10}%`,
        passed,
        reason: passed
          ? `Your 10th marks (${profile.marks_10}%) satisfy the requirement.`
          : `Your 10th marks (${profile.marks_10}%) are below the required ${req10th}%.`,
      });
    } else {
      hasInconclusive = true;
      criteria.push({
        name: "10th Percentage",
        required: `Min ${req10th}%`,
        userValue: "Not set in profile",
        passed: null,
        reason: `Requires ${req10th}% in 10th standard.`,
      });
    }
  }

  // 3. 12th Marks Check
  const req12th = extractMarksRequirement(combinedText, "12th");
  if (req12th !== null) {
    if (profile?.marks_12 != null) {
      const passed = profile.marks_12 >= req12th;
      if (!passed) hasIneligible = true;
      criteria.push({
        name: "12th Percentage",
        required: `Min ${req12th}%`,
        userValue: `${profile.marks_12}%`,
        passed,
        reason: passed
          ? `Your 12th marks (${profile.marks_12}%) satisfy the requirement.`
          : `Your 12th marks (${profile.marks_12}%) are below the required ${req12th}%.`,
      });
    } else {
      hasInconclusive = true;
      criteria.push({
        name: "12th Percentage",
        required: `Min ${req12th}%`,
        userValue: "Not set in profile",
        passed: null,
        reason: `Requires ${req12th}% in 12th standard.`,
      });
    }
  }

  // 4. Branch Check
  const allowedBranches = extractBranches(combinedText);
  if (allowedBranches.length > 0 && !allowedBranches.includes("all")) {
    if (profile?.branch) {
      const userBranchNorm = normalizeText(profile.branch);
      const isAllowed = allowedBranches.some((canonical) => {
        if (canonical === "cse" && /cs|computer/i.test(userBranchNorm)) return true;
        if (canonical === "it" && /information/i.test(userBranchNorm)) return true;
        if (canonical === "ece" && /electronics/i.test(userBranchNorm)) return true;
        if (canonical === "eee" && /electrical/i.test(userBranchNorm)) return true;
        if (canonical === "mech" && /mech/i.test(userBranchNorm)) return true;
        if (canonical === "civil" && /civil/i.test(userBranchNorm)) return true;
        if (canonical === "ai_ml" && /(ai|ml|data)/i.test(userBranchNorm)) return true;
        return false;
      });

      if (!isAllowed) hasIneligible = true;
      criteria.push({
        name: "Eligible Branches",
        required: allowedBranches.map((b) => b.toUpperCase()).join(", "),
        userValue: profile.branch,
        passed: isAllowed,
        reason: isAllowed
          ? `Your branch (${profile.branch}) is eligible.`
          : `Your branch (${profile.branch}) was not found in the allowed branches list.`,
      });
    } else {
      hasInconclusive = true;
      criteria.push({
        name: "Eligible Branches",
        required: allowedBranches.map((b) => b.toUpperCase()).join(", "),
        userValue: "Not set in profile",
        passed: null,
        reason: `Eligible branches specified, but your branch is not configured.`,
      });
    }
  }

  // 5. Skill Matching
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  if (profile?.skills && profile.skills.length > 0) {
    const textLower = combinedText.toLowerCase();
    for (const skill of profile.skills) {
      const skillClean = skill.trim();
      if (!skillClean) continue;
      // Exact word boundary matching for skill
      const escaped = skillClean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(textLower)) {
        matchedSkills.push(skillClean);
      }
    }
  }

  // Overall status resolution
  let status: EligibilityResult["status"] = "not_specified";
  let summary = "";

  if (criteria.length === 0) {
    status = "not_specified";
    summary = "No strict numeric cutoffs or branch filters detected.";
  } else if (hasIneligible) {
    status = "ineligible";
    const failed = criteria.filter((c) => c.passed === false).map((c) => c.name);
    summary = `You do not meet the criteria for: ${failed.join(", ")}.`;
  } else if (hasInconclusive) {
    status = "review";
    summary = "You meet all verified criteria, but some profile fields are missing.";
  } else {
    status = "eligible";
    summary = "You meet all explicitly mentioned eligibility requirements!";
  }

  return {
    status,
    summary,
    criteria,
    matchedSkills,
    missingSkills,
  };
}
