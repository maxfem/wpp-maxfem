ALTER TABLE message_templates 
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS body_text text,
  ADD COLUMN IF NOT EXISTS preview_text text;

NOTIFY pgrst, 'reload schema';