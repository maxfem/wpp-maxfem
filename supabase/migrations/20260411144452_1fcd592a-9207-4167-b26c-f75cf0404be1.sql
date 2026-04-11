ALTER TABLE public.campaign_activities
ADD COLUMN attribution_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;