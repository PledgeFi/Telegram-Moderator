import "dotenv/config";
import { BOT_TOKEN, KNOWN_CHAT_IDS, ADMIN_IDS } from "./src/config.js";
import { registerBotCommands } from "./src/commands.js";
import { createBot } from "./src/bot.js";
import { storage } from "./src/storage.js";
import { topicDiscovery } from "./src/topicDiscovery.js";
import { seedAllKnownChats } from "./src/userRegistry.js";
import { refreshModeratedMembers, moderatedStore } from "./src/moderatedStore.js";
import { chatRegistry, refreshChatStatus } from "./src/chatRegistry.js";

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is not set.");
  console.error("1. Copy .env.example to .env");
  console.error("2. Add your bot token from @BotFather");
  console.error("3. Save the file (Ctrl+S)");
  process.exit(1);
}

for (const topic of storage.listAllTopics()) {
  topicDiscovery.register(topic.chatId, topic.threadId, topic.name, topic.chatTitle);
}

const bot = createBot();

const me = await bot.telegram.getMe();
console.log(`Bot online: @${me.username}`);
console.log(`KNOWN_CHAT_IDS: ${KNOWN_CHAT_IDS.join(", ") || "(none — set on Railway)"}`);
console.log(`ADMIN_IDS: ${[...ADMIN_IDS].join(", ") || "(none)"}`);

for (const chatId of KNOWN_CHAT_IDS) {
  await refreshChatStatus(bot.telegram, chatId).catch((err) => {
    console.warn(`Could not refresh known chat ${chatId}:`, err.message);
  });
}

try {
  await registerBotCommands(bot.telegram);
} catch (err) {
  console.warn("registerBotCommands failed:", err.message);
}

try {
  await seedAllKnownChats(bot.telegram);
} catch (err) {
  console.warn("seedAllKnownChats failed:", err.message);
}

for (const chat of chatRegistry.list()) {
  await refreshModeratedMembers(bot.telegram, chat.chatId).catch((err) => {
    console.warn(`refreshModeratedMembers failed for ${chat.chatId}:`, err.message);
  });
}
await bot.telegram.deleteWebhook({ drop_pending_updates: true });
await bot.launch({
  allowedUpdates: ["message", "channel_post", "my_chat_member", "chat_member", "callback_query"],
});

console.log("Topic moderator bot started.");
console.log("Configure everything via DM with the bot (/start).");
console.log("Disable privacy mode: @BotFather -> /setprivacy -> Disable");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
