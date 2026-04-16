
-- First delete duplicate failed entries (keep latest per customer)
DELETE FROM automation_queue
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id, campaign_id, trigger_type ORDER BY created_at DESC) as rn
    FROM automation_queue
    WHERE campaign_id = 'e8f2394d-8a95-45ca-886d-e2c312486ced'
      AND status = 'failed'
      AND current_node_id = 'wa2'
  ) sub
  WHERE rn > 1
);

-- Now reset remaining failed items to pending
UPDATE automation_queue 
SET status = 'pending', processed_at = NULL, scheduled_for = NULL
WHERE campaign_id = 'e8f2394d-8a95-45ca-886d-e2c312486ced' 
  AND status = 'failed' 
  AND current_node_id = 'wa2';
