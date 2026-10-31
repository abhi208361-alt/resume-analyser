import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "talentlens.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin'
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    applicants INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    requirements TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'In Review',
    score INTEGER NOT NULL DEFAULT 0,
    skills TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Processing',
    score INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS screenings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT NOT NULL,
    role_name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'In Review',
    updated TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    time TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info'
  );
`);

function seedData() {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
    `).run("Ava Morgan", "admin@talentlens.ai", "admin123", "admin");
  }

  const jobsCount = db.prepare("SELECT COUNT(*) as count FROM jobs").get().count;
  if (jobsCount === 0) {
    db.prepare(`
      INSERT INTO jobs (title, department, status, applicants, description, requirements, created_at)
      VALUES
        ('Senior Frontend Developer', 'Engineering', 'Open', 42, 'Build responsive interfaces and design systems.', 'React, TypeScript, UI systems, performance tuning', '2025-04-12'),
        ('Product Designer', 'Design', 'Reviewing', 38, 'Own product flows and design decision-making.', 'UX research, interaction design, Figma, testing', '2025-04-11'),
        ('Data Analyst', 'Analytics', 'Open', 31, 'Analyze funnel and hiring data at scale.', 'SQL, dashboards, experimentation, Excel', '2025-04-10'),
        ('AI Research Engineer', 'Research', 'Closed', 18, 'Research and validate AI assisted screening pipelines.', 'Python, LLM evaluation, model tuning', '2025-04-09'),
        ('Customer Success Lead', 'Support', 'Open', 24, 'Drive adoption and retention with customer-facing teams.', 'Pipeline management, CS operations, communication', '2025-04-08')
    `).run();
  }

  const candidateCount = db.prepare("SELECT COUNT(*) as count FROM candidates").get().count;
  if (candidateCount === 0) {
    db.prepare(`
      INSERT INTO candidates (name, email, job_title, status, score, skills, created_at)
      VALUES
        ('Samantha Ray', 'samantha.ray@gmail.com', 'Product Designer', 'Strong Match', 92, 'Figma, UX research, design systems', '2025-04-12'),
        ('Noah Kim', 'noah.kim@gmail.com', 'Frontend Engineer', 'Interview', 87, 'React, TypeScript, performance', '2025-04-11'),
        ('Aisha Patel', 'aisha.patel@gmail.com', 'ML Engineer', 'In Review', 81, 'Python, LLMs, data science', '2025-04-09'),
        ('Daniel Smith', 'daniel.smith@gmail.com', 'Data Analyst', 'Rejected', 61, 'SQL, dashboards, stakeholder analysis', '2025-04-08')
    `).run();
  }

  const screeningCount = db.prepare("SELECT COUNT(*) as count FROM screenings").get().count;
  if (screeningCount === 0) {
    db.prepare(`
      INSERT INTO screenings (candidate_name, role_name, score, status, updated)
      VALUES
        ('Eva Gomez', 'Frontend Developer', 95, 'Strong Match', '2h ago'),
        ('Martin Box', 'Product Manager', 83, 'In Review', '3h ago'),
        ('Kira Wong', 'Customer Success', 76, 'Interview', '5h ago'),
        ('Daniel Lee', 'AI Engineer', 68, 'Rejected', 'Yesterday')
    `).run();
  }

  const alertCount = db.prepare("SELECT COUNT(*) as count FROM alerts").get().count;
  if (alertCount === 0) {
    db.prepare(`
      INSERT INTO alerts (title, detail, time, level)
      VALUES
        ('Gemini quota warning', 'AI scoring is approaching the current plan limit.', '18m ago', 'warning'),
        ('Resume parsing delay', 'Two PDFs are pending beyond normal processing time.', '1h ago', 'info'),
        ('Schema mismatch detected', 'One job import is missing required skill metadata.', 'Today', 'critical')
    `).run();
  }
}

seedData();

export { db };