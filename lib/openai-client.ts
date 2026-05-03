import OpenAI from "openai";

let cached: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NVIDIA_API_KEY is not set. Copy .env.example to .env.local and add your key.",
    );
  }
  const baseURL =
    process.env.NVIDIA_API_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  cached = new OpenAI({
    apiKey,
    baseURL,
  });
  return cached;
}

export function getChatModel(): string {
  return process.env.NVIDIA_CHAT_MODEL ?? "moonshotai/kimi-k2-instruct";
}
