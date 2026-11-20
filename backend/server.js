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
import PDFDocument from "pdfkit";
import { createRequire } from "node:module";
import WordExtractor from "word-extractor";

const require = createRequire(import.meta.url);
const { recognize } = require("tesseract.js");
const wordExtractor = new WordExtractor();

import { db } from "./db.js";
import { analyzeResume, extractResumeData } from "./gemini.js";
import { signToken, verifyToken } from "./auth.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "2mb" }));

const settings = () => db.prepare("SELECT * FROM application_settings WHERE id = 1").get();

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set([
      "application/pdf",
      "application/msword",
      "application/octet-stream",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ]);
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedExtension = new Set([".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"]).has(extension);
    cb(allowed.has(file.mimetype) && allowedExtension ? null : Object.assign(new Error("Unsupported file type"), { status: 400 }), allowed.has(file.mimetype) && allowedExtension);
  },
});

function isAdmin(req) {
  return req.user.role === "admin";
}

function adminOnly(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ message: "Administrator access required" });
  next();
}

function uid(req) {
  return Number(req.user.id);
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username || "",
    displayName: user.display_name || user.name,
    email: user.email,
    role: user.role,
  };
}

function activity(req, type, resourceType = null, resourceId = null, metadata = null) {
  db.prepare(`
    INSERT INTO activity_logs (user_id, activity_type, resource_type, resource_id, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(uid(req), type, resourceType, resourceId, metadata ? JSON.stringify(metadata) : null);
}

function audit(req, action, detail = "", resourceType = null, resourceId = null) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, detail, resource_type, resource_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(uid(req), action, detail, resourceType, resourceId);
}

function pagination(req) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

async function extractText(file) {
  const header = fs.readFileSync(file.path).subarray(0, 8);
  const extension = path.extname(file.originalname).toLowerCase();
  const signatures = {
    ".pdf": header.toString("ascii", 0, 4) === "%PDF",
    ".png": header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ".jpg": header.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    ".jpeg": header.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    ".doc": header.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225])),
    ".docx": header.subarray(0, 2).toString("ascii") === "PK",
  };
  if (extension !== ".txt" && !signatures[extension]) {
    throw Object.assign(new Error("The file content does not match its extension"), { status: 400 });
  }
  if (file.mimetype === "application/pdf") {
    const parsed = await pdfParse(fs.readFileSync(file.path));
    if (String(parsed.text || "").trim().length >= 20) return parsed.text;
  }
  if (extension === ".doc") {
    const document = await wordExtractor.extract(file.path);
    return document.getBody();
  }
  if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return (await mammoth.extractRawText({ path: file.path })).value;
  }
  if (file.mimetype === "text/plain") return fs.readFileSync(file.path, "utf8");
  if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") {
    const result = await recognize(file.path, "eng");
    return result.data.text;
  }
  throw Object.assign(new Error("The file type could not be extracted"), { status: 422 });
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  database: "sqlite",
  ai: Boolean(process.env.GEMINI_API_KEY),
}));

app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.path === "/login" || req.path === "/register") return next();
  if (settings().maintenance_mode && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, "");
      const payload = require("jsonwebtoken").decode(token);
      const user = payload ? db.prepare("SELECT role FROM users WHERE id=?").get(payload.id) : null;
      if (user?.role !== "admin") return res.status(503).json({ message: "The application is in maintenance mode" });
    } catch {
      return res.status(503).json({ message: "The application is in maintenance mode" });
    }
  }
  next();
});

app.post("/api/register", async (req, res, next) => {
  try {
    const config = settings();
    if (!config.registration_enabled) return res.status(403).json({ message: "New registrations are disabled" });
    const { name, email, password } = req.body || {};
    if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(password || "").length < 8) {
      return res.status(400).json({ message: "Name, valid email, and a password of at least 8 characters are required" });
    }
    const normalized = email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email = ?").get(normalized)) {
      return res.status(409).json({ message: "An account with that email already exists" });
    }
    const result = db.prepare("INSERT INTO users (name, email, password, role, active) VALUES (?, ?, ?, 'user', 1)")
      .run(name.trim(), normalized, await bcrypt.hash(password, 12));
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(user.id);
    db.prepare("INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)").run(user.id, user.name);
    const token = signToken(user);
    const payload = require("jsonwebtoken").decode(token);
    db.prepare("INSERT INTO user_sessions (user_id, jti, expires_at) VALUES (?, ?, ?)")
      .run(user.id, payload.jti, new Date(Date.now() + config.session_timeout_minutes * 60000).toISOString());
    db.prepare("INSERT INTO activity_logs (user_id, activity_type) VALUES (?, 'register')").run(user.id);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !user.active || !(await bcrypt.compare(String(req.body?.password || ""), user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = signToken(user);
    const payload = require("jsonwebtoken").decode(token);
    const config = settings();
    db.prepare("INSERT INTO user_sessions (user_id, jti, expires_at) VALUES (?, ?, ?)")
      .run(user.id, payload.jti, new Date(Date.now() + config.session_timeout_minutes * 60000).toISOString());
    db.prepare("INSERT INTO activity_logs (user_id, activity_type) VALUES (?, 'login')").run(user.id);
    db.prepare("INSERT INTO audit_logs (user_id, action) VALUES (?, 'login')").run(user.id);
    res.json({ token, user: safeUser(user) });
  } catch (error) { next(error); }
});

app.post("/api/logout", verifyToken, (req, res) => {
  activity(req, "logout");
  if (req.user.jti) db.prepare("UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE jti = ?").run(req.user.jti);
  res.json({ success: true });
});

app.get("/api/me", verifyToken, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(uid(req));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ ...safeUser(user), phone: user.phone || "", profilePicture: user.profile_picture || "" });
});

app.get("/api/dashboard", verifyToken, (req, res) => {
  const admin = isAdmin(req);
  const id = uid(req);
  const totalResumes = admin
    ? db.prepare("SELECT COUNT(*) count FROM resumes WHERE deleted_at IS NULL").get().count
    : db.prepare("SELECT COUNT(*) count FROM resumes WHERE user_id=? AND deleted_at IS NULL").get(id).count;
  const totalAnalyses = admin
    ? db.prepare("SELECT COUNT(*) count FROM analyses").get().count
    : db.prepare("SELECT COUNT(*) count FROM analyses WHERE user_id=?").get(id).count;
  const avgRow = admin
    ? db.prepare("SELECT COALESCE(ROUND(AVG(score)), 0) score FROM analyses").get()
    : db.prepare("SELECT COALESCE(ROUND(AVG(score)), 0) score FROM analyses WHERE user_id=?").get(id);
  const activeJobs = admin
    ? db.prepare("SELECT COUNT(*) count FROM jobs WHERE deleted_at IS NULL AND status = 'Open'").get().count
    : db.prepare("SELECT COUNT(*) count FROM jobs WHERE deleted_at IS NULL AND status = 'Open'").get().count;
  const recent = admin
    ? db.prepare("SELECT id, candidate_name name, job_title role, score, created_at updated, source FROM (SELECT a.id, COALESCE(r.candidate_name, c.name, 'Candidate') candidate_name, COALESCE(a.job_title, 'General analysis') job_title, a.score, a.created_at, a.source FROM analyses a LEFT JOIN resumes r ON r.id=a.resume_id LEFT JOIN candidates c ON c.id=a.candidate_id ORDER BY a.id DESC LIMIT 8)").all()
    : db.prepare("SELECT a.id, COALESCE(r.candidate_name, c.name, 'Candidate') name, COALESCE(a.job_title, 'General analysis') role, a.score, a.created_at updated, a.source FROM analyses a LEFT JOIN resumes r ON r.id=a.resume_id LEFT JOIN candidates c ON c.id=a.candidate_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 8").all(id);

  res.json({
    metrics: [
      { label: "Total Resumes", value: totalResumes, delta: "persisted" },
      { label: "Analyses", value: totalAnalyses, delta: "persisted" },
      { label: "Average Score", value: avgRow.score, delta: "out of 100" },
      { label: "Active Jobs", value: activeJobs, delta: "database" },
    ],
    screenings: recent.map((row) => ({ id: row.id, name: row.name, role: row.role, score: row.score, status: row.score >= 75 ? "Strong Match" : "In Review", updated: row.updated })),
    applicationsByJob: [],
    pipelineStages: [
      { label: "Analyzed", value: totalAnalyses, color: "#8b5cf6" },
      { label: "Strong Match", value: recent.filter((row) => row.score >= 75).length, color: "#22c55e" },
      { label: "Needs Review", value: recent.filter((row) => row.score < 75).length, color: "#f59e0b" },
    ],
  });
});

app.get("/api/jobs", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = `%${String(req.query.search || "")}%`;
  const status = req.query.status ? String(req.query.status) : null;
  const department = req.query.department ? String(req.query.department) : null;
  const location = req.query.location ? String(req.query.location) : null;
  let sql = "SELECT * FROM jobs WHERE deleted_at IS NULL";
  const params = [];
  if (!isAdmin(req)) {
    sql += " AND status = 'Open'";
  }
  if (search !== "%%") { sql += " AND (title LIKE ? OR description LIKE ? OR required_skills LIKE ?)"; params.push(search, search, search); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  if (department) { sql += " AND department = ?"; params.push(department); }
  if (location) { sql += " AND location LIKE ?"; params.push(`%${location}%`); }
  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
  activity(req, "job_view");
});

app.post("/api/jobs", verifyToken, adminOnly, (req, res, next) => {
  try {
    const b = req.body || {};
    if (!String(b.title || "").trim()) return res.status(400).json({ message: "Job title is required" });
    const result = db.prepare(`
      INSERT INTO jobs (title, company, department, location, employment_type, salary_range, description, required_skills, preferred_skills, min_experience, max_experience, education, application_deadline, status, applicants, created_by, updated, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      b.title.trim(), b.company || "", b.department || "", b.location || "", b.employment_type || "", b.salary_range || "",
      b.description || "", b.required_skills || b.requirements || "", b.preferred_skills || "", Number(b.min_experience || b.minimum_experience || 0),
      b.max_experience == null ? null : Number(b.max_experience), b.education || "", b.application_deadline || "", b.status || "Open",
      Number(b.applicants || 0), uid(req)
    );
    const id = result.lastInsertRowid;
    activity(req, "job_create", "job", id);
    audit(req, "job_create", b.title, "job", id);
    res.status(201).json(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id));
  } catch (error) { next(error); }
});

app.put("/api/jobs/:id", verifyToken, adminOnly, (req, res) => {
  const existing = db.prepare("SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!existing) return res.status(404).json({ message: "Job not found" });
  const b = req.body || {};
  const fields = [
    "title", "company", "department", "location", "employment_type", "salary_range", "description",
    "required_skills", "preferred_skills", "education", "application_deadline", "status"
  ];
  const values = fields.map((field) => b[field] ?? existing[field]);
  db.prepare(`
    UPDATE jobs SET title=?, company=?, department=?, location=?, employment_type=?, salary_range=?, description=?,
    required_skills=?, preferred_skills=?, education=?, application_deadline=?, status=?,
    min_experience=?, max_experience=?, applicants=?, updated=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(...values,
    b.min_experience ?? b.minimum_experience ?? existing.min_experience,
    b.max_experience ?? existing.max_experience,
    Number(b.applicants ?? existing.applicants),
    req.params.id);
  activity(req, "job_update", "job", Number(req.params.id));
  audit(req, "job_update", "", "job", Number(req.params.id));
  res.json(db.prepare("SELECT * FROM jobs WHERE id = ?").get(req.params.id));
});

app.delete("/api/jobs/:id", verifyToken, adminOnly, (req, res) => {
  const result = db.prepare("UPDATE jobs SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").run(req.params.id);
  if (!result.changes) return res.status(404).json({ message: "Job not found" });
  activity(req, "job_delete", "job", Number(req.params.id));
  audit(req, "job_delete", "", "job", Number(req.params.id));
  res.json({ success: true });
});

app.post("/api/jobs/:id/apply", verifyToken, (req, res, next) => {
  try {
    const job = db.prepare("SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL AND status='Open'").get(req.params.id);
    if (!job) return res.status(404).json({ message: "Available job not found" });
    const resumeId = req.body.resumeId ? Number(req.body.resumeId) : null;
    if (resumeId) {
      const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND user_id=? AND deleted_at IS NULL").get(resumeId, uid(req));
      if (!resume) return res.status(404).json({ message: "Resume not found" });
    }
    let candidate = db.prepare("SELECT * FROM candidates WHERE user_id=? AND deleted_at IS NULL").get(uid(req));
    if (!candidate) {
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(uid(req));
      const result = db.prepare(`
        INSERT INTO candidates (name,email,user_id,status,job_id,created_by,created_at)
        VALUES (?, ?, ?, 'New', ?, ?, CURRENT_TIMESTAMP)
      `).run(user.name, user.email, uid(req), job.id, uid(req));
      candidate = db.prepare("SELECT * FROM candidates WHERE id=?").get(result.lastInsertRowid);
    }
    let matchScore = 0;
    if (resumeId) {
      const analysis = db.prepare("SELECT score,result_json FROM analyses WHERE resume_id=? AND user_id=? ORDER BY id DESC LIMIT 1").get(resumeId, uid(req));
      matchScore = analysis?.score || 0;
    }
    db.prepare(`
      INSERT INTO job_applications (job_id,candidate_id,resume_id,user_id,status,match_score,result_json)
      VALUES (?, ?, ?, ?, 'Submitted', ?, ?)
      ON CONFLICT(job_id,user_id) DO UPDATE SET resume_id=excluded.resume_id, updated_at=CURRENT_TIMESTAMP
    `).run(job.id, candidate.id, resumeId, uid(req), matchScore, null);
    db.prepare("UPDATE jobs SET applicants=(SELECT COUNT(*) FROM job_applications WHERE job_id=?) WHERE id=?").run(job.id, job.id);
    activity(req, "job_application", "job", job.id, { resumeId });
    audit(req, "job_application", job.title, "job", job.id);
    res.status(201).json({ success: true, jobId: job.id, matchScore });
  } catch (error) { next(error); }
});

app.get("/api/job-applications", verifyToken, (req, res) => {
  if (isAdmin(req)) {
    return res.json(db.prepare("SELECT ja.*, j.title job_title, u.name applicant_name, u.email applicant_email FROM job_applications ja JOIN jobs j ON j.id=ja.job_id JOIN users u ON u.id=ja.user_id ORDER BY ja.id DESC").all());
  }
  res.json(db.prepare("SELECT ja.*, j.title job_title FROM job_applications ja JOIN jobs j ON j.id=ja.job_id WHERE ja.user_id=? ORDER BY ja.id DESC").all(uid(req)));
});

app.get("/api/candidates", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  const search = `%${String(req.query.search || "")}%`;
  let sql = "SELECT * FROM candidates WHERE deleted_at IS NULL";
  const params = [];
  if (!isAdmin(req)) { sql += " AND user_id = ?"; params.push(uid(req)); }
  if (String(req.query.search || "")) { sql += " AND (name LIKE ? OR email LIKE ? OR technical_skills LIKE ?)"; params.push(search, search, search); }
  if (req.query.status) { sql += " AND status = ?"; params.push(String(req.query.status)); }
  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  res.json(db.prepare(sql).all(...params));
});

app.post("/api/candidates", verifyToken, adminOnly, (req, res, next) => {
  try {
    const b = req.body || {};
    if (!String(b.name || "").trim()) return res.status(400).json({ message: "Candidate name is required" });
    const result = db.prepare(`
      INSERT INTO candidates (name,email,phone,location,education,work_experience,technical_skills,projects,certifications,
        job_title,status,score,ats_score,review_notes,job_id,created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      b.name.trim(), b.email || "", b.phone || "", b.location || "", b.education || "", b.work_experience || "",
      b.technical_skills || b.skills || "", b.projects || "", b.certifications || "", b.job_title || "", b.status || "New",
      Number(b.score || 0), Number(b.ats_score || 0), b.review_notes || "", b.job_id ? Number(b.job_id) : null, uid(req)
    );
    const id = result.lastInsertRowid;
    activity(req, "candidate_create", "candidate", id);
    audit(req, "candidate_create", b.name, "candidate", id);
    res.status(201).json(db.prepare("SELECT * FROM candidates WHERE id=?").get(id));
  } catch (error) { next(error); }
});

app.put("/api/candidates/:id", verifyToken, (req, res) => {
  const candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });
  if (!isAdmin(req) && candidate.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  const b = req.body || {};
  if (!isAdmin(req) && Object.hasOwn(b, "review_notes")) return res.status(403).json({ message: "Internal review notes are restricted" });
  db.prepare(`
    UPDATE candidates SET name=?,email=?,phone=?,location=?,education=?,work_experience=?,technical_skills=?,
      projects=?,certifications=?,job_title=?,status=?,score=?,ats_score=?,review_notes=?,job_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    b.name ?? candidate.name, b.email ?? candidate.email, b.phone ?? candidate.phone, b.location ?? candidate.location,
    b.education ?? candidate.education, b.work_experience ?? candidate.work_experience,
    b.technical_skills ?? b.skills ?? candidate.technical_skills, b.projects ?? candidate.projects,
    b.certifications ?? candidate.certifications, b.job_title ?? candidate.job_title, b.status ?? candidate.status,
    Number(b.score ?? candidate.score), Number(b.ats_score ?? candidate.ats_score),
    b.review_notes ?? candidate.review_notes, b.job_id ?? candidate.job_id, req.params.id
  );
  activity(req, "candidate_update", "candidate", Number(req.params.id));
  res.json(db.prepare("SELECT * FROM candidates WHERE id=?").get(req.params.id));
});

app.delete("/api/candidates/:id", verifyToken, adminOnly, (req, res) => {
  const result = db.prepare("UPDATE candidates SET deleted_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL").run(req.params.id);
  if (!result.changes) return res.status(404).json({ message: "Candidate not found" });
  activity(req, "candidate_delete", "candidate", Number(req.params.id));
  audit(req, "candidate_delete", "", "candidate", Number(req.params.id));
  res.json({ success: true });
});

app.post("/api/candidates/:id/review", verifyToken, adminOnly, (req, res) => {
  const candidate = db.prepare("SELECT * FROM candidates WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!candidate) return res.status(404).json({ message: "Candidate not found" });
  db.prepare("INSERT INTO candidate_reviews (candidate_id,reviewer_id,notes,status) VALUES (?, ?, ?, ?)")
    .run(candidate.id, uid(req), String(req.body.notes || ""), req.body.status || candidate.status);
  if (req.body.status) db.prepare("UPDATE candidates SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.status, candidate.id);
  if (req.body.notes) db.prepare("UPDATE candidates SET review_notes=? WHERE id=?").run(req.body.notes, candidate.id);
  res.status(201).json({ success: true });
});

app.get("/api/resumes", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  const sql = isAdmin(req)
    ? "SELECT * FROM resumes WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?"
    : "SELECT * FROM resumes WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?";
  const rows = isAdmin(req)
    ? db.prepare(sql).all(limit, offset)
    : db.prepare(sql).all(uid(req), limit, offset);
  res.json(rows.map(({ stored_path, file_name, ...resume }) => ({
    ...resume,
    storedFilename: file_name,
  })));
});

async function storeAndAnalyze(req, file, body) {
  const text = await extractText(file);
  if (String(text || "").trim().length < 20) {
    throw Object.assign(new Error("Could not extract enough readable text. For scanned documents, OCR must find at least 20 characters."), { status: 422 });
  }
  const extracted = extractResumeData(text);
  const jobDescription = String(body.jobDescription || body.job_description || "").trim();
  const job = body.jobId ? db.prepare("SELECT * FROM jobs WHERE id=? AND deleted_at IS NULL").get(Number(body.jobId)) : null;
  const effectiveJobDescription = jobDescription || job?.description || "General professional role";
  const analysis = await analyzeResume(text, effectiveJobDescription);

  let candidateId = body.candidateId ? Number(body.candidateId) : null;
  if (!candidateId) {
    const candidateName = String(body.candidateName || extracted.fullName || "").trim();
    if (candidateName) {
      const existing = db.prepare("SELECT id FROM candidates WHERE name=? AND (user_id=? OR created_by=? ) LIMIT 1").get(candidateName, uid(req), uid(req));
      if (existing) candidateId = existing.id;
      else {
        const created = db.prepare(`
          INSERT INTO candidates (name,email,phone,location,education,work_experience,technical_skills,projects,certifications,
            status,score,ats_score,user_id,created_by,job_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?)
        `).run(
          candidateName, extracted.email, extracted.phone, "", extracted.education, extracted.experience,
          Object.values(extracted.skills).flat().join(", "), extracted.projects, extracted.certifications,
          analysis.score, analysis.atsScore, isAdmin(req) ? null : uid(req), uid(req), job?.id || null
        );
        candidateId = created.lastInsertRowid;
      }
    }
  }

  const resumeResult = db.prepare(`
    INSERT INTO resumes (candidate_id,candidate_name,file_name,original_name,file_extension,mime_type,file_size,stored_path,status,analysis_status,extraction_status,score,user_id,uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Analyzed', 'Completed', 'completed', ?, ?, CURRENT_TIMESTAMP)
  `).run(candidateId, String(body.candidateName || extracted.fullName || "Uploaded Candidate"), file.filename, file.originalname,
    path.extname(file.originalname).toLowerCase(), file.mimetype, file.size, file.path, analysis.score, uid(req));
  const resumeId = resumeResult.lastInsertRowid;
  db.prepare("INSERT INTO resume_files (resume_id,stored_path,original_name,mime_type,size_bytes,sha256) VALUES (?, ?, ?, ?, ?, ?)")
    .run(resumeId, file.path, file.originalname, file.mimetype, file.size, crypto.createHash("sha256").update(fs.readFileSync(file.path)).digest("hex"));
  db.prepare("INSERT INTO extracted_resume_data (resume_id,data_json,extraction_status) VALUES (?, ?, 'completed')").run(resumeId, JSON.stringify(extracted));
  for (const [category, values] of Object.entries(extracted.skills)) {
    for (const skill of values) {
      db.prepare("INSERT OR IGNORE INTO resume_skills (resume_id,skill,category) VALUES (?, ?, ?)").run(resumeId, skill, category);
    }
  }
  const analysisResult = db.prepare(`
    INSERT INTO analyses (user_id,resume_id,candidate_id,job_id,job_title,job_description,score,ats_score,skills_score,experience_score,
      education_score,projects_score,formatting_score,keyword_score,result_json,source,status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
  `).run(
    uid(req), resumeId, candidateId, job?.id || null, body.jobTitle || job?.title || "", effectiveJobDescription,
    analysis.score, analysis.atsScore, analysis.skillsScore, analysis.experienceScore, analysis.educationScore,
    analysis.projectsScore, analysis.formattingScore, analysis.keywordScore, JSON.stringify(analysis), analysis.source
  );
  const analysisId = analysisResult.lastInsertRowid;
  if (candidateId) {
    db.prepare("UPDATE candidates SET resume_id=?,score=?,ats_score=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(resumeId, analysis.score, analysis.atsScore, candidateId);
  }
  db.prepare(`
    INSERT INTO screenings (candidate_id,resume_id,analysis_id,job_id,candidate_name,role_name,score,status,performed_by,reviewer_id,updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'In Review', ?, ?, CURRENT_TIMESTAMP)
  `).run(candidateId, resumeId, analysisId, job?.id || null, body.candidateName || extracted.fullName || "Uploaded Candidate",
    body.jobTitle || job?.title || "General analysis", analysis.score, uid(req), isAdmin(req) ? uid(req) : null);
  activity(req, "resume_upload", "resume", resumeId, { originalName: file.originalname });
  activity(req, "resume_analysis", "analysis", analysisId, { source: analysis.source });
  audit(req, "resume_analysis", file.originalname, "analysis", analysisId);
  return { resumeId, analysisId, candidateId, analysis };
}

app.post("/api/upload-resume", verifyToken, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const stored = await storeAndAnalyze(req, req.file, req.body || {});
    res.status(201).json({
      resume: db.prepare("SELECT * FROM resumes WHERE id=?").get(stored.resumeId),
      analysis: { ...stored.analysis, resumeId: stored.resumeId, analysisId: stored.analysisId },
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
});

app.post("/api/resumes/upload", verifyToken, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const stored = await storeAndAnalyze(req, req.file, req.body || {});
    res.status(201).json({
      resume: db.prepare("SELECT id,user_id,original_name,file_name,file_extension,mime_type,file_size,status,analysis_status,extraction_status,uploaded_at FROM resumes WHERE id=?").get(stored.resumeId),
      analysis: { ...stored.analysis, resumeId: stored.resumeId, analysisId: stored.analysisId },
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(error);
  }
});

app.post("/api/resumes/upload-text", verifyToken, async (req, res, next) => {
  const text = String(req.body?.text || req.body?.resumeText || "").trim();
  if (text.length < 20) return res.status(400).json({ message: "Resume text must contain at least 20 characters" });
  const filePath = path.join(uploadsDir, `${crypto.randomUUID()}.txt`);
  const file = { path: filePath, filename: path.basename(filePath), originalname: "pasted-resume.txt", mimetype: "text/plain", size: Buffer.byteLength(text, "utf8") };
  try {
    fs.writeFileSync(filePath, text, "utf8");
    const stored = await storeAndAnalyze(req, file, req.body || {});
    res.status(201).json({
      resume: db.prepare("SELECT id,user_id,original_name,file_name,file_extension,mime_type,file_size,status,analysis_status,extraction_status,uploaded_at FROM resumes WHERE id=?").get(stored.resumeId),
      analysis: { ...stored.analysis, resumeId: stored.resumeId, analysisId: stored.analysisId },
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    next(error);
  }
});

app.get("/api/resumes/:id", verifyToken, (req, res) => {
  const resume = db.prepare(`
    SELECT id,user_id,candidate_id,candidate_name,original_name,file_extension,mime_type,file_size,status,analysis_status,extraction_status,uploaded_at
    FROM resumes WHERE id=? AND deleted_at IS NULL
  `).get(req.params.id);
  if (!resume) return res.status(404).json({ message: "Resume not found" });
  if (!isAdmin(req) && resume.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  res.json(resume);
});

app.post("/api/resumes/upload-multiple", verifyToken, upload.array("files", 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: "No files uploaded" });
    const results = [];
    for (const file of req.files) {
      try {
        results.push({ file: file.originalname, ...await storeAndAnalyze(req, file, req.body || {}) });
      } catch (error) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        results.push({ file: file.originalname, error: error.message, status: "Failed" });
      }
    }
    res.status(207).json(results);
  } catch (error) { next(error); }
});

app.get("/api/resumes/:id/download", verifyToken, (req, res) => {
  const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!resume) return res.status(404).json({ message: "Resume not found" });
  if (!isAdmin(req) && resume.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  if (!fs.existsSync(resume.stored_path)) return res.status(404).json({ message: "Stored resume is missing" });
  activity(req, "resume_download", "resume", resume.id, { originalName: resume.original_name });
  res.download(resume.stored_path, resume.original_name);
});

app.delete("/api/resumes/:id", verifyToken, (req, res) => {
  const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND deleted_at IS NULL").get(req.params.id);
  if (!resume) return res.status(404).json({ message: "Resume not found" });
  if (!isAdmin(req) && resume.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  db.prepare("UPDATE resumes SET deleted_at=CURRENT_TIMESTAMP WHERE id=?").run(resume.id);
  activity(req, "resume_delete", "resume", resume.id);
  audit(req, "resume_delete", resume.original_name, "resume", resume.id);
  res.json({ success: true });
});

app.post("/api/analyze", verifyToken, async (req, res, next) => {
  try {
    const resumeText = String(req.body?.resumeText || "").trim();
    const jobDescription = String(req.body?.jobDescription || "").trim();
    if (resumeText.length < 20) return res.status(400).json({ message: "Resume text must contain at least 20 characters" });
    if (!jobDescription) return res.status(400).json({ message: "Job description is required" });
    const analysis = await analyzeResume(resumeText, jobDescription);
    const result = db.prepare(`
      INSERT INTO analyses (user_id,job_id,job_title,job_description,score,ats_score,skills_score,experience_score,
        education_score,projects_score,formatting_score,keyword_score,result_json,source,status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed')
    `).run(
      uid(req), req.body.jobId ? Number(req.body.jobId) : null, req.body.jobTitle || "",
      jobDescription, analysis.score, analysis.atsScore, analysis.skillsScore, analysis.experienceScore,
      analysis.educationScore, analysis.projectsScore, analysis.formattingScore, analysis.keywordScore,
      JSON.stringify(analysis), analysis.source
    );
    activity(req, "resume_analysis", "analysis", result.lastInsertRowid, { source: analysis.source, pastedText: true });
    audit(req, "resume_analysis", "Pasted resume text", "analysis", result.lastInsertRowid);
    res.status(201).json({ ...analysis, analysisId: result.lastInsertRowid });
  } catch (error) { next(error); }
});

app.get("/api/analyses", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  const sql = isAdmin(req)
    ? "SELECT a.*,r.original_name resume_name,c.name candidate_name FROM analyses a LEFT JOIN resumes r ON r.id=a.resume_id LEFT JOIN candidates c ON c.id=a.candidate_id ORDER BY a.id DESC LIMIT ? OFFSET ?"
    : "SELECT a.*,r.original_name resume_name,c.name candidate_name FROM analyses a LEFT JOIN resumes r ON r.id=a.resume_id LEFT JOIN candidates c ON c.id=a.candidate_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT ? OFFSET ?";
  const rows = isAdmin(req)
    ? db.prepare(sql).all(limit, offset)
    : db.prepare(sql).all(uid(req), limit, offset);
  res.json(rows.map((row) => ({ ...row, result: parseJson(row.result_json) })));
});

app.get("/api/analyses/:id", verifyToken, (req, res) => {
  const row = db.prepare("SELECT * FROM analyses WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ message: "Analysis not found" });
  if (!isAdmin(req) && row.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  res.json({ ...row, result: parseJson(row.result_json) });
});

app.delete("/api/analyses/:id", verifyToken, (req, res) => {
  const row = db.prepare("SELECT * FROM analyses WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ message: "Analysis not found" });
  if (!isAdmin(req) && row.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  db.prepare("DELETE FROM analyses WHERE id=?").run(req.params.id);
  activity(req, "analysis_delete", "analysis", Number(req.params.id));
  res.json({ success: true });
});

app.get("/api/screenings", verifyToken, (req, res) => {
  const { limit, offset } = pagination(req);
  const sql = isAdmin(req)
    ? `SELECT s.*,u.name performed_by_name FROM screenings s LEFT JOIN users u ON u.id=s.performed_by
       ORDER BY s.id DESC LIMIT ? OFFSET ?`
    : `SELECT s.*,u.name performed_by_name FROM screenings s LEFT JOIN users u ON u.id=s.performed_by
       WHERE s.performed_by=? OR s.candidate_id IN (SELECT id FROM candidates WHERE user_id=?)
       ORDER BY s.id DESC LIMIT ? OFFSET ?`;
  const rows = isAdmin(req)
    ? db.prepare(sql).all(limit, offset)
    : db.prepare(sql).all(uid(req), uid(req), limit, offset);
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.candidate_name || "Candidate",
    role: row.role_name || "General",
    score: row.score,
    status: row.status,
    updated: row.updated || row.created_at,
    analysisId: row.analysis_id,
    resumeId: row.resume_id,
    candidateId: row.candidate_id,
    performedBy: row.performed_by_name || "",
  })));
});

app.put("/api/screenings/:id", verifyToken, (req, res) => {
  const screening = db.prepare("SELECT * FROM screenings WHERE id=?").get(req.params.id);
  if (!screening) return res.status(404).json({ message: "Screening not found" });
  if (!isAdmin(req) && screening.performed_by !== uid(req)) return res.status(403).json({ message: "Access denied" });
  db.prepare("UPDATE screenings SET status=?,notes=?,reviewer_id=?,updated=CURRENT_TIMESTAMP WHERE id=?")
    .run(req.body.status || screening.status, req.body.notes ?? screening.notes, isAdmin(req) ? uid(req) : screening.reviewer_id, screening.id);
  if (req.body.note) db.prepare("INSERT INTO screening_notes (screening_id,reviewer_id,note) VALUES (?, ?, ?)").run(screening.id, uid(req), req.body.note);
  activity(req, "screening_update", "screening", screening.id);
  res.json(db.prepare("SELECT * FROM screenings WHERE id=?").get(screening.id));
});

app.get("/api/screenings/:id/notes", verifyToken, (req, res) => {
  const screening = db.prepare("SELECT * FROM screenings WHERE id=?").get(req.params.id);
  if (!screening) return res.status(404).json({ message: "Screening not found" });
  if (!isAdmin(req) && screening.performed_by !== uid(req)) return res.status(403).json({ message: "Access denied" });
  res.json(db.prepare("SELECT * FROM screening_notes WHERE screening_id=? ORDER BY id DESC").all(screening.id));
});

app.post("/api/screenings/:id/notes", verifyToken, (req, res) => {
  const screening = db.prepare("SELECT * FROM screenings WHERE id=?").get(req.params.id);
  if (!screening) return res.status(404).json({ message: "Screening not found" });
  if (!isAdmin(req) && screening.performed_by !== uid(req)) return res.status(403).json({ message: "Access denied" });
  if (!String(req.body.note || "").trim()) return res.status(400).json({ message: "Note is required" });
  const result = db.prepare("INSERT INTO screening_notes (screening_id,reviewer_id,note) VALUES (?, ?, ?)").run(screening.id, uid(req), req.body.note.trim());
  activity(req, "screening_note", "screening", screening.id);
  res.status(201).json(db.prepare("SELECT * FROM screening_notes WHERE id=?").get(result.lastInsertRowid));
});

app.get("/api/reports", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  let sql = "SELECT r.*, c.name candidate_name, a.score, a.ats_score, j.title job_title FROM reports r LEFT JOIN candidates c ON c.id=r.candidate_id LEFT JOIN analyses a ON a.id=r.analysis_id LEFT JOIN jobs j ON j.id=r.job_id";
  const params = [];
  if (!isAdmin(req)) { sql += " WHERE r.generated_by=?"; params.push(uid(req)); }
  sql += " ORDER BY r.id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  res.json({
    cards: [
      { label: "Total reports", value: rows.length, delta: "database" },
      { label: "Candidate reports", value: rows.filter((row) => row.report_type === "candidate").length, delta: "saved" },
      { label: "Analysis reports", value: rows.filter((row) => row.report_type === "analysis").length, delta: "saved" },
      { label: "Job matching reports", value: rows.filter((row) => row.report_type === "job_match").length, delta: "saved" },
    ],
    rows,
  });
});

app.post("/api/reports/generate", verifyToken, (req, res) => {
  const analysisId = req.body.analysisId ? Number(req.body.analysisId) : null;
  const candidateId = req.body.candidateId ? Number(req.body.candidateId) : null;
  if (!analysisId && !candidateId) return res.status(400).json({ message: "analysisId or candidateId is required" });
  const analysis = analysisId ? db.prepare("SELECT * FROM analyses WHERE id=?").get(analysisId) : null;
  if (analysis && !isAdmin(req) && analysis.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  const candidate = candidateId ? db.prepare("SELECT * FROM candidates WHERE id=? AND deleted_at IS NULL").get(candidateId) : null;
  if (candidate && !isAdmin(req) && candidate.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  const reportType = req.body.reportType || "analysis";
  const fileName = `talentlens-${reportType}-${analysisId || candidateId || Date.now()}.pdf`;
  const storedPath = path.join(uploadsDir, fileName);
  const result = db.prepare(`
    INSERT INTO reports (candidate_id,analysis_id,job_id,report_type,file_name,stored_path,generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(candidate?.id || analysis?.candidate_id || null, analysis?.id || null, analysis?.job_id || null, reportType, fileName, storedPath, uid(req));
  activity(req, "report_generation", "report", result.lastInsertRowid);
  res.status(201).json(db.prepare("SELECT * FROM reports WHERE id=?").get(result.lastInsertRowid));
});

app.get("/api/reports/:id/pdf", verifyToken, (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id=?").get(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found" });
  if (!isAdmin(req) && report.generated_by !== uid(req)) return res.status(403).json({ message: "Access denied" });
  const candidate = report.candidate_id ? db.prepare("SELECT * FROM candidates WHERE id=?").get(report.candidate_id) : null;
  const analysis = report.analysis_id ? db.prepare("SELECT * FROM analyses WHERE id=?").get(report.analysis_id) : null;
  const resume = analysis?.resume_id ? db.prepare("SELECT * FROM resumes WHERE id=?").get(analysis.resume_id) : null;
  const result = analysis ? parseJson(analysis.result_json) : {};

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${report.file_name}"`);
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(20).text("TalentLens Candidate Analysis Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(11).text(`Candidate: ${candidate?.name || "Not specified"}`);
  doc.text(`Email: ${candidate?.email || "Not specified"}`);
  doc.text(`Original resume: ${resume?.original_name || "Not specified"}`);
  doc.text(`Analysis date: ${analysis?.created_at || new Date().toISOString()}`);
  doc.text(`Overall score: ${analysis?.score ?? "N/A"} / 100`);
  doc.text(`ATS compatibility: ${analysis?.ats_score ?? "N/A"} / 100`);
  doc.moveDown();
  const sections = [
    ["Skills evaluation", result.skillsEvaluation],
    ["Education evaluation", result.educationEvaluation],
    ["Experience evaluation", result.extracted?.experience || result.experienceGaps?.join("; ")],
    ["Project evaluation", result.projectEvaluation],
    ["Strengths", result.strengths?.join("; ")],
    ["Weaknesses", result.weaknesses?.join("; ")],
    ["Missing skills", result.missingSkills?.join(", ")],
    ["Missing keywords", result.missingKeywords?.join(", ")],
    ["Recommendations", result.suggestions?.join("; ")],
  ];
  for (const [title, value] of sections) {
    doc.addPage();
    doc.fontSize(15).text(title);
    doc.moveDown(0.5);
    doc.fontSize(11).text(String(value || "Not detected"));
  }
  if (candidate?.review_notes) {
    doc.addPage();
    doc.fontSize(15).text("Administrator review notes");
    doc.moveDown(0.5);
    doc.fontSize(11).text(candidate.review_notes);
  }
  doc.end();
  activity(req, "report_download", "report", report.id);
});

app.get("/api/reports/resume/:resumeId", verifyToken, (req, res) => {
  const resume = db.prepare("SELECT * FROM resumes WHERE id=? AND deleted_at IS NULL").get(req.params.resumeId);
  if (!resume) return res.status(404).json({ message: "Resume not found" });
  if (!isAdmin(req) && resume.user_id !== uid(req)) return res.status(403).json({ message: "Access denied" });
  if (!fs.existsSync(resume.stored_path)) return res.status(404).json({ message: "Stored resume is missing" });
  activity(req, "resume_download", "resume", resume.id);
  res.download(resume.stored_path, resume.original_name);
});

app.delete("/api/reports/:id", verifyToken, (req, res) => {
  const report = db.prepare("SELECT * FROM reports WHERE id=?").get(req.params.id);
  if (!report) return res.status(404).json({ message: "Report not found" });
  if (!isAdmin(req) && report.generated_by !== uid(req)) return res.status(403).json({ message: "Access denied" });
  if (report.stored_path && fs.existsSync(report.stored_path)) fs.unlinkSync(report.stored_path);
  db.prepare("DELETE FROM reports WHERE id=?").run(report.id);
  activity(req, "report_delete", "report", report.id);
  res.json({ success: true });
});

app.get("/api/history", verifyToken, (req, res) => {
  const { page, limit, offset } = pagination(req);
  const sql = isAdmin(req)
    ? "SELECT * FROM activity_logs ORDER BY id DESC LIMIT ? OFFSET ?"
    : "SELECT * FROM activity_logs WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?";
  const rows = isAdmin(req)
    ? db.prepare(sql).all(limit, offset)
    : db.prepare(sql).all(uid(req), limit, offset);
  res.json(rows.map((row) => ({ ...row, metadata: parseJson(row.metadata) })));
});

app.get("/api/activity", verifyToken, (req, res) => {
  const { limit, offset } = pagination(req);
  const sql = isAdmin(req)
    ? "SELECT a.*,u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?"
    : "SELECT a.*,u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT ? OFFSET ?";
  const rows = isAdmin(req)
    ? db.prepare(sql).all(limit, offset)
    : db.prepare(sql).all(uid(req), limit, offset);
  res.json(rows);
});

app.get("/api/settings", verifyToken, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(uid(req));
  const profile = db.prepare("SELECT * FROM user_profiles WHERE user_id=?").get(uid(req));
  const preferences = db.prepare("SELECT * FROM user_settings WHERE user_id=?").get(uid(req));
  res.json({
    profile: {
      name: user.name,
      username: user.username || "",
      displayName: profile?.display_name || user.display_name || user.name,
      email: user.email,
      phone: profile?.phone || user.phone || "",
      profilePicture: profile?.profile_picture || user.profile_picture || "",
    },
    appearance: {
      theme: preferences?.theme || "system",
      sidebar: parseJson(preferences?.sidebar_preferences),
      dashboard: parseJson(preferences?.dashboard_preferences),
    },
    application: isAdmin(req) ? settings() : null,
  });
});

app.put("/api/settings/profile", verifyToken, (req, res) => {
  const b = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(uid(req));
  const username = String(b.username || user.username || "").trim();
  if (!username || !/^[a-zA-Z0-9._-]{3,40}$/.test(username)) {
    return res.status(400).json({ message: "Username must be 3-40 characters and contain only letters, numbers, dots, underscores, or hyphens" });
  }
  const usernameConflict = db.prepare("SELECT id FROM users WHERE username=? AND id<>?").get(username, uid(req));
  if (usernameConflict) return res.status(409).json({ message: "Username is already in use" });
  const email = String(b.email || user.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "A valid email is required" });
  if (email !== user.email) return res.status(400).json({ message: "Use the email change endpoint with your current password" });
  const conflict = db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, uid(req));
  if (conflict) return res.status(409).json({ message: "Email is already in use" });
  db.prepare("UPDATE users SET name=?,username=?,display_name=?,email=?,phone=?,profile_picture=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(String(b.name || b.displayName || user.name).trim(), username, b.displayName || user.display_name || user.name, email,
      b.phone || "", b.profilePicture || "", uid(req));
  db.prepare(`
    INSERT INTO user_profiles (user_id,display_name,phone,profile_picture)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,phone=excluded.phone,
      profile_picture=excluded.profile_picture,updated_at=CURRENT_TIMESTAMP
  `).run(uid(req), b.displayName || b.name || user.name, b.phone || "", b.profilePicture || "");
  activity(req, "profile_update");
  audit(req, "profile_update");
  const updated = db.prepare("SELECT * FROM users WHERE id=?").get(uid(req));
  res.json({ success: true, profile: { ...safeUser(updated), phone: updated.phone || "", profilePicture: updated.profile_picture || "" } });
});

app.put("/api/settings/email", verifyToken, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "A valid email is required" });
    const user = db.prepare("SELECT password,email FROM users WHERE id=?").get(uid(req));
    if (!(await bcrypt.compare(String(req.body?.currentPassword || ""), user.password))) {
      return res.status(401).json({ message: "Current password is required to change email" });
    }
    if (db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, uid(req))) {
      return res.status(409).json({ message: "Email is already in use" });
    }
    db.prepare("UPDATE users SET email=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(email, uid(req));
    audit(req, "email_update");
    res.json({ success: true, email });
  } catch (error) { next(error); }
});

app.put("/api/settings/appearance", verifyToken, (req, res) => {
  const theme = ["light", "dark", "system"].includes(req.body.theme) ? req.body.theme : "system";
  db.prepare(`
    INSERT INTO user_settings (user_id,theme,sidebar_preferences,dashboard_preferences)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,
      sidebar_preferences=excluded.sidebar_preferences,dashboard_preferences=excluded.dashboard_preferences,
      updated_at=CURRENT_TIMESTAMP
  `).run(uid(req), theme, JSON.stringify(req.body.sidebar || {}), JSON.stringify(req.body.dashboard || {}));
  activity(req, "settings_change", null, null, { category: "appearance" });
  res.json({ success: true, theme });
});

app.get("/api/settings/preferences", verifyToken, (req, res) => {
  const preferences = db.prepare("SELECT * FROM user_settings WHERE user_id=?").get(uid(req));
  res.json({
    theme: preferences?.theme || "system",
    sidebar: parseJson(preferences?.sidebar_preferences),
    dashboard: parseJson(preferences?.dashboard_preferences),
  });
});

app.put("/api/settings/preferences", verifyToken, (req, res) => {
  const theme = ["light", "dark", "system"].includes(req.body?.theme) ? req.body.theme : "system";
  db.prepare(`
    INSERT INTO user_settings (user_id,theme,sidebar_preferences,dashboard_preferences)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,
      sidebar_preferences=excluded.sidebar_preferences,dashboard_preferences=excluded.dashboard_preferences,
      updated_at=CURRENT_TIMESTAMP
  `).run(uid(req), theme, JSON.stringify(req.body?.sidebar || {}), JSON.stringify(req.body?.dashboard || {}));
  res.json({ success: true, theme });
});

app.put("/api/settings/password", verifyToken, async (req, res, next) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(uid(req));
    if (!(await bcrypt.compare(String(req.body.currentPassword || ""), user.password))) return res.status(401).json({ message: "Current password is incorrect" });
    const password = String(req.body.newPassword || "");
    if (password.length < 8) return res.status(400).json({ message: "New password must be at least 8 characters" });
    if (password !== String(req.body.confirmPassword || "")) return res.status(400).json({ message: "Password confirmation does not match" });
    db.prepare("UPDATE users SET password=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(await bcrypt.hash(password, 12), uid(req));
    db.prepare("UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND jti<>?").run(uid(req), req.user.jti || "");
    activity(req, "password_change");
    audit(req, "password_change");
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.post("/api/settings/logout-other-sessions", verifyToken, (req, res) => {
  db.prepare("UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND jti<>?")
    .run(uid(req), req.user.jti || "");
  activity(req, "logout_other_sessions");
  res.json({ success: true });
});

app.put("/api/settings/application", verifyToken, adminOnly, (req, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE application_settings SET application_name=?,organization_name=?,max_upload_bytes=?,
      allowed_file_types=?,notification_settings=?,analysis_thresholds=?,registration_enabled=?,
      session_timeout_minutes=?,maintenance_mode=?,updated_at=CURRENT_TIMESTAMP WHERE id=1
  `).run(
    String(b.application_name || "TalentLens"),
    b.organization_name || "",
    Math.max(1024, Math.min(100 * 1024 * 1024, Number(b.max_upload_bytes || 10485760))),
    String(b.allowed_file_types || settings().allowed_file_types),
    JSON.stringify(b.notification_settings || {}),
    JSON.stringify(b.analysis_thresholds || {}),
    b.registration_enabled ? 1 : 0,
    Math.max(5, Math.min(10080, Number(b.session_timeout_minutes || 720))),
    b.maintenance_mode ? 1 : 0
  );
  activity(req, "application_settings_change");
  audit(req, "application_settings_change");
  res.json(settings());
});

app.get("/api/users", verifyToken, adminOnly, (req, res) => {
  const rows = db.prepare("SELECT id,name,email,role,active,display_name,phone,created_at,updated_at FROM users ORDER BY id DESC").all();
  res.json(rows);
});

app.get("/api/users/:id", verifyToken, adminOnly, (req, res) => {
  const user = db.prepare("SELECT id,name,username,email,role,active,display_name,phone,profile_picture,created_at,updated_at FROM users WHERE id=?").get(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

app.post("/api/users", verifyToken, adminOnly, async (req, res, next) => {
  try {
    const { name, email, password, role = "user" } = req.body || {};
    if (!name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || String(password || "").length < 8) {
      return res.status(400).json({ message: "Name, valid email, and password are required" });
    }
    if (!["admin", "user"].includes(role)) return res.status(400).json({ message: "Invalid role" });
    const normalized = email.trim().toLowerCase();
    if (db.prepare("SELECT id FROM users WHERE email=?").get(normalized)) return res.status(409).json({ message: "Email already exists" });
    const result = db.prepare("INSERT INTO users (name,email,password,role,active) VALUES (?, ?, ?, ?, 1)")
      .run(name.trim(), normalized, await bcrypt.hash(password, 12), role);
    db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(result.lastInsertRowid);
    db.prepare("INSERT INTO user_profiles (user_id,display_name) VALUES (?, ?)").run(result.lastInsertRowid, name.trim());
    audit(req, "user_create", name, "user", result.lastInsertRowid);
    res.status(201).json(db.prepare("SELECT id,name,email,role,active,created_at FROM users WHERE id=?").get(result.lastInsertRowid));
  } catch (error) { next(error); }
});

app.put("/api/users/:id", verifyToken, adminOnly, (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target.role === "admin" && req.body.role && req.body.role !== "admin" && target.id !== uid(req)) {
    return res.status(403).json({ message: "Another administrator account cannot be demoted" });
  }
  const role = ["admin", "user"].includes(req.body.role) ? req.body.role : target.role;
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : target.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "A valid email is required" });
  if (db.prepare("SELECT id FROM users WHERE email=? AND id<>?").get(email, target.id)) return res.status(409).json({ message: "Email already exists" });
  db.prepare("UPDATE users SET name=?,email=?,role=?,active=?,display_name=?,phone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(
      req.body.name || target.name,
      email,
      role,
      req.body.active == null ? target.active : (req.body.active ? 1 : 0),
      req.body.displayName ?? target.display_name ?? target.name,
      req.body.phone ?? target.phone ?? "",
      target.id
    );
  audit(req, "user_update", target.email, "user", target.id);
  res.json(db.prepare("SELECT id,name,email,role,active,display_name,phone,created_at,updated_at FROM users WHERE id=?").get(target.id));
});

app.post("/api/users/:id/password-reset", verifyToken, adminOnly, async (req, res, next) => {
  try {
    const target = db.prepare("SELECT id,email FROM users WHERE id=?").get(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    const temporaryPassword = String(req.body?.temporaryPassword || "");
    if (temporaryPassword.length < 8) return res.status(400).json({ message: "A temporary password of at least 8 characters is required" });
    db.prepare("UPDATE users SET password=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(await bcrypt.hash(temporaryPassword, 12), target.id);
    db.prepare("UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?").run(target.id);
    audit(req, "user_password_reset", target.email, "user", target.id);
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.post("/api/users/:id/deactivate", verifyToken, adminOnly, (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target.id === uid(req)) return res.status(400).json({ message: "You cannot deactivate your own account" });
  db.prepare("UPDATE users SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(target.id);
  db.prepare("UPDATE user_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=?").run(target.id);
  audit(req, "user_deactivate", target.email, "user", target.id);
  res.json({ success: true });
});

app.get("/api/admin/overview", verifyToken, adminOnly, (req, res) => {
  res.json({
    users: db.prepare("SELECT COUNT(*) count FROM users").get().count,
    resumes: db.prepare("SELECT COUNT(*) count FROM resumes WHERE deleted_at IS NULL").get().count,
    analyses: db.prepare("SELECT COUNT(*) count FROM analyses").get().count,
    candidates: db.prepare("SELECT COUNT(*) count FROM candidates WHERE deleted_at IS NULL").get().count,
    jobs: db.prepare("SELECT COUNT(*) count FROM jobs WHERE deleted_at IS NULL").get().count,
    auditLogs: db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100").all(),
  });
});

app.get("/api/models", verifyToken, (_req, res) => res.json([
  { id: 1, name: "Resume parsing / extraction", status: "Healthy", detail: "PDF, DOCX, TXT, PNG, and JPG" },
  { id: 2, name: "AI scoring / analysis", status: process.env.GEMINI_API_KEY ? "Healthy" : "Degraded", detail: process.env.GEMINI_API_KEY ? "Gemini configured" : "Local deterministic analysis active" },
  { id: 3, name: "OCR", status: "Healthy", detail: "Tesseract image OCR" },
]));

app.get("/api/alerts", verifyToken, (req, res) => {
  if (isAdmin(req)) {
    return res.json(db.prepare("SELECT * FROM notifications ORDER BY id DESC").all());
  }
  res.json(db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC").all(uid(req)));
});

app.get("/api/reports/export/csv", verifyToken, (req, res) => {
  const rows = isAdmin(req)
    ? db.prepare("SELECT c.name,c.email,c.phone,c.status,c.score,c.ats_score,c.created_at FROM candidates c WHERE c.deleted_at IS NULL").all()
    : db.prepare("SELECT c.name,c.email,c.phone,c.status,c.score,c.ats_score,c.created_at FROM candidates c WHERE c.user_id=? AND c.deleted_at IS NULL").all(uid(req));
  const headers = rows.length ? Object.keys(rows[0]) : ["name", "email", "phone", "status", "score", "ats_score", "created_at"];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="talentlens-candidates.csv"');
  activity(req, "report_export", null, null, { format: "csv" });
  res.send(csv);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  const message = error.code === "LIMIT_FILE_SIZE"
    ? "File exceeds the configured upload size limit"
    : error.message || "Internal server error";
  res.status(status).json({ message });
});

app.listen(PORT, () => console.log(`TalentLens backend running on http://localhost:${PORT}`));
