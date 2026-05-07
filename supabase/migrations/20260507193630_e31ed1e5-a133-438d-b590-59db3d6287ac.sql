-- Create automations table
CREATE TABLE IF NOT EXISTS public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  trigger jsonb NOT NULL,
  steps jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  stats_total_runs int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Ensure RLS is enabled for automations
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

-- Create policies for automations (using service role in code, but keeping RLS safe)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automations' AND policyname = 'Users can view their own tenant automations') THEN
        CREATE POLICY "Users can view their own tenant automations" ON public.automations FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automations' AND policyname = 'Users can insert their own tenant automations') THEN
        CREATE POLICY "Users can insert their own tenant automations" ON public.automations FOR INSERT WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS automations_tenant_idx ON public.automations(tenant_id, status);

-- Fix popups table: add status if missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='status') THEN
        ALTER TABLE public.popups ADD COLUMN status text NOT NULL DEFAULT 'draft';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='trigger') THEN
        ALTER TABLE public.popups ADD COLUMN trigger text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='trigger_value') THEN
        ALTER TABLE public.popups ADD COLUMN trigger_value numeric;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='pages') THEN
        ALTER TABLE public.popups ADD COLUMN pages text[] DEFAULT ARRAY['/*'];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='display_max_per_visitor') THEN
        ALTER TABLE public.popups ADD COLUMN display_max_per_visitor int DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='content') THEN
        ALTER TABLE public.popups ADD COLUMN content jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='style') THEN
        ALTER TABLE public.popups ADD COLUMN style jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='starts_at') THEN
        ALTER TABLE public.popups ADD COLUMN starts_at timestamptz;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='popups' AND column_name='ends_at') THEN
        ALTER TABLE public.popups ADD COLUMN ends_at timestamptz;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS popups_tenant_idx ON public.popups(tenant_id, status);
