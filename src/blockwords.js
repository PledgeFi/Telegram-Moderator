import { canManageChat, isPrivileged, resolveActorId } from "./moderation.js";
import { WARNING_DELETE_SECONDS } from "./config.js";
import { blockwordStorage } from "./blockwordStorage.js";
import { modLogStorage } from "./modLogStorage.js";
import { formatUser, modLogHeader, sendModLog } from "./modLog.js";
import { getCommandText, isGroupChat, replyEphemeral } from "./modUtils.js";
import { userRegistry } from "./userRegistry.js";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isGroupOrChannel(ctx) {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup" || type === "channel";
}

function parseWordCommand(text, command) {
  const match = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?\\s+(\\S(?:.*\\S)?)`, "i"));
  return match?.[1]?.trim() || null;
}

async function denyAdmin(ctx) {
  await replyEphemeral(ctx, "Only group admins can manage blocked words.");
}

async function handleBlockword(ctx) {
  if (!isGroupOrChannel(ctx)) return;
  if (!(await canManageChat(ctx))) {
    await denyAdmin(ctx);
    return;
  }

  const word = parseWordCommand(getCommandText(ctx), "blockword");
  if (!word) {
    await replyEphemeral(
      ctx,
      "Usage: /blockword <word or phrase>\nExample: /blockword scam"
    );
    return;
  }

  blockwordStorage.add(ctx.chat.id, word, { addedBy: resolveActorId(ctx) });
  await replyEphemeral(ctx, `Blocked word saved: "${word}"`);
}

async function handleUnblockword(ctx) {
  if (!isGroupOrChannel(ctx)) return;
  if (!(await canManageChat(ctx))) {
    await denyAdmin(ctx);
    return;
  }

  const word = parseWordCommand(getCommandText(ctx), "unblockword");
  if (!word) {
    await replyEphemeral(ctx, "Usage: /unblockword <word>\nExample: /unblockword scam");
    return;
  }

  if (!blockwordStorage.remove(ctx.chat.id, word)) {
    await replyEphemeral(ctx, "Blocked word not found.");
    return;
  }

  await replyEphemeral(ctx, `Removed blocked word: "${word}"`);
}

async function handleBlockwords(ctx) {
  if (!isGroupOrChannel(ctx)) return;
  if (!(await canManageChat(ctx))) {
    await denyAdmin(ctx);
    return;
  }

  const words = blockwordStorage.list(ctx.chat.id);
  if (words.length === 0) {
    await replyEphemeral(ctx, "No blocked words configured.");
    return;
  }

  const lines = words.map((entry, i) => `${i + 1}. ${entry.word}`);
  await replyEphemeral(ctx, `Blocked words (${words.length}):\n\n${lines.join("\n")}`);
}

async function handleSetModlog(ctx) {
  if (!isGroupChat(ctx)) return;
  if (!(await canManageChat(ctx))) {
    await replyEphemeral(ctx, "Only group admins can set the mod log.");
    return;
  }

  const threadId = ctx.message?.message_thread_id ?? null;
  modLogStorage.set(ctx.chat.id, {
    chatId: ctx.chat.id,
    threadId,
    title: ctx.chat.title || null,
  });

  const place = threadId ? `topic #${threadId}` : "this chat";
  await replyEphemeral(ctx, `Mod log destination set to ${place}.`);

  await sendModLog(
    ctx.telegram,
    ctx.chat.id,
    `${modLogHeader("Mod log configured")}\n` +
      `Group: ${escapeHtml(ctx.chat.title || String(ctx.chat.id))}\n` +
      `Destination: ${place}\n` +
      `By: ${formatUser(ctx.from)}`,
    { threadId }
  );
}

function shouldScanMessage(msg) {
  if (!msg) return false;
  if (msg.new_chat_members || msg.left_chat_member || msg.pinned_message) return false;

  const text = msg.text || msg.caption;
  if (!text?.trim()) return false;
  if (text.startsWith("/")) return false;

  return true;
}

async function sendBlockwordNotice(telegram, chatId, threadId, user) {
  const mention = `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name || "User")}</a>`;
  const text =
    `⚠️ ${mention}, please respect the group rules.\n` +
    `Your message contained a blocked word and was removed.`;

  const extra = threadId > 0 ? { message_thread_id: threadId } : {};
  try {
    return await telegram.sendMessage(chatId, text, {
      ...extra,
      parse_mode: "HTML",
    });
  } catch (err) {
    if (threadId > 0) {
      return telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
    throw err;
  }
}

export async function handleBlockwordCheck(ctx, msg) {
  if (!shouldScanMessage(msg)) return false;

  const user = msg.from;
  if (!user || user.is_bot) return false;

  if (await isPrivileged(ctx.telegram, ctx.chat.id, user.id)) return false;

  const text = msg.text || msg.caption || "";
  const matched = blockwordStorage.findMatch(ctx.chat.id, text);
  if (!matched) return false;

  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
  } catch (err) {
    console.warn(`Blockword delete failed in ${ctx.chat.id}:`, err.message);
    return false;
  }

  userRegistry.remember(ctx.chat.id, user);

  const threadId = msg.message_thread_id ?? 0;
  try {
    const notice = await sendBlockwordNotice(ctx.telegram, ctx.chat.id, threadId, user);
    setTimeout(() => {
      ctx.telegram.deleteMessage(ctx.chat.id, notice.message_id).catch(() => {});
    }, WARNING_DELETE_SECONDS * 1000);
  } catch (err) {
    console.warn(`Blockword notice failed in ${ctx.chat.id}:`, err.message);
  }

  console.log(`Blocked word "${matched}" in chat ${ctx.chat.id} from user ${user.id}`);
  return true;
}

export function registerBlockwordHandlers(bot) {
  bot.command("blockword", handleBlockword);
  bot.command("unblockword", handleUnblockword);
  bot.command("blockwords", handleBlockwords);
  bot.command("setmodlog", handleSetModlog);

  bot.on("channel_post", async (ctx, next) => {
    const text = ctx.channelPost?.text || "";
    if (!text.startsWith("/")) return next();

    const cmd = text.split(/\s/)[0].split("@")[0].toLowerCase();
    if (cmd === "/blockword") return handleBlockword(ctx);
    if (cmd === "/unblockword") return handleUnblockword(ctx);
    if (cmd === "/blockwords") return handleBlockwords(ctx);
    if (cmd === "/setmodlog") return handleSetModlog(ctx);
    return next();
  });
}
