-- Trigger to attribute sales to campaigns
CREATE OR REPLACE FUNCTION public.attribute_order_to_campaign()
RETURNS TRIGGER AS $$
DECLARE
  v_link_id UUID;
  v_campaign_id UUID;
  v_customer_id UUID;
BEGIN
  -- Find the most recent click for this customer in the last 7 days
  -- We join tracked_links with link_clicks to find when they actually clicked
  SELECT tl.id, tl.campaign_id, tl.customer_id
  INTO v_link_id, v_campaign_id, v_customer_id
  FROM public.tracked_links tl
  JOIN public.link_clicks lc ON lc.link_id = tl.id
  WHERE tl.customer_id = NEW.customer_id
    AND tl.tenant_id = NEW.tenant_id
    AND lc.clicked_at >= (NEW.created_at - INTERVAL '7 days')
    AND lc.clicked_at <= NEW.created_at
  ORDER BY lc.clicked_at DESC
  LIMIT 1;

  IF v_campaign_id IS NOT NULL THEN
    -- Update campaign_activities with conversion data
    -- We use upsert-like logic to ensure the record exists (it should, as the message was sent)
    INSERT INTO public.campaign_activities (
      campaign_id, customer_id, tenant_id, channel, status, converted_at, conversion_value, attribution_order_id
    )
    VALUES (
      v_campaign_id, v_customer_id, NEW.tenant_id, 'email', 'sent', NEW.created_at, NEW.total, NEW.id
    )
    ON CONFLICT (campaign_id, customer_id)
    DO UPDATE SET 
      converted_at = EXCLUDED.converted_at,
      conversion_value = COALESCE(public.campaign_activities.conversion_value, 0) + EXCLUDED.conversion_value,
      attribution_order_id = EXCLUDED.attribution_order_id,
      status = 'converted';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS attribute_order_on_insert ON public.orders;

-- Create trigger for automatic attribution
CREATE TRIGGER attribute_order_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.attribute_order_to_campaign();
