import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "warns.json");

class WarnStorage {
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

  _user(chatId, userId) {
    const chatKey = String(chatId);
    const userKey = String(userId);
    if (!this.data[chatKey]) this.data[chatKey] = {};
    if (!this.data[chatKey][userKey]) {
      this.data[chatKey][userKey] = { count: 0, entries: [] };
    }
    return this.data[chatKey][userKey];
  }

  add(chatId, userId, { reason, by, byName }) {
    const record = this._user(chatId, userId);
    record.entries.push({
      reason: reason || "No reason given",
      by,
      byName: byName || String(by),
      at: new Date().toISOString(),
    });
    record.count = record.entries.length;
    this.save();
    return record.count;
  }

  clear(chatId, userId, count = 1) {
    const chatKey = String(chatId);
    const userKey = String(userId);
    const record = this.data[chatKey]?.[userKey];
    if (!record?.entries?.length) return 0;

    if (count === Infinity || count >= record.entries.length) {
      delete this.data[chatKey][userKey];
      if (Object.keys(this.data[chatKey]).length === 0) delete this.data[chatKey];
      this.save();
      return 0;
    }

    record.entries.splice(-count, count);
    record.count = record.entries.length;
    this.save();
    return record.count;
  }

  get(chatId, userId) {
    return this.data[String(chatId)]?.[String(userId)] || { count: 0, entries: [] };
  }
}

export const warnStorage = new WarnStorage();
