import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  CircleOff,
  Database,
  Download,
  FileText,
  FolderCog,
  Gauge,
  Home,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Lock,
  LogIn,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UploadCloud,
  User,
  UserRound,
  Users,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { jsPDF } from "jspdf";
import * as pdfjsLib from "pdfjs-dist";

type PageKey =
  | "Landing"
  | "Dashboard"
  | "Jobs"
  | "Candidates"
  | "Resumes"
  | "Screenings"
  | "Models"
  | "Alerts"
  | "Reports"
  | "Settings";

type StatusValue =
  | "Strong Match"
  | "In Review"
  | "Interview"
  | "Rejected"
  | "Open"
  | "Reviewing"
  | "Closed"
  | "Healthy"
  | "Degraded"
  | "Unavailable"
  | "Not Configured";

type Job = {
  id: number;
  title: string;
  department: string;
  status: string;
  applicants: number;
  description?: string;
  requirements?: string;
  created_at?: string;
};

type Candidate = {
  id: number;
  name: string;
  email: string;
  job_title: string;
  status: string;
  score: number;
  skills?: string;
  created_at?: string;
};

type Screening = {
  id: number;
  name: string;
  role: string;
  score: number;
  status: string;
  updated: string;
};

type ModelHealth = {
  id: number;
  name: string;
  status: string;
  detail: string;
};

type AlertItem = {
  id: number;
  title: string;
  detail: string;
  time: string;
  level: string;
};

type DashboardReadout = {
  metrics: Array<{ label: string; value: number; delta: string }>;
  screenings: Screening[];
  applicationsByJob: Array<{ label: string; value: number; color: string }>;
  pipelineStages: Array<{ label: string; value: number; color: string }>;
};

type AnalysisResult = {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  keywordMatch: {
    found: string[];
    missing: string[];
  };
};

const sidebarPages: Array<{ key: PageKey; icon: React.ReactNode; label: string }> = [
  { key: "Landing", icon: <Home className="h-4 w-4" />, label: "Landing" },
  { key: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
  { key: "Jobs", icon: <BriefcaseBusiness className="h-4 w-4" />, label: "Jobs" },
  { key: "Candidates", icon: <Users className="h-4 w-4" />, label: "Candidates" },
  { key: "Resumes", icon: <FileText className="h-4 w-4" />, label: "Resumes" },
  { key: "Screenings", icon: <FolderCog className="h-4 w-4" />, label: "Screenings" },
  { key: "Models", icon: <Sparkles className="h-4 w-4" />, label: "Models" },
  { key: "Alerts", icon: <Bell className="h-4 w-4" />, label: "Alerts" },
  { key: "Reports", icon: <TrendingUp className="h-4 w-4" />, label: "Reports" },
  { key: "Settings", icon: <Settings className="h-4 w-4" />, label: "Settings" },
];

const statusClasses: Record<StatusValue, string> = {
  "Strong Match": "bg-[#e7f9f1] text-[#188a5c] border border-[#bfe8d1]",
  "In Review": "bg-[#fff4dc] text-[#a96d00] border border-[#f4d99f]",
  Interview: "bg-[#eaf7ff] text-[#1d7ca8] border border-[#bfe2f6]",
  Rejected: "bg-[#eceff4] text-[#5a6478] border border-[#d9dfe8]",
  Open: "bg-[#eafaf3] text-[#1f8d68] border border-[#bfe6d5]",
  Reviewing: "bg-[#fff3d7] text-[#a56b00] border border-[#f3db9a]",
  Closed: "bg-[#eef2f8] text-[#5d6880] border border-[#dfe5ee]",
  Healthy: "bg-[#eafaf3] text-[#1f8d68] border border-[#bae7cf]",
  Degraded: "bg-[#fff2d8] text-[#a96800] border border-[#f3d99a]",
  Unavailable: "bg-[#fde9ea] text-[#c64a5d] border border-[#f2bec6]",
  "Not Configured": "bg-[#edf0f5] text-[#606c7c] border border-[#dfe3eb]",
};

const demoReports = {
  cards: [
    { label: "Avg Match Score", value: "84%", delta: "+4.6%" },
    { label: "Time to Screen", value: "2.4d", delta: "-12%" },
    { label: "Offer Rate", value: "31%", delta: "+2.1%" },
    { label: "Hidden Talent", value: "14%", delta: "+6%" },
  ],
  velocity: [42, 58, 76, 63, 85, 92, 74],
};

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function apiRequest(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("talentlens-token");
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(path, { ...options, headers }).then(async (response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || "Request failed");
    }

    if (response.status === 204) return undefined;
    return response.json();
  });
}

function StatusBadge({ value }: { value?: string }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
        statusClasses[value as StatusValue] || "bg-[#f2f4f8] text-[#5c667b] border border-[#e5eaf0]"
      )}
    >
      {value}
    </span>
  );
}

function extractTextFromPDF(file: File): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(" ");
        fullText += pageText + "\n";
      }

      resolve(fullText.trim());
    } catch (error) {
      reject(error);
    }
  });
}

function exportCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportReportPdf() {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("TalentLens Report", 14, 16);

  doc.setFontSize(11);
  doc.text("Generated: " + new Date().toLocaleDateString(), 14, 24);

  doc.setFontSize(12);
  doc.text("Summary metrics", 14, 38);

  demoReports.cards.forEach((card, index) => {
    const y = 48 + index * 12;
    doc.text(`${card.label}: ${card.value} (${card.delta})`, 14, y);
  });

  doc.save("talentlens-report.pdf");
}

function LandingPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#eaedf2] bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#f0ebff] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#5e4bde]">
                AI-powered recruiting intelligence
              </span>
            </div>

            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[#111827]">
                Smarter Hiring with AI
              </h1>
              <p className="max-w-xl text-sm leading-7 text-[#647084]">
                TalentLens helps teams match candidates to roles faster using resume parsing,
                role-fit scoring, and operational hiring analytics.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-medium text-white"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("talentlens-navigate", { detail: { page: "Dashboard" } })
                  );
                }}
              >
                Get Started
              </button>
              <button className="rounded-xl border border-[#e6eaf0] bg-white px-4 py-2.5 text-sm font-medium text-[#1f2937]">
                Learn More
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#eef1f4] bg-[#f8f9fc] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7d889d]">
                  Live pipeline
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#111827]">1,872</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f1ebff] text-[#604ae5]">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Shortlisted", value: "412" },
                { label: "Interviewing", value: "84" },
                { label: "Offers", value: "19" },
                { label: "Avg. fit", value: "84%" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-[#edf0f5] bg-white p-3">
                  <p className="text-[11px] text-[#7a8598]">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-[#111827]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "AI Resume Analysis",
            detail: "Improve candidate matching quality with automatic skill extraction and fit scoring.",
          },
          {
            title: "Structured Hiring",
            detail: "Track interview stages, hiring signals, and decision stages without switching tools.",
          },
          {
            title: "Operational Visibility",
            detail: "Monitor sourcing performance, model health, and pre-screening throughput at a glance.",
          },
        ].map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-[#eaedf2] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.02)]"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f2ebff] text-[#624ae6]">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-lg font-semibold text-[#111827]">{feature.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#677285]">{feature.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsPage({
  jobs,
  onCreate,
  onUpdate,
  onDelete,
}: {
  jobs: Job[];
  onCreate: (payload: Partial<Job>) => void;
  onUpdate: (id: number, payload: Partial<Job>) => void;
  onDelete: (id: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    department: "",
    status: "Open",
    applicants: "0",
    description: "",
    requirements: "",
  });

  const resetForm = () => {
    setForm({
      title: "",
      department: "",
      status: "Open",
      applicants: "0",
      description: "",
      requirements: "",
    });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (job: Job) => {
    setEditingId(job.id);
    setForm({
      title: job.title,
      department: job.department,
      status: job.status,
      applicants: String(job.applicants ?? 0),
      description: job.description || "",
      requirements: job.requirements || "",
    });
    setShowForm(true);
  };

  const submit = () => {
    const payload = {
      title: form.title,
      department: form.department,
      status: form.status,
      applicants: Number(form.applicants || 0),
      description: form.description,
      requirements: form.requirements,
    };

    if (editingId !== null) {
      onUpdate(editingId, payload);
    } else {
      onCreate(payload);
    }
    setShowForm(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">Jobs</h2>
          <p className="text-sm text-[#7a8598]">Recruitment pipeline and hiring stages</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-3.5 py-2.5 text-sm font-medium text-white"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Create Job
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-[#eaedf2] bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Department</label>
              <input
                value={form.department}
                onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              >
                <option value="Open">Open</option>
                <option value="Reviewing">Reviewing</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Applicants</label>
              <input
                type="number"
                value={form.applicants}
                onChange={(e) => setForm((prev) => ({ ...prev, applicants: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[#374151]">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-[#374151]">Requirements</label>
              <textarea
                rows={3}
                value={form.requirements}
                onChange={(e) => setForm((prev) => ({ ...prev, requirements: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              className="rounded-xl border border-[#edf1f5] bg-white px-4 py-2 text-sm font-medium text-[#5b677a]"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white"
              onClick={submit}
            >
              {editingId !== null ? "Save Changes" : "Create Job"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#eaedf2] bg-white overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8f9fc]">
            <tr className="text-[#7a8598]">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Applicants</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-[#eef1f5]">
                <td className="px-4 py-3 font-medium text-[#1d2430]">{job.title}</td>
                <td className="px-4 py-3 text-[#5f6d82]">{job.department}</td>
                <td className="px-4 py-3">
                  <StatusBadge value={job.status} />
                </td>
                <td className="px-4 py-3 text-[#1d2430]">{job.applicants}</td>
                <td className="px-4 py-3 text-[#7a8598]">
                  {job.created_at ? new Date(job.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-[#edf1f5] bg-[#f8f9fc] p-2"
                      onClick={() => openEdit(job)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-[#5c667b]" />
                    </button>
                    <button
                      className="rounded-lg border border-[#edf1f5] bg-[#f8f9fc] p-2"
                      onClick={() => onDelete(job.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[#c6405d]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CandidatesPage({
  candidates,
  onCreate,
  onUpdate,
  onDelete,
}: {
  candidates: Candidate[];
  onCreate: (payload: Partial<Candidate>) => void;
  onUpdate: (id: number, payload: Partial<Candidate>) => void;
  onDelete: (id: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    job_title: "",
    status: "In Review",
    score: "0",
    skills: "",
  });

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      job_title: "",
      status: "In Review",
      score: "0",
      skills: "",
    });
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (candidate: Candidate) => {
    setEditingId(candidate.id);
    setForm({
      name: candidate.name,
      email: candidate.email,
      job_title: candidate.job_title || "",
      status: candidate.status,
      score: String(candidate.score || 0),
      skills: candidate.skills || "",
    });
    setShowForm(true);
  };

  const submit = () => {
    const payload = {
      name: form.name,
      email: form.email,
      job_title: form.job_title,
      status: form.status,
      score: Number(form.score || 0),
      skills: form.skills,
    };

    if (editingId !== null) {
      onUpdate(editingId, payload);
    } else {
      onCreate(payload);
    }

    setShowForm(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">Candidates</h2>
          <p className="text-sm text-[#7a8598]">Searchable profiles and screening signals</p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-3.5 py-2.5 text-sm font-medium text-white"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-[#eaedf2] bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Job</label>
              <input
                value={form.job_title}
                onChange={(e) => setForm((prev) => ({ ...prev, job_title: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              >
                <option value="In Review">In Review</option>
                <option value="Interview">Interview</option>
                <option value="Strong Match">Strong Match</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Score</label>
              <input
                type="number"
                value={form.score}
                onChange={(e) => setForm((prev) => ({ ...prev, score: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#374151]">Skills</label>
              <input
                value={form.skills}
                onChange={(e) => setForm((prev) => ({ ...prev, skills: e.target.value }))}
                className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-3">
            <button
              className="rounded-xl border border-[#edf1f5] bg-white px-4 py-2 text-sm font-medium text-[#5b677a]"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white"
              onClick={submit}
            >
              {editingId !== null ? "Save Changes" : "Add Candidate"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {candidates.map((candidate) => (
          <div key={candidate.id} className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f0ebff] text-[#5e4bde]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-[#1d2430]">{candidate.name}</div>
                  <div className="text-sm text-[#7a8598]">{candidate.job_title || "Open role"}</div>
                  <div className="text-xs text-[#8b95a6]">{candidate.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#eafaf3] px-2.5 py-1 text-sm font-semibold text-[#1f8d68]">
                  {candidate.score}% fit
                </span>
                <StatusBadge value={candidate.status} />
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-[#edf1f5] bg-[#f8f9fc] p-2"
                    onClick={() => openEdit(candidate)}
                  >
                    <Pencil className="h-3.5 w-3.5 text-[#5c667b]" />
                  </button>
                  <button
                    className="rounded-lg border border-[#edf1f5] bg-[#f8f9fc] p-2"
                    onClick={() => onDelete(candidate.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[#c6405d]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumesPage() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsParsing(true);

    try {
      let text = "";
      if (file.type === "application/pdf") {
        text = await extractTextFromPDF(file);
      } else if (file.type === "text/plain") {
        text = await file.text();
      } else {
        throw new Error("Unsupported file type. Please upload a PDF or TXT file.");
      }

      if (!text.trim()) {
        throw new Error("Could not extract text from the file.");
      }

      setResumeText(text);
    } catch (err: any) {
      setError(err?.message || "Failed to read file.");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!resumeText || !jobDescription) {
      setError("Please provide both a resume and a job description.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await apiRequest("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ resumeText, jobDescription }),
      });

      setResult(response);
    } catch (err) {
      setError("Failed to analyze resume. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setResumeText("");
    setJobDescription("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">Resumes</h2>
          <p className="text-sm text-[#7a8598]">Upload, extract, and analyze resume content</p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#111827] px-3.5 py-2.5 text-sm font-medium text-white">
          <UploadCloud className="h-4 w-4" />
          Upload Resume
          <input ref={fileInputRef} type="file" accept=".pdf,.txt" className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {!result ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-[#eaedf2] bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#5f6d82]" />
                <h3 className="font-semibold text-[#111827]">Resume</h3>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#5f6d82] hover:text-[#111827] disabled:opacity-50"
              >
                {isParsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
                Upload
              </button>
            </div>

            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              className="h-[280px] w-full resize-none rounded-xl border border-[#e9edf3] bg-[#f8f9fc] p-4 text-sm outline-none focus:border-[#c3b8ff]"
              placeholder="Paste the resume text here..."
            />
          </div>

          <div className="rounded-2xl border border-[#eaedf2] bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5 text-[#5f6d82]" />
              <h3 className="font-semibold text-[#111827]">Job Description</h3>
            </div>

            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              className="h-[280px] w-full resize-none rounded-xl border border-[#e9edf3] bg-[#f8f9fc] p-4 text-sm outline-none focus:border-[#c3b8ff]"
              placeholder="Paste the job description here..."
            />
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#eaedf2] bg-white p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0ebff] text-[#5e4bde]">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-semibold text-[#111827]">Resume Analysis</div>
                <div className="text-sm text-[#7a8598]">Candidate fit score {result.score}%</div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="rounded-xl border border-[#edf1f5] bg-[#f8f9fc] px-3 py-2 text-sm font-medium text-[#5b677a]"
            >
              Analyze Another
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-[#f8f9fc] p-4">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[#1f8d68]" />
                <h4 className="font-semibold text-[#111827]">Key Strengths</h4>
              </div>
              <ul className="space-y-2 text-sm text-[#5f6d82]">
                {result.strengths.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1f8d68]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-[#f8f9fc] p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#a86700]" />
                <h4 className="font-semibold text-[#111827]">Gaps & Weaknesses</h4>
              </div>
              <ul className="space-y-2 text-sm text-[#5f6d82]">
                {result.weaknesses.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#a86700]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#f8f9fc] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-[#5e4bde]" />
              <h4 className="font-semibold text-[#111827]">Actionable Suggestions</h4>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {result.suggestions.map((item) => (
                <div key={item} className="rounded-xl border border-[#edf1f5] bg-white p-3 text-sm text-[#5f6d82]">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[#f3c8d0] bg-[#fff1f3] px-3 py-2 text-sm text-[#b32344]">
          {error}
        </div>
      )}

      {!result && (
        <div className="flex justify-center">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || isParsing}
            className="inline-flex items-center justify-center rounded-xl bg-[#111827] px-6 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {isAnalyzing ? "Analyzing..." : "Analyze Match"}
          </button>
        </div>
      )}
    </div>
  );
}

function ScreeningsPage({ screenings }: { screenings: Screening[] }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">Screenings</h2>
          <p className="text-sm text-[#7a8598]">Role-fit scoring and reviewer actions</p>
        </div>
        <button
          className="rounded-xl border border-[#edf1f5] bg-white px-3 py-2 text-sm font-medium text-[#5b677a]"
          onClick={() =>
            exportCsv(
              "screenings.csv",
              screenings.map((row) => ({
                Candidate: row.name,
                Job: row.role,
                "Match Score": row.score,
                Status: row.status,
                Updated: row.updated,
              }))
            )
          }
        >
          Export CSV
        </button>
      </div>

      <div className="rounded-2xl border border-[#eaedf2] bg-white overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8f9fc]">
            <tr className="text-[#7a8598]">
              <th className="px-4 py-3 font-medium">Candidate</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Match</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {screenings.map((row) => (
              <tr key={row.id} className="border-t border-[#eef1f5]">
                <td className="px-4 py-3 font-medium text-[#1d2430]">{row.name}</td>
                <td className="px-4 py-3 text-[#5f6d82]">{row.role}</td>
                <td className="px-4 py-3 text-[#1d2430]">{row.score}%</td>
                <td className="px-4 py-3">
                  <StatusBadge value={row.status} />
                </td>
                <td className="px-4 py-3 text-[#7a8598]">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelsPage({ models }: { models: ModelHealth[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[#111827]">Models</h2>
        <p className="text-sm text-[#7a8598]">Configured providers and AI pipeline health</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {models.map((model) => (
          <div key={model.id} className="rounded-2xl border border-[#eaedf2] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#7a8598]">Component</div>
                <div className="mt-2 text-lg font-semibold text-[#111827]">{model.name}</div>
              </div>
              <StatusBadge value={model.status} />
            </div>
            <div className="mt-4 text-sm text-[#677285]">{model.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertsPage({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[#111827]">Alerts</h2>
        <p className="text-sm text-[#7a8598]">Operational events requiring attention</p>
      </div>

      <div className="space-y-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl",
                  alert.level === "critical"
                    ? "bg-[#fde8ec] text-[#c6405d]"
                    : alert.level === "warning"
                      ? "bg-[#fff4db] text-[#a86700]"
                      : "bg-[#eaf7ff] text-[#2278a9]"
                )}
              >
                {alert.level === "critical" ? (
                  <CircleOff className="h-4 w-4" />
                ) : alert.level === "warning" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-medium text-[#1d2430]">{alert.title}</h3>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[#7a8598]">{alert.time}</span>
                </div>
                <p className="mt-2 text-sm text-[#677285]">{alert.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">Reports</h2>
          <p className="text-sm text-[#7a8598]">Hiring analytics and funnel health</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-[#edf1f5] bg-white px-3.5 py-2.5 text-sm font-medium text-[#1f2937]"
            onClick={() =>
              exportCsv("talentlens-report.csv", [
                { Metric: "Avg Match Score", Value: "84%" },
                { Metric: "Time to Screen", Value: "2.4d" },
                { Metric: "Offer Rate", Value: "31%" },
                { Metric: "Hidden Talent", Value: "14%" },
              ])
            }
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-[#111827] px-3.5 py-2.5 text-sm font-medium text-white"
            onClick={exportReportPdf}
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {demoReports.cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#7a8598]">{card.label}</div>
            <div className="mt-4 flex items-end justify-between">
              <span className="text-[28px] font-semibold tracking-tight text-[#111827]">{card.value}</span>
              <span className="text-[11px] font-medium text-[#2a9a67]">{card.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="mb-4 text-lg font-semibold text-[#111827]">Hiring velocity</div>
        <div className="flex h-48 items-end gap-3">
          {demoReports.velocity.map((value, index) => (
            <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-2">
              <div
                className="flex h-full w-full items-end justify-center rounded-t-2xl bg-gradient-to-t from-[#6a5ce7] to-[#7d6ff1]"
                style={{ height: `${value}%` }}
              />
              <span className="text-[10px] text-[#7a8598]">{["M", "T", "W", "T", "F", "S", "S"][index]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const settings = [
    { label: "Theme", value: "Light" },
    { label: "Review Policy", value: "Human override required" },
    { label: "AI Provider", value: "Google Gemini" },
    { label: "PDF Parser", value: "PDF.js + extraction" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[#111827]">Settings</h2>
        <p className="text-sm text-[#7a8598]">Workspace and integration preferences</p>
      </div>

      <div className="rounded-2xl border border-[#eaedf2] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="space-y-4">
          {settings.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between border-b border-[#edf1f5] pb-3 last:border-0 last:pb-0"
            >
              <span className="text-sm text-[#667287]">{item.label}</span>
              <span className="text-sm font-medium text-[#1d2430]">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardPage({
  dashboard,
}: {
  dashboard: DashboardReadout | null;
}) {
  if (!dashboard) {
    return (
      <div className="rounded-2xl border border-[#eaedf2] bg-white p-12 text-center text-sm text-[#69788b]">
        Loading dashboard...
      </div>
    );
  }

  const totalBars = dashboard.applicationsByJob.reduce((sum, item) => sum + item.value, 0) || 1;
  const totalPipeline = dashboard.pipelineStages.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#7b8598]">Dashboard</div>
            <h2 className="mt-2 text-2xl font-semibold text-[#111827]">Dashboard</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-[#ebeff4] bg-[#f8f9fc] px-3 py-2 text-xs text-[#59667d]">
            <CircleDashed className="h-3.5 w-3.5" />
            Updated 9 minutes ago
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.metrics.map((metric, index) => (
          <div key={metric.label} className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1ebff] text-[#5f4ae7]">
                {index === 0 && <FileText className="h-4 w-4" />}
                {index === 1 && <CheckCircle2 className="h-4 w-4" />}
                {index === 2 && <CircleDashed className="h-4 w-4" />}
                {index === 3 && <BriefcaseBusiness className="h-4 w-4" />}
              </div>
              <span className="text-[11px] font-medium text-[#2a9a67]">{metric.delta}</span>
            </div>
            <div className="text-[28px] font-semibold tracking-tight text-[#111827]">{metric.value}</div>
            <div className="mt-2 text-xs text-[#7b8698]">{metric.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1f2937]">Recent Screenings</h3>
              <p className="mt-1 text-xs text-[#7a8598]">Latest candidate-to-role matches</p>
            </div>
            <button className="rounded-xl border border-[#edf0f4] bg-[#f8f9fc] px-3 py-2 text-xs font-medium text-[#59667d]">
              Filter
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#edf0f4] text-[#7a8598]">
                  <th className="py-3 pr-4 font-medium">Candidate</th>
                  <th className="py-3 pr-4 font-medium">Job</th>
                  <th className="py-3 pr-4 font-medium">Match Score</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.screenings.map((row) => (
                  <tr key={row.id} className="border-b border-[#f1f3f6] last:border-0">
                    <td className="py-3 pr-4 font-medium text-[#1d2430]">{row.name}</td>
                    <td className="py-3 pr-4 text-[#627086]">{row.role}</td>
                    <td className="py-3 pr-4 text-[#1d2430]">{row.score}%</td>
                    <td className="py-3 pr-4">
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="py-3 text-[#7a8598]">{row.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1f2937]">AI Model Health</h3>
              <p className="mt-1 text-xs text-[#7a8598]">Operational status</p>
            </div>
            <button className="rounded-xl border border-[#edf0f4] bg-[#f8f9fc] p-2">
              <Gauge className="h-4 w-4 text-[#677285]" />
            </button>
          </div>

          <div className="space-y-3">
            {[
              { name: "Resume parsing / extraction", status: "Healthy", detail: "Avg latency 1.1s" },
              { name: "AI scoring / analysis", status: "Degraded", detail: "3 recent spikes" },
              { name: "Skills extraction", status: "Healthy", detail: "92% confidence" },
              { name: "Duplicate detection", status: "Not Configured", detail: "Disabled in tenant" },
            ].map((model) => (
              <div key={model.name} className="rounded-2xl border border-[#eef1f4] bg-[#f8f9fc] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-[#1d2430]">{model.name}</div>
                    <div className="text-[11px] text-[#7a8598]">{model.detail}</div>
                  </div>
                  <StatusBadge value={model.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1f2937]">Applications by Job</h3>
              <p className="mt-1 text-xs text-[#7a8598]">Current inbound pipeline by role</p>
            </div>
          </div>
          <div className="flex h-56 items-end gap-4">
            {dashboard.applicationsByJob.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center justify-end gap-3">
                <div
                  className="flex h-40 w-full items-end justify-center rounded-t-2xl p-1"
                  style={{
                    height: `${(bar.value / totalBars) * 100}%`,
                    background: `linear-gradient(180deg, ${bar.color}, #6755ea)`,
                  }}
                >
                  <span className="mb-2 text-[11px] font-medium text-white">{bar.value}</span>
                </div>
                <span className="text-[11px] text-[#7a8598]">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#eaedf2] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-[#1f2937]">Pipeline Stages</h3>
              <p className="mt-1 text-xs text-[#7a8598]">Current stage distribution</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative h-40 w-40">
              <div
                className="h-40 w-40 rounded-full"
                style={{
                  background: `conic-gradient(${dashboard.pipelineStages
                    .map((segment, index) => {
                      const prev = dashboard.pipelineStages
                        .slice(0, index)
                        .reduce((sum, item) => sum + item.value, 0);
                      const current = (segment.value / totalPipeline) * 100;
                      const start = (prev / totalPipeline) * 100;
                      return `${segment.color} ${start}% ${start + current}%`;
                    })
                    .join(", ")})`,
                }}
              />
              <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-2xl font-semibold text-[#111827]">{totalPipeline}</span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#7a8598]">Total</span>
              </div>
            </div>

            <div className="flex-1 space-y-3">
              {dashboard.pipelineStages.map((stage) => (
                <div key={stage.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm text-[#5f6d82]">{stage.label}</span>
                  </div>
                  <span className="text-sm font-medium text-[#1f2937]">{stage.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#eadfff] bg-[#f3edff] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e9e0ff] text-[#5f4ae7]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#1f2937]">TalentLens screening and analytics</div>
              <div className="text-sm text-[#5f6d82]">
                Use structured review signals, AI scoring, and role-fit matching to reduce review time while
                keeping final hiring decisions human-led.
              </div>
            </div>
          </div>
          <button
            className="rounded-xl bg-[#111827] px-3.5 py-2 text-sm font-medium text-white"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("talentlens-navigate", { detail: { page: "Reports" } })
              )
            }
          >
            View Reports
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("talentlens-auth") === "true";
  });

  const [activePage, setActivePage] = useState<PageKey>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loginEmail, setLoginEmail] = useState("admin@talentlens.ai");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [loginError, setLoginError] = useState("");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [models, setModels] = useState<ModelHealth[]>([]);
  const [dashboard, setDashboard] = useState<DashboardReadout | null>(null);

  const fetchAppData = async () => {
    try {
      const [dashboardRes, jobsRes, candidatesRes, screeningsRes, alertsRes, modelsRes] =
        await Promise.all([
          apiRequest("/api/dashboard"),
          apiRequest("/api/jobs"),
          apiRequest("/api/candidates"),
          apiRequest("/api/screenings"),
          apiRequest("/api/alerts"),
          apiRequest("/api/models"),
        ]);

      setDashboard(dashboardRes);
      setJobs(jobsRes);
      setCandidates(candidatesRes);
      setScreenings(screeningsRes);
      setAlerts(alertsRes);
      setModels(modelsRes);
    } catch (error) {
      console.error("Failed to fetch app data:", error);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchAppData();
  }, [isLoggedIn]);

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const custom = event as CustomEvent<{ page?: PageKey }>;
      const page = custom.detail?.page;
      if (page) {
        setActivePage(page);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("talentlens-navigate", handleNavigate);
    return () => window.removeEventListener("talentlens-navigate", handleNavigate);
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!loginEmail || !loginPassword) {
      setLoginError("Please enter both email and password.");
      return;
    }

    try {
      const data = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      localStorage.setItem("talentlens-token", data.token);
      localStorage.setItem("talentlens-user", JSON.stringify(data.user));
      localStorage.setItem("talentlens-auth", "true");
      setIsLoggedIn(true);
      setLoginError("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("talentlens-token");
    localStorage.removeItem("talentlens-user");
    localStorage.removeItem("talentlens-auth");
    setIsLoggedIn(false);
  };

  const handleCreateJob = async (payload: Partial<Job>) => {
    try {
      const created = await apiRequest("/api/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setJobs((prev) => [created, ...prev]);
    } catch (error) {
      console.error("Create job failed:", error);
    }
  };

  const handleUpdateJob = async (id: number, payload: Partial<Job>) => {
    try {
      const updated = await apiRequest(`/api/jobs/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setJobs((prev) => prev.map((job) => (job.id === id ? updated : job)));
    } catch (error) {
      console.error("Update job failed:", error);
    }
  };

  const handleDeleteJob = async (id: number) => {
    try {
      await apiRequest(`/api/jobs/${id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((job) => job.id !== id));
    } catch (error) {
      console.error("Delete job failed:", error);
    }
  };

  const handleCreateCandidate = async (payload: Partial<Candidate>) => {
    try {
      const created = await apiRequest("/api/candidates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCandidates((prev) => [created, ...prev]);
    } catch (error) {
      console.error("Create candidate failed:", error);
    }
  };

  const handleUpdateCandidate = async (id: number, payload: Partial<Candidate>) => {
    try {
      const updated = await apiRequest(`/api/candidates/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setCandidates((prev) => prev.map((candidate) => (candidate.id === id ? updated : candidate)));
    } catch (error) {
      console.error("Update candidate failed:", error);
    }
  };

  const handleDeleteCandidate = async (id: number) => {
    try {
      await apiRequest(`/api/candidates/${id}`, { method: "DELETE" });
      setCandidates((prev) => prev.filter((candidate) => candidate.id !== id));
    } catch (error) {
      console.error("Delete candidate failed:", error);
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case "Landing":
        return <LandingPage />;
      case "Dashboard":
        return <DashboardPage dashboard={dashboard} />;
      case "Jobs":
        return <JobsPage jobs={jobs} onCreate={handleCreateJob} onUpdate={handleUpdateJob} onDelete={handleDeleteJob} />;
      case "Candidates":
        return (
          <CandidatesPage
            candidates={candidates}
            onCreate={handleCreateCandidate}
            onUpdate={handleUpdateCandidate}
            onDelete={handleDeleteCandidate}
          />
        );
      case "Resumes":
        return <ResumesPage />;
      case "Screenings":
        return <ScreeningsPage screenings={screenings} />;
      case "Models":
        return <ModelsPage models={models} />;
      case "Alerts":
        return <AlertsPage alerts={alerts} />;
      case "Reports":
        return <ReportsPage />;
      case "Settings":
        return <SettingsPage />;
      default:
        return <DashboardPage dashboard={dashboard} />;
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f4f8] p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md rounded-3xl border border-[#eaedf2] bg-white p-8 shadow-[0_1px_0_rgba(15,23,42,0.02)]"
        >
          <div className="flex items-center justify-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5d4ae6] text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#7a8598]">TalentLens</div>
              <div className="text-2xl font-semibold text-[#111827]">Sign in</div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="mt-7 space-y-4">
            <label className="block">
              <div className="mb-2 text-sm font-medium text-[#1f2937]">Email</div>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b95a6]" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#bcaefb]"
                />
              </div>
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-medium text-[#1f2937]">Password</div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8b95a6]" />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#e9edf3] bg-[#f8f9fc] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#bcaefb]"
                />
              </div>
            </label>

            {loginError && (
              <div className="rounded-xl border border-[#f3c8d0] bg-[#fff1f3] px-3 py-2 text-sm text-[#b32344]">
                {loginError}
              </div>
            )}

            <button type="submit" className="w-full rounded-xl bg-[#111827] px-4 py-3 text-sm font-medium text-white">
              <span className="inline-flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Sign in to TalentLens
              </span>
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f4f8] text-[#111827]">
      <div className="flex">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 w-[230px] border-r border-[#ecf0f4] bg-white transition-transform duration-200 lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            !sidebarOpen && "lg:translate-x-0"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-[#eef1f5] px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5d4ae6] text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-[#7a8598]">TalentLens</div>
                  <div className="text-base font-semibold text-[#111827]">Recruiting</div>
                </div>
              </div>

              <button
                className="rounded-lg p-1.5 text-[#7a8598] hover:bg-[#f6f8fb] lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 px-3 py-4">
              <nav className="space-y-1">
                {sidebarPages.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      setActivePage(item.key);
                      setSidebarOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                      activePage === item.key
                        ? "bg-[#f2ebff] text-[#5a4ae3] ring-1 ring-[#e4dcff]"
                        : "text-[#59657a] hover:bg-[#f8f9fb] hover:text-[#111827]"
                    )}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      {item.label}
                    </span>
                    {activePage === item.key ? <ChevronRight className="h-4 w-4" /> : null}
                  </button>
                ))}
              </nav>
            </div>

            <div className="border-t border-[#eef1f5] p-4">
              <div className="flex items-center gap-3 rounded-xl bg-[#f8f9fc] p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f1ebff] text-[#5d4ae6]">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#111827]">Ava Morgan</div>
                  <div className="text-[11px] text-[#7a8598]">Talent Lead</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-[#edf0f4] bg-white/80 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  className="rounded-xl border border-[#edf1f5] bg-[#f8f9fc] p-2 text-[#5d6779] lg:hidden"
                  onClick={() => setSidebarOpen((value) => !value)}
                >
                  <Menu className="h-4 w-4" />
                </button>

                <div className="hidden items-center gap-2 rounded-xl border border-[#edf1f5] bg-[#f8f9fc] px-3 py-2 text-[#7a8598] sm:flex">
                  <Search className="h-4 w-4" />
                  <input
                    className="w-40 border-0 bg-transparent text-sm outline-none placeholder:text-[#99a6b7]"
                    placeholder="Search..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button className="rounded-xl border border-[#edf1f5] bg-[#f8f9fc] p-2 text-[#5d6779]">
                  <Bell className="h-4 w-4" />
                </button>

                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[#edf1f5] bg-[#f8f9fc] px-3 py-2 text-sm font-medium text-[#1f2937]"
                  onClick={handleLogout}
                >
                  <Database className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#f1f3f6] px-4 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#7a8598]">
                  <span>Landing</span>
                  <ChevronRight className="h-3 w-3" />
                  <span>{activePage}</span>
                </div>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                  {activePage}
                </h1>
              </div>

              <div className="hidden items-center gap-2 rounded-full bg-[#f1ebff] px-3 py-1.5 text-sm font-medium text-[#5e4bde] md:flex">
                <Sparkles className="h-4 w-4" />
                Live updates
              </div>
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6">
            <div className="mb-4 rounded-xl border border-[#edf1f5] bg-[#f7f9fb] px-3 py-2 text-[11px] text-[#687687]">
              Real-time demo mode • Updates every 5s
            </div>
            {renderPage()}
          </main>
        </div>
      </div>
    </div>
  );
}