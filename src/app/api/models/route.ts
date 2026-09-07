import { toProviderError } from "@/lib/ai";
import type { ProviderConfig } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface RemoteModel {
  id: string;
  label: string;
  note?: string;
}

function openAiBase(config: ProviderConfig): string {
  if (config.provider === "openai") return "https://api.openai.com/v1";
  const raw = (config.baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("กรุณาระบุ Base URL ของผู้ให้บริการ");
  return /\/v\d+$/.test(raw) ? raw : `${raw}/v1`;
}

async function readError(res: Response): Promise<never> {
  const body = (await res.text()).slice(0, 300);
  throw Object.assign(new Error(body), { status: res.status });
}

/* -------------------------------- providers ------------------------------- */

async function anthropicModels(config: ProviderConfig): Promise<RemoteModel[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) await readError(res);

  const json = (await res.json()) as {
    data?: { id: string; display_name?: string }[];
  };
  return (json.data ?? []).map((m) => ({
    id: m.id,
    label: m.display_name || m.id,
  }));
}

async function googleModels(config: ProviderConfig): Promise<RemoteModel[]> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" +
    encodeURIComponent(config.apiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) await readError(res);

  const json = (await res.json()) as {
    models?: {
      name: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }[];
  };

  return (json.models ?? [])
    // Only models this key can actually generate text with.
    .filter((m) =>
      (m.supportedGenerationMethods ?? []).some(
        (method) => method === "generateContent" || method === "streamGenerateContent",
      ),
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      label: m.displayName || m.name.replace(/^models\//, ""),
      note: m.description?.slice(0, 90),
    }))
    // Embedding / vision-only variants are noise for a translation app.
    .filter((m) => !/embedding|aqa|imagen|veo|tts|image-generation/i.test(m.id));
}

async function openAiModels(config: ProviderConfig): Promise<RemoteModel[]> {
  const res = await fetch(`${openAiBase(config)}/models`, {
    headers: { authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) await readError(res);

  const json = (await res.json()) as {
    data?: { id: string; name?: string; description?: string }[];
  };

  return (json.data ?? [])
    .map((m) => ({ id: m.id, label: m.name || m.id, note: m.description?.slice(0, 90) }))
    .filter((m) => !/embedding|whisper|tts|dall-e|moderation|image/i.test(m.id));
}

/* --------------------------------- handler -------------------------------- */

export async function POST(req: Request) {
  let config: ProviderConfig;
  try {
    ({ config } = (await req.json()) as { config: ProviderConfig });
  } catch {
    return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });
  }

  if (!config?.apiKey) {
    return Response.json({ error: "ใส่ API Key ก่อนจึงจะดึงรายชื่อโมเดลได้" }, { status: 401 });
  }

  try {
    let models: RemoteModel[];
    switch (config.provider) {
      case "anthropic":
        models = await anthropicModels(config);
        break;
      case "google":
        models = await googleModels(config);
        break;
      default:
        models = await openAiModels(config);
    }

    models.sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({ models });
  } catch (e) {
    const err = toProviderError(e);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
