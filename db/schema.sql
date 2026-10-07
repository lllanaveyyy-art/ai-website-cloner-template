CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  name text NOT NULL,
  company text NOT NULL,
  email text NOT NULL,
  phone text,
  company_size integer,
  service_needed text NOT NULL,
  budget_range text,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'Needs Review',
  request_type text,
  urgency text NOT NULL DEFAULT 'Normal',
  estimated_value text NOT NULL DEFAULT 'Unknown',
  department text NOT NULL DEFAULT 'General',
  ai_summary text,
  recommended_action text,
  priority text NOT NULL DEFAULT 'Normal' CHECK (priority IN ('High','Normal','Low')),
  pipeline_stage text NOT NULL DEFAULT 'New' CHECK (pipeline_stage IN ('New','Qualified','Contacted','Discovery','Proposal','Won','Lost')),
  workflow_state text NOT NULL DEFAULT 'Pending' CHECK (workflow_state IN ('Pending','Running','Completed','Failed','Partially Completed')),
  ai_status text NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','completed','failed','fallback')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'public_form',
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Running','Completed','Failed','Partially Completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  error_summary text,
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_name text NOT NULL,
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Running','Completed','Failed','Skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  output_summary text,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, step_key, attempt)
);

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  author_email text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('Admin','Manager')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'initial',
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  reason text NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, kind)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('high_priority','workflow_failed','follow_up_overdue','system')),
  title text NOT NULL,
  body text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (email_type IN ('customer_confirmation','manager_notification','follow_up_reminder')),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending_setup' CHECK (status IN ('pending_setup','pending','sent','failed')),
  provider_message_id text,
  error_message text,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_workflow_state ON leads(workflow_state);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_lead ON workflow_runs(lead_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(status, due_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_search ON leads USING gin (
  to_tsvector('english', coalesce(name,'') || ' ' || coalesce(company,'') || ' ' || coalesce(email,'') || ' ' || coalesce(ai_summary,''))
);
