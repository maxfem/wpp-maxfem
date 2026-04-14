
ALTER TABLE public.automation_queue
  ADD COLUMN IF NOT EXISTS current_node_id text DEFAULT 'start',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Index for efficient queue processing: find pending items ready to process
CREATE INDEX IF NOT EXISTS idx_automation_queue_scheduled
  ON public.automation_queue (status, scheduled_for)
  WHERE status = 'pending';
