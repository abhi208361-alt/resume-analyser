import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "talentlens_secret_key_2025";

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only PDF and TXT files are supported"));
  },
});

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function fallbackAnalysis() {
  return {
    score: 86,
    summary:
      "Candidate demonstrates strong role alignment and clear communication of relevant work. The profile is a strong match with a few gaps around measurable business impact and job-specific keywords.",
    strengths: [
      "Strong product and UX awareness",
      "Relevant experience with technical delivery",
      "Good cross-functional communication",
    ],
    weaknesses: [
      "Could include more measurable business impact",
      "Need stronger evidence of role-specific keywords",
      "Add examples of direct stakeholder influence",
    ],
    suggestions: [
      "Add more quantified results to project descriptions",
      "Promote direct product metrics and stakeholder influence",
      "Mirror role-specific keyword clusters in the resume",
    ],
    keywordMatch: {
      found: ["product", "design", "analysis", "ux", "research"],
      missing: ["A/B testing", "roadmapping", "stakeholder management"],
    },
  };
}

async function analyzeTextWithGemini(resumeText, jobDescription) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    return fallbackAnalysis();
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
                    Analyze this resume against the job description.
                    Return valid JSON only in this shape:
                    {
                      "score": 0-100,
                      "summary": "string",
                      "strengths": ["string"],
                      "weaknesses": ["string"],
                      "suggestions": ["string"],
                      "keywordMatch": {
                        "found": ["string"],
                        "missing": ["string"]
                      }
                    }

                    Job description:
                    ${jobDescription}

                    Resume:
                    ${resumeText}
                  `,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Gemini unavailable");
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      JSON.stringify(fallbackAnalysis());

    const parsed = JSON.parse(text);

    return {
      score: Number(parsed.score ?? 86),
      summary: String(parsed.summary ?? fallbackAnalysis().summary),
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths
        : fallbackAnalysis().strengths,
      weaknesses: Array.isArray(parsed.weaknesses)
        ? parsed.weaknesses
        : fallbackAnalysis().weaknesses,
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : fallbackAnalysis().suggestions,
      keywordMatch: {
        found: Array.isArray(parsed.keywordMatch?.found)
          ? parsed.keywordMatch.found
          : fallbackAnalysis().keywordMatch.found,
        missing: Array.isArray(parsed.keywordMatch?.missing)
          ? parsed.keywordMatch.missing
          : fallbackAnalysis().keywordMatch.missing,
      },
    };
  } catch (error) {
    return fallbackAnalysis();
  }
}

// AUTH
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db
    .prepare("SELECT * FROM users WHERE email = ? AND password = ?")
    .get(email, password);

  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  return res.json({
    token: signToken(user),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// DASHBOARD
app.get("/api/dashboard", verifyToken, (_req, res) => {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY id DESC").all();
  const screenings = db.prepare("SELECT * FROM screenings ORDER BY id DESC LIMIT 5").all();

  res.json({
    metrics: [
      { label: "New Resumes Today", value: 184, delta: "+12%" },
      { label: "Auto-Screened", value: 96, delta: "+8%" },
      { label: "Awaiting Review", value: 31, delta: "-5%" },
      { label: "Active Jobs", value: jobs.length, delta: "+2" },
    ],
    screenings: screenings.map((row) => ({
      id: row.id,
      name: row.candidate_name,
      role: row.role_name,
      score: row.score,
      status: row.status,
      updated: row.updated,
    })),
    applicationsByJob: [
      { label: "Product", value: 42, color: "#5b4ae3" },
      { label: "Engineering", value: 31, color: "#7c6ff2" },
      { label: "Sales", value: 28, color: "#3ac6af" },
      { label: "Finance", value: 23, color: "#5eaaf6" },
      { label: "Marketing", value: 37, color: "#8b5cf6" },
    ],
    pipelineStages: [
      { label: "New", value: 126, color: "#8b5cf6" },
      { label: "Screening", value: 68, color: "#22c55e" },
      { label: "Interview", value: 34, color: "#14b8a6" },
      { label: "Offer", value: 12, color: "#f59e0b" },
      { label: "Rejected", value: 51, color: "#cbd5e1" },
    ],
  });
});

// JOBS CRUD
app.get("/api/jobs", verifyToken, (_req, res) => {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY id DESC").all();
  res.json(jobs);
});

app.post("/api/jobs", verifyToken, (req, res) => {
  const { title, department, status, applicants, description, requirements } = req.body || {};
  if (!title || !department) {
    return res.status(400).json({ message: "Title and department are required" });
  }

  const result = db
    .prepare(`
      INSERT INTO jobs (title, department, status, applicants, description, requirements)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      title,
      department,
      status || "Open",
      Number(applicants || 0),
      description || "",
      requirements || ""
    );

  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(job);
});

app.put("/api/jobs/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const { title, department, status, applicants, description, requirements } = req.body || {};

  const existing = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Job not found" });

  db.prepare(`
    UPDATE jobs
    SET title = ?, department = ?, status = ?, applicants = ?, description = ?, requirements = ?
    WHERE id = ?
  `).run(
    title || existing.title,
    department || existing.department,
    status || existing.status,
    Number(applicants ?? existing.applicants),
    description ?? existing.description,
    requirements ?? existing.requirements,
    id
  );

  const updated = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return res.json(updated);
});

app.delete("/api/jobs/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Job not found" });

  db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return res.json({ success: true });
});

// CANDIDATES CRUD
app.get("/api/candidates", verifyToken, (_req, res) => {
  const rows = db.prepare("SELECT * FROM candidates ORDER BY id DESC").all();
  res.json(rows);
});

app.post("/api/candidates", verifyToken, (req, res) => {
  const { name, email, job_title, status, score, skills } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" });
  }

  const result = db
    .prepare(`
      INSERT INTO candidates (name, email, job_title, status, score, skills)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(name, email, job_title || "", status || "In Review", Number(score || 0), skills || "");

  const candidate = db.prepare("SELECT * FROM candidates WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(candidate);
});

app.put("/api/candidates/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const { name, email, job_title, status, score, skills } = req.body || {};

  const existing = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Candidate not found" });

  db.prepare(`
    UPDATE candidates
    SET name = ?, email = ?, job_title = ?, status = ?, score = ?, skills = ?
    WHERE id = ?
  `).run(
    name || existing.name,
    email || existing.email,
    job_title ?? existing.job_title,
    status || existing.status,
    Number(score ?? existing.score),
    skills ?? existing.skills,
    id
  );

  const updated = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
  return res.json(updated);
});

app.delete("/api/candidates/:id", verifyToken, (req, res) => {
  const { id } = req.params;
  const existing = db.prepare("SELECT * FROM candidates WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ message: "Candidate not found" });

  db.prepare("DELETE FROM candidates WHERE id = ?").run(id);
  return res.json({ success: true });
});

// SCREENINGS
app.get("/api/screenings", verifyToken, (_req, res) => {
  const rows = db.prepare("SELECT * FROM screenings ORDER BY id DESC").all();
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.candidate_name,
      role: row.role_name,
      score: row.score,
      status: row.status,
      updated: row.updated,
    }))
  );
});

// MODELS
app.get("/api/models", verifyToken, (_req, res) => {
  res.json([
    { id: 1, name: "Resume parsing / extraction", status: "Healthy", detail: "Avg latency 1.1s" },
    { id: 2, name: "AI scoring / analysis", status: "Degraded", detail: "3 recent spikes" },
    { id: 3, name: "Skills extraction", status: "Healthy", detail: "92% confidence" },
    { id: 4, name: "Duplicate detection", status: "Not Configured", detail: "Disabled in tenant" },
  ]);
});

// ALERTS
app.get("/api/alerts", verifyToken, (_req, res) => {
  const rows = db.prepare("SELECT * FROM alerts ORDER BY id DESC").all();
  res.json(rows);
});

// REPORTS
app.get("/api/reports", verifyToken, (_req, res) => {
  res.json({
    cards: [
      { label: "Avg Match Score", value: "84%", delta: "+4.6%" },
      { label: "Time to Screen", value: "2.4d", delta: "-12%" },
      { label: "Offer Rate", value: "31%", delta: "+2.1%" },
      { label: "Hidden Talent", value: "14%", delta: "+6%" },
    ],
    velocity: [42, 58, 76, 63, 85, 92, 74],
  });
});

// RESUMES
app.get("/api/resumes", verifyToken, (_req, res) => {
  const rows = db.prepare("SELECT * FROM resumes ORDER BY id DESC").all();
  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.candidate_name,
      file: row.file_name,
      uploaded: row.uploaded_at,
      status: row.status,
      score: row.score,
    }))
  );
});

app.post("/api/analyze", verifyToken, async (req, res) => {
  const { resumeText, jobDescription } = req.body || {};
  if (!resumeText || !jobDescription) {
    return res.status(400).json({ message: "resumeText and jobDescription are required" });
  }

  const result = await analyzeTextWithGemini(resumeText, jobDescription);
  return res.json(result);
});

app.post("/api/upload-resume", verifyToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let resumeText = "";

    if (req.file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(buffer);
      resumeText = pdfData.text;
    } else {
      resumeText = fs.readFileSync(req.file.path, "utf8");
    }

    const analysis = await analyzeTextWithGemini(resumeText, "General product and hiring role");

    const candidateName = req.body.candidateName || "Uploaded Candidate";
    const uploadedAt = new Date().toISOString().slice(0, 10);

    db.prepare(`
      INSERT INTO resumes (candidate_name, file_name, original_name, stored_path, uploaded_at, status, score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      candidateName,
      req.file.originalname,
      req.file.originalname,
      req.file.path,
      uploadedAt,
      "Analyzed",
      analysis.score || 82
    );

    db.prepare(`
      INSERT INTO screenings (candidate_name, role_name, score, status, updated)
      VALUES (?, ?, ?, ?, ?)
    `).run(candidateName, "Frontend Developer", analysis.score || 82, "Strong Match", "just now");

    return res.json({
      message: "Resume uploaded successfully",
      score: analysis.score || 82,
      summary: analysis.summary || "Resume analyzed successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Resume processing failed" });
  }
});

app.listen(PORT, () => {
  console.log(`TalentLens backend running on http://localhost:${PORT}`);
});