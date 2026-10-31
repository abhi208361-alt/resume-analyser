export const users = [
  {
    id: 1,
    name: 'Ava Morgan',
    email: 'admin@talentlens.ai',
    password: 'admin123',
    role: 'admin',
  },
];

export const jobs = [
  { id: 1, title: 'Senior Frontend Developer', department: 'Engineering', status: 'Open', applicants: 42, updated: 'Apr 12, 2025' },
  { id: 2, title: 'Product Designer', department: 'Design', status: 'Reviewing', applicants: 38, updated: 'Apr 11, 2025' },
  { id: 3, title: 'Data Analyst', department: 'Analytics', status: 'Open', applicants: 31, updated: 'Apr 10, 2025' },
  { id: 4, title: 'AI Research Engineer', department: 'Research', status: 'Closed', applicants: 18, updated: 'Apr 09, 2025' },
  { id: 5, title: 'Customer Success Lead', department: 'Support', status: 'Open', applicants: 24, updated: 'Apr 08, 2025' },
];

export const candidates = [
  { id: 1, name: 'Samantha Ray', email: 'samantha.ray@gmail.com', role: 'Product Designer', status: 'Shortlisted', score: 92, updated: '1h ago' },
  { id: 2, name: 'Noah Kim', email: 'noah.kim@gmail.com', role: 'Frontend Engineer', status: 'Interview', score: 87, updated: '2h ago' },
  { id: 3, name: 'Aisha Patel', email: 'aisha.patel@gmail.com', role: 'ML Engineer', status: 'Reviewing', score: 81, updated: '4h ago' },
  { id: 4, name: 'Daniel Smith', email: 'daniel.smith@gmail.com', role: 'Data Analyst', status: 'Rejected', score: 61, updated: '5h ago' },
  { id: 5, name: 'Grace Lee', email: 'grace.lee@gmail.com', role: 'Operations Manager', status: 'Strong Fit', score: 89, updated: '6h ago' },
];

export const resumes = [
  { id: 1, name: 'Aisha Patel', file: 'aisha_cv.pdf', uploaded: 'Apr 11, 2025', status: 'Ready', score: 92 },
  { id: 2, name: 'Marcus Chen', file: 'marcus_cv.pdf', uploaded: 'Apr 10, 2025', status: 'Analyzed', score: 88 },
  { id: 3, name: 'Maya Smith', file: 'maya_cv.pdf', uploaded: 'Apr 09, 2025', status: 'Processing', score: 74 },
  { id: 4, name: 'Jules Foster', file: 'jules_cv.pdf', uploaded: 'Apr 08, 2025', status: 'Reviewed', score: 82 },
];

export const screenings = [
  { id: 1, name: 'Eva Gomez', role: 'Frontend Developer', score: 95, status: 'Strong Match', updated: '2h ago' },
  { id: 2, name: 'Martin Box', role: 'Product Manager', score: 83, status: 'In Review', updated: '3h ago' },
  { id: 3, name: 'Kira Wong', role: 'Customer Success', score: 76, status: 'Interview', updated: '5h ago' },
  { id: 4, name: 'Daniel Lee', role: 'AI Engineer', score: 68, status: 'Rejected', updated: 'Yesterday' },
];

export const models = [
  { id: 1, name: 'Resume parsing / extraction', status: 'Healthy', detail: 'Avg latency 1.1s' },
  { id: 2, name: 'AI scoring / analysis', status: 'Degraded', detail: '3 recent spikes' },
  { id: 3, name: 'Skills extraction', status: 'Healthy', detail: '92% confidence' },
  { id: 4, name: 'Duplicate detection', status: 'Not Configured', detail: 'Disabled in tenant' },
];

export const alerts = [
  { id: 1, title: 'Gemini quota warning', detail: 'AI scoring is approaching the current plan limit.', time: '18m ago', level: 'warning' },
  { id: 2, title: 'Resume parsing delay', detail: 'Two PDFs are pending beyond normal processing time.', time: '1h ago', level: 'info' },
  { id: 3, title: 'Schema mismatch detected', detail: 'One job import is missing required skill metadata.', time: 'Today', level: 'critical' },
];

export const dashboard = {
  metrics: [
    { label: 'New Resumes Today', value: 184, delta: '+12%' },
    { label: 'Auto-Screened', value: 96, delta: '+8%' },
    { label: 'Awaiting Review', value: 31, delta: '-5%' },
    { label: 'Active Jobs', value: 18, delta: '+2' },
  ],
  screenings: screenings.slice(0, 5),
  applicationsByJob: [
    { label: 'Product', value: 42 },
    { label: 'Engineering', value: 31 },
    { label: 'Sales', value: 28 },
    { label: 'Finance', value: 23 },
    { label: 'Marketing', value: 37 },
  ],
  pipelineStages: [
    { label: 'New', value: 126, color: '#8b5cf6' },
    { label: 'Screening', value: 68, color: '#22c55e' },
    { label: 'Interview', value: 34, color: '#14b8a6' },
    { label: 'Offer', value: 12, color: '#f59e0b' },
    { label: 'Rejected', value: 51, color: '#cbd5e1' },
  ],
};

export const reports = {
  cards: [
    { label: 'Avg Match Score', value: '84%', delta: '+4.6%' },
    { label: 'Time to Screen', value: '2.4d', delta: '-12%' },
    { label: 'Offer Rate', value: '31%', delta: '+2.1%' },
    { label: 'Hidden Talent', value: '14%', delta: '+6%' },
  ],
  velocity: [42, 58, 76, 63, 85, 92, 74],
};