import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Briefcase, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Lightbulb, 
  Target,
  Loader2,
  ChevronRight,
  RefreshCw,
  LogIn,
  User,
  Lock,
  FileUp,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeResume, AnalysisResult } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker using Vite's asset loading
// @ts-expect-error - Vite specific import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail && loginPassword) {
      setIsLoggedIn(true);
      setError(null);
    } else {
      setError('Please enter both email and password.');
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingFile(true);
    setError(null);

    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPDF(file);
      } else if (file.type === 'text/plain') {
        text = await file.text();
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or TXT file.');
      }
      
      if (!text.trim()) {
        throw new Error('Could not extract text from the file.');
      }
      
      setResumeText(text);
    } catch (err: any) {
      setError(err.message || 'Failed to read file.');
    } finally {
      setIsParsingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!resumeText || !jobDescription) {
      setError('Please provide both a resume and a job description.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      const analysis = await analyzeResume(resumeText, jobDescription);
      setResult(analysis);
    } catch (err) {
      setError('Failed to analyze resume. Please try again.');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setResumeText('');
    setJobDescription('');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md glass-card p-8"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-zinc-900 text-white rounded-2xl mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold">Resume Analyzer</h1>
            <p className="text-zinc-500 mt-2">Sign in to analyze your resume</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Email Address</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
                  placeholder="name@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="password"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <button 
              type="submit"
              className="w-full py-3 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-xs text-zinc-400">
              Demo: Use any email and password.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div className="text-left">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center justify-center p-2 bg-zinc-900 text-white rounded-xl mb-4"
            >
              <Search className="w-6 h-6" />
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl"
            >
              Resume Analyzer
            </motion.h1>
          </div>
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Sign Out
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div 
              key="input-section"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
              <div className="glass-card p-6 flex flex-col h-[500px]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-zinc-500" />
                    <h2 className="text-lg font-semibold">Your Resume</h2>
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingFile}
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 transition-colors disabled:opacity-50"
                  >
                    {isParsingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
                    Upload PDF/TXT
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".pdf,.txt"
                    onChange={handleFileUpload}
                  />
                </div>
                <div className="relative flex-1">
                  <textarea
                    className="w-full h-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all resize-none font-sans text-sm"
                    placeholder="Paste your resume text here or upload a file..."
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                  />
                  {resumeText && (
                    <button 
                      onClick={() => setResumeText('')}
                      className="absolute top-2 right-2 p-1 bg-white/80 rounded-md hover:bg-white transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="glass-card p-6 flex flex-col h-[500px]">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="w-5 h-5 text-zinc-500" />
                  <h2 className="text-lg font-semibold">Job Description</h2>
                </div>
                <textarea
                  className="flex-1 w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900 focus:border-transparent outline-none transition-all resize-none font-sans text-sm"
                  placeholder="Paste the job description here..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div className="md:col-span-2 flex flex-col items-center gap-4">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-100"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">{error}</span>
                  </motion.div>
                )}
                
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isParsingFile}
                  className={cn(
                    "group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-zinc-900 font-pj rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900",
                    (isAnalyzing || isParsingFile) && "opacity-80 cursor-not-allowed"
                  )}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze Match
                      <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="result-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="glass-card p-8">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="58"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        className="text-zinc-100"
                      />
                      <motion.circle
                        cx="64"
                        cy="64"
                        r="58"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="transparent"
                        strokeDasharray={364.4}
                        initial={{ strokeDashoffset: 364.4 }}
                        animate={{ strokeDashoffset: 364.4 - (364.4 * result.score) / 100 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className={cn(
                          result.score >= 80 ? "text-emerald-500" : 
                          result.score >= 60 ? "text-amber-500" : "text-red-500"
                        )}
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-3xl font-bold">{result.score}</span>
                      <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Match</span>
                    </div>
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-2xl font-bold mb-2">Analysis Summary</h2>
                    <p className="text-zinc-600 leading-relaxed">{result.summary}</p>
                  </div>
                  <button 
                    onClick={handleReset}
                    className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                    title="Start Over"
                  >
                    <RefreshCw className="w-5 h-5 text-zinc-500" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4 text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Key Strengths</h3>
                  </div>
                  <ul className="space-y-3">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-3 text-zinc-700 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="glass-card p-6">
                  <div className="flex items-center gap-2 mb-4 text-amber-600">
                    <AlertCircle className="w-5 h-5" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Gaps & Weaknesses</h3>
                  </div>
                  <ul className="space-y-3">
                    {result.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-3 text-zinc-700 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="glass-card p-6 md:col-span-2">
                  <div className="flex items-center gap-2 mb-6">
                    <Target className="w-5 h-5 text-zinc-500" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Keyword Analysis</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Found Keywords</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.keywordMatch.found.map((k, i) => (
                          <span key={i} className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-100">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">Missing Keywords</h4>
                      <div className="flex flex-wrap gap-2">
                        {result.keywordMatch.missing.map((k, i) => (
                          <span key={i} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-xs font-medium border border-red-100">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6 md:col-span-2 bg-zinc-900 text-white border-none">
                  <div className="flex items-center gap-2 mb-4 text-zinc-400">
                    <Lightbulb className="w-5 h-5" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Actionable Suggestions</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/10 text-sm leading-relaxed">
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-center pb-12">
                <button
                  onClick={handleReset}
                  className="inline-flex items-center px-6 py-3 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-600 hover:bg-white hover:shadow-sm transition-all"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Analyze Another Resume
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
