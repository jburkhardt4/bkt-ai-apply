# Data Model — BKT AI-Apply

> Generated types: `src/types/db.types.ts`
> After any schema change run: `pnpm db:gen-types`

---

## Entity Relationship Summary

```
auth.users (Supabase managed)
  ├── user_profiles    (1:1)
  ├── companies        (1:many)
  ├── jobs             (1:many)  ──── companies (many:1)
  ├── applications     (1:many)  ──── jobs (many:1)
  │     ├── application_events   (1:many)
  │     ├── documents            (1:many)
  │     └── interviews           (1:many) ── email_events (many:1)
  └── email_events     (1:many)  ──── applications (many:1, nullable)
```

---

## Table Schemas

### user_profiles
```sql
create table user_profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  email           text,
  linkedin_url    text,
  target_roles    text[],
  target_locations text[],
  remote_pref     text check (remote_pref in ('remote','hybrid','onsite','any')),
  salary_min      integer,
  skills          text[],
  match_weights   jsonb default '{"skills":40,"seniority":25,"location":20,"salary":15}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

### companies
```sql
create table companies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  website     text,
  industry    text,
  size_range  text check (size_range in ('1-50','51-200','201-1000','1000+')),
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

### jobs
```sql
create table jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  company_id       uuid references companies(id),
  title            text not null,
  description      text,
  url              text,
  source           text check (source in ('linkedin','indeed','glassdoor','manual','auto','other')),
  location         text,
  remote_type      text check (remote_type in ('remote','hybrid','onsite')),
  salary_min       integer,
  salary_max       integer,
  salary_currency  text default 'USD',
  match_score      numeric(5,2),
  match_breakdown  jsonb,
  discovered_at    timestamptz default now(),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
```

### applications  *(core tracking entity)*
```sql
create table applications (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  job_id                    uuid not null references jobs(id),
  stage                     text not null default 'discovery'
    check (stage in (
      'discovery','applied','screening',
      'interview_scheduled','interview_complete',
      'offer','hired','rejected','ghosted'
    )),
  stage_updated_at          timestamptz default now(),
  trigger_type              text default 'manual'
    check (trigger_type in ('manual','auto_email','auto_calendar','auto_apply')),
  applied_at                timestamptz,
  resume_document_id        uuid,
  cover_letter_document_id  uuid,
  notes                     text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);
```

### application_events  *(event log — never delete)*
```sql
create table application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  user_id         uuid not null references auth.users(id),
  event_type      text not null
    check (event_type in (
      'stage_change','note_added','document_updated',
      'email_detected','calendar_detected','score_updated'
    )),
  from_stage      text,
  to_stage        text,
  trigger_type    text,
  source_ref      text,
  metadata        jsonb,
  created_at      timestamptz default now()
);
```

### documents
```sql
create table documents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  application_id  uuid references applications(id),
  type            text not null check (type in ('resume','cover_letter','portfolio')),
  version         integer default 1,
  content_text    text,
  storage_path    text,
  ai_model_used   text,
  created_at      timestamptz default now()
);
```

### email_events
```sql
create table email_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  gmail_message_id  text unique not null,
  gmail_thread_id   text,
  from_address      text,
  subject           text,
  received_at       timestamptz,
  classified_as     text
    check (classified_as in (
      'interview_request','rejection','offer',
      'screening','follow_up','other'
    )),
  confidence_score  numeric(4,3),
  extracted_company text,
  extracted_date    timestamptz,
  application_id    uuid references applications(id),
  raw_snippet       text,
  processed_at      timestamptz default now()
);
```

### interviews
```sql
create table interviews (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references applications(id) on delete cascade,
  user_id           uuid not null references auth.users(id),
  scheduled_at      timestamptz,
  duration_minutes  integer,
  format            text check (format in ('phone','video','onsite','technical','panel')),
  round_number      integer default 1,
  interviewer_names text[],
  calendar_event_id text,
  email_event_id    uuid references email_events(id),
  prep_notes        text,
  outcome           text default 'pending'
    check (outcome in ('pending','passed','rejected','rescheduled','no_show')),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
```

---

## Required Indexes
```sql
create index idx_applications_user_stage on applications(user_id, stage);
create index idx_app_events_app          on application_events(application_id, created_at desc);
create index idx_email_events_user       on email_events(user_id, received_at desc);
create index idx_jobs_user_score         on jobs(user_id, match_score desc);
create index idx_interviews_app          on interviews(application_id);
```

---

## Valid Stage Transitions
```
discovery            → applied | rejected
applied              → screening | rejected | ghosted
screening            → interview_scheduled | rejected | ghosted
interview_scheduled  → interview_complete | rejected | ghosted
interview_complete   → interview_scheduled | offer | rejected | ghosted
offer                → hired | rejected
hired                → (terminal)
rejected             → (terminal)
ghosted              → applied (if re-engaged)
```
