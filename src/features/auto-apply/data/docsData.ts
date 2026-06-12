// BKT AI-Apply — Documents (resumes + cover letters) seed data
// Ported from the design-system UI kit (ui_kits/ai-apply). Demo seed data:
// used as the fallback dataset when Supabase is not configured or empty,
// so the redesigned UI is fully reviewable without credentials.
import type { DocsData } from '../types'

export const DOCS_SEED: DocsData = {

  /* ---- paper templates (shared by resumes & letters) ---- */
  templates: [
    { id: 'classic',   name: 'Classic',   sub: 'Times New Roman',
      font: "'Times New Roman', Times, serif", headFont: "'Times New Roman', Times, serif",
      headCase: 'uppercase', rule: true,  centerName: false, accent: '#101013' },
    { id: 'modern',    name: 'Modern',    sub: 'Geist',
      font: "'Geist', 'Avenir Next', sans-serif", headFont: "'Geist', 'Avenir Next', sans-serif",
      headCase: 'uppercase', rule: false, centerName: false, accent: '#1a47a8' },
    { id: 'executive', name: 'Executive', sub: 'Georgia',
      font: "Georgia, 'Times New Roman', serif", headFont: "Georgia, 'Times New Roman', serif",
      headCase: 'none', rule: true, centerName: true, accent: '#101013' },
    { id: 'compact',   name: 'Compact',   sub: 'Helvetica',
      font: "Helvetica, Arial, sans-serif", headFont: "Helvetica, Arial, sans-serif",
      headCase: 'uppercase', rule: false, centerName: false, accent: '#3f3f46' },
  ],

  /* ---- builder seed: the base resume ---- */
  resumeContent: {
    name: 'John Burkhardt',
    contact: 'Charlotte, NC · john@bktadvisory.com · (704) 555-0188 · linkedin.com/in/jburkhardt',
    headline: 'Salesforce Consulting Leader · Business Architect',
    summary: 'Consulting leader with 12+ years designing and delivering Salesforce platforms for enterprise clients. Founder of BKT Advisory, where I lead discovery-to-go-live engagements across Sales, Service, and Revenue Cloud — translating business strategy into systems that ship. Known for pragmatic architecture, clean governance, and teams that deliver on time.',
    experience: [
      { role: 'Founder & Principal Consultant', org: 'BKT Advisory', when: '2021 – Present',
        bullets: [
          'Lead end-to-end Salesforce consulting engagements for 14 enterprise clients across financial services, healthcare, and SaaS.',
          'Designed quote-to-cash architecture (CPQ + Billing) that cut quote turnaround 38% for a $200M software firm.',
          'Built AI-assisted application pipeline (multi-model routing, Gmail/Calendar ingestion) powering real-time hiring-stage tracking.' ] },
      { role: 'Senior Manager, Salesforce Practice', org: 'Meridian Consulting Group', when: '2016 – 2021',
        bullets: [
          'Grew the Salesforce practice from 6 to 31 consultants; owned delivery quality across 40+ concurrent projects.',
          'Served as lead business architect on multi-cloud programs up to $4.5M, reporting to client steering committees.' ] },
      { role: 'Business Systems Analyst', org: 'TruNorth Financial', when: '2012 – 2016',
        bullets: [
          'Owned Salesforce administration and process mapping for a 600-seat org; led migration off legacy CRM in 9 months.' ] },
    ],
    education: [
      { degree: 'B.S. Business Administration', org: 'University of North Carolina at Charlotte', when: '2012' },
    ],
    skills: ['Salesforce Architecture', 'CPQ / Billing', 'Apex & Flows', 'Business Analysis', 'Process Mapping', 'Agile Delivery', 'Stakeholder Management', 'AI Workflow Automation', 'SQL', 'Jira / Confluence'],
  },

  /* ---- builder seed: the base cover letter ---- */
  letterContent: {
    name: 'John Burkhardt',
    contact: 'Charlotte, NC · john@bktadvisory.com · (704) 555-0188',
    date: '6/10/2026',
    recipient: 'Hiring Team',
    company: 'PwC',
    role: 'Salesforce Consulting Manager',
    greeting: 'Dear Hiring Team,',
    body: [
      'I am writing to apply for the Salesforce Consulting Manager role. Over the last twelve years I have led Salesforce delivery from both sides of the table — most recently as founder of BKT Advisory, where I run discovery-to-go-live engagements for enterprise clients across Sales, Service, and Revenue Cloud.',
      'Your posting calls for end-to-end engagement ownership, customization depth, and integration management. That is the core of my practice: I served as lead business architect on multi-cloud programs up to $4.5M, designed CPQ architecture that cut quote turnaround 38%, and have kept delivery teams of 30+ consultants shipping on time.',
      'I would welcome the chance to bring that operating discipline to your clients. Thank you for your consideration.',
    ],
    closing: 'Sincerely,',
  },

  /* ---- history: uploaded / generated resumes ---- */
  resumes: [
    { id: 'r1', name: 'John_Burkhardt_Resume_2026.pdf', kind: 'Base', isDefault: true,
      updated: '6/2/2026 4:12:00 PM', size: '184 KB', template: 'classic',
      note: 'Primary resume — used by Auto Apply' },
    { id: 'r2', name: 'JB_Resume_Salesforce_Architect.pdf', kind: 'Customized',
      target: 'Salesforce Architect — Tech Holding', updated: '6/8/2026 9:41:00 AM', size: '188 KB', template: 'modern',
      summary: 'Salesforce architect with 12+ years designing scalable enterprise platforms — architecture strategy, governance, and hands-on Apex/SOQL/API integration across Sales and Service Cloud.' },
    { id: 'r3', name: 'JB_Resume_Consulting_Manager.pdf', kind: 'Customized',
      target: 'Salesforce Consulting Manager — PwC', updated: '6/7/2026 2:25:00 PM', size: '186 KB', template: 'classic',
      summary: 'Consulting manager with 12+ years leading Salesforce engagements end-to-end — solution design, integration management, and client delivery teams of 30+ consultants.' },
    { id: 'r4', name: 'JB_Resume_RevOps.pdf', kind: 'Customized',
      target: 'RevOps Admin — Blackthorn', updated: '6/5/2026 11:03:00 AM', size: '181 KB', template: 'compact',
      summary: 'Revenue-operations specialist focused on Salesforce hygiene, workflow automation, and GTM reporting for SaaS teams.' },
    { id: 'r5', name: 'John_Burkhardt_Resume_2024.pdf', kind: 'Archived',
      updated: '11/18/2024 3:30:00 PM', size: '176 KB', template: 'executive',
      summary: 'Senior Salesforce practice manager with a decade of platform delivery, practice growth, and business-architecture experience.' },
  ],

  /* ---- history: cover letters ---- */
  letters: [
    { id: 'l1', name: 'CL_PwC_Consulting_Manager.pdf', kind: 'Customized', isDefault: true,
      target: 'Salesforce Consulting Manager — PwC', updated: '6/8/2026 10:02:00 AM', size: '92 KB', template: 'classic' },
    { id: 'l2', name: 'CL_Neocol_Solution_Architect.pdf', kind: 'Customized',
      target: 'Solution Architect — Neocol', updated: '6/6/2026 4:47:00 PM', size: '90 KB', template: 'modern',
      company: 'Neocol', role: 'Solution Architect, Financial Services', recipient: 'Neocol Talent Team',
      body0: 'I am writing to apply for the Solution Architect role on your financial-services team. As founder of BKT Advisory I architect Salesforce-native solutions daily — most recently quote-to-cash designs spanning CPQ and Billing.' },
    { id: 'l3', name: 'CL_Generic_Base.pdf', kind: 'Base',
      updated: '5/28/2026 1:15:00 PM', size: '88 KB', template: 'classic',
      company: '[Company]', role: '[Role]', recipient: 'Hiring Team',
      body0: 'I am writing to apply for the [Role] position. Over the last twelve years I have led Salesforce delivery from both sides of the table — as a practice leader and as founder of BKT Advisory.' },
  ],

  /* ---- canned AI Writer exchanges ---- */
  ai: {
    suggestions: {
      resume: ['Tighten my summary', 'Quantify my last role', 'Match keywords to a job', 'Trim to one page'],
      letter: ['Punchier opening line', 'Tailor to the PwC role', 'Make it shorter', 'More formal tone'],
    },
    replies: {
      resume: {
        'Tighten my summary': {
          text: 'Here is a tighter cut — 38 words, leads with scope and proof:',
          patch: 'Salesforce consulting leader (12 yrs) and founder of BKT Advisory. I take enterprise clients from discovery to go-live across Sales, Service, and Revenue Cloud — pragmatic architecture, clean governance, delivery on time. CPQ redesigns have cut quote turnaround 38%.',
          patchTarget: 'summary', patchLabel: 'Apply to Summary' },
        'Quantify my last role': {
          text: 'Your BKT Advisory bullets carry numbers; the Meridian ones can too. Try: "Grew practice revenue 4.2× while holding delivery margin above 38%" and "Cut average project overrun from 19% to 6% with stage-gated governance." Want me to slot those in?' },
        'Match keywords to a job': {
          text: 'Against the PwC Salesforce Consulting Manager posting, you are strong on engagement leadership and integration management. Add the literal phrases "client engagement" and "customization in Salesforce" — ATS scanners match exact wording. Your skills block covers the rest.' },
        'Trim to one page': {
          text: 'To hold one page at 11pt: drop the TruNorth role to a single line, cap BKT Advisory at two bullets, and move Education below Skills. The Compact template buys you ~4 extra lines.' },
      },
      letter: {
        'Punchier opening line': {
          text: 'Swap the standard opener for proof-first:',
          patch: 'Twelve years of Salesforce delivery taught me one thing: engagements succeed on architecture and operating discipline, not slideware. That is what I would bring to your Salesforce Consulting Manager bench.',
          patchTarget: 'body0', patchLabel: 'Apply to Opening' },
        'Tailor to the PwC role': {
          text: 'The posting leads with client engagement, Salesforce customization, and integration management. Name all three in paragraph two and point each at a result — your CPQ turnaround stat covers customization; the $4.5M program covers engagement scale.' },
        'Make it shorter': {
          text: 'Cut paragraph two to its second sentence and fold the close into one line: "I would welcome the chance to bring that discipline to your clients." 140 words reads better than 200 here.' },
        'More formal tone': {
          text: 'Replace "That is the core of my practice" with "These responsibilities align directly with my experience," and sign off "Respectfully" rather than "Sincerely." I would keep the contractions out as well.' },
      },
    },
  },
}
