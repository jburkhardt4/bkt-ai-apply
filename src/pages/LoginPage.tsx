import { useState } from 'react'
import type { FormEvent } from 'react'
import { getSupabaseClient } from '../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          border: '1px solid var(--line)',
          borderRadius: '18px',
          padding: '2rem',
          background: 'var(--surface)',
          boxShadow: '0 16px 34px rgba(12,16,22,0.08)',
        }}
      >
        <p
          style={{
            margin: '0 0 0.2rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: '0.7rem',
            color: 'var(--ink-subtle)',
            fontWeight: 700,
          }}
        >
          BKT AI-Apply
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            margin: '0 0 1.5rem',
            color: 'var(--ink-strong)',
          }}
        >
          Sign in
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: '0.3rem',
                color: 'var(--ink-subtle)',
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
                fontSize: '0.9rem',
                background: '#fff',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: '0.3rem',
                color: 'var(--ink-subtle)',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                font: 'inherit',
                fontSize: '0.9rem',
                background: '#fff',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                color: '#dc2626',
                fontSize: '0.82rem',
                padding: '0.5rem 0.75rem',
                background: '#fef2f2',
                borderRadius: '6px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.25rem',
              padding: '0.6rem 1rem',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
