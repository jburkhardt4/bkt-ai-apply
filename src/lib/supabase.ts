import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

interface SupabaseConfigState {
  isConfigured: boolean
  error: string | null
}

let client: SupabaseClient | null = null

export function getSupabaseConfigState(): SupabaseConfigState {
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      isConfigured: false,
      error:
        'Supabase environment variables are missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    }
  }

  return {
    isConfigured: true,
    error: null,
  }
}

export function getSupabaseClientSafe(): SupabaseClient | null {
  const configState = getSupabaseConfigState()

  if (!configState.isConfigured) {
    return null
  }

  return getSupabaseClient()
}

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client
  }

  const configState = getSupabaseConfigState()

  if (!configState.isConfigured) {
    throw new Error(configState.error ?? 'Supabase configuration is invalid.')
  }

  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return client
}
