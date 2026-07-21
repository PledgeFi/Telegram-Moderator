import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { messageContainsTrigger } from "./filterStorage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "blockwords.json");

export function messageContainsBlockedWord(text, word) {
  if (!text || !word) return false;
  const normalized = text.trim();
  const blocked = word.trim();
  if (!blocked) return false;

  if (blocked.includes(" ")) {
    return normalized.toLowerCase().includes(blocked.toLowerCase());
  }

  return messageContainsTrigger(normalized, blocked);
}

class BlockwordStorage {
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
    if (!this.data[key]) this.data[key] = { words: {} };
    return this.data[key];
  }

  add(chatId, word, meta = {}) {
    const key = word.trim().toLowerCase();
    if (!key) return false;
    const chat = this._chat(chatId);
    chat.words[key] = {
      word: key,
      addedBy: meta.addedBy ?? null,
      addedAt: new Date().toISOString(),
    };
    this.save();
    return true;
  }

  remove(chatId, word) {
    const chat = this._chat(chatId);
    const key = word.trim().toLowerCase();
    if (!(key in chat.words)) return false;
    delete chat.words[key];
    if (Object.keys(chat.words).length === 0) delete this.data[String(chatId)];
    this.save();
    return true;
  }

  list(chatId) {
    return Object.values(this._chat(chatId).words || {});
  }

  findMatch(chatId, text) {
    const words = this.list(chatId);
    if (!words.length || !text?.trim()) return null;

    const sorted = [...words].sort((a, b) => b.word.length - a.word.length);
    for (const entry of sorted) {
      if (messageContainsBlockedWord(text, entry.word)) {
        return entry.word;
      }
    }
    return null;
  }
}

export const blockwordStorage = new BlockwordStorage();
