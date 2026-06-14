export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_model_usage: {
        Row: {
          application_id: string | null
          called_at: string
          estimated_cost_usd: number
          id: string
          model_name: string
          model_provider: string
          task_type: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Insert: {
          application_id?: string | null
          called_at?: string
          estimated_cost_usd: number
          id?: string
          model_name: string
          model_provider: string
          task_type: string
          tokens_in: number
          tokens_out: number
          user_id: string
        }
        Update: {
          application_id?: string | null
          called_at?: string
          estimated_cost_usd?: number
          id?: string
          model_name?: string
          model_provider?: string
          task_type?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_usage_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_scores: {
        Row: {
          domain_score: number | null
          gaps: string[]
          id: string
          job_id: string
          location_auth_score: number | null
          model_used: string
          overall_score: number
          reasoning_trace: Json
          recommendation: string
          scored_at: string
          seniority_score: number | null
          skills_score: number | null
          strengths: string[]
          tools_score: number | null
          user_id: string
        }
        Insert: {
          domain_score?: number | null
          gaps?: string[]
          id?: string
          job_id: string
          location_auth_score?: number | null
          model_used: string
          overall_score: number
          reasoning_trace?: Json
          recommendation: string
          scored_at?: string
          seniority_score?: number | null
          skills_score?: number | null
          strengths?: string[]
          tools_score?: number | null
          user_id: string
        }
        Update: {
          domain_score?: number | null
          gaps?: string[]
          id?: string
          job_id?: string
          location_auth_score?: number | null
          model_used?: string
          overall_score?: number
          reasoning_trace?: Json
          recommendation?: string
          scored_at?: string
          seniority_score?: number | null
          skills_score?: number | null
          strengths?: string[]
          tools_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_scores_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          actor: string
          application_id: string
          created_at: string
          event_type: string
          from_stage: string | null
          id: string
          metadata: Json
          reason: string | null
          to_stage: string | null
          user_id: string
        }
        Insert: {
          actor: string
          application_id: string
          created_at?: string
          event_type: string
          from_stage?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_stage?: string | null
          user_id: string
        }
        Update: {
          actor?: string
          application_id?: string
          created_at?: string
          event_type?: string
          from_stage?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_stage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      application_materials: {
        Row: {
          application_id: string
          document_id: string
          id: string
          is_primary: boolean
          linked_at: string
          material_type: string
        }
        Insert: {
          application_id: string
          document_id: string
          id?: string
          is_primary?: boolean
          linked_at?: string
          material_type: string
        }
        Update: {
          application_id?: string
          document_id?: string
          id?: string
          is_primary?: boolean
          linked_at?: string
          material_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_materials_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_materials_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      application_queue: {
        Row: {
          application_id: string
          attempts: number
          channel: string | null
          created_at: string
          id: string
          last_attempt_at: string | null
          last_error: string | null
          queued_by: string
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          application_id: string
          attempts?: number
          channel?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          queued_by: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          application_id?: string
          attempts?: number
          channel?: string | null
          created_at?: string
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          queued_by?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_queue_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          id: string
          job_id: string
          match_score: number | null
          notes: string | null
          stage: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          match_score?: number | null
          notes?: string | null
          stage?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          match_score?: number | null
          notes?: string | null
          stage?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_memory: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          source_conversation_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind?: string
          source_conversation_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          source_conversation_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_memory_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          size_range: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          size_range?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          size_range?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          content_hash: string
          created_at: string
          document_type: string
          id: string
          is_locked: boolean
          storage_path: string
          user_id: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          document_type: string
          id?: string
          is_locked?: boolean
          storage_path: string
          user_id: string
          version?: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          document_type?: string
          id?: string
          is_locked?: boolean
          storage_path?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          application_id: string | null
          auto_actioned: boolean
          body_snippet: string | null
          classification: string
          confidence: number
          from_address: string
          gmail_labels: string[]
          gmail_message_id: string
          id: string
          processed_at: string | null
          received_at: string
          subject: string | null
          thread_id: string | null
          user_id: string
        }
        Insert: {
          application_id?: string | null
          auto_actioned?: boolean
          body_snippet?: string | null
          classification: string
          confidence: number
          from_address: string
          gmail_labels?: string[]
          gmail_message_id: string
          id?: string
          processed_at?: string | null
          received_at: string
          subject?: string | null
          thread_id?: string | null
          user_id: string
        }
        Update: {
          application_id?: string | null
          auto_actioned?: boolean
          body_snippet?: string | null
          classification?: string
          confidence?: number
          from_address?: string
          gmail_labels?: string[]
          gmail_message_id?: string
          id?: string
          processed_at?: string | null
          received_at?: string
          subject?: string | null
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_label_map: {
        Row: {
          classification: string
          created_at: string
          display_label: string
          gmail_label: string
          id: string
          user_id: string
        }
        Insert: {
          classification: string
          created_at?: string
          display_label: string
          gmail_label: string
          id?: string
          user_id: string
        }
        Update: {
          classification?: string
          created_at?: string
          display_label?: string
          gmail_label?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_label_map_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_sync_state: {
        Row: {
          created_at: string
          history_id: string | null
          last_error: string | null
          last_status: string | null
          last_synced_at: string | null
          updated_at: string
          user_id: string
          watch_expiration: string | null
        }
        Insert: {
          created_at?: string
          history_id?: string | null
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          updated_at?: string
          user_id: string
          watch_expiration?: string | null
        }
        Update: {
          created_at?: string
          history_id?: string | null
          last_error?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          updated_at?: string
          user_id?: string
          watch_expiration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmail_sync_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          application_id: string
          calendar_event_id: string | null
          created_at: string
          duration_minutes: number | null
          id: string
          interview_type: string
          interviewer_names: string[]
          location_or_link: string | null
          notes: string | null
          scheduled_at: string
          status: string
          user_id: string
        }
        Insert: {
          application_id: string
          calendar_event_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type: string
          interviewer_names?: string[]
          location_or_link?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string
          user_id: string
        }
        Update: {
          application_id?: string
          calendar_event_id?: string | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          interview_type?: string
          interviewer_names?: string[]
          location_or_link?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          application_method: string | null
          company_id: string | null
          compensation_max: number | null
          compensation_min: number | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          job_type: string | null
          location: string | null
          posted_at: string | null
          remote_type: string | null
          skills: string[]
          source: string | null
          source_url: string
          title: string
          user_id: string
        }
        Insert: {
          application_method?: string | null
          company_id?: string | null
          compensation_max?: number | null
          compensation_min?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          posted_at?: string | null
          remote_type?: string | null
          skills?: string[]
          source?: string | null
          source_url: string
          title: string
          user_id: string
        }
        Update: {
          application_method?: string | null
          company_id?: string | null
          compensation_max?: number | null
          compensation_min?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          posted_at?: string | null
          remote_type?: string | null
          skills?: string[]
          source?: string | null
          source_url?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          application_id: string | null
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          application_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          notification_type: string
          title: string
          user_id: string
        }
        Update: {
          application_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_profiles: {
        Row: {
          created_at: string
          environments: string[]
          id: string
          is_active: boolean
          job_titles: string[]
          job_types: string[]
          keywords: string[]
          last_run_at: string | null
          locations: string[]
          min_salary: number | null
          next_run_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          environments?: string[]
          id?: string
          is_active?: boolean
          job_titles?: string[]
          job_types?: string[]
          keywords?: string[]
          last_run_at?: string | null
          locations?: string[]
          min_salary?: number | null
          next_run_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          environments?: string[]
          id?: string
          is_active?: boolean
          job_titles?: string[]
          job_types?: string[]
          keywords?: string[]
          last_run_at?: string | null
          locations?: string[]
          min_salary?: number | null
          next_run_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospecting_runs: {
        Row: {
          error: string | null
          id: string
          jobs_found: number
          jobs_queued: number
          profile_id: string
          run_at: string
          status: string
          user_id: string
        }
        Insert: {
          error?: string | null
          id?: string
          jobs_found?: number
          jobs_queued?: number
          profile_id: string
          run_at?: string
          status: string
          user_id: string
        }
        Update: {
          error?: string | null
          id?: string
          jobs_found?: number
          jobs_queued?: number
          profile_id?: string
          run_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "prospecting_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiters: {
        Row: {
          company_id: string | null
          created_at: string
          email: string | null
          id: string
          linkedin_url: string | null
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name: string
          notes?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiters_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          granted_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_jobs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_jobs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_submit_score_threshold: number
          created_at: string
          credits: number
          daily_submission_cap: number
          last_target_job: Json | null
          monthly_budget_usd: number
          paused: boolean
          review_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_submit_score_threshold?: number
          created_at?: string
          credits?: number
          daily_submission_cap?: number
          last_target_job?: Json | null
          monthly_budget_usd?: number
          paused?: boolean
          review_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_submit_score_threshold?: number
          created_at?: string
          credits?: number
          daily_submission_cap?: number
          last_target_job?: Json | null
          monthly_budget_usd?: number
          paused?: boolean
          review_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      transition_stage: {
        Args: {
          p_actor?: string
          p_application_id: string
          p_from_stage: string
          p_reason: string
          p_to_stage: string
          p_user_id: string
        }
        Returns: undefined
      }
      write_approval_event: {
        Args: {
          p_application_id: string
          p_metadata?: Json
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
