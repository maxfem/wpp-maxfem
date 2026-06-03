-- Tabela partner_signups
-- Cadastros do programa institucional de parceria científica
-- (LP: maxfem.tech/parceiras — Programa para Nutricionistas)

CREATE TABLE IF NOT EXISTS public.partner_signups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  program           TEXT NOT NULL,                       -- ex.: parceria_cientifica_nutricionistas
  -- Dados profissionais
  name              TEXT NOT NULL,
  crn               TEXT NOT NULL,                       -- ex.: CRN-3 12345
  cpf               TEXT NOT NULL,                       -- 000.000.000-00
  email             TEXT NOT NULL,
  whatsapp          TEXT NOT NULL,
  instagram         TEXT,
  area              TEXT NOT NULL,                       -- saude_mulher, gestacao, climaterio, ...
  patients_range    TEXT NOT NULL,                       -- ate_20, 21_50, 51_100, mais_100
  motivation        TEXT,
  -- Consentimentos (auditoria LGPD/CFN)
  accept_regulation BOOLEAN NOT NULL DEFAULT FALSE,
  accept_ethics     BOOLEAN NOT NULL DEFAULT FALSE,
  accept_lgpd       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Status do fluxo
  status            TEXT NOT NULL DEFAULT 'pending_crn_validation'
                    CHECK (status IN ('pending_crn_validation','approved','rejected','ended')),
  status_reason     TEXT,
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  -- Tracking
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  ip                INET,
  user_agent        TEXT,
  -- Metadados
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Anti-duplicidade por tenant
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, crn)
);

CREATE INDEX idx_partner_signups_tenant_status ON public.partner_signups(tenant_id, status);
CREATE INDEX idx_partner_signups_program       ON public.partner_signups(program);
CREATE INDEX idx_partner_signups_created       ON public.partner_signups(created_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_partner_signups_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_partner_signups_updated_at
BEFORE UPDATE ON public.partner_signups
FOR EACH ROW EXECUTE FUNCTION public.tg_partner_signups_set_updated_at();

-- RLS
ALTER TABLE public.partner_signups ENABLE ROW LEVEL SECURITY;

-- Membros do tenant podem ler e gerenciar
CREATE POLICY partner_signups_tenant_select
  ON public.partner_signups FOR SELECT
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY partner_signups_tenant_update
  ON public.partner_signups FOR UPDATE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY partner_signups_tenant_delete
  ON public.partner_signups FOR DELETE
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Inserções vêm SEMPRE via edge function partner-signup com service-role key
-- (formulário público anônimo). Não criamos policy INSERT — service-role bypassa RLS.

COMMENT ON TABLE  public.partner_signups
  IS 'Cadastros do programa institucional de parceria científica (formulário público em /parceiras). Insert via edge function partner-signup com service-role.';
COMMENT ON COLUMN public.partner_signups.program
  IS 'Identificador do programa (ex.: parceria_cientifica_nutricionistas). Permite múltiplos programas no futuro.';
COMMENT ON COLUMN public.partner_signups.status
  IS 'pending_crn_validation → approved/rejected; approved → ended (quando parceira encerra)';
