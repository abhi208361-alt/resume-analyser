import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { analyzeResume } from "./gemini.js";
import { signToken, verifyToken } from "./auth.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    cb(allowed.has(file.mimetype) ? null : new Error("Only PDF, DOCX, and TXT files are supported"), allowed.has(file.mimetype));
  },
});

const audit = (userId, action, detail = "") =>
  db.prepare("INSERT INTO audit_logs (user_id, action, detail) VALUES (?, ?, ?)").run(userId, action, detail);

function userId(req) {
  return Number(req.user.id);
}

function own(table, id, owner) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, owner);
}

async function extractText(file) {
  if (file.mimetype === "application/pdf") return (await pdfParse(fs.readFileSync(file.path))).text;
  if (file.mimetype.includes("wordprocessingml")) return (await mammoth.extractRawText({ path: file.path })).value;
  return fs.readFileSync(file.path, "utf8");
}

function safeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

app.get("/api/health", (_req, res) => res.json({ status: "ok", database: "sqlite", ai: Boolean(process.env.GEMINI_API_KEY) }));

app.post("/api/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(password || "").length < 8) {
      return res.status(400).json({ message: "Name, valid email, and a password of at least 8 characters are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail)) {
      return res.status(409).json({ message: "An account with that email already exists" });
    }
    const result = db.prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')")
      .run(name.trim(), normalizedEmail, await bcrypt.hash(password, 12));
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    audit(user.id, "register");
    res.status(201).json({ token: signToken(user), user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !(await bcrypt.compare(String(req.body?.password || ""), user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    audit(user.id, "login");
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", verifyToken, (req, res) => {
  audit(userId(req), "logout");
  res.json({ success: true });
});

app.get("/api/me", verifyToken, (req, res) => {
  const user = db.prepare("SELECT id, name, email, role, created_at FROM users WHERE id = ?").get(userId(req));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

app.get("/api/dashboard", verifyToken, (req, res) => {
  const id = userId(req);
  const totalResumes = db.prepare("SELECT COUNT(*) count FROM resumes WHERE user_id = ?").get(id).count;
  const totalAnalyses = db.prepare("SELECT COUNT(*) count FROM analyses WHERE user_id = ?").get(id).count;
  const average = db.prepare("SELECT COALESCE(ROUND(AVG(score)), 0) score FROM analyses WHERE user_id = ?").get(id).score;
  const recent = db.prepare(`
    SELECT a.id, COALESCE(r.candidate_name, 'Resume') name, COALESCE(a.job_title, 'General analysis') role,
      a.score, a.created_at updated, a.source
    FROM analyses a LEFT JOIN resumes r ON r.id = a.resume_id
    WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 8
  `).all(id);
  const skills = db.prepare("SELECT result_json FROM analyses WHERE user_id = ? ORDER BY id DESC LIMIT 20").all(id)
    .flatMap((row) => JSON.parse(row.result_json).extracted?.skills ? Object.values(JSON.parse(row.result_json).extracted.skills).flat() : []);
  const counts = [...new Set(skills)].map((skill) => ({ label: skill, value: skills.filter((item) => item === skill).length, color: "#5b4ae3" }));
  res.json({
    metrics: [
      { label: "Total Resumes", value: totalResumes, delta: "persisted" },
      { label: "Analyses", value: totalAnalyses, delta: "persisted" },
      { label: "Average Score", value: average, delta: "out of 100" },
      { label: "Active Jobs", value: db.prepare("SELECT COUNT(*) count FROM jobs WHERE user_id = ? AND status != 'Closed'").get(id).count, delta: "persisted" },
    ],
    screenings: recent.map((row) => ({ id: row.id, name: row.name, role: row.role, score: row.score, status: row.score >= 75 ? "Strong Match" : "In Review", updated: row.updated })),
    applicationsByJob: counts.slice(0, 6),
    pipelineStages: [
      { label: "Analyzed", value: totalAnalyses, color: "#8b5cf6" },
      { label: "Strong Match", value: recent.filter((row) => row.score >= 75).length, color: "#22c55e" },
      { label: "Needs Review", value: recent.filter((row) => row.score < 75).length, color: "#f59e0b" },
    ],
  });
});

app.get("/api/jobs", verifyToken, (req, res) => res.json(db.prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY id DESC").all(userId(req))));
app.post("/api/jobs", verifyToken, (req, res, next) => {
  try {
    const { title, department, status = "Open", applicants = 0, description = "", requirements = "" } = req.body || {};
    if (!title?.trim() || !department?.trim()) return res.status(400).json({ message: "Title and department are required" });
    const result = db.prepare("INSERT INTO jobs (title, department, status, applicants, description, requirements, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(title.trim(), department.trim(), status, Number(applicants) || 0, description, requirements, userId(req));
    res.status(201).json(own("jobs", result.lastInsertRowid, userId(req)));
  } catch (error) { next(error); }
});
app.put("/api/jobs/:id", verifyToken, (req, res) => {
  const existing = own("jobs", req.params.id, userId(req));
  if (!existing) return res.status(404).json({ message: "Job not found" });
  const body = req.body || {};
  db.prepare("UPDATE jobs SET title = ?, department = ?, status = ?, applicants = ?, description = ?, requirements = ? WHERE id = ? AND user_id = ?")
    .run(body.title || existing.title, body.department || existing.department, body.status || existing.status, Number(body.applicants ?? existing.applicants), body.description ?? existing.description, body.requirements ?? existing.requirements, req.params.id, userId(req));
  res.json(own("jobs", req.params.id, userId(req)));
});
app.delete("/api/jobs/:id", verifyToken, (req, res) => {
  const result = db.prepare("DELETE FROM jobs WHERE id = ? AND user_id = ?").run(req.params.id, userId(req));
  if (!result.changes) return res.status(404).json({ message: "Job not found" });
  res.json({ success: true });
});

app.get("/api/candidates", verifyToken, (req, res) => res.json(db.prepare("SELECT * FROM candidates WHERE user_id = ? ORDER BY id DESC").all(userId(req))));
app.post("/api/candidates", verifyToken, (req, res) => {
  const { name, email, job_title = "", status = "In Review", score = 0, skills = "" } = req.body || {};
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ message: "Name and email are required" });
  const result = db.prepare("INSERT INTO candidates (name, email, job_title, status, score, skills, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(name.trim(), email.trim(), job_title, status, Number(score) || 0, skills, userId(req));
  res.status(201).json(own("candidates", result.lastInsertRowid, userId(req)));
});
app.put("/api/candidates/:id", verifyToken, (req, res) => {
  const existing = own("candidates", req.params.id, userId(req));
  if (!existing) return res.status(404).json({ message: "Candidate not found" });
  const body = req.body || {};
  db.prepare("UPDATE candidates SET name = ?, email = ?, job_title = ?, status = ?, score = ?, skills = ? WHERE id = ? AND user_id = ?")
    .run(body.name || existing.name, body.email || existing.email, body.job_title ?? existing.job_title, body.status || existing.status, Number(body.score ?? existing.score), body.skills ?? existing.skills, req.params.id, userId(req));
  res.json(own("candidates", req.params.id, userId(req)));
});
app.delete("/api/candidates/:id", verifyToken, (req, res) => {
  const result = db.prepare("DELETE FROM candidates WHERE id = ? AND user_id = ?").run(req.params.id, userId(req));
  if (!result.changes) return res.status(404).json({ message: "Candidate not found" });
  res.json({ success: true });
});

app.get("/api/screenings", verifyToken, (req, res) => res.json(db.prepare("SELECT id, candidate_name name, role_name role, score, status, updated FROM screenings WHERE user_id = ? ORDER BY id DESC").all(userId(req))));
app.get("/api/models", verifyToken, (_req, res) => res.json([
  { id: 1, name: "Resume parsing / extraction", status: "Healthy", detail: "PDF, DOCX, and TXT" },
  { id: 2, name: "AI scoring / analysis", status: process.env.GEMINI_API_KEY ? "Healthy" : "Unavailable", detail: process.env.GEMINI_API_KEY ? "Gemini configured" : "Local analysis active" },
  { id: 3, name: "Skills extraction", status: "Healthy", detail: "Deterministic local extraction" },
]));
app.get("/api/alerts", verifyToken, (_req, res) => res.json(db.prepare("SELECT * FROM alerts ORDER BY id DESC").all()));

app.get("/api/resumes", verifyToken, (req, res) => {
  const rows = db.prepare("SELECT id, candidate_name name, file_name file, original_name, uploaded_at uploaded, status, score FROM resumes WHERE user_id = ? ORDER BY id DESC").all(userId(req));
  res.json(rows);
});
app.post("/api/upload-resume", verifyToken, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const text = await extractText(req.file);
    if (text.trim().length < 20) return res.status(422).json({ message: "The uploaded file does not contain enough readable text" });
    const candidateName = String(req.body.candidateName || "").trim() || "Uploaded Candidate";
    const result = db.prepare("INSERT INTO resumes (candidate_name, file_name, original_name, stored_path, uploaded_at, status, score, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(candidateName, req.file.filename, req.file.originalname, req.file.path, new Date().toISOString(), "Extracted", 0, userId(req));
    const resumeId = result.lastInsertRowid;
    const analysis = await analyzeResume(text, req.body.jobDescription || "General professional role");
    db.prepare("UPDATE resumes SET status = 'Analyzed', score = ? WHERE id = ? AND user_id = ?").run(analysis.score, resumeId, userId(req));
    db.prepare("INSERT INTO extracted_resume_data (resume_id, data_json) VALUES (?, ?)").run(resumeId, JSON.stringify(analysis.extracted));
    db.prepare("INSERT INTO analyses (user_id, resume_id, job_title, job_description, score, ats_score, result_json, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(userId(req), resumeId, req.body.jobTitle || "", req.body.jobDescription || "General professional role", analysis.score, analysis.atsScore, JSON.stringify(analysis), analysis.source);
    audit(userId(req), "upload_resume", req.file.originalname);
    res.status(201).json({ resume: own("resumes", resumeId, userId(req)), analysis: { ...analysis, resumeId } });
  } catch (error) { next(error); }
});
app.get("/api/resumes/:id/download", verifyToken, (req, res) => {
  const resume = own("resumes", req.params.id, userId(req));
  if (!resume || !fs.existsSync(resume.stored_path)) return res.status(404).json({ message: "Resume not found" });
  res.download(resume.stored_path, resume.original_name);
});
app.delete("/api/resumes/:id", verifyToken, (req, res) => {
  const resume = own("resumes", req.params.id, userId(req));
  if (!resume) return res.status(404).json({ message: "Resume not found" });
  if (fs.existsSync(resume.stored_path)) fs.unlinkSync(resume.stored_path);
  db.prepare("DELETE FROM resumes WHERE id = ? AND user_id = ?").run(req.params.id, userId(req));
  res.json({ success: true });
});

app.post("/api/analyze", verifyToken, async (req, res, next) => {
  try {
    if (!req.body?.resumeText?.trim() || !req.body?.jobDescription?.trim()) return res.status(400).json({ message: "resumeText and jobDescription are required" });
    const analysis = await analyzeResume(req.body.resumeText, req.body.jobDescription);
    const result = db.prepare("INSERT INTO analyses (user_id, job_title, job_description, score, ats_score, result_json, source) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(userId(req), req.body.jobTitle || "", req.body.jobDescription, analysis.score, analysis.atsScore, JSON.stringify(analysis), analysis.source);
    audit(userId(req), "analyze_resume");
    res.json({ ...analysis, analysisId: result.lastInsertRowid });
  } catch (error) { next(error); }
});
app.get("/api/analyses", verifyToken, (req, res) => {
  const rows = db.prepare("SELECT a.id, a.resume_id resumeId, a.job_title jobTitle, a.score, a.ats_score atsScore, a.source, a.created_at createdAt, a.result_json result FROM analyses a WHERE a.user_id = ? ORDER BY a.id DESC").all(userId(req));
  res.json(rows.map((row) => ({ ...row, result: JSON.parse(row.result) })));
});
app.get("/api/analyses/:id", verifyToken, (req, res) => {
  const row = db.prepare("SELECT * FROM analyses WHERE id = ? AND user_id = ?").get(req.params.id, userId(req));
  if (!row) return res.status(404).json({ message: "Analysis not found" });
  res.json({ ...row, result: JSON.parse(row.result_json) });
});
app.delete("/api/analyses/:id", verifyToken, (req, res) => {
  const result = db.prepare("DELETE FROM analyses WHERE id = ? AND user_id = ?").run(req.params.id, userId(req));
  if (!result.changes) return res.status(404).json({ message: "Analysis not found" });
  res.json({ success: true });
});

app.post("/api/job-matches", verifyToken, async (req, res, next) => {
  try {
    const resume = own("resumes", req.body?.resumeId, userId(req));
    if (!resume) return res.status(404).json({ message: "Resume not found" });
    const description = String(req.body?.description || "").trim();
    if (!description) return res.status(400).json({ message: "Job description is required" });
    const resumeMime = resume.original_name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : resume.original_name.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";
    const analysis = await analyzeResume(await extractText({ path: resume.stored_path, mimetype: resumeMime }), description);
    const job = db.prepare("INSERT INTO job_descriptions (user_id, title, company, description) VALUES (?, ?, ?, ?)")
      .run(userId(req), req.body.title || "Untitled role", req.body.company || "", description);
    const match = db.prepare("INSERT INTO job_matches (user_id, resume_id, job_description_id, score, result_json) VALUES (?, ?, ?, ?, ?)")
      .run(userId(req), resume.id, job.lastInsertRowid, analysis.score, JSON.stringify(analysis));
    res.status(201).json({ id: match.lastInsertRowid, score: analysis.score, result: analysis });
  } catch (error) { next(error); }
});

app.get("/api/reports", verifyToken, (req, res) => {
  const id = userId(req);
  const rows = db.prepare("SELECT score, ats_score atsScore, created_at createdAt, result_json result FROM analyses WHERE user_id = ? ORDER BY id DESC").all(id);
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0;
  res.json({ cards: [{ label: "Average Resume Score", value: `${average}%`, delta: `${rows.length} analyses` }, { label: "Analyses", value: String(rows.length), delta: "saved" }], analyses: rows.map((row) => ({ ...row, result: JSON.parse(row.result) })) });
});

app.get("/api/admin/overview", verifyToken, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Administrator access required" });
  res.json({
    users: db.prepare("SELECT COUNT(*) count FROM users").get().count,
    resumes: db.prepare("SELECT COUNT(*) count FROM resumes").get().count,
    analyses: db.prepare("SELECT COUNT(*) count FROM analyses").get().count,
    auditLogs: db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50").all(),
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 500).json({ message: error.code === "LIMIT_FILE_SIZE" ? "File exceeds the upload size limit" : error.message || "Internal server error" });
});

app.listen(PORT, () => console.log(`TalentLens backend running on http://localhost:${PORT}`));
