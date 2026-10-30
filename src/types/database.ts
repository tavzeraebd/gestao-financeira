export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string;
          created_by: string;
          credit_limit: number | null;
          family_id: string;
          id: string;
          institution_name: string | null;
          is_active: boolean;
          name: string;
          opening_balance: number;
          opening_balance_date: string;
          statement_closing_day: number | null;
          statement_due_day: number | null;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string;
          credit_limit?: number | null;
          family_id: string;
          id?: string;
          institution_name?: string | null;
          is_active?: boolean;
          name: string;
          opening_balance?: number;
          opening_balance_date?: string;
          statement_closing_day?: number | null;
          statement_due_day?: number | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          credit_limit?: number | null;
          family_id?: string;
          id?: string;
          institution_name?: string | null;
          is_active?: boolean;
          name?: string;
          opening_balance?: number;
          opening_balance_date?: string;
          statement_closing_day?: number | null;
          statement_due_day?: number | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          family_id: string;
          id: string;
          metadata: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          family_id: string;
          id?: string;
          metadata?: NonNullable<Json>;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          family_id?: string;
          id?: string;
          metadata?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      budgets: {
        Row: {
          amount_limit: number;
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string;
          end_month: string | null;
          family_id: string;
          id: string;
          start_month: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount_limit: number;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          end_month?: string | null;
          family_id: string;
          id?: string;
          start_month: string;
          updated_at?: string;
        };
        Update: {
          amount_limit?: number;
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          end_month?: string | null;
          family_id?: string;
          id?: string;
          start_month?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budgets_category_fk";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "budgets_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "budgets_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          archived_at: string | null;
          color: string;
          created_at: string;
          created_by: string;
          family_id: string;
          icon: string;
          id: string;
          is_default: boolean;
          name: string;
          parent_id: string | null;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          color: string;
          created_at?: string;
          created_by?: string;
          family_id: string;
          icon: string;
          id?: string;
          is_default?: boolean;
          name: string;
          parent_id?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          created_by?: string;
          family_id?: string;
          icon?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          parent_id?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_parent_fk";
            columns: ["family_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      expense_splits: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string;
          family_id: string;
          id: string;
          member_id: string;
          transaction_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          created_by: string;
          family_id: string;
          id?: string;
          member_id: string;
          transaction_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string;
          family_id?: string;
          id?: string;
          member_id?: string;
          transaction_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_splits_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_splits_member_fk";
            columns: ["family_id", "member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "expense_splits_transaction_fk";
            columns: ["family_id", "transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      families: {
        Row: {
          base_currency: string;
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          base_currency?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          base_currency?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "families_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      family_invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          created_by: string;
          expires_at: string;
          family_id: string;
          id: string;
          invited_email: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          role: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by: string;
          expires_at: string;
          family_id: string;
          id?: string;
          invited_email?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role?: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          family_id?: string;
          id?: string;
          invited_email?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          role?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_invites_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_invites_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_invites_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_invites_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      family_members: {
        Row: {
          created_at: string;
          ended_at: string | null;
          family_id: string;
          id: string;
          joined_at: string;
          role: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          family_id: string;
          id?: string;
          joined_at?: string;
          role: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          family_id?: string;
          id?: string;
          joined_at?: string;
          role?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_contributions: {
        Row: {
          amount: number;
          contribution_date: string;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          family_id: string;
          goal_id: string;
          id: string;
          idempotency_key: string | null;
          kind: string;
          member_id: string;
          notes: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          contribution_date: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          family_id: string;
          goal_id: string;
          id?: string;
          idempotency_key?: string | null;
          kind: string;
          member_id: string;
          notes?: string | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          contribution_date?: string;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          family_id?: string;
          goal_id?: string;
          id?: string;
          idempotency_key?: string | null;
          kind?: string;
          member_id?: string;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_contributions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_contributions_goal_fk";
            columns: ["family_id", "goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "goal_contributions_member_fk";
            columns: ["family_id", "member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      goals: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string;
          description: string | null;
          family_id: string;
          icon: string;
          id: string;
          idempotency_key: string | null;
          name: string;
          status: string;
          target_amount: number;
          target_date: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          family_id: string;
          icon?: string;
          id?: string;
          idempotency_key?: string | null;
          name: string;
          status?: string;
          target_amount: number;
          target_date?: string | null;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          description?: string | null;
          family_id?: string;
          icon?: string;
          id?: string;
          idempotency_key?: string | null;
          name?: string;
          status?: string;
          target_amount?: number;
          target_date?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          data: NonNullable<Json>;
          dedupe_key: string;
          entity_id: string;
          entity_type: string;
          family_id: string;
          id: string;
          read_at: string | null;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          data?: NonNullable<Json>;
          dedupe_key: string;
          entity_id: string;
          entity_type: string;
          family_id: string;
          id?: string;
          read_at?: string | null;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: NonNullable<Json>;
          dedupe_key?: string;
          entity_id?: string;
          entity_type?: string;
          family_id?: string;
          id?: string;
          read_at?: string | null;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recurrences: {
        Row: {
          account_id: string;
          amount: number;
          assigned_member_id: string | null;
          category_id: string;
          created_at: string;
          created_by: string;
          description: string;
          end_date: string | null;
          family_id: string;
          frequency: string;
          id: string;
          idempotency_key: string | null;
          interval_count: number;
          is_active: boolean;
          last_failure_at: string | null;
          last_failure_code: string | null;
          next_occurrence_date: string;
          payroll_deduction: boolean;
          start_date: string;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          amount: number;
          assigned_member_id?: string | null;
          category_id: string;
          created_at?: string;
          created_by?: string;
          description: string;
          end_date?: string | null;
          family_id: string;
          frequency: string;
          id?: string;
          idempotency_key?: string | null;
          interval_count?: number;
          is_active?: boolean;
          last_failure_at?: string | null;
          last_failure_code?: string | null;
          next_occurrence_date: string;
          payroll_deduction?: boolean;
          start_date: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          assigned_member_id?: string | null;
          category_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          end_date?: string | null;
          family_id?: string;
          frequency?: string;
          id?: string;
          idempotency_key?: string | null;
          interval_count?: number;
          is_active?: boolean;
          last_failure_at?: string | null;
          last_failure_code?: string | null;
          next_occurrence_date?: string;
          payroll_deduction?: boolean;
          start_date?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurrences_account_fk";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "recurrences_assigned_member_fk";
            columns: ["family_id", "assigned_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "recurrences_category_fk";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "recurrences_created_by_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recurrences_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      security_events: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          metadata: NonNullable<Json>;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "security_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settlements: {
        Row: {
          amount: number;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          family_id: string;
          from_member_id: string;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          settlement_date: string;
          to_member_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          family_id: string;
          from_member_id: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          settlement_date: string;
          to_member_id: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          family_id?: string;
          from_member_id?: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          settlement_date?: string;
          to_member_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "settlements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "settlements_from_member_fk";
            columns: ["family_id", "from_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "settlements_to_member_fk";
            columns: ["family_id", "to_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          amount: number;
          assigned_member_id: string | null;
          category_id: string | null;
          created_at: string;
          created_by: string;
          deleted_at: string | null;
          deleted_by: string | null;
          description: string;
          destination_account_id: string | null;
          due_date: string | null;
          family_id: string;
          id: string;
          idempotency_key: string | null;
          notes: string | null;
          occurrence_date: string | null;
          recurrence_id: string | null;
          reversal_of_id: string | null;
          status: string;
          transaction_date: string;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          amount: number;
          assigned_member_id?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description: string;
          destination_account_id?: string | null;
          due_date?: string | null;
          family_id: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          occurrence_date?: string | null;
          recurrence_id?: string | null;
          reversal_of_id?: string | null;
          status?: string;
          transaction_date: string;
          type: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          assigned_member_id?: string | null;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          description?: string;
          destination_account_id?: string | null;
          due_date?: string | null;
          family_id?: string;
          id?: string;
          idempotency_key?: string | null;
          notes?: string | null;
          occurrence_date?: string | null;
          recurrence_id?: string | null;
          reversal_of_id?: string | null;
          status?: string;
          transaction_date?: string;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_account_fk";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_assigned_member_fk";
            columns: ["family_id", "assigned_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_category_fk";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_created_by_fk";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_destination_account_fk";
            columns: ["family_id", "destination_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_recurrence_fk";
            columns: ["family_id", "recurrence_id"];
            isOneToOne: false;
            referencedRelation: "recurrences";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_reversal_of_fk";
            columns: ["family_id", "reversal_of_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_family_invite: { Args: { p_token: string }; Returns: string };
      account_balances: {
        Args: { p_as_of?: string };
        Returns: {
          account_id: string;
          balance: string;
        }[];
      };
      account_flows: {
        Args: { p_from: string; p_to: string };
        Returns: {
          account_id: string;
          closing: string;
          inflow: string;
          opening: string;
          outflow: string;
        }[];
      };
      budget_progress: {
        Args: { p_from_month: string; p_to_month: string };
        Returns: {
          budget_id: string;
          committed: string;
          month: string;
          spent: string;
        }[];
      };
      cancel_pending_transaction: {
        Args: { p_transaction_id: string };
        Returns: undefined;
      };
      category_totals: {
        Args: { p_from: string; p_to: string; p_type: string };
        Returns: {
          amount: string;
          category_id: string;
        }[];
      };
      change_member_role: {
        Args: { p_member_id: string; p_role: string };
        Returns: string;
      };
      create_family: { Args: { p_name: string }; Returns: string };
      create_family_invite: {
        Args: { p_email?: string; p_role?: string };
        Returns: {
          expires_at: string;
          invite_id: string;
          token: string;
        }[];
      };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: Json };
      get_invite_preview: {
        Args: { p_token: string };
        Returns: {
          email_bound: boolean;
          expires_at: string;
          family_name: string;
          role: string;
          status: string;
        }[];
      };
      goal_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          deposits: string;
          goal_id: string;
          saved: string;
          withdrawals: string;
        }[];
      };
      leave_family: { Args: Record<PropertyKey, never>; Returns: undefined };
      materialize_recurrences: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      member_balances: {
        Args: Record<PropertyKey, never>;
        Returns: {
          amount: string;
          creditor_member_id: string;
          debtor_member_id: string;
        }[];
      };
      member_expense_totals: {
        Args: { p_from: string; p_to: string };
        Returns: {
          amount: string;
          member_id: string;
        }[];
      };
      monthly_cash_flow: {
        Args: { p_from: string; p_to: string };
        Returns: {
          expense: string;
          income: string;
          month: string;
          result: string;
        }[];
      };
      pay_pending_transaction: {
        Args: {
          p_account_id: string;
          p_amount: number;
          p_paid_on: string;
          p_transaction_id: string;
        };
        Returns: undefined;
      };
      pending_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          overdue_count: number;
          overdue_payable: string;
          overdue_receivable: string;
          payable: string;
          receivable: string;
        }[];
      };
      period_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          expense: string;
          income: string;
          result: string;
        }[];
      };
      projected_cash_flow: {
        Args: { p_months: number };
        Returns: {
          month: string;
          pending_expense: string;
          pending_income: string;
          recurring_expense: string;
          recurring_income: string;
        }[];
      };
      refresh_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      remove_family_member: { Args: { p_member_id: string }; Returns: string };
      revoke_family_invite: {
        Args: { p_invite_id: string };
        Returns: undefined;
      };
      set_transaction_splits: {
        Args: { p_mode: string; p_shares: Json; p_transaction_id: string };
        Returns: undefined;
      };
      transfer_ownership: { Args: { p_member_id: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
