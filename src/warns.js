import { isGroupAdmin } from "./auth.js";
import { WARN_AUTO_MUTE } from "./config.js";
import { canManageChat, resolveActorId, isPrivileged } from "./moderation.js";
import { warnStorage } from "./warnStorage.js";
import { moderatedStore } from "./moderatedStore.js";
import { userRegistry } from "./userRegistry.js";
import { formatUser, modLogHeader, sendModLog } from "./modLog.js";
import {
  displayName,
  isGroupChat,
  getCommandText,
  parseReasonAfterCommand,
  replyEphemeral,
  resolveTargetUser,
} from "./modUtils.js";

const MUTE_PERMISSIONS = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false,
};

const deps = { userRegistry, moderatedStore };

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function validateWarnTarget(ctx, command) {
  if (!isGroupChat(ctx)) return { error: "This command only works in groups." };
  if (!(await canManageChat(ctx))) return { error: "Only group admins can use this command." };

  const resolved = await resolveTargetUser(ctx, command, deps);
  if (resolved.error) return { error: resolved.error };

  const target = resolved.target;
  const actorId = resolveActorId(ctx);
  if (actorId && target.id === actorId) {
    return { error: "You can't warn yourself." };
  }

  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, target.id);
    if (member.status === "creator") {
      return { error: "Can't warn the group owner." };
    }
    if (member.status === "administrator" || (await isGroupAdmin(ctx.telegram, ctx.chat.id, target.id))) {
      return { error: "Can't warn another admin." };
    }
    userRegistry.remember(ctx.chat.id, member.user);
    return { target: member.user };
  } catch (err) {
    return { error: `Could not verify member: ${err.message}` };
  }
}

async function autoMuteIfNeeded(ctx, target, count) {
  if (!WARN_AUTO_MUTE || count < WARN_AUTO_MUTE) return false;
  if (ctx.chat.type !== "supergroup") return false;

  try {
    await ctx.telegram.restrictChatMember(ctx.chat.id, target.id, {
      permissions: MUTE_PERMISSIONS,
      use_independent_chat_permissions: true,
    });
    const member = await ctx.telegram.getChatMember(ctx.chat.id, target.id);
    moderatedStore.remember(ctx.chat.id, member.user);
    return true;
  } catch (err) {
    console.warn(`Auto-mute failed for ${target.id}:`, err.message);
    return false;
  }
}

async function handleWarn(ctx) {
  const check = await validateWarnTarget(ctx, "warn");
  if (check.error) {
    await replyEphemeral(ctx, check.error);
    return;
  }

  const { target } = check;
  const actorId = resolveActorId(ctx);
  const actor = ctx.from;
  const reason = parseReasonAfterCommand(getCommandText(ctx), "warn") || "No reason given";

  const count = warnStorage.add(ctx.chat.id, target.id, {
    reason,
    by: actorId,
    byName: displayName(actor),
  });

  const muted = await autoMuteIfNeeded(ctx, target, count);
  const limitNote =
    count >= WARN_AUTO_MUTE
      ? muted
        ? ` Auto-muted (${count}/${WARN_AUTO_MUTE} warns).`
        : ` Warn limit reached (${count}/${WARN_AUTO_MUTE}).`
      : ` (${count}/${WARN_AUTO_MUTE})`;

  await replyEphemeral(
    ctx,
    `Warned ${displayName(target)}.${limitNote}\nReason: ${reason}`
  );

  const group = escapeHtml(ctx.chat.title || String(ctx.chat.id));
  await sendModLog(
    ctx.telegram,
    ctx.chat.id,
    `${modLogHeader("Warn")}\n` +
      `Group: ${group}\n` +
      `User: ${formatUser(target)}\n` +
      `By: ${formatUser(actor)}\n` +
      `Warns: ${count}/${WARN_AUTO_MUTE}\n` +
      `Reason: ${escapeHtml(reason)}` +
      (muted ? "\n<b>Action:</b> auto-muted" : ""),
    { threadId: ctx.message?.message_thread_id ?? null }
  );
}

async function handleWarns(ctx) {
  const check = await validateWarnTarget(ctx, "warns");
  if (check.error) {
    await replyEphemeral(ctx, check.error);
    return;
  }

  const { target } = check;
  const record = warnStorage.get(ctx.chat.id, target.id);
  if (record.count === 0) {
    await replyEphemeral(ctx, `${displayName(target)} has no warnings.`);
    return;
  }

  const lines = record.entries.map(
    (entry, i) => `${i + 1}. ${entry.reason} — by ${entry.byName}`
  );
  await replyEphemeral(
    ctx,
    `${displayName(target)}: ${record.count}/${WARN_AUTO_MUTE} warning(s)\n\n${lines.join("\n")}`
  );
}

async function handleUnwarn(ctx) {
  const check = await validateWarnTarget(ctx, "unwarn");
  if (check.error) {
    await replyEphemeral(ctx, check.error);
    return;
  }

  const { target } = check;
  const text = getCommandText(ctx);
  const clearAll = /\ball\b/i.test(parseReasonAfterCommand(text, "unwarn"));
  const remaining = warnStorage.clear(ctx.chat.id, target.id, clearAll ? Infinity : 1);

  await replyEphemeral(
    ctx,
    clearAll
      ? `Cleared all warnings for ${displayName(target)}.`
      : `Removed 1 warning for ${displayName(target)} (${remaining} left).`
  );

  await sendModLog(
    ctx.telegram,
    ctx.chat.id,
    `${modLogHeader("Unwarn")}\n` +
      `User: ${formatUser(target)}\n` +
      `By: ${formatUser(ctx.from)}\n` +
      `Remaining: ${remaining}/${WARN_AUTO_MUTE}`,
    { threadId: ctx.message?.message_thread_id ?? null }
  );
}

export function registerWarnHandlers(bot) {
  bot.command("warn", handleWarn);
  bot.command("warns", handleWarns);
  bot.command("unwarn", handleUnwarn);
}

export { autoMuteIfNeeded, MUTE_PERMISSIONS };
