
-- Create whatsapp_messages table
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'template', 'interactive', 'reaction', 'location')),
  content TEXT,
  media_url TEXT,
  wamid TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'sent', 'delivered', 'read', 'failed')),
  template_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_whatsapp_messages_tenant ON public.whatsapp_messages(tenant_id);
CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX idx_whatsapp_messages_customer ON public.whatsapp_messages(customer_id);
CREATE INDEX idx_whatsapp_messages_wamid ON public.whatsapp_messages(wamid);
CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant members can view messages"
  ON public.whatsapp_messages FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can insert messages"
  ON public.whatsapp_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant members can update messages"
  ON public.whatsapp_messages FOR UPDATE
  TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Service role can insert (for webhook)
CREATE POLICY "Service role full access"
  ON public.whatsapp_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
