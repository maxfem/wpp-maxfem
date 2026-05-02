-- Add mobile-specific columns to popups table
ALTER TABLE public.popups 
ADD COLUMN IF NOT EXISTS html_mobile TEXT,
ADD COLUMN IF NOT EXISTS design_mobile JSONB;

-- Comment to explain the columns
COMMENT ON COLUMN public.popups.html_mobile IS 'HTML content specifically for mobile devices';
COMMENT ON COLUMN public.popups.design_mobile IS 'GrapesJS JSON design state specifically for mobile devices';
