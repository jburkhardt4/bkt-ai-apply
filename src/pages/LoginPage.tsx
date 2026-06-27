import { useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { getSupabaseClient } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) {
        setError(authError.message)
      } else {
        window.location.href = '/'
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh bg-background">
      {/* Left panel — brand + gradient */}
      <div className="relative hidden flex-col items-start justify-between overflow-hidden bg-foreground p-10 text-background md:flex md:w-[45%]">
        {/* Animated gradient blobs */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 20% 30%, rgba(37,99,235,0.35) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(99,102,241,0.25) 0%, transparent 50%)',
          }}
        />
        {/* Brand mark */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-lg">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-background/50">
              BKT
            </p>
            <p
              className="text-base font-semibold leading-tight text-background"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              AI-Apply
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div className="relative">
          <blockquote className="space-y-2">
            <p
              className="text-2xl font-semibold leading-snug text-background"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Your automated job application pipeline.
            </p>
            <p className="text-sm text-background/60">
              From discovery to hire — intelligent, systematic, and always on.
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* Mobile brand mark */}
        <div className="mb-8 flex items-center gap-2.5 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            BKT AI-Apply
          </span>
        </div>

        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle
              className="text-2xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Sign in
            </CardTitle>
            <CardDescription>Enter your credentials to access your pipeline.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
