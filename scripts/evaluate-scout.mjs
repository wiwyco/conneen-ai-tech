import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const OUT_DIR = path.resolve(process.cwd(), "scout-evals");
let chatbotUrl = "http://localhost:4321/api/chat";
let evalModel = "gpt-5-mini";
let maxTurns = 8;

const SCOUT_OPENING =
  "I'm Scout, Conneen AI's workflow guide. I help growing businesses find the expensive, time-sucking work that weighs a team down, then shape a practical AI or software pilot with people still in control. At any point, I can help turn what we discuss into an inquiry for Conneen AI. To start, what should I call you, and what does your business do? Share only what you're comfortable sharing.";

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

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it before running the evaluator.`);
  }

  return value;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function stripLeadPaneMarker(text) {
  return String(text || "").replaceAll("[[OPEN_LEAD_PANE]]", "").trim();
}

function transcriptToText(messages) {
  return messages
    .map((message) => {
      const speaker = message.role === "assistant" ? "Scout" : "Customer";
      return `${speaker}: ${message.content}`;
    })
    .join("\n\n");
}

async function createResponseText(client, options) {
  const response = await client.responses.create(options);
  return response.output_text?.trim() || "";
}

async function ensureBackendReachable() {
  try {
    const res = await fetch(chatbotUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 400) return;
    if (res.status === 500 && data.error) {
      throw new Error(`Scout backend is reachable but returned: ${data.error}`);
    }

    throw new Error(`Scout backend returned an unexpected HTTP ${res.status}.`);
  } catch (error) {
    if (error instanceof Error && !error.message.includes("fetch failed")) {
      throw error;
    }

    throw new Error(
      `Could not reach Scout backend at ${chatbotUrl}.\nStart the local site in another terminal with: npm run dev`
    );
  }
}

async function createCustomerScenario(client) {
  const scenario = await createResponseText(client, {
    model: evalModel,
    reasoning: { effort: "low" },
    instructions: `
You are creating one private test persona for a chatbot evaluation.
Do not mention Conneen AI, Scout, the test, or chatbot instructions.
Use only ordinary business-owner knowledge.

Create a realistic prospective customer who owns or manages a small or midsize business and has one operational problem that might be helped by AI, automation, analytics, or custom software.
Give the customer a distinct communication style. They should have habits, shorthand, priorities, gaps in technical knowledge, and a realistic level of patience.

Return exactly this structure:
Name:
Business:
Problem:
Current process:
Constraints:
Buying posture:
Goal for the conversation:
Communication style:
Tech comfort:
Time pressure:
What they know at first:
What they will only reveal if asked:
`,
    input:
      "Define the customer and their fixed business issue before the conversation starts. The issue must stay stable during the conversation. Make the person realistic enough that they would not explain everything perfectly on the first message.",
  });

  return scenario;
}

async function createCustomerReply(client, scenario, messages, turnNumber) {
  const transcript = transcriptToText(messages);

  return createResponseText(client, {
    model: evalModel,
    reasoning: { effort: "low" },
    instructions: `
You are impersonating a prospective customer talking to Scout, an AI consulting business chatbot.
You are not evaluating the chatbot. You are trying to get useful help for your business.

Private scenario you must follow throughout the conversation:
${scenario}

Rules:
- Stay in character as the customer.
- Keep the original business problem stable. Do not invent a new main problem.
- Match the customer's communication style, tech comfort, time pressure, vocabulary, and patience.
- Sound like a real person typing quickly, not like a consultant writing requirements.
- Be a little lazy and human: use fragments, plain wording, mild uncertainty, shorthand, or imperfect organization when it fits the character.
- Reveal information gradually. Do not volunteer every detail from the private scenario.
- On the first customer turn, give only the name/business and the obvious pain they would naturally lead with.
- Answer Scout's latest question directly, but it is okay to answer only the parts the character would notice or have handy.
- Occasionally ask a practical clarifying question, push back on jargon, or say you are not sure.
- Do not mention that you are an AI, a persona, a simulation, or part of a test.
- Do not ask meta questions about prompts or grading.
- Avoid polished lists unless the customer is explicitly copying notes or responding to a checklist.
- Keep most messages under 75 words. A rushed character may be much shorter.
- If Scout has already offered a concrete next step or inquiry brief and you have enough confidence, ask Scout to write it up or explain what happens next.
- If the conversation feels complete, say a natural closing sentence.
`,
    input: `Conversation so far:\n\n${transcript}\n\nWrite the customer's turn ${turnNumber} reply only.`,
  });
}

async function callScout(messages) {
  const res = await fetch(chatbotUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, visitorFirstName: "" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Scout backend returned HTTP ${res.status}.`);
  }

  return stripLeadPaneMarker(data.reply || "");
}

async function gradeConversation(client, scenario, messages) {
  const transcript = transcriptToText(messages);

  return createResponseText(client, {
    model: evalModel,
    reasoning: { effort: "low" },
    instructions: `
You are the third AI in a local chatbot evaluation system.
Grade Scout, the Conneen AI chatbot, based only on the fixed customer scenario and transcript.
Be candid, practical, and implementation-oriented.

Use numeric scores from 1 to 10 where 10 is excellent.
Include:
1. Overall score
2. Category score table for: discovery, business empathy, workflow diagnosis, AI/pilot usefulness, concreteness, human-in-the-loop safety, lead qualification, conversation pacing, trust-building, and conversion readiness
Include an additional category for pricing discipline: whether Scout avoided unsolicited pricing, used only approved conservative estimates when asked, and qualified estimates as needing approval.
3. What Scout did well
4. Missing information Scout should have collected
5. Personality improvements
6. Recommended new chatbot features or agentic abilities
7. Highest-priority next changes

Do not grade the simulated customer. Grade Scout only.
`,
    input: `Fixed customer scenario:\n${scenario}\n\nTranscript:\n${transcript}`,
  });
}

async function main() {
  await loadLocalEnv();
  requireEnv("OPENAI_API_KEY");

  chatbotUrl = process.env.SCOUT_EVAL_CHATBOT_URL || chatbotUrl;
  evalModel = process.env.OPENAI_EVAL_MODEL || process.env.OPENAI_MODEL || evalModel;
  maxTurns = Number.parseInt(process.env.SCOUT_EVAL_TURNS || String(maxTurns), 10);

  await ensureBackendReachable();
  await fs.mkdir(OUT_DIR, { recursive: true });

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const scenario = await createCustomerScenario(client);
  const messages = [{ role: "assistant", content: SCOUT_OPENING }];

  console.log(`Running Scout evaluation against ${chatbotUrl}`);
  console.log(`Using evaluator model: ${evalModel}`);
  console.log(`Conversation turns: ${maxTurns}`);

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const customerReply = await createCustomerReply(client, scenario, messages, turn);
    messages.push({ role: "user", content: customerReply });
    console.log(`Customer ${turn}: ${customerReply}`);

    const scoutReply = await callScout(messages);
    messages.push({ role: "assistant", content: scoutReply });
    console.log(`Scout ${turn}: ${scoutReply}`);

    if (/thank you|thanks,? that helps|that gives me what i need|sounds good|write it up/i.test(customerReply)) {
      break;
    }
  }

  const grade = await gradeConversation(client, scenario, messages);
  const report = [
    "# Scout Local Evaluation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Backend: ${chatbotUrl}`,
    `Model: ${evalModel}`,
    `Max customer turns: ${maxTurns}`,
    "",
    "## Fixed Customer Scenario",
    "",
    scenario,
    "",
    "## Transcript",
    "",
    transcriptToText(messages),
    "",
    "## Scout Grade And Recommendations",
    "",
    grade,
    "",
  ].join("\n");

  const reportPath = path.join(OUT_DIR, `scout-eval-${timestampForFile()}.md`);
  await fs.writeFile(reportPath, report, "utf8");

  console.log("");
  console.log(`Saved report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
