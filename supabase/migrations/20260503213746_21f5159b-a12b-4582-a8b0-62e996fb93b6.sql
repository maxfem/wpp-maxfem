-- Dedupe existing duplicates keeping most recent per (campaign_id, customer_id)
DELETE FROM campaign_activities a USING campaign_activities b
WHERE a.campaign_id = b.campaign_id
  AND a.customer_id = b.customer_id
  AND a.ctid < b.ctid;

-- Unique index to enable upsert onConflict
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_activities_campaign_customer
  ON public.campaign_activities (campaign_id, customer_id);

-- Backfill from email_logs for past sends (idempotent)
INSERT INTO campaign_activities (tenant_id, campaign_id, customer_id, status, channel, sent_at)
SELECT DISTINCT ON (el.campaign_id, el.customer_id)
  el.tenant_id, el.campaign_id, el.customer_id,
  CASE WHEN el.status = 'sent' THEN 'sent' ELSE el.status END,
  'email', el.sent_at
FROM email_logs el
WHERE el.campaign_id IS NOT NULL AND el.customer_id IS NOT NULL
ORDER BY el.campaign_id, el.customer_id, el.sent_at DESC NULLS LAST
ON CONFLICT (campaign_id, customer_id) DO UPDATE
  SET sent_at = COALESCE(campaign_activities.sent_at, EXCLUDED.sent_at),
      status = CASE WHEN campaign_activities.status IS NULL OR campaign_activities.status = 'pending'
                    THEN EXCLUDED.status ELSE campaign_activities.status END,
      channel = COALESCE(campaign_activities.channel, EXCLUDED.channel);