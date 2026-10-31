# TalentLens

AI-powered resume screening and recruitment analytics interface.

## Features
- Landing page
- Dashboard with KPI cards, screening table, AI model health, charts
- Jobs, Candidates, Resumes, Screenings, Models, Alerts, Reports, Settings
- Resume upload with PDF/TXT support
- AI analysis using Gemini when API key is provided
- Responsive sidebar navigation and mobile drawer

## Local setup
1. Install dependencies:
   npm install

2. Create a `.env` file:
   cp .env.example .env

3. Add your Gemini API key if you want live AI scoring:
   VITE_GEMINI_API_KEY=your_key_here

4. Start the app:
   npm run dev

5. Open:
   http://localhost:3000

## Login
- Email: admin@talentlens.ai
- Password: admin123