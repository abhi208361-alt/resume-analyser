import dotenv from "dotenv";

dotenv.config();

const skillCatalog = {
  programming: ["javascript", "typescript", "python", "java", "c++", "c#", "go", "rust", "php", "ruby", "kotlin", "swift"],
  frameworks: ["react", "next.js", "node.js", "express", "angular", "vue", "django", "spring", ".net", "flask"],
  data: ["sql", "postgresql", "mysql", "mongodb", "redis", "pandas", "tableau", "power bi", "oracle"],
  cloud: ["aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ci/cd", "github actions"],
  security: ["cybersecurity", "owasp", "penetration testing", "siem", "soc", "iam", "encryption"],
  soft: ["leadership", "communication", "collaboration", "problem solving", "stakeholder management", "mentoring"],
};

function normalizeWords(value) {
  return [...new Set(String(value).toLowerCase().match(/[a-z][a-z0-9+#./-]{1,}/g) || [])];
}

export function extractResumeData(text) {
  const source = String(text || "").replace(/\r/g, "");
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = source.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() || "";
  const lines = source.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const fullName = lines.find((line) =>
    /^[A-Za-z][A-Za-z .'-]{2,50}$/.test(line) &&
    !/@/.test(line) &&
    !/^(resume|curriculum|curriculum vitae|profile|summary)$/i.test(line)
  ) || "";

  const skills = Object.fromEntries(
    Object.entries(skillCatalog).map(([category, catalog]) => [
      category,
      catalog.filter((skill) => source.toLowerCase().includes(skill)),
    ])
  );

  const sectionText = (name) => {
    const heading = new RegExp(`^\\s*${name}\\s*:?[\\t ]*$`, "i");
    const headings = lines
      .map((line, index) => ({ line, index }))
      .filter((item) => heading.test(item.line));
    if (!headings.length) return "";
    const start = headings[0].index + 1;
    let end = lines.length;
    for (let index = start; index < lines.length; index++) {
      if (/^[A-Za-z][A-Za-z /&-]{2,30}\s*:?\s*$/.test(lines[index]) && index !== start) {
        end = index;
        break;
      }
    }
    return lines.slice(start, end).join("\n").trim();
  };

  return {
    fullName,
    email,
    phone,
    skills,
    education: sectionText("education"),
    experience: sectionText("(?:work )?experience|employment"),
    projects: sectionText("projects"),
    certifications: sectionText("certifications"),
    achievements: sectionText("achievements|accomplishments"),
  };
}

function localAnalysis(resumeText, jobDescription) {
  const resume = String(resumeText || "").trim();
  const job = String(jobDescription || "").trim();
  const extracted = extractResumeData(resume);
  const resumeWords = new Set(normalizeWords(resume));
  const jobWords = [...new Set(normalizeWords(job).filter((word) => word.length > 3))];
  const found = jobWords.filter((word) => resumeWords.has(word));
  const missing = jobWords.filter((word) => !resumeWords.has(word)).slice(0, 30);
  const keywordRatio = jobWords.length ? found.length / jobWords.length : 0;
  const flatSkills = Object.values(extracted.skills).flat();
  const skillsScore = Math.min(100, flatSkills.length * 10);
  const experienceScore = extracted.experience ? 70 : 35;
  const educationScore = extracted.education ? 75 : 45;
  const projectsScore = extracted.projects ? 80 : 35;
  const formattingScore = Math.max(25, Math.min(100,
    (resume.length >= 800 ? 30 : 10) +
    (resume.split(/\n/).length >= 8 ? 30 : 15) +
    (/education|experience|skills|projects/i.test(resume) ? 40 : 20)
  ));
  const keywordScore = Math.round(keywordRatio * 100);
  const score = Math.round(
    skillsScore * 0.23 +
    experienceScore * 0.20 +
    educationScore * 0.12 +
    projectsScore * 0.12 +
    formattingScore * 0.13 +
    keywordScore * 0.20
  );
  const atsScore = Math.round(formattingScore * 0.55 + keywordScore * 0.45);

  return {
    score: Math.max(0, Math.min(100, score)),
    atsScore: Math.max(0, Math.min(100, atsScore)),
    skillsScore,
    experienceScore,
    educationScore,
    projectsScore,
    formattingScore,
    keywordScore,
    summary: `Deterministic analysis found ${found.length} of ${jobWords.length} selected job terms and ${flatSkills.length} recognizable skills.`,
    strengths: [
      ...(found.length ? [`Matches ${found.length} job-specific terms`] : []),
      ...(extracted.experience ? ["Experience section detected"] : []),
      ...(extracted.projects ? ["Project evidence detected"] : []),
      ...(flatSkills.length ? ["Technical skills were detectable"] : []),
    ],
    weaknesses: [
      ...(missing.length ? [`Missing job terms: ${missing.slice(0, 8).join(", ")}`] : []),
      ...(!extracted.education ? ["Education section could not be verified"] : []),
      ...(resume.length < 800 ? ["Resume content is brief; measurable outcomes may be missing"] : []),
      ...(!extracted.projects ? ["Project evidence could not be verified"] : []),
    ],
    suggestions: [
      "Use quantified outcomes for major responsibilities",
      "Use standard section headings for reliable parsing",
      ...(missing.length ? [`Only add ${missing.slice(0, 3).join(", ")} if they are truthful for the candidate`] : []),
    ],
    missingSkills: missing.filter((word) => /^(python|javascript|typescript|java|react|sql|aws|azure|docker|kubernetes|cybersecurity|leadership|communication)/i.test(word)),
    missingKeywords: missing,
    formattingProblems: formattingScore < 70 ? ["Section headings or text structure may need improvement"] : [],
    grammarIssues: [],
    experienceGaps: !extracted.experience ? ["No verifiable experience section was detected"] : [],
    educationEvaluation: extracted.education ? "Education details were detected." : "Education details could not be verified.",
    projectEvaluation: extracted.projects ? "Projects were detected." : "Projects could not be verified.",
    skillsEvaluation: flatSkills.length ? `Detected skills: ${flatSkills.join(", ")}` : "No catalog skills could be verified.",
    keywordMatch: { found, missing },
    extracted,
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
          contents: [{ parts: [{ text: `Return JSON only. Preserve facts from the resume and do not invent missing details. Add recommendations. Use keys: score, atsScore, skillsScore, experienceScore, educationScore, projectsScore, formattingScore, keywordScore, summary, strengths, weaknesses, suggestions, missingSkills, missingKeywords, formattingProblems, grammarIssues, experienceGaps, educationEvaluation, projectEvaluation, skillsEvaluation, keywordMatch(found, missing).\nResume:\n${String(resumeText).slice(0, 15000)}\nJob:\n${String(jobDescription).slice(0, 10000)}` }] }],
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json();
    const parsed = parseJsonResponse(data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
    const bounded = (value, fallback) => Math.max(0, Math.min(100, Number(value ?? fallback)));
    return {
      ...local,
      ...parsed,
      score: bounded(parsed.score, local.score),
      atsScore: bounded(parsed.atsScore, local.atsScore),
      skillsScore: bounded(parsed.skillsScore, local.skillsScore),
      experienceScore: bounded(parsed.experienceScore, local.experienceScore),
      educationScore: bounded(parsed.educationScore, local.educationScore),
      projectsScore: bounded(parsed.projectsScore, local.projectsScore),
      formattingScore: bounded(parsed.formattingScore, local.formattingScore),
      keywordScore: bounded(parsed.keywordScore, local.keywordScore),
      extracted: local.extracted,
      keywordMatch: {
        found: Array.isArray(parsed.keywordMatch?.found) ? parsed.keywordMatch.found : local.keywordMatch.found,
        missing: Array.isArray(parsed.keywordMatch?.missing) ? parsed.keywordMatch.missing : local.keywordMatch.missing,
      },
      source: "gemini",
      warning: "",
    };
  } catch (error) {
    return { ...local, source: "local", warning: `AI provider unavailable; local deterministic analysis was used: ${error.message}` };
  }
}
