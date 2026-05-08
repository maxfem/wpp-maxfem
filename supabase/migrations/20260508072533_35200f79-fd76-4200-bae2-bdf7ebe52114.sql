ALTER TABLE message_templates 
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS preview_text text,
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_text text;

NOTIFY pgrst, 'reload schema';