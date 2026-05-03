import OpenAI from "openai";

const cachedClients = new Map<string, OpenAI>();
let nextKeyIndex = 0;
const throttleChains = new Map<string, Promise<void>>();
const nextAvailableAtByKey = new Map<string, number>();

function splitKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getNvidiaKeys(): string[] {
  const keys = [process.env.NVIDIA_API_KEY?.trim(), ...splitKeys(process.env.NVIDIA_API_KEYS)]
    .filter((key): key is string => Boolean(key));
  return Array.from(new Set(keys));
}

function getRequestDelayMs(): number {
  const raw = Number.parseInt(process.env.NVIDIA_REQUEST_DELAY_MS ?? "1200", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function getOpenAIClient(): OpenAI {
  const { apiKey } = reserveNvidiaKey();
  return getOpenAIClientForKey(apiKey);
}

function getOpenAIClientForKey(apiKey: string): OpenAI {
  const cached = cachedClients.get(apiKey);
  if (cached) return cached;

  const baseURL =
    process.env.NVIDIA_API_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  const client = new OpenAI({
    apiKey,
    baseURL,
  });
  cachedClients.set(apiKey, client);
  return client;
}

export function reserveNvidiaKey(): { apiKey: string; keyNumber: number; keyCount: number } {
  const keys = getNvidiaKeys();
  if (keys.length === 0) {
    throw new Error(
      "NVIDIA_API_KEY or NVIDIA_API_KEYS is not set. Copy .env.example to .env.local and add your key.",
    );
  }
  const keyNumber = (nextKeyIndex % keys.length) + 1;
  const apiKey = keys[nextKeyIndex % keys.length];
  nextKeyIndex += 1;
  return { apiKey, keyNumber, keyCount: keys.length };
}

export function getChatModel(): string {
  return process.env.NVIDIA_CHAT_MODEL ?? "moonshotai/kimi-k2-instruct";
}

export async function getThrottledOpenAIClient(): Promise<OpenAI> {
  const { apiKey } = reserveNvidiaKey();
  await waitForNvidiaRequestSlot(apiKey);
  return getOpenAIClientForKey(apiKey);
}

async function waitForNvidiaRequestSlot(apiKey: string): Promise<void> {
  const delayMs = getRequestDelayMs();
  if (delayMs <= 0) return;

  const previous = throttleChains.get(apiKey) ?? Promise.resolve();
  const next = previous.then(async () => {
    const now = Date.now();
    const availableAt = nextAvailableAtByKey.get(apiKey) ?? now;
    const waitMs = Math.max(0, availableAt - now);
    nextAvailableAtByKey.set(apiKey, Math.max(now, availableAt) + delayMs);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  });
  throttleChains.set(apiKey, next.catch(() => undefined));
  await next;
}
