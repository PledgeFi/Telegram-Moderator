import { formatUser, messageLink, modLogHeader, sendModLog } from "./modLog.js";
import { getCommandText, isGroupChat, parseReasonAfterCommand, replyEphemeral } from "./modUtils.js";
import { userRegistry } from "./userRegistry.js";

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(text, max = 500) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

async function handleReport(ctx) {
  if (!isGroupChat(ctx)) return;

  const reply = ctx.message?.reply_to_message;
  if (!reply) {
    await replyEphemeral(ctx, "Reply to a message and send /report [reason]");
    return;
  }

  if (reply.from?.is_bot) {
    await replyEphemeral(ctx, "You can't report bot messages.");
    return;
  }

  const reporter = ctx.from;
  const reported = reply.from;
  const reason = parseReasonAfterCommand(getCommandText(ctx), "report") || "No reason given";

  if (reported) userRegistry.remember(ctx.chat.id, reported);
  if (reporter) userRegistry.remember(ctx.chat.id, reporter);

  const reportedText =
    reply.text ||
    reply.caption ||
    (reply.sticker ? "[sticker]" : reply.photo ? "[photo]" : reply.video ? "[video]" : "[media]");

  const link = messageLink(
    ctx.chat.id,
    reply.message_id,
    reply.message_thread_id ?? ctx.message?.message_thread_id ?? null
  );

  const group = escapeHtml(ctx.chat.title || String(ctx.chat.id));
  const sent = await sendModLog(
    ctx.telegram,
    ctx.chat.id,
    `${modLogHeader("Report")}\n` +
      `Group: ${group}\n` +
      `Reported: ${formatUser(reported)}\n` +
      `By: ${formatUser(reporter)}\n` +
      `Reason: ${escapeHtml(reason)}\n\n` +
      `<b>Message:</b>\n<pre>${escapeHtml(truncate(reportedText))}</pre>\n` +
      `<a href="${link}">Open message</a>`,
    { threadId: ctx.message?.message_thread_id ?? null }
  );

  if (sent) {
    await replyEphemeral(ctx, "Report sent to moderators. Thank you.");
  } else {
    await replyEphemeral(ctx, "Could not send report. Ask an admin to run /setmodlog in a mod topic.");
  }
}

export function registerReportHandlers(bot) {
  bot.command("report", handleReport);
}
