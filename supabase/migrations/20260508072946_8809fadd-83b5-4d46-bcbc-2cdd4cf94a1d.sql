ALTER TABLE message_templates ALTER COLUMN body DROP NOT NULL;
ALTER TABLE message_templates ALTER COLUMN body SET DEFAULT '';

NOTIFY pgrst, 'reload schema';