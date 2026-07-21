import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "modlog.json");

class ModLogStorage {
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

  get(sourceChatId) {
    return this.data[String(sourceChatId)] || null;
  }

  set(sourceChatId, { chatId, threadId = null, title = null }) {
    this.data[String(sourceChatId)] = {
      chatId,
      threadId: threadId ?? null,
      title: title ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.save();
  }

  clear(sourceChatId) {
    if (!(String(sourceChatId) in this.data)) return false;
    delete this.data[String(sourceChatId)];
    this.save();
    return true;
  }
}

export const modLogStorage = new ModLogStorage();
