import { MOD_LOG_CHAT_ID, MOD_LOG_TOPIC_ID } from "./config.js";
import { modLogStorage } from "./modLogStorage.js";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatUser(user) {
  if (!user) return "Unknown";
  const name = escapeHtml(user.first_name || "User");
  if (user.username) return `@${escapeHtml(user.username)} (${name})`;
  return `<a href="tg://user?id=${user.id}">${name}</a>`;
}

export function messageLink(chatId, messageId, threadId = null) {
  const internal = String(chatId).replace(/^-100/, "");
  if (threadId) {
    return `https://t.me/c/${internal}/${threadId}/${messageId}`;
  }
  return `https://t.me/c/${internal}/${messageId}`;
}

function resolveDestination(sourceChatId) {
  const stored = modLogStorage.get(sourceChatId);
  if (stored?.chatId) {
    return { chatId: stored.chatId, threadId: stored.threadId ?? null };
  }
  if (MOD_LOG_CHAT_ID) {
    return { chatId: MOD_LOG_CHAT_ID, threadId: MOD_LOG_TOPIC_ID ?? null };
  }
  return { chatId: sourceChatId, threadId: null };
}

export async function sendModLog(telegram, sourceChatId, html, { threadId = null } = {}) {
  const dest = resolveDestination(sourceChatId);
  const extra = {};
  const targetThread = dest.threadId ?? threadId;
  if (targetThread) extra.message_thread_id = targetThread;

  try {
    await telegram.sendMessage(dest.chatId, html, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    });
    return true;
  } catch (err) {
    if (targetThread) {
      try {
        await telegram.sendMessage(dest.chatId, html, {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        return true;
      } catch {
        // fall through
      }
    }
    console.warn(`Mod log send failed for ${sourceChatId}:`, err.message);
    return false;
  }
}

export function modLogHeader(action) {
  return `🔨 <b>${escapeHtml(action)}</b>`;
}
