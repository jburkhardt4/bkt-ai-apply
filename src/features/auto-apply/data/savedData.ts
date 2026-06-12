// BKT AI-Apply — Saved Jobs seed data
// Ported from the design-system UI kit (ui_kits/ai-apply). Demo seed data:
// used as the fallback dataset when Supabase is not configured or empty,
// so the redesigned UI is fully reviewable without credentials.
import type { SavedJob } from '../types'

export const SAVED_SEED: { jobs: SavedJob[] } = {
  jobs: [
    { id: 'v1', title: 'Senior Salesforce Project Manager', saved: '1 month ago',
      chips: ['Salesforce', 'PM', 'global implementations'],
      allChips: ['Salesforce', 'PM', 'global implementations', 'SDLC', 'Agile', 'Scrum'],
      desc: 'Senior Salesforce PM to lead end-to-end global implementations. Key requirements: full SDLC ownership, Agile/Scrum leadership, budget management ($1M+), and risk mitigation. Coordinates cross-functional teams (Devs, BAs, Admins) and reports directly to steering committees. Proficiency in Jira/Confluence and Smartsheet required; PMP or Salesforce certifications a plus.' },
    { id: 'v2', title: 'Salesforce Technical Lead', saved: '1 month ago',
      chips: ['Salesforce', 'Technical Lead', 'system architecture'],
      allChips: ['Salesforce', 'Technical Lead', 'system architecture', 'Apex', 'LWC', 'integrations'],
      desc: 'Technical Lead to own Salesforce system architecture and guide a team of developers. Hands-on Apex, LWC, and integration design, plus code review and release governance across a multi-cloud org.' },
    { id: 'v3', title: 'Senior Salesforce Business Analyst', saved: '1 month ago',
      chips: ['Senior Salesforce BA', 'requirements elicitation', 'process mapping'],
      allChips: ['Senior Salesforce BA', 'requirements elicitation', 'process mapping', 'user stories', 'UAT', 'stakeholder management'],
      desc: 'Senior BA to run requirements elicitation and process mapping for an enterprise Salesforce program — writing user stories, leading UAT cycles, and translating business needs for delivery teams.' },
    { id: 'v4', title: 'Salesforce Consultant', saved: '1 month ago',
      chips: ['Salesforce', 'Consultant', 'discovery workshops'],
      allChips: ['Salesforce', 'Consultant', 'discovery workshops', 'solution design', 'client delivery'],
      desc: 'Consultant to lead discovery workshops and solution design for mid-market Salesforce implementations, owning client delivery from kickoff through go-live.' },
    { id: 'v5', title: 'Senior Salesforce Administrator', saved: '1 month ago',
      chips: ['Salesforce', 'Administrator', 'Flow Builder'],
      allChips: ['Salesforce', 'Administrator', 'Flow Builder', 'security model', 'release management'],
      desc: 'Senior Admin to own day-to-day platform health — Flow Builder automation, the security and sharing model, sandbox strategy, and release management for a 600-seat org.' },
  ],
}
