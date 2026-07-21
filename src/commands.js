import { chatRegistry } from "./chatRegistry.js";
import { KNOWN_CHAT_IDS } from "./config.js";

export const BOT_COMMANDS = [
  { command: "start", description: "Open setup menu" },
  { command: "menu", description: "Open setup menu" },
  { command: "help", description: "Setup guide" },
  { command: "stocks", description: "US watchlist prices" },
];

export const GROUP_COMMANDS = [
  { command: "help", description: "Show group command list" },
  { command: "stocks", description: "US watchlist prices" },
  { command: "report", description: "Report a message to mods" },
  { command: "filter", description: "Set auto-reply trigger" },
  { command: "unfilter", description: "Remove auto-reply trigger" },
  { command: "filters", description: "List auto-reply triggers" },
  { command: "blockword", description: "Block a word or phrase" },
  { command: "unblockword", description: "Remove blocked word" },
  { command: "blockwords", description: "List blocked words" },
  { command: "warn", description: "Warn member (reply)" },
  { command: "warns", description: "Show member warnings" },
  { command: "unwarn", description: "Remove warning (reply)" },
  { command: "mute", description: "Mute member (reply to message)" },
  { command: "unmute", description: "Unmute member (reply to message)" },
  { command: "ban", description: "Ban member (reply to message)" },
  { command: "unban", description: "Unban member (reply or user ID)" },
  { command: "kick", description: "Kick member (reply to message)" },
  { command: "setmodlog", description: "Set mod log topic" },
  { command: "setwelcome", description: "Set new member welcome message" },
  { command: "welcome", description: "Show welcome message settings" },
  { command: "unwelcome", description: "Disable welcome message" },
  { command: "myid", description: "Show your Telegram user ID" },
];

export const GROUP_HELP_TEXT =
  "📋 *Group commands*\n\n" +
  "`/help` — Show this list\n" +
  "`/stocks` — US watchlist prices\n" +
  "`/report [reason]` — Report a message \\(reply\\)\n\n" +
  "*Auto\\-reply*\n" +
  "`/filter <trigger> <response>` — Set auto\\-reply\n" +
  "`/unfilter <trigger>` — Remove auto\\-reply\n" +
  "`/filters` — List auto\\-reply triggers\n\n" +
  "*Blocked words* \\(auto\\-delete\\)\n" +
  "`/blockword <word>` — Block word/phrase\n" +
  "`/unblockword <word>` — Remove blocked word\n" +
  "`/blockwords` — List blocked words\n\n" +
  "*Warnings*\n" +
  "`/warn [reason]` — Warn member \\(reply\\)\n" +
  "`/warns` — Show warnings \\(reply\\)\n" +
  "`/unwarn` — Remove 1 warn \\(reply\\)\n" +
  "`/unwarn all` — Clear all warns \\(reply\\)\n\n" +
  "*Moderation*\n" +
  "`/mute` `/unmute` `/ban` `/unban` `/kick` — Member actions \\(reply\\)\n" +
  "`/setmodlog` — Send mod logs to this topic\n\n" +
  "*Welcome*\n" +
  "`/setwelcome <message>` — Set new member welcome\n" +
  "`/welcome` — Show welcome settings\n" +
  "`/unwelcome` — Disable welcome message\n\n" +
  "`/myid` — Show your Telegram user ID\n\n" +
  "_Welcome placeholders: {name} {username} {mention} {group}_\n\n" +
  "_Admin commands require group admin\\. 3 warns \\= auto\\-mute\\._";

function isGroupOrChannel(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup" || type === "channel";
}

async function setCommandsForScope(telegram, commands, scope) {
  try {
    await telegram.deleteMyCommands({ scope });
  } catch {
    // scope may not exist yet
  }
  await telegram.setMyCommands(commands, { scope });
}

export async function registerGroupCommandsForChat(telegram, chatId) {
  const chatScope = { type: "chat", chat_id: chatId };
  const adminScope = { type: "chat_administrators", chat_id: chatId };
  await setCommandsForScope(telegram, GROUP_COMMANDS, chatScope);
  await setCommandsForScope(telegram, GROUP_COMMANDS, adminScope);
}

function collectCommandChatIds() {
  const ids = new Set(KNOWN_CHAT_IDS);
  for (const chat of chatRegistry.list()) {
    ids.add(Number(chat.chatId));
  }
  return [...ids].filter((id) => Number.isFinite(id));
}

export async function registerAllKnownGroupCommands(telegram) {
  for (const chatId of collectCommandChatIds()) {
    try {
      await registerGroupCommandsForChat(telegram, chatId);
    } catch (err) {
      console.warn(`Failed to register commands for chat ${chatId}:`, err.message);
    }
  }
}

export async function registerBotCommands(telegram) {
  const groupScopes = [
    { type: "default" },
    { type: "all_group_chats" },
    { type: "all_chat_administrators" },
  ];

  for (const scope of groupScopes) {
    await setCommandsForScope(telegram, GROUP_COMMANDS, scope);
  }

  await setCommandsForScope(telegram, BOT_COMMANDS, { type: "all_private_chats" });

  await registerAllKnownGroupCommands(telegram);

  const names = GROUP_COMMANDS.map((c) => c.command).join(", ");
  console.log(`Bot commands registered (${GROUP_COMMANDS.length}): ${names}`);
}

async function handleGroupHelp(ctx) {
  if (!isGroupOrChannel(ctx)) return;
  await registerGroupCommandsForChat(ctx.telegram, ctx.chat.id).catch(() => {});
  await ctx.reply(GROUP_HELP_TEXT, { parse_mode: "MarkdownV2" });
}

export function registerGroupHelpHandler(bot) {
  bot.command("help", async (ctx, next) => {
    if (!isGroupOrChannel(ctx)) return next();
    await handleGroupHelp(ctx);
  });

  bot.on("channel_post", async (ctx, next) => {
    const text = ctx.channelPost?.text || "";
    if (!text.match(/^\/help(?:@[\w_]+)?(?:\s|$)/i)) return next();
    await handleGroupHelp(ctx);
  });
}
