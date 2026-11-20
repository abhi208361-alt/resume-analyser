# TalentLens

AI-powered resume screening and recruitment analytics interface.

## Features
- Landing page
- Dashboard with KPI cards, screening table, AI model health, charts
- Jobs, Candidates, Resumes, Screenings, Models, Alerts, Reports, Settings
- Secure registration/login with bcrypt-hashed passwords and JWT sessions
- User-scoped resume storage and persisted analysis history
- Resume upload with PDF, DOCX, and TXT extraction
- Local deterministic analysis with optional server-side Gemini enhancement
- ATS scoring, keyword gaps, extracted skills, and job matching endpoints
- Responsive sidebar navigation and mobile drawer

## Local setup
1. Install dependencies:
   npm install

2. Create a `.env` file:
   cp .env.example .env

3. Set a long random `JWT_SECRET`. Add `GEMINI_API_KEY` only if you want Gemini enhancement;
   local analysis works without an external provider.

4. Start the app:
   npm run dev

5. Open:
   http://localhost:3000

## Login
- Email: admin@talentlens.ai
- Password: admin123

The default account is created only when the local SQLite database is empty. Change its password
before using the application outside local development.

## API

Authenticated endpoints include `/api/dashboard`, `/api/jobs`, `/api/candidates`,
`/api/upload-resume`, `/api/analyze`, `/api/analyses`, `/api/job-matches`, and `/api/reports`.
Send the JWT returned by `/api/login` or `/api/register` as `Authorization: Bearer <token>`.

The backend uses the existing SQLite database at `backend/data/talentlens.db` for local
development. It creates user, resume, extraction, analysis, job description, job match, and
audit-log tables on startup. Uploaded files are stored under `backend/uploads` and are never
served publicly; downloads require ownership authorization.