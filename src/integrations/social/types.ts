/**
 * Adapter pattern para envio em canais sociais (LinkedIn/Instagram).
 * Cada implementação encapsula a comunicação com um provedor específico
 * (Unipile, Phantombuster, etc). A fábrica lê env/flags para escolher.
 */
export type SocialChannel = "linkedin" | "instagram";

export interface SocialSendInput {
  entity_id: string;
  recipient_handle?: string;
  message: string;
}

export interface SocialSendResult {
  status: "sent" | "pending_provider" | "failed";
  provider: string;
  provider_message_id?: string;
  error?: string;
}

export interface SocialSender {
  readonly provider: string;
  send(channel: SocialChannel, input: SocialSendInput): Promise<SocialSendResult>;
}

class StubSocialSender implements SocialSender {
  readonly provider = "stub";
  async send(_channel: SocialChannel, _input: SocialSendInput): Promise<SocialSendResult> {
    return { status: "pending_provider", provider: this.provider };
  }
}

class UnipileSender implements SocialSender {
  readonly provider = "unipile";
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}
  async send(channel: SocialChannel, input: SocialSendInput): Promise<SocialSendResult> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-API-KEY": this.apiKey,
        },
        body: JSON.stringify({
          provider: channel,
          recipient: input.recipient_handle,
          text: input.message,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        return {
          status: "failed",
          provider: this.provider,
          error: `${res.status} ${t.slice(0, 200)}`,
        };
      }
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { status: "sent", provider: this.provider, provider_message_id: body.id };
    } catch (err) {
      return {
        status: "failed",
        provider: this.provider,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

class PhantombusterSender implements SocialSender {
  readonly provider = "phantombuster";
  constructor(private readonly _apiKey: string) {}
  async send(_channel: SocialChannel, _input: SocialSendInput): Promise<SocialSendResult> {
    // Skeleton — Phantombuster exige agents pré-configurados por canal.
    return { status: "pending_provider", provider: this.provider };
  }
}

/** Fábrica: escolhe implementação por env. Sem provider configurado → stub. */
export function getSocialSender(channel: SocialChannel): SocialSender {
  const unipileUrl = process.env.UNIPILE_URL;
  const unipileKey = process.env.UNIPILE_API_KEY;
  if (unipileUrl && unipileKey) return new UnipileSender(unipileUrl, unipileKey);
  const pbKey = process.env.PHANTOMBUSTER_API_KEY;
  if (pbKey) return new PhantombusterSender(pbKey);
  void channel;
  return new StubSocialSender();
}
