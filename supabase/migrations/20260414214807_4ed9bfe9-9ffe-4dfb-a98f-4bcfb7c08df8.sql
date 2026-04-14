
CREATE UNIQUE INDEX idx_aq_unique_trigger 
  ON automation_queue (customer_id, campaign_id, trigger_type, COALESCE((trigger_data->>'yampi_order_id'), id::text))
  WHERE status NOT IN ('skipped');
