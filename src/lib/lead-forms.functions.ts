import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { leadFormSchema } from "@/lib/lead-forms";

const slugInput = z.object({ slug: z.string().min(2).max(63) });

export const getPublicLeadForm = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => slugInput.parse(input))
  .handler(async ({ data }) => {
    const { publicDb } = await import("@/lib/supabase-public.server");
    const { data: form } = await publicDb()
      .from("lead_forms")
      .select("slug, title, description, fields, submit_label, success_message, consent_text, double_opt_in")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    return form ?? null;
  });

export const submitLeadForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(2).max(63),
        values: z.record(z.string(), z.unknown()).default({}),
        consent: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { handleSubmission }, { deliverConfirmation }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/lead-forms.server"),
      import("@/lib/lead-forms-delivery.server"),
    ]);
    const outcome = await handleSubmission(supabaseAdmin, {
      slug: data.slug,
      values: data.values,
      consent: data.consent,
    });
    if (outcome.status === "pending" && outcome.confirmToken) {
      await deliverConfirmation(supabaseAdmin, outcome.submissionId!, outcome.confirmToken);
    }
    return { status: outcome.status, message: outcome.message, errors: outcome.errors ?? {} };
  });

export const confirmLeadForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(16).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const [{ supabaseAdmin }, { confirmByToken }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/lead-forms.server"),
    ]);
    return confirmByToken(supabaseAdmin, data.token);
  });

export const listLeadForms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lead_forms")
      .select("id, slug, name, status, channel, double_opt_in, journey_id, submission_count, updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getLeadForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: form, error } = await context.supabase
      .from("lead_forms")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!form) throw new Error("Formulário não encontrado");
    const { data: submissions } = await context.supabase
      .from("lead_form_submissions")
      .select("id, email, full_name, company_name, status, created_at, confirmed_at")
      .eq("form_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { form, submissions: submissions ?? [] };
  });

export const saveLeadForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().nullable().default(null), form: leadFormSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = { ...data.form, created_by: context.userId };
    if (data.id) {
      const { error } = await context.supabase.from("lead_forms").update(data.form).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("lead_forms")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });