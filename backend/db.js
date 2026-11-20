import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "talentlens.db"));
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    display_name TEXT,
    phone TEXT,
    profile_picture TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    phone TEXT,
    location TEXT,
    profile_picture TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'system',
    sidebar_preferences TEXT NOT NULL DEFAULT '{}',
    dashboard_preferences TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT,
    department TEXT,
    location TEXT,
    employment_type TEXT,
    salary_range TEXT,
    description TEXT,
    required_skills TEXT,
    preferred_skills TEXT,
    min_experience INTEGER NOT NULL DEFAULT 0,
    max_experience INTEGER,
    education TEXT,
    application_deadline TEXT,
    status TEXT NOT NULL DEFAULT 'Open',
    applicants INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    location TEXT,
    education TEXT,
    work_experience TEXT,
    technical_skills TEXT,
    projects TEXT,
    certifications TEXT,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'New',
    score INTEGER NOT NULL DEFAULT 0,
    ats_score INTEGER NOT NULL DEFAULT 0,
    review_notes TEXT,
    resume_id INTEGER,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS candidate_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    status TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    candidate_name TEXT,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    stored_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Processing',
    score INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS resume_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    stored_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    sha256 TEXT,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS extracted_resume_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL UNIQUE REFERENCES resumes(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    extraction_status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS resume_skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    category TEXT,
    UNIQUE(resume_id, skill)
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    job_title TEXT,
    job_description TEXT,
    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
    ats_score INTEGER NOT NULL CHECK(ats_score BETWEEN 0 AND 100),
    skills_score INTEGER NOT NULL DEFAULT 0,
    experience_score INTEGER NOT NULL DEFAULT 0,
    education_score INTEGER NOT NULL DEFAULT 0,
    projects_score INTEGER NOT NULL DEFAULT 0,
    formatting_score INTEGER NOT NULL DEFAULT 0,
    keyword_score INTEGER NOT NULL DEFAULT 0,
    result_json TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'local',
    status TEXT NOT NULL DEFAULT 'Completed',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Submitted',
    match_score INTEGER NOT NULL DEFAULT 0,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS job_descriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    title TEXT,
    company TEXT,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    job_description_id INTEGER REFERENCES job_descriptions(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS screenings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    candidate_name TEXT,
    role_name TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'In Review',
    notes TEXT,
    reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS screening_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    screening_id INTEGER NOT NULL REFERENCES screenings(id) ON DELETE CASCADE,
    reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL,
    file_name TEXT,
    stored_path TEXT,
    generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT,
    resource_type TEXT,
    resource_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    detail TEXT,
    level TEXT NOT NULL DEFAULT 'info',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS application_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    application_name TEXT NOT NULL DEFAULT 'TalentLens',
    organization_name TEXT,
    max_upload_bytes INTEGER NOT NULL DEFAULT 10485760,
    allowed_file_types TEXT NOT NULL DEFAULT 'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg',
    notification_settings TEXT NOT NULL DEFAULT '{}',
    analysis_thresholds TEXT NOT NULL DEFAULT '{}',
    registration_enabled INTEGER NOT NULL DEFAULT 1,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 720,
    maintenance_mode INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

`);

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumn("users", "display_name", "TEXT");
addColumn("users", "phone", "TEXT");
addColumn("users", "profile_picture", "TEXT");
addColumn("users", "active", "INTEGER NOT NULL DEFAULT 1");
addColumn("users", "updated_at", "TEXT");
addColumn("users", "username", "TEXT");
addColumn("jobs", "description", "TEXT");
addColumn("jobs", "requirements", "TEXT");
addColumn("jobs", "company", "TEXT");
addColumn("jobs", "location", "TEXT");
addColumn("jobs", "employment_type", "TEXT");
addColumn("jobs", "salary_range", "TEXT");
addColumn("jobs", "required_skills", "TEXT");
addColumn("jobs", "preferred_skills", "TEXT");
addColumn("jobs", "min_experience", "INTEGER NOT NULL DEFAULT 0");
addColumn("jobs", "max_experience", "INTEGER");
addColumn("jobs", "education", "TEXT");
addColumn("jobs", "application_deadline", "TEXT");
addColumn("jobs", "created_by", "INTEGER");
addColumn("jobs", "updated_at", "TEXT");
addColumn("jobs", "deleted_at", "TEXT");
addColumn("jobs", "created_at", "TEXT");
addColumn("candidates", "phone", "TEXT");
addColumn("candidates", "location", "TEXT");
addColumn("candidates", "education", "TEXT");
addColumn("candidates", "work_experience", "TEXT");
addColumn("candidates", "technical_skills", "TEXT");
addColumn("candidates", "projects", "TEXT");
addColumn("candidates", "certifications", "TEXT");
addColumn("candidates", "ats_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("candidates", "review_notes", "TEXT");
addColumn("candidates", "resume_id", "INTEGER");
addColumn("candidates", "job_id", "INTEGER");
addColumn("candidates", "created_by", "INTEGER");
addColumn("candidates", "updated_at", "TEXT");
addColumn("candidates", "deleted_at", "TEXT");
addColumn("candidates", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
addColumn("resumes", "candidate_id", "INTEGER");
addColumn("resumes", "mime_type", "TEXT");
addColumn("resumes", "deleted_at", "TEXT");
addColumn("resumes", "user_id", "INTEGER REFERENCES users(id) ON DELETE CASCADE");
addColumn("resumes", "file_extension", "TEXT");
addColumn("resumes", "file_size", "INTEGER NOT NULL DEFAULT 0");
addColumn("resumes", "analysis_status", "TEXT NOT NULL DEFAULT 'Completed'");
addColumn("resumes", "extraction_status", "TEXT NOT NULL DEFAULT 'completed'");
addColumn("analyses", "candidate_id", "INTEGER");
addColumn("analyses", "job_id", "INTEGER");
addColumn("analyses", "skills_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "experience_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "education_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "projects_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "formatting_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "keyword_score", "INTEGER NOT NULL DEFAULT 0");
addColumn("analyses", "status", "TEXT NOT NULL DEFAULT 'Completed'");
addColumn("screenings", "candidate_id", "INTEGER");
addColumn("screenings", "resume_id", "INTEGER");
addColumn("screenings", "analysis_id", "INTEGER");
addColumn("screenings", "job_id", "INTEGER");
addColumn("screenings", "notes", "TEXT");
addColumn("screenings", "reviewer_id", "INTEGER");
addColumn("screenings", "performed_by", "INTEGER");
addColumn("screenings", "created_at", "TEXT");

db.prepare(`
  INSERT OR IGNORE INTO application_settings (id) VALUES (1)
`).run();

for (const user of db.prepare("SELECT id,email,username FROM users").all()) {
  if (!user.username) {
    const base = String(user.email).split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 40) || `user${user.id}`;
    let username = base;
    let suffix = 1;
    while (db.prepare("SELECT id FROM users WHERE username=? AND id<>?").get(username, user.id)) {
      username = `${base}${suffix++}`;
    }
    db.prepare("UPDATE users SET username=? WHERE id=?").run(username, user.id);
  }
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL");

// Keep a setup-only default administrator; no recruitment or candidate demo records are seeded.
const adminCount = db.prepare("SELECT COUNT(*) count FROM users WHERE role = 'admin'").get().count;
if (adminCount === 0) {
  db.prepare(`
    INSERT INTO users (name, email, password, role, active)
    VALUES (?, ?, ?, 'admin', 1)
  `).run("Administrator", "admin@talentlens.ai", bcrypt.hashSync("admin123", 12));
}

for (const user of db.prepare("SELECT id,password FROM users").all()) {
  if (!String(user.password).startsWith("$2")) {
    db.prepare("UPDATE users SET password=? WHERE id=?").run(bcrypt.hashSync(String(user.password), 12), user.id);
  }
}

const demoJobTitles = [
  "Senior Frontend Developer",
  "Product Designer",
  "Data Analyst",
  "AI Research Engineer",
  "Customer Success Lead",
];
for (const title of demoJobTitles) {
  db.prepare("DELETE FROM jobs WHERE title=?").run(title);
}

const demoCandidates = ["Samantha Ray", "Noah Kim", "Aisha Patel", "Daniel Smith", "Grace Lee"];
for (const name of demoCandidates) {
  db.prepare("DELETE FROM candidates WHERE name=?").run(name);
}

const demoScreenings = ["Eva Gomez", "Martin Box", "Kira Wong", "Daniel Lee"];
for (const name of demoScreenings) {
  db.prepare("DELETE FROM screenings WHERE candidate_name=?").run(name);
}
