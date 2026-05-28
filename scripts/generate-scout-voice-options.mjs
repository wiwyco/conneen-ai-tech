import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const OUT_DIR = path.resolve(process.cwd(), "scout-voice-options");

const VOICES = [
  {
    id: "marin",
    label: "Marin",
    instructions: "Speak like a calm senior consultant: warm, concise, grounded, and conversational. Avoid announcer energy.",
  },
  {
    id: "cedar",
    label: "Cedar",
    instructions: "Speak with a steady, composed consultant voice. Sound practical, reassuring, and crisp.",
  },
  {
    id: "verse",
    label: "Verse",
    instructions: "Speak naturally and lightly, with quick responsiveness and a friendly meeting-assistant tone.",
  },
  {
    id: "sage",
    label: "Sage",
    instructions: "Speak patiently and clearly. Keep the delivery gentle, thoughtful, and easy to follow.",
  },
  {
    id: "coral",
    label: "Coral",
    instructions: "Speak in a polished, positive, helpful tone. Keep it professional, not overly cheerful.",
  },
];

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function run() {
  await loadLocalEnv();
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");

  const sample = process.env.SCOUT_VOICE_SAMPLE
    || "Scout here. I can keep this brief: I heard the question, I checked the client workspace, and the next useful step is to confirm the owner, deadline, and data source before I add it to the project plan.";
  const model = process.env.SCOUT_TTS_MODEL || "gpt-4o-mini-tts";
  const format = process.env.SCOUT_TTS_SAMPLE_FORMAT || "mp3";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = [`# Scout Voice Options - ${new Date().toISOString()}`, ""];

  for (const voice of VOICES) {
    const response = await client.audio.speech.create({
      model,
      voice: voice.id,
      input: sample,
      instructions: voice.instructions,
      response_format: format,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = `scout-${voice.id}.${format}`;
    await fs.writeFile(path.join(OUT_DIR, fileName), buffer);
    report.push(`- ${voice.label} (${voice.id}): ${fileName}`);
  }

  report.push("", "Recommendation: start with `marin` for client meetings, `cedar` for executive reviews, and `verse` if you want Scout to feel more conversational.");
  await fs.writeFile(path.join(OUT_DIR, "README.md"), `${report.join("\n")}\n`, "utf8");
  console.log(`Generated ${VOICES.length} voice samples in ${OUT_DIR}`);
}

run().catch((error) => {
  console.error(`Scout voice option generation failed: ${error.message}`);
  process.exitCode = 1;
});
