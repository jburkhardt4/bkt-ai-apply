import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────

export type JobType = 'full-time' | 'contract' | 'part-time'
export type Environment = 'remote' | 'hybrid' | 'in-office'

export interface ProspectorFormValues {
  jobTitles: string[]
  locations: string[]
  jobTypes: JobType[]
  environments: Environment[]
  minSalary: number | null
  keywords: string[]
}

export interface ProspectingProfile {
  id: string
  user_id: string
  is_active: boolean
  job_titles: string[]
  locations: string[]
  job_types: JobType[]
  environments: Environment[]
  min_salary: number | null
  keywords: string[]
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

interface ProspectorProfileFormProps {
  profile: ProspectingProfile | null
  isSaving: boolean
  onSave: (values: ProspectorFormValues) => void
}

// ── Constants ─────────────────────────────────────────────────

const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  { value: 'full-time', label: 'Full-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'part-time', label: 'Part-time' },
]

const ENVIRONMENT_OPTIONS: { value: Environment; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'in-office', label: 'In-office' },
]

const KEYWORDS_MAX = 20

// ── Sub-component: TagInput ────────────────────────────────────

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder: string
  maxTags?: number
  disabled?: boolean
  id?: string
}

function TagInput({ tags, onChange, placeholder, maxTags = KEYWORDS_MAX, disabled, id }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const atMax = maxTags != null && tags.length >= maxTags

  function commitTag(raw: string) {
    const value = raw.trim()
    if (!value || tags.includes(value) || (maxTags != null && tags.length >= maxTags)) return
    onChange([...tags, value.slice(0, 50)])
    setInputValue('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitTag(inputValue)
    }
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 pr-1 text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => commitTag(inputValue)}
        placeholder={atMax ? `Maximum ${maxTags} reached` : placeholder}
        disabled={disabled || atMax}
        className="min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        title={atMax ? `Maximum ${maxTags} tags reached` : undefined}
      />
    </div>
  )
}

// ── Label helper ──────────────────────────────────────────────

function FieldLabel({ htmlFor, children, required }: { htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-foreground"
    >
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  )
}

// ── Main Form ─────────────────────────────────────────────────

export function ProspectorProfileForm({ profile, isSaving, onSave }: ProspectorProfileFormProps) {
  const [jobTitles, setJobTitles] = useState<string[]>(profile?.job_titles ?? [])
  const [locations, setLocations] = useState<string[]>(profile?.locations ?? [])
  const [jobTypes, setJobTypes] = useState<JobType[]>(profile?.job_types ?? [])
  const [environments, setEnvironments] = useState<Environment[]>(profile?.environments ?? [])
  const [minSalary, setMinSalary] = useState<string>(
    profile?.min_salary != null ? String(profile.min_salary) : '',
  )
  const [keywords, setKeywords] = useState<string[]>(profile?.keywords ?? [])

  // Validation state
  const [attempted, setAttempted] = useState(false)

  const jobTitlesError = attempted && jobTitles.length === 0

  function toggleJobType(value: JobType, checked: boolean) {
    setJobTypes((prev) =>
      checked ? [...prev, value] : prev.filter((t) => t !== value),
    )
  }

  function toggleEnvironment(value: Environment, checked: boolean) {
    setEnvironments((prev) =>
      checked ? [...prev, value] : prev.filter((e) => e !== value),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAttempted(true)

    if (jobTitles.length === 0) return

    const parsedSalary = minSalary !== '' ? parseInt(minSalary, 10) : null
    if (parsedSalary !== null && isNaN(parsedSalary)) return

    onSave({
      jobTitles,
      locations,
      jobTypes,
      environments,
      minSalary: parsedSalary,
      keywords,
    })
  }

  const isFirstSave = profile === null

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Helper text when no profile exists */}
      {isFirstSave && (
        <p className="text-sm text-muted-foreground">
          Set up your search profile to start discovering jobs automatically.
        </p>
      )}

      {/* Job Titles */}
      <div>
        <FieldLabel htmlFor="job-titles" required>
          Job Titles
        </FieldLabel>
        <TagInput
          id="job-titles"
          tags={jobTitles}
          onChange={setJobTitles}
          placeholder="e.g. Product Manager — press Enter to add"
          disabled={isSaving}
        />
        {jobTitlesError && (
          <p className="mt-1 text-xs text-destructive">At least one job title is required.</p>
        )}
      </div>

      {/* Locations */}
      <div>
        <FieldLabel htmlFor="locations">Locations</FieldLabel>
        <TagInput
          id="locations"
          tags={locations}
          onChange={setLocations}
          placeholder="e.g. San Francisco, CA — press Enter to add"
          disabled={isSaving}
        />
      </div>

      {/* Job Types */}
      <div>
        <FieldLabel>Job Types</FieldLabel>
        <div className="flex flex-wrap gap-4">
          {JOB_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={jobTypes.includes(option.value)}
                onCheckedChange={(checked) =>
                  toggleJobType(option.value, checked === true)
                }
                disabled={isSaving}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Environments */}
      <div>
        <FieldLabel>Environments</FieldLabel>
        <div className="flex flex-wrap gap-4">
          {ENVIRONMENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                checked={environments.includes(option.value)}
                onCheckedChange={(checked) =>
                  toggleEnvironment(option.value, checked === true)
                }
                disabled={isSaving}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Min Salary */}
      <div>
        <FieldLabel htmlFor="min-salary">Minimum Salary</FieldLabel>
        <div className="relative max-w-48">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            id="min-salary"
            type="number"
            min={0}
            step={1000}
            value={minSalary}
            onChange={(e) => setMinSalary(e.target.value)}
            placeholder="e.g. 120000"
            className={cn('pl-7', isSaving && 'opacity-50')}
            disabled={isSaving}
          />
        </div>
      </div>

      {/* Keywords */}
      <div>
        <FieldLabel htmlFor="keywords">Keywords</FieldLabel>
        <TagInput
          id="keywords"
          tags={keywords}
          onChange={setKeywords}
          placeholder="e.g. B2B SaaS — press Enter to add"
          maxTags={KEYWORDS_MAX}
          disabled={isSaving}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Up to {KEYWORDS_MAX} keywords. Press Enter or comma to add.
        </p>
      </div>

      <Button type="submit" disabled={isSaving} className="mt-1">
        {isSaving ? 'Saving…' : isFirstSave ? 'Save Profile' : 'Update Profile'}
      </Button>
    </form>
  )
}
