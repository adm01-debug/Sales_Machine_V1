
CREATE TYPE public.sm_cadence_preset AS ENUM ('aggressive','standard','enterprise','custom');

ALTER TABLE public.cadence_rules
  ADD COLUMN preset public.sm_cadence_preset NOT NULL DEFAULT 'custom';

ALTER TABLE public.campaigns_orchestration
  ADD COLUMN cadence_preset public.sm_cadence_preset NOT NULL DEFAULT 'standard';

-- Seed 3 presets globais (owner_id NULL = disponíveis para todos)
ALTER TABLE public.cadence_rules ALTER COLUMN owner_id DROP NOT NULL;

INSERT INTO public.cadence_rules (name, description, preset, steps, is_active)
VALUES
  ('Preset: Aggressive (5 dias)', 'Sequência curta e agressiva para leads quentes', 'aggressive',
   '[{"channel":"whatsapp","delay_days":0},{"channel":"whatsapp","delay_days":1},{"channel":"email","delay_days":2},{"channel":"sms","delay_days":3},{"channel":"whatsapp","delay_days":5}]'::jsonb, true),
  ('Preset: Standard (10 dias)', 'Cadência multicanal balanceada', 'standard',
   '[{"channel":"whatsapp","delay_days":0},{"channel":"email","delay_days":2},{"channel":"linkedin","delay_days":4},{"channel":"sms","delay_days":7},{"channel":"instagram","delay_days":10}]'::jsonb, true),
  ('Preset: Enterprise (21 dias)', 'Cadência longa e consultiva para contas grandes', 'enterprise',
   '[{"channel":"email","delay_days":0},{"channel":"linkedin","delay_days":3},{"channel":"email","delay_days":7},{"channel":"whatsapp","delay_days":12},{"channel":"linkedin","delay_days":17},{"channel":"email","delay_days":21}]'::jsonb, true);

-- Policy: presets globais são legíveis por todos autenticados
CREATE POLICY "cadence presets readable by all authed"
  ON public.cadence_rules FOR SELECT TO authenticated
  USING (owner_id IS NULL OR owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
