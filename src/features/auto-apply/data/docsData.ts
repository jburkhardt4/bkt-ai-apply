// BKT AI-Apply — Documents (resumes + cover letters) seed data
// Ported from the design-system UI kit (ui_kits/ai-apply). Demo seed data:
// used as the fallback dataset when Supabase is not configured or empty,
// so the redesigned UI is fully reviewable without credentials.
//
// NOTE: This copy is intentionally em-dash-free. Em/en dashes are an AI "tell"
// and must never appear in resume or cover-letter content (see textSanitizer.ts
// and docs/domain/business-rules.md).
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

  // Builder starts BLANK — real content comes from the user's uploaded/saved
  // documents (loaded from the `documents` table), never demo data.
  resumeContent: {
    name: '',
    contact: '',
    headline: '',
    summary: '',
    experience: [],
    education: [],
    skills: [],
    certifications: [],
  },

  letterContent: {
    name: '',
    contact: '',
    date: '',
    recipient: '',
    company: '',
    role: '',
    greeting: '',
    body: [''],
    closing: 'Sincerely,',
  },

  // History is loaded from the real `documents` table (DocsHome useEffect) — no
  // seeded/demo resumes or cover letters.
  resumes: [],

  letters: [],

  /* ---- canned AI Writer exchanges ---- */
  ai: {
    suggestions: {
      resume: ['Tighten my summary', 'Quantify my last role', 'Match keywords to a job', 'Trim to one page'],
      letter: ['Punchier opening line', 'Tailor to the PwC role', 'Make it shorter', 'More formal tone'],
    },
    replies: {
      resume: {
        'Tighten my summary': {
          text: 'Here is a tighter cut, 38 words, leads with scope and proof:',
          patch: 'Salesforce consulting leader (12 yrs) and founder of BKT Advisory. I take enterprise clients from discovery to go-live across Sales, Service, and Revenue Cloud: pragmatic architecture, clean governance, delivery on time. CPQ redesigns have cut quote turnaround 38%.',
          patchTarget: 'summary', patchLabel: 'Apply to Summary' },
        'Quantify my last role': {
          text: 'Your BKT Advisory bullets carry numbers; the Meridian ones can too. Try: "Grew practice revenue 4.2× while holding delivery margin above 38%" and "Cut average project overrun from 19% to 6% with stage-gated governance." Want me to slot those in?' },
        'Match keywords to a job': {
          text: 'Against the PwC Salesforce Consulting Manager posting, you are strong on engagement leadership and integration management. Add the literal phrases "client engagement" and "customization in Salesforce"; ATS scanners match exact wording. Your skills block covers the rest.' },
        'Trim to one page': {
          text: 'To hold one page at 11pt: drop the TruNorth role to a single line, cap BKT Advisory at two bullets, and move Education below Skills. The Compact template buys you ~4 extra lines.' },
      },
      letter: {
        'Punchier opening line': {
          text: 'Swap the standard opener for proof-first:',
          patch: 'Twelve years of Salesforce delivery taught me one thing: engagements succeed on architecture and operating discipline, not slideware. That is what I would bring to your Salesforce Consulting Manager bench.',
          patchTarget: 'body0', patchLabel: 'Apply to Opening' },
        'Tailor to the PwC role': {
          text: 'The posting leads with client engagement, Salesforce customization, and integration management. Name all three in paragraph two and point each at a result; your CPQ turnaround stat covers customization, and the $4.5M program covers engagement scale.' },
        'Make it shorter': {
          text: 'Cut paragraph two to its second sentence and fold the close into one line: "I would welcome the chance to bring that discipline to your clients." 140 words reads better than 200 here.' },
        'More formal tone': {
          text: 'Replace "That is the core of my practice" with "These responsibilities align directly with my experience," and sign off "Respectfully" rather than "Sincerely." I would keep the contractions out as well.' },
      },
    },
  },
}
