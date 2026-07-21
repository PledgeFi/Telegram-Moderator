const CONFIRM_DELETE_SECONDS = 5;

export function scheduleDelete(telegram, chatId, messageId, seconds = CONFIRM_DELETE_SECONDS) {
  setTimeout(() => {
    telegram.deleteMessage(chatId, messageId).catch(() => {});
  }, seconds * 1000);
}

export async function replyEphemeral(ctx, text) {
  const sent = await ctx.reply(text);
  scheduleDelete(ctx.telegram, ctx.chat.id, sent.message_id);

  const source = ctx.message || ctx.channelPost;
  if (source?.message_id) {
    scheduleDelete(ctx.telegram, ctx.chat.id, source.message_id);
  }
}

export function displayName(user) {
  return user.first_name || user.username || String(user.id);
}

export function isGroupChat(ctx) {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

export function getCommandText(ctx) {
  return ctx.message?.text || ctx.channelPost?.text || "";
}

function getCommandEnd(msg, command) {
  for (const entity of msg?.entities || []) {
    if (entity.type === "bot_command") {
      return entity.offset + entity.length;
    }
  }
  const text = msg?.text || "";
  const match = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?`, "i"));
  return match ? match[0].length : 0;
}

function extractUserFromEntities(msg, command) {
  const text = msg?.text || "";
  if (!text) return null;

  const afterCmd = getCommandEnd(msg, command);

  for (const entity of msg.entities || []) {
    if (entity.offset < afterCmd) continue;
    if (entity.type === "text_mention" && entity.user && !entity.user.is_bot) {
      return { user: entity.user };
    }
  }

  for (const entity of msg.entities || []) {
    if (entity.offset < afterCmd) continue;
    if (entity.type === "mention") {
      const username = text.slice(entity.offset + 1, entity.offset + entity.length);
      return { username };
    }
  }

  return null;
}

function extractAnyTextMention(msg) {
  for (const entity of msg?.entities || []) {
    if (entity.type === "text_mention" && entity.user && !entity.user.is_bot) {
      return entity.user;
    }
  }
  return null;
}

function resolveTargetFromReply(msg) {
  const reply = msg?.reply_to_message;
  if (!reply) return null;
  if (reply.sender_chat) return null;
  if (reply.from && !reply.from.is_bot) return reply.from;
  return null;
}

export async function lookupMember(ctx, query, { userRegistry, moderatedStore }) {
  const q = query.replace(/^@/, "").trim();
  if (!q) return null;

  const byUsername = userRegistry.getByUsername(ctx.chat.id, q);
  if (byUsername) return userRegistry.toUser(byUsername);

  const byModerated = moderatedStore.getByUsername(ctx.chat.id, q);
  if (byModerated) {
    try {
      const member = await ctx.telegram.getChatMember(ctx.chat.id, byModerated.id);
      userRegistry.remember(ctx.chat.id, member.user);
      return member.user;
    } catch {
      return userRegistry.toUser(byModerated);
    }
  }

  const byName = userRegistry.getByFirstName(ctx.chat.id, q);
  if (byName) return userRegistry.toUser(byName);

  const fuzzy = userRegistry.search(ctx.chat.id, q);
  if (fuzzy) return userRegistry.toUser(fuzzy);

  return null;
}

export async function resolveTargetUser(ctx, command, deps) {
  const msg = ctx.message;
  const text = getCommandText(ctx);

  const anyMention = extractAnyTextMention(msg);
  if (anyMention) {
    deps.userRegistry.remember(ctx.chat.id, anyMention);
    return { target: anyMention };
  }

  const fromEntity = extractUserFromEntities(msg, command);
  if (fromEntity?.user) {
    deps.userRegistry.remember(ctx.chat.id, fromEntity.user);
    return { target: fromEntity.user };
  }

  if (fromEntity?.username) {
    const user = await lookupMember(ctx, fromEntity.username, deps);
    if (user) return { target: user };
  }

  const idMatch = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?\\s*(\\d+)`, "i"));
  if (idMatch) {
    return { target: { id: Number(idMatch[1]) } };
  }

  const userMatch = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?\\s*@(\\w{3,})`, "i"));
  if (userMatch) {
    const user = await lookupMember(ctx, userMatch[1], deps);
    if (user) return { target: user };
  }

  const nameMatch = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?\\s+([^\\s@/][^\\s]*)`, "i"));
  if (nameMatch) {
    const user = await lookupMember(ctx, nameMatch[1], deps);
    if (user) return { target: user };
  }

  const replyTarget = resolveTargetFromReply(msg);
  if (replyTarget) {
    deps.userRegistry.remember(ctx.chat.id, replyTarget);
    return { target: replyTarget };
  }

  if (fromEntity?.username || userMatch || nameMatch) {
    const query = fromEntity?.username || userMatch?.[1] || nameMatch?.[1];
    return {
      error:
        `@${query.replace(/^@/, "")} not found in this group. ` +
        `Reply to their message and send /${command}.`,
    };
  }

  return {
    error: `Reply to the member's message and send /${command}.`,
  };
}

export function parseReasonAfterCommand(text, command) {
  const match = text.match(new RegExp(`^\\/${command}(?:@[\\w_]+)?\\s*([\\s\\S]*)$`, "i"));
  return match?.[1]?.trim() || "";
}
