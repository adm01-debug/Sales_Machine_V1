import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractVariables, unknownVariables } from "@/lib/template-vars";
import { CHANNELS } from "@/lib/audience-rules";

/** CRUD + envio de teste dos templates da Biblioteca (todos os canais). */

const RcsPayload = z
  .object({
    type: z.literal("rich_card").default("rich_card"),
    title: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    image_url: z.string().url().optional(),
    suggestions: z
      .array(
        z.object({
          type: z.enum(["reply", "openUrl", "dial"]),
          text: z.string().min(1).max(25),
          url: z.string().url().optional(),
          phone: z.string().optional(),
        }),
      )
      .max(4)
      .default([]),
  })
  .strict();

const BaseTemplate = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(CHANNELS),
  subject: z.string().trim().max(200).nullish(),
  body: z.string().trim().min(1).max(4000),
  media_url: z.string().url().nullish(),
  rcs_payload: RcsPayload.nullish(),
  email_blocks: z.array(z.record(z.string(), z.unknown())).max(60).nullish(),
  variables: z.array(z.string()).default([]).optional(),
});

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_templates")
      .select(
        "id, name, channel, subject, body, media_url, rcs_payload, email_blocks, variables, archived, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    BaseTemplate.extend({ id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.channel === "mms" && !data.media_url) {
      throw new Error("MMS requer media_url");
    }
    if (data.channel === "rcs" && !data.rcs_payload) {
      throw new Error("RCS requer rcs_payload");
    }
    if (data.channel === "email" && !data.subject?.trim()) {
      throw new Error("Templates de e-mail exigem assunto");
    }
    const unknown = unknownVariables(`${data.subject ?? ""}\n${data.body}`);
    if (unknown.length > 0) {
      throw new Error(`Variáveis desconhecidas: ${unknown.map((v) => `{{${v}}}`).join(", ")}`);
    }
    const row = {
      name: data.name,
      channel: data.channel,
      subject: data.channel === "email" ? (data.subject ?? null) : null,
      body: data.body,
      media_url: data.media_url ?? null,
      rcs_payload: (data.rcs_payload ?? null) as never,
      email_blocks: (data.channel === "email" ? (data.email_blocks ?? null) : null) as never,
      variables: extractVariables(`${data.subject ?? ""}\n${data.body}`) as never,
      created_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("message_templates")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("message_templates")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const archiveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_templates")
      .update({ archived: data.archived })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase
      .from("message_templates")
      .select("name, channel, subject, body, media_url, rcs_payload, email_blocks, variables")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const { data: created, error: insErr } = await context.supabase
      .from("message_templates")
      .insert({
        name: `${src.name} (cópia)`,
        channel: src.channel,
        subject: src.subject,
        body: src.body,
        media_url: src.media_url,
        rcs_payload: src.rcs_payload as never,
        email_blocks: src.email_blocks as never,
        variables: src.variables as never,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    return { id: created.id };
  });

/** Envia mensagem de teste para um entity específico via SINGU. */
export const sendTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity_id: z.string().uuid(),
        channel: z.enum(["sms", "rcs", "mms"]),
        body: z.string().min(1).max(1000),
        media_url: z.string().url().nullish(),
        rcs_payload: RcsPayload.nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: ent, error } = await context.supabase
      .from("entity_map")
      .select("id, singu_id")
      .eq("id", data.entity_id)
      .maybeSingle();
    if (error || !ent) throw new Error("entity não encontrada");
    if (!ent.singu_id) throw new Error("entity sem mapeamento SINGU");

    const { singuClient } = await import("@/integrations/external/singu.server");
    try {
      if (data.channel === "sms") {
        await singuClient.sendSms({ contact_id: ent.singu_id, message: data.body });
      } else if (data.channel === "mms") {
        if (!data.media_url) throw new Error("MMS requer media_url");
        await singuClient.sendMms({
          contact_id: ent.singu_id,
          message: data.body,
          media_url: data.media_url,
        });
      } else {
        await singuClient.sendRcs({
          contact_id: ent.singu_id,
          message: data.body,
          rcs_payload: (data.rcs_payload ?? undefined) as Record<string, unknown> | undefined,
        });
      }
      await context.supabase.from("contact_touchpoints").insert({
        entity_id: ent.id,
        channel: data.channel as never,
        direction: "outbound",
        status: "sent",
        payload: {
          message: data.body,
          media_url: data.media_url ?? null,
          rcs_payload: data.rcs_payload ?? null,
          test_send: true,
        } as never,
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });

/** URL assinada de 60 minutos para leitura de mídia no bucket message-media. */
export const getMediaSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("message-media")
      .createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });