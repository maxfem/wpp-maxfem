
-- Enrich orders table with tracking and payment fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS delivery_estimate timestamp with time zone,
  ADD COLUMN IF NOT EXISTS payment_summary jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS items_summary jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS status_alias text;

-- Add document column to customers for normalized CPF
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS document text;

-- Index for fast CPF lookups
CREATE INDEX IF NOT EXISTS idx_customers_document ON public.customers (document) WHERE document IS NOT NULL;

-- Index for order_number lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders (order_number) WHERE order_number IS NOT NULL;

-- Allow tenant members to update orders (currently missing)
CREATE POLICY "Members can update orders"
  ON public.orders
  FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids(auth.uid())));

-- Service role full access on orders
CREATE POLICY "Service role full access on orders"
  ON public.orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
