-- Allow multiple channels per (campaign, customer) — fixes WhatsApp+email coexistence
ALTER TABLE campaign_activities DROP CONSTRAINT IF EXISTS uq_campaign_activities_campaign_customer;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_campaign_activities_campaign_customer_channel'
  ) THEN
    ALTER TABLE campaign_activities ADD CONSTRAINT uq_campaign_activities_campaign_customer_channel
      UNIQUE (campaign_id, customer_id, channel);
  END IF;
END $$;
