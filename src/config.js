import "dotenv/config";

export const BOT_TOKEN = process.env.BOT_TOKEN || "";

export const ADMIN_IDS = new Set(
  (process.env.ADMIN_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .map(Number)
);

/** Group IDs to check for DM admin access (useful when data/ is empty on Railway). */
export const KNOWN_CHAT_IDS = (process.env.KNOWN_CHAT_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter((id) => /^-?\d+$/.test(id))
  .map(Number);

export const WARNING_DELETE_SECONDS = 15;

/** Auto-mute after this many warnings (default 3). Set 0 to disable. */
export const WARN_AUTO_MUTE = Math.max(0, Number(process.env.WARN_AUTO_MUTE || "3") || 0);

/** Optional fallback mod-log destination (per-group override via /setmodlog). */
export const MOD_LOG_CHAT_ID = (() => {
  const raw = (process.env.MOD_LOG_CHAT_ID || "").trim();
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
})();

export const MOD_LOG_TOPIC_ID = (() => {
  const raw = (process.env.MOD_LOG_TOPIC_ID || "").trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
})();
