import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { addSubmission, getPendingSubmissions, getAdminIds, now } from "../data.js";

registerMainMenuItem({ label: "📤 Submit Track", data: "submit:start", order: 10 });

const composer = new Composer<Ctx>();

composer.callbackQuery("submit:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_flac_file";
  await ctx.reply(
    "Send me a FLAC file to submit it to the library.\n\n" +
    "Only FLAC format is accepted — other file types will be rejected.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Cancel", "menu:main")],
      ]),
    },
  );
});

composer.on("message:document", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_flac_file") return next();

  const doc = ctx.message.document;
  if (!doc) return next();

  const fileName = doc.file_name ?? "";
  const isFlac = fileName.toLowerCase().endsWith(".flac");
  const isAudio = doc.mime_type === "audio/flac" || doc.mime_type === "audio/x-flac";

  if (!isFlac && !isAudio) {
    await ctx.reply(
      "That file isn't a FLAC. Please send a .flac file — other formats aren't accepted.",
      { reply_markup: inlineKeyboard([[inlineButton("Cancel", "menu:main")]]) },
    );
    return;
  }

  ctx.session.pendingTrack = {
    title: fileName.replace(/\.flac$/i, ""),
    artist: "",
    album: "",
    duration: 0,
    file_size: doc.file_size ?? 0,
    file_path: doc.file_id,
    tags: [],
  };
  ctx.session.step = "awaiting_track_title";

  await ctx.reply(
    "Got it — FLAC file received.\n\nWhat's the track title?",
    {
      reply_markup: { force_reply: true, input_field_placeholder: "Track title…" },
    },
  );
});

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();

  if (ctx.session.step === "awaiting_track_title") {
    if (!ctx.session.pendingTrack) return next();
    ctx.session.pendingTrack.title = text;
    ctx.session.step = "awaiting_track_artist";
    await ctx.reply(
      `Title: ${text}\n\nWho's the artist?`,
      {
        reply_markup: { force_reply: true, input_field_placeholder: "Artist name…" },
      },
    );
    return;
  }

  if (ctx.session.step === "awaiting_track_artist") {
    if (!ctx.session.pendingTrack) return next();
    ctx.session.pendingTrack.artist = text;
    ctx.session.step = "awaiting_track_album";
    await ctx.reply(
      `Artist: ${text}\n\nWhat album is it from? (or "skip" to leave blank)`,
      {
        reply_markup: { force_reply: true, input_field_placeholder: "Album name…" },
      },
    );
    return;
  }

  if (ctx.session.step === "awaiting_track_album") {
    if (!ctx.session.pendingTrack) return next();
    ctx.session.pendingTrack.album = text.toLowerCase() === "skip" ? "" : text;
    ctx.session.step = "awaiting_track_tags";

    const pending = ctx.session.pendingTrack;
    const summary = [
      `Title: ${pending.title}`,
      `Artist: ${pending.artist}`,
      pending.album ? `Album: ${pending.album}` : null,
      `Size: ${formatFileSize(pending.file_size)}`,
    ].filter(Boolean).join("\n");

    await ctx.reply(
      `${summary}\n\nAdd tags (comma-separated, e.g. "rock, classic, 90s") or type "skip":`,
      {
        reply_markup: { force_reply: true, input_field_placeholder: "Tags…" },
      },
    );
    return;
  }

  if (ctx.session.step === "awaiting_track_tags") {
    if (!ctx.session.pendingTrack) return next();
    const tags = text.toLowerCase() === "skip"
      ? []
      : text.split(",").map(t => t.trim()).filter(t => t.length > 0);

    ctx.session.pendingTrack.tags = tags;

    const pending = ctx.session.pendingTrack;
    const { track, submission } = addSubmission({
      title: pending.title,
      artist: pending.artist,
      album: pending.album,
      duration: pending.duration,
      file_size: pending.file_size,
      uploader_id: ctx.from?.id ?? 0,
      tags,
      cover_art: pending.cover_art,
      file_path: pending.file_path,
    });

    ctx.session.step = undefined;
    ctx.session.pendingTrack = undefined;

    await ctx.reply(
      `✅ Track submitted!\n\n"${track.title}" by ${track.artist} is now pending review. You'll be notified once an admin approves it.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );

    // Notify admins
    const adminIds = getAdminIds();
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendMessage(
          adminId,
          `📥 New track submission\n\n"${track.title}" by ${track.artist}` +
          (track.album ? ` (${track.album})` : "") +
          `\n\nTags: ${tags.length > 0 ? tags.join(", ") : "none"}`,
          {
            reply_markup: inlineKeyboard([
              [
                inlineButton("✅ Approve", `moderation:approve:${track.id}`),
                inlineButton("❌ Reject", `moderation:reject:${track.id}`),
              ],
            ]),
          },
        );
      } catch {
        // 403 if admin never started the bot — skip silently
      }
    }
    return;
  }

  return next();
});

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default composer;
