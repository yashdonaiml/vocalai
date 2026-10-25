// Client-safe provider catalog. aviroh's own vocabulary: no vendor SDK types leak here.
export type ProviderId = "openai" | "anthropic" | "google" | "deepgram" | "elevenlabs" | "cartesia";
export type Capability = "llm" | "embedding" | "stt" | "tts" | "realtime";

export const PROVIDERS: { id: ProviderId; label: string; caps: Capability[]; env: string }[] = [
  { id: "openai", label: "OpenAI", caps: ["llm", "embedding", "realtime", "stt", "tts"], env: "OPENAI_API_KEY" },
  { id: "anthropic", label: "Anthropic", caps: ["llm"], env: "ANTHROPIC_API_KEY" },
  { id: "google", label: "Google Gemini", caps: ["llm", "embedding", "realtime"], env: "GOOGLE_API_KEY" },
  { id: "deepgram", label: "Deepgram", caps: ["stt", "tts"], env: "DEEPGRAM_API_KEY" },
  { id: "elevenlabs", label: "ElevenLabs", caps: ["tts"], env: "ELEVENLABS_API_KEY" },
  { id: "cartesia", label: "Cartesia", caps: ["tts"], env: "CARTESIA_API_KEY" },
];

export const MODELS: Record<Capability, { provider: ProviderId; id: string; label: string }[]> = {
  realtime: [
    { provider: "openai", id: "gpt-realtime", label: "OpenAI Realtime" },
    { provider: "google", id: "gemini-2.5-flash-native-audio-preview-09-2025", label: "Gemini Live (native audio)" },
  ],
  llm: [
    { provider: "openai", id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { provider: "openai", id: "gpt-4.1", label: "GPT-4.1" },
    { provider: "anthropic", id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { provider: "google", id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite" },
    { provider: "google", id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  ],
  stt: [
    { provider: "deepgram", id: "nova-3", label: "Deepgram Nova-3" },
    { provider: "openai", id: "gpt-4o-transcribe", label: "OpenAI Transcribe" },
  ],
  tts: [
    { provider: "elevenlabs", id: "eleven_flash_v2_5", label: "ElevenLabs Flash" },
    { provider: "cartesia", id: "sonic-3.6", label: "Cartesia Sonic 3.6" },
    { provider: "deepgram", id: "aura-2", label: "Deepgram Aura" },
    { provider: "openai", id: "gpt-4o-mini-tts", label: "OpenAI TTS" },
  ],
  embedding: [
    { provider: "openai", id: "text-embedding-3-large", label: "OpenAI text-embedding-3-large (3072)" },
    { provider: "google", id: "gemini-embedding-001", label: "Gemini embedding (3072)" },
  ],
};

export const REALTIME_VOICES: Record<string, string[]> = {
  openai: ["marin", "cedar", "alloy", "ash", "coral", "sage", "verse"],
  google: ["Puck", "Charon", "Kore", "Fenrir", "Aoede"],
};

export const providerLabel = (id: string) => PROVIDERS.find((p) => p.id === id)?.label ?? id;
