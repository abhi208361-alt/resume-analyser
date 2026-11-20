import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "talentlens.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    applicants INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    requirements TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'In Review',
    score INTEGER NOT NULL DEFAULT 0,
    skills TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Processing',
    score INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS screenings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_name TEXT NOT NULL,
    role_name TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'In Review',
    updated TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    time TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info'
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
    job_title TEXT,
    job_description TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
    ats_score INTEGER NOT NULL CHECK(ats_score BETWEEN 0 AND 100),
    result_json TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS extracted_resume_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL UNIQUE REFERENCES resumes(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    job_description_id INTEGER NOT NULL REFERENCES job_descriptions(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const jobForeignKeys = db.prepare("PRAGMA foreign_key_list(jobs)").all();
if (jobForeignKeys.some((item) => item.from !== "user_id")) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE jobs_repaired (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      applicants INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      requirements TEXT,
      created_at TEXT,
      updated TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO jobs_repaired (id, title, department, status, applicants, description, requirements, created_at, updated, user_id)
      SELECT id, title, department, status, applicants, description, requirements, created_at, updated, user_id FROM jobs;
    DROP TABLE jobs;
    ALTER TABLE jobs_repaired RENAME TO jobs;
    PRAGMA foreign_keys = ON;
  `);
}

for (const [table, column] of [
  ["users", "created_at", "TEXT"],
  ["jobs", "description", "TEXT"],
  ["jobs", "requirements", "TEXT"],
  ["jobs", "created_at", "TEXT"],
  ["jobs", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE"],
  ["candidates", "user_id"],
  ["resumes", "user_id"],
  ["screenings", "user_id"],
]) {
  addColumnIfMissing(table, column, column === "user_id" ? "INTEGER REFERENCES users(id) ON DELETE CASCADE" : "TEXT");
}

function seedData() {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  if (userCount === 0) {
    db.prepare(`
      INSERT INTO users (name, email, password, role)
      VALUES (?, ?, ?, ?)
    `).run("Ava Morgan", "admin@talentlens.ai", bcrypt.hashSync("admin123", 12), "admin");
  }

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@talentlens.ai");
  const usersToMigrate = db.prepare("SELECT id, password FROM users").all();
  for (const user of usersToMigrate) {
    if (!String(user.password).startsWith("$2")) {
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(bcrypt.hashSync(user.password, 12), user.id);
    }
  }
  if (admin) {
    for (const table of ["jobs", "candidates", "resumes", "screenings"]) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(admin.id);
    }
  }

  const jobsCount = db.prepare("SELECT COUNT(*) as count FROM jobs WHERE user_id = ?").get(admin?.id || 0).count;
  if (jobsCount === 0) {
    const insertJob = db.prepare(`
      INSERT INTO jobs (title, department, status, applicants, description, requirements, created_at, updated, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      ["Senior Frontend Developer", "Engineering", "Open", 42, "Build responsive interfaces and design systems.", "React, TypeScript, UI systems, performance tuning", "2025-04-12"],
      ["Product Designer", "Design", "Reviewing", 38, "Own product flows and design decision-making.", "UX research, interaction design, Figma, testing", "2025-04-11"],
      ["Data Analyst", "Analytics", "Open", 31, "Analyze funnel and hiring data at scale.", "SQL, dashboards, experimentation, Excel", "2025-04-10"],
      ["AI Research Engineer", "Research", "Closed", 18, "Research and validate AI assisted screening pipelines.", "Python, LLM evaluation, model tuning", "2025-04-09"],
      ["Customer Success Lead", "Support", "Open", 24, "Drive adoption and retention with customer-facing teams.", "Pipeline management, CS operations, communication", "2025-04-08"],
    ].forEach((job) => insertJob.run(...job, job[6], admin?.id || 0));
  }

  const candidateCount = db.prepare("SELECT COUNT(*) as count FROM candidates WHERE user_id = ?").get(admin?.id || 0).count;
  if (candidateCount === 0) {
    const insertCandidate = db.prepare(`
      INSERT INTO candidates (name, email, job_title, status, score, skills, created_at, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    [
      ["Samantha Ray", "samantha.ray@gmail.com", "Product Designer", "Strong Match", 92, "Figma, UX research, design systems", "2025-04-12"],
      ["Noah Kim", "noah.kim@gmail.com", "Frontend Engineer", "Interview", 87, "React, TypeScript, performance", "2025-04-11"],
      ["Aisha Patel", "aisha.patel@gmail.com", "ML Engineer", "In Review", 81, "Python, LLMs, data science", "2025-04-09"],
      ["Daniel Smith", "daniel.smith@gmail.com", "Data Analyst", "Rejected", 61, "SQL, dashboards, stakeholder analysis", "2025-04-08"],
    ].forEach((candidate) => insertCandidate.run(...candidate, admin?.id || 0));
  }

  const screeningCount = db.prepare("SELECT COUNT(*) as count FROM screenings WHERE user_id = ?").get(admin?.id || 0).count;
  if (screeningCount === 0) {
    const insertScreening = db.prepare(`
      INSERT INTO screenings (candidate_name, role_name, score, status, updated, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    [
      ["Eva Gomez", "Frontend Developer", 95, "Strong Match", "2h ago"],
      ["Martin Box", "Product Manager", 83, "In Review", "3h ago"],
      ["Kira Wong", "Customer Success", 76, "Interview", "5h ago"],
      ["Daniel Lee", "AI Engineer", 68, "Rejected", "Yesterday"],
    ].forEach((screening) => insertScreening.run(...screening, admin?.id || 0));
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