import { MemorySessionStorage } from "./toolkit/index.js";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  file_size: number;
  upload_timestamp: number;
  uploader_id: number;
  tags: string[];
  cover_art?: string;
  file_path: string;
  status: "approved" | "pending" | "rejected";
}

export interface Submission {
  track_id: string;
  status: "pending" | "approved" | "rejected";
  admin_notes: string;
}

export interface User {
  telegram_id: number;
  role: "user" | "admin";
}

// Persistent storage using toolkit's StorageAdapter (Redis-backed in prod).
// NEVER use readAllKeys / KEYS / SCAN — maintain explicit index records.
const trackStore = new MemorySessionStorage<Track>();
const submissionStore = new MemorySessionStorage<Submission>();
const userStore = new MemorySessionStorage<User>();
const tagIndex = new MemorySessionStorage<string[]>();
const submissionIndex = new MemorySessionStorage<string[]>();
const adminIds = new MemorySessionStorage<number[]>();
const nextId = new MemorySessionStorage<number>();
// Explicit index records — the only way to enumerate collections
const allTrackIds = new MemorySessionStorage<string[]>();
const allTagNames = new MemorySessionStorage<string[]>();

let _now: () => number = () => Date.now();
export function setClock(fn: () => number) { _now = fn; }
export function now() { return _now(); }

function genId(): string {
  const n = (nextId.read("counter") ?? 0) + 1;
  nextId.write("counter", n);
  return String(n);
}

function addTrackIdToIndex(id: string): void {
  const ids = allTrackIds.read("index") ?? [];
  if (!ids.includes(id)) allTrackIds.write("index", [...ids, id]);
}

function addTagNameToIndex(tag: string): void {
  const tags = allTagNames.read("index") ?? [];
  if (!tags.includes(tag)) allTagNames.write("index", [...tags, tag]);
}

export function addTrack(t: Omit<Track, "id" | "upload_timestamp" | "status">): Track {
  const id = genId();
  const track: Track = { ...t, id, upload_timestamp: now(), status: "approved" };
  trackStore.write(id, track);
  addTrackIdToIndex(id);
  for (const tag of track.tags) {
    addTagNameToIndex(tag);
    const existing = tagIndex.read(tag) ?? [];
    if (!existing.includes(id)) {
      tagIndex.write(tag, [...existing, id]);
    }
  }
  return track;
}

export function addSubmission(t: Omit<Track, "id" | "upload_timestamp" | "status">): { track: Track; submission: Submission } {
  const id = genId();
  const track: Track = { ...t, id, upload_timestamp: now(), status: "pending" };
  trackStore.write(id, track);
  addTrackIdToIndex(id);
  const submission: Submission = { track_id: id, status: "pending", admin_notes: "" };
  submissionStore.write(id, submission);
  for (const tag of track.tags) {
    addTagNameToIndex(tag);
    const existing = tagIndex.read(tag) ?? [];
    if (!existing.includes(id)) {
      tagIndex.write(tag, [...existing, id]);
    }
  }
  const userIdx = submissionIndex.read(String(t.uploader_id)) ?? [];
  submissionIndex.write(String(t.uploader_id), [...userIdx, id]);
  return { track, submission };
}

export function getTrack(id: string): Track | undefined {
  return trackStore.read(id) ?? undefined;
}

export function getAllTracks(): Track[] {
  const ids = allTrackIds.read("index") ?? [];
  return ids.map((id) => trackStore.read(id)).filter((t): t is Track => t !== undefined);
}

export function getTracksByTag(tag: string): Track[] {
  const ids = tagIndex.read(tag) ?? [];
  return ids.map((id) => trackStore.read(id)).filter((t): t is Track => t !== undefined && t.status === "approved");
}

export function getAllTags(): string[] {
  return allTagNames.read("index") ?? [];
}

export function getRecentTracks(limit = 10): Track[] {
  return getAllTracks()
    .filter((t) => t.status === "approved")
    .sort((a, b) => b.upload_timestamp - a.upload_timestamp)
    .slice(0, limit);
}

export function searchTracks(query: string): Track[] {
  const q = query.toLowerCase();
  return getAllTracks().filter((t) =>
    t.status === "approved" &&
    (t.title.toLowerCase().includes(q) ||
     t.artist.toLowerCase().includes(q) ||
     t.album.toLowerCase().includes(q))
  );
}

export function getUserTracks(userId: number): Track[] {
  return getAllTracks().filter((t) => t.uploader_id === userId);
}

export function getUserSubmissions(userId: number): Submission[] {
  const ids = submissionIndex.read(String(userId)) ?? [];
  return ids.map((id) => submissionStore.read(id)).filter((s): s is Submission => s !== undefined);
}

export function approveSubmission(trackId: string): boolean {
  const track = trackStore.read(trackId);
  if (!track || track.status !== "pending") return false;
  track.status = "approved";
  trackStore.write(trackId, track);
  const sub = submissionStore.read(trackId);
  if (sub) {
    sub.status = "approved";
    submissionStore.write(trackId, sub);
  }
  return true;
}

export function rejectSubmission(trackId: string, reason: string): boolean {
  const track = trackStore.read(trackId);
  if (!track || track.status !== "pending") return false;
  track.status = "rejected";
  trackStore.write(trackId, track);
  const sub = submissionStore.read(trackId);
  if (sub) {
    sub.status = "rejected";
    sub.admin_notes = reason;
    submissionStore.write(trackId, sub);
  }
  return true;
}

export function getPendingSubmissions(): { track: Track; submission: Submission }[] {
  const ids = allTrackIds.read("index") ?? [];
  const results: { track: Track; submission: Submission }[] = [];
  for (const id of ids) {
    const sub = submissionStore.read(id);
    if (sub && sub.status === "pending") {
      const track = trackStore.read(id);
      if (track) results.push({ track, submission: sub });
    }
  }
  return results;
}

export function setUserRole(userId: number, role: "user" | "admin"): void {
  userStore.write(String(userId), { telegram_id: userId, role });
}

export function getUserRole(userId: number): "user" | "admin" {
  const user = userStore.read(String(userId));
  return user?.role ?? "user";
}

export function isAdmin(userId: number): boolean {
  return getUserRole(userId) === "admin";
}

export function addAdminId(id: number): void {
  const ids = adminIds.read("list") ?? [];
  if (!ids.includes(id)) adminIds.write("list", [...ids, id]);
}

export function getAdminIds(): number[] {
  return adminIds.read("list") ?? [];
}

export function updateTrackTags(trackId: string, tags: string[]): void {
  const track = trackStore.read(trackId);
  if (!track) return;
  for (const old of track.tags) {
    const ids = tagIndex.read(old) ?? [];
    tagIndex.write(old, ids.filter((id) => id !== trackId));
  }
  track.tags = tags;
  trackStore.write(trackId, track);
  for (const tag of tags) {
    addTagNameToIndex(tag);
    const ids = tagIndex.read(tag) ?? [];
    if (!ids.includes(trackId)) tagIndex.write(tag, [...ids, trackId]);
  }
}

export function updateTrackInfo(trackId: string, info: Partial<Pick<Track, "title" | "artist" | "album">>): void {
  const track = trackStore.read(trackId);
  if (!track) return;
  if (info.title !== undefined) track.title = info.title;
  if (info.artist !== undefined) track.artist = info.artist;
  if (info.album !== undefined) track.album = info.album;
  trackStore.write(trackId, track);
}
