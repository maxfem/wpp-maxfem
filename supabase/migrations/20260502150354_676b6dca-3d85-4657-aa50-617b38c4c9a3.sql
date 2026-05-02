-- Backfill html_mobile/design_mobile from desktop when empty or still default placeholder template
UPDATE public.popups
SET 
  html_mobile = html,
  design_mobile = design,
  updated_at = now()
WHERE 
  html IS NOT NULL
  AND length(html) > 100
  AND (
    html_mobile IS NULL
    OR length(coalesce(html_mobile, '')) < 200
    OR html_mobile ILIKE '%Título do seu Pop-up%'
    OR html_mobile ILIKE '%Cadastrar%' AND html_mobile ILIKE '%Seu nome%' AND html_mobile ILIKE '%Seu e-mail%'
  );