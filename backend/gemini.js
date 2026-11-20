import dotenv from "dotenv";

dotenv.config();

const skillCatalog = {
  programming: ["javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "php", "ruby"],
  frameworks: ["react", "next.js", "node.js", "express", "angular", "vue", "django", "spring", " .net"],
  data: ["sql", "postgresql", "mysql", "mongodb", "redis", "pandas", "tableau", "power bi"],
  cloud: ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd"],
  soft: ["leadership", "communication", "collaboration", "problem solving", "stakeholder management", "mentoring"],
};

const words = (value) =>
  [...new Set(String(value).toLowerCase().match(/[a-z][a-z0-9+#./-]{1,}/g) || [])];

function extractSkills(text) {
  const normalized = String(text).toLowerCase();
  return Object.fromEntries(
    Object.entries(skillCatalog).map(([category, skills]) => [
      category,
      skills.filter((skill) => normalized.includes(skill.trim().toLowerCase())),
    ])
  );
}

export function extractResumeData(text) {
  const source = String(text || "");
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = source.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() || "";
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fullName = lines.find((line) => /^[A-Za-z][A-Za-z .'-]{2,50}$/.test(line) && !/@/.test(line)) || "";
  const skills = extractSkills(source);
  const sections = {};
  for (const section of ["education", "experience", "projects", "certifications", "achievements"]) {
    const index = source.toLowerCase().indexOf(section);
    sections[section] = index >= 0 ? source.slice(index, index + 1200).trim() : "";
  }
  return { fullName, email, phone, skills, ...sections };
}

function localAnalysis(resumeText, jobDescription) {
  const resumeWords = new Set(words(resumeText));
  const required = words(jobDescription).filter((word) => word.length > 3);
  const uniqueRequired = [...new Set(required)];
  const found = uniqueRequired.filter((word) => resumeWords.has(word));
  const missing = uniqueRequired.filter((word) => !resumeWords.has(word)).slice(0, 20);
  const keywordRatio = uniqueRequired.length ? found.length / uniqueRequired.length : 0;
  const resumeLength = String(resumeText).trim().length;
  const sections = extractResumeData(resumeText);
  const sectionCount = ["education", "experience", "projects"].filter((key) => sections[key]).length;
  const score = Math.max(0, Math.min(100, Math.round(keywordRatio * 70 + Math.min(resumeLength / 2200, 1) * 20 + sectionCount * 3)));
  const atsScore = Math.max(0, Math.min(100, Math.round(Math.min(resumeLength / 1600, 1) * 65 + sectionCount * 10)));

  return {
    score,
    atsScore,
    summary: `Local analysis found ${found.length} of ${uniqueRequired.length || 0} job keywords and ${Object.values(sections.skills).flat().length} recognizable skills.`,
    strengths: [
      ...(found.length ? [`Matches ${found.length} job-specific keywords`] : []),
      ...(sections.experience ? ["Includes an experience section"] : []),
      ...(sections.projects ? ["Includes project evidence"] : []),
    ],
    weaknesses: [
      ...(missing.length ? [`Missing keywords: ${missing.slice(0, 5).join(", ")}`] : []),
      ...(!sections.education ? ["Education section was not detected"] : []),
      ...(resumeLength < 800 ? ["Resume text is short; add measurable accomplishments"] : []),
    ],
    suggestions: [
      "Use quantified outcomes for each major responsibility",
      ...(missing.length ? [`Add truthful role keywords such as ${missing.slice(0, 3).join(", ")}`] : []),
      "Keep section headings standard for ATS parsing",
    ],
    keywordMatch: { found, missing },
    extracted: sections,
  };
}

function parseJsonResponse(text) {
  const cleaned = String(text).replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

export async function analyzeResume(resumeText, jobDescription) {
  const local = localAnalysis(resumeText, jobDescription);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...local, source: "local" };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Return JSON only with score, atsScore, summary, strengths, weaknesses, suggestions, keywordMatch(found, missing). Analyze this resume against this job description.\nResume:\n${resumeText}\nJob:\n${jobDescription}` }] }],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json();
    const parsed = parseJsonResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    return {
      ...local,
      ...parsed,
      score: Math.max(0, Math.min(100, Number(parsed.score ?? local.score))),
      atsScore: Math.max(0, Math.min(100, Number(parsed.atsScore ?? local.atsScore))),
      keywordMatch: {
        found: Array.isArray(parsed.keywordMatch?.found) ? parsed.keywordMatch.found : local.keywordMatch.found,
        missing: Array.isArray(parsed.keywordMatch?.missing) ? parsed.keywordMatch.missing : local.keywordMatch.missing,
      },
      source: "gemini",
    };
  } catch (error) {
    console.warn("Gemini analysis unavailable; returning local analysis:", error.message);
    return { ...local, source: "local", warning: "AI provider unavailable; local analysis was used." };
  }
}
