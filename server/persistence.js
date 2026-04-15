import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), '.data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

export function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ROOMS_FILE)) {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms: [] }, null, 2), 'utf8');
  }
}

export function loadRooms() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    return parsed.rooms || [];
  } catch {
    return [];
  }
}

export function saveRooms(rooms) {
  ensureDataFile();
  fs.writeFileSync(ROOMS_FILE, JSON.stringify({ rooms }, null, 2), 'utf8');
}
