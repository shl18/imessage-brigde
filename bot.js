const express = require("express");
const { OpenAI } = require("openai");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");


const CONFIG = {
  openaiApiKey: "",
  bluebubbleUrl: "https://0b7a-2601-cd-cb7f-be20-7127-4a3f-9e-3a4.ngrok-free.app",
  bluebubblePassword: "NewDay@824",
  webhookPort: 8000,
  model: "gpt-4o",
  systemPrompt: `You are a helpful assistant replying via iMessage. 
Keep responses concise and conversational. 
Do not use markdown formatting — plain text only.`,
};
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: CONFIG.openaiApiKey });

const conversations = {};
const MAX_HISTORY = 20;

async function sendIMessage(chatGuid, text) {
  try {
    const url = `${CONFIG.bluebubbleUrl}/api/v1/message/text?password=${CONFIG.bluebubblePassword}`;
    const response = await axios.post(url, {
      chatGuid: chatGuid,
      message: text,
      method: "apple-script", // use "private-api" if you have Private API enabled
      tempGuid: uuidv4(),     // required by BlueBubble when using AppleScript
    });
    console.log(`[SENT] to ${chatGuid}:`, text.substring(0, 60) + "...");
    return response.data;
  } catch (err) {
    console.error("[ERROR] Failed to send message:", err.response?.data || err.message);
  }
}


async function getAIReply(sender, userMessage) {
  if (!conversations[sender]) {
    conversations[sender] = [];
  }

  const history = conversations[sender];
  history.push({ role: "user", content: userMessage });

  try {
    const response = await openai.chat.completions.create({
      model: CONFIG.model,
      messages: [
        { role: "system", content: CONFIG.systemPrompt },
        ...history,
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    const reply = response.choices[0].message.content.trim();


    history.push({ role: "assistant", content: reply });

    if (history.length > MAX_HISTORY) {
      conversations[sender] = history.slice(-MAX_HISTORY);
    }

    return reply;
  } catch (err) {
    console.error("[ERROR] OpenAI API error:", err.message);
    return "Sorry, I ran into an error. Please try again.";
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const body = req.body;

  const eventType = body?.type;
  if (eventType !== "new-message") return;

  const messageData = body?.data;
  if (!messageData) return;

  if (messageData.isFromMe) return;

  const text = messageData.text?.trim();
  if (!text) return;

  const sender = messageData.handle?.address || "unknown";
  const chatGuid = messageData.chats?.[0]?.guid;

  if (!chatGuid) {
    console.warn("[WARN] No chatGuid found, skipping message");
    return;
  }

  console.log(`[IN] From ${sender}: ${text}`);

  const aiReply = await getAIReply(sender, text);

  await sendIMessage(chatGuid, aiReply);
});

app.get("/", (req, res) => {
  res.json({ status: "running", bot: "iMessage AI Bot" });
});

// ── START SERVER ──────────────────────────────────────────────
app.listen(CONFIG.webhookPort, () => {
  console.log(`
╔══════════════════════════════════════╗
║     iMessage AI Bot is running!      ║
║  Webhook listening on port ${CONFIG.webhookPort}      ║
║  Add webhook in BlueBubble:          ║
║  http://localhost:${CONFIG.webhookPort}/webhook      ║
╚══════════════════════════════════════╝
  `);
});