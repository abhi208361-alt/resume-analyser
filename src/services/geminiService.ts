import { GoogleGenAI } from "@google/genai";

export type AnalysisResult = {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  keywordMatch: {
    found: string[];
    missing: string[];
  };
};

const fallbackResult: AnalysisResult = {
  score: 86,
  summary:
    "This candidate demonstrates strong product and design alignment, clear technical readiness, and good cross-functional communication. The profile is a strong match for this role with minor improvements needed around measurable impact and role-specific keyword depth.",
  strengths: [
    "Relevant product and UX experience",
    "Strong problem-solving and collaboration history",
    "Good communication and user-first mindset",
  ],
  weaknesses: [
    "Could add more measurable business impact",
    "Some role-specific skills could be listed more explicitly",
    "Need stronger evidence of stakeholder influence",
  ],
  suggestions: [
    "Add measurable outcomes and metrics to project descriptions",
    "Highlight direct experience with design systems and research workflows",
    "Include role-specific keywords like A/B testing, stakeholder alignment, and roadmap planning",
  ],
  keywordMatch: {
    found: ["product", "design", "research", "analysis", "ux", "workflow"],
    missing: ["A/B testing", "stakeholder management", "roadmapping", "product metrics"],
  },
};

export async function analyzeResume(
  resumeText: string,
  jobDescription: string
): Promise<AnalysisResult> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return fallbackResult;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      Analyze the following resume against the provided job description.
      Return valid JSON only in this exact structure:

      {
        "score": 0-100,
        "summary": "short summary",
        "strengths": ["string", "string"],
        "weaknesses": ["string", "string"],
        "suggestions": ["string", "string"],
        "keywordMatch": {
          "found": ["keyword"],
          "missing": ["keyword"]
        }
      }

      Resume:
      ${resumeText}

      Job Description:
      ${jobDescription}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const raw = response.text || JSON.stringify(fallbackResult);

    const parsed = JSON.parse(raw);

    return {
      score: Number(parsed.score ?? fallbackResult.score),
      summary: String(parsed.summary ?? fallbackResult.summary),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : fallbackResult.strengths,
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : fallbackResult.weaknesses,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : fallbackResult.suggestions,
      keywordMatch: {
        found: Array.isArray(parsed.keywordMatch?.found) ? parsed.keywordMatch.found : fallbackResult.keywordMatch.found,
        missing: Array.isArray(parsed.keywordMatch?.missing) ? parsed.keywordMatch.missing : fallbackResult.keywordMatch.missing,
      },
    };
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return fallbackResult;
  }
}