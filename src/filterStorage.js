import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "filters.json");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Match trigger anywhere in the message as a whole word/token (case-insensitive). */
export function messageContainsTrigger(text, trigger) {
  if (!text || !trigger) return false;
  const normalized = text.trim();
  const word = trigger.trim().toLowerCase();
  if (!word) return false;
  if (normalized.toLowerCase() === word) return true;

  const re = new RegExp(`(^|[^\\w])${escapeRegex(word)}($|[^\\w])`, "i");
  return re.test(normalized);
}

class FilterStorage {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (!fs.existsSync(DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  }

  save() {
    const dir = path.dirname(DATA_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), "utf-8");
  }

  _chat(chatId) {
    const key = String(chatId);
    if (!this.data[key]) this.data[key] = { filters: {} };
    return this.data[key];
  }

  set(chatId, trigger, response) {
    const key = trigger.toLowerCase();
    const chat = this._chat(chatId);
    if (!chat.filters[key]) {
      chat.filters[key] = { trigger: key, responses: [] };
    }

    const entry = chat.filters[key];
    if (entry.response && !entry.responses) {
      entry.responses = [entry.response];
      delete entry.response;
    }
    if (!entry.responses.includes(response)) {
      entry.responses.push(response);
    }
    entry.updatedAt = new Date().toISOString();
    this.save();
  }

  getResponses(chatId, trigger) {
    const entry = this._chat(chatId).filters[trigger.toLowerCase()];
    if (!entry) return [];
    if (entry.responses?.length) return entry.responses;
    if (entry.response) return [entry.response];
    return [];
  }

  get(chatId, trigger) {
    const responses = this.getResponses(chatId, trigger);
    if (responses.length === 0) return null;
    return { trigger: trigger.toLowerCase(), responses };
  }

  remove(chatId, trigger) {
    const entry = this._chat(chatId);
    const key = trigger.toLowerCase();
    if (!(key in entry.filters)) return false;
    delete entry.filters[key];
    if (Object.keys(entry.filters).length === 0) delete this.data[String(chatId)];
    this.save();
    return true;
  }

  list(chatId) {
    return Object.values(this._chat(chatId).filters || {});
  }

  findMatch(chatId, text) {
    const filters = this.list(chatId);
    if (!filters.length || !text?.trim()) return null;

    const sorted = [...filters].sort((a, b) => b.trigger.length - a.trigger.length);

    for (const entry of sorted) {
      if (!messageContainsTrigger(text, entry.trigger)) continue;
      const responses = entry.responses?.length
        ? entry.responses
        : entry.response
          ? [entry.response]
          : [];
      if (responses.length) {
        return { trigger: entry.trigger, responses };
      }
    }
    return null;
  }
}

export const filterStorage = new FilterStorage();
