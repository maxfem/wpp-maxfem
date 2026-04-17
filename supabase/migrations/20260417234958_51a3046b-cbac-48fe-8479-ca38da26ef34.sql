-- Backfill: rewrite all tracking_url to canonical maxfem domain whenever tracking_code is present.
-- Removes Loggi/Correios/Jadlog/etc URLs that polluted historical data.
UPDATE public.orders
SET tracking_url = 'http://rastreio.maxfem.com.br/' || tracking_code,
    updated_at = now()
WHERE tracking_code IS NOT NULL
  AND tracking_code <> ''
  AND (tracking_url IS NULL OR tracking_url <> ('http://rastreio.maxfem.com.br/' || tracking_code));