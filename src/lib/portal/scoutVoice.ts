import OpenAI from "openai";
import { getEnv } from "./env";

export const SCOUT_VOICE_OPTIONS = [
  {
    id: "marin",
    label: "Marin",
    description: "Warm, modern, and natural. Best default for Scout in client meetings.",
    instructions: "Speak like a calm senior consultant: warm, concise, grounded, and conversational. Avoid announcer energy.",
  },
  {
    id: "cedar",
    label: "Cedar",
    description: "Steadier and more executive. Good for high-trust business reviews.",
    instructions: "Speak with a steady, composed consultant voice. Sound practical, reassuring, and crisp.",
  },
  {
    id: "verse",
    label: "Verse",
    description: "Friendly and responsive. Good when Scout should feel more conversational.",
    instructions: "Speak naturally and lightly, with quick responsiveness and a friendly meeting-assistant tone.",
  },
  {
    id: "sage",
    label: "Sage",
    description: "Soft, patient, and easy to listen to. Good for longer explanations.",
    instructions: "Speak patiently and clearly. Keep the delivery gentle, thoughtful, and easy to follow.",
  },
  {
    id: "coral",
    label: "Coral",
    description: "Bright and polished. Good for onboarding and setup walkthroughs.",
    instructions: "Speak in a polished, positive, helpful tone. Keep it professional, not overly cheerful.",
  },
] as const;

export type ScoutVoiceId = typeof SCOUT_VOICE_OPTIONS[number]["id"];

export function getScoutVoiceOption(voice = getEnv("SCOUT_TTS_VOICE") || "marin") {
  return SCOUT_VOICE_OPTIONS.find((option) => option.id === voice) || SCOUT_VOICE_OPTIONS[0];
}

export async function synthesizeScoutSpeech({
  text,
  voice,
  format = "wav",
}: {
  text: string;
  voice?: string;
  format?: "mp3" | "wav" | "pcm" | "opus";
}) {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY.");

  const selected = getScoutVoiceOption(voice);
  const client = new OpenAI({ apiKey });
  const speech = await client.audio.speech.create({
    model: getEnv("SCOUT_TTS_MODEL") || "gpt-4o-mini-tts",
    voice: selected.id,
    input: text,
    instructions: getEnv("SCOUT_TTS_INSTRUCTIONS") || selected.instructions,
    response_format: format,
  });

  return {
    selected,
    contentType: format === "mp3" ? "audio/mpeg" : format === "opus" ? "audio/opus" : format === "pcm" ? "audio/pcm" : "audio/wav",
    buffer: Buffer.from(await speech.arrayBuffer()),
  };
}
