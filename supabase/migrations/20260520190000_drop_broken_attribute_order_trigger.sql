-- ============================================================
-- Remove o trigger quebrado attribute_order_on_insert.
-- ------------------------------------------------------------
-- A função attribute_order_to_campaign fazia, em todo INSERT de orders:
--   INSERT INTO campaign_activities (...) ON CONFLICT (campaign_id, customer_id) ...
-- mas o índice único real de campaign_activities é
--   (campaign_id, customer_id, channel)  — uq_campaign_activities_campaign_customer_channel
-- (multi-canal: o mesmo cliente tem activity de e-mail E de whatsapp na mesma
-- campanha, então (campaign_id, customer_id) não é único e nunca poderá ser).
--
-- Resultado: todo INSERT em orders de um cliente que clicou num link rastreado
-- nos últimos 7 dias falhava com 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") — bloqueando silenciosamente o
-- import de pedidos de campanha (e a atribuição de conversão) desde ~14/05.
--
-- A atribuição de conversão de verdade é feita pelo attributeConversions() da
-- edge function yampi-sync (last-touch, UTM + janela de clique). Este trigger
-- era legado, cru (canal 'email' hardcoded) e redundante. Removido.
-- ============================================================

DROP TRIGGER IF EXISTS attribute_order_on_insert ON public.orders;
DROP FUNCTION IF EXISTS public.attribute_order_to_campaign();
