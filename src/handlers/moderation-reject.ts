import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { rejectSubmission, getTrack, isAdmin } from "../data.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^moderation:reject:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const trackId = ctx.match[1];
  const userId = ctx.from?.id ?? 0;

  if (!isAdmin(userId)) {
    await ctx.reply("Only admins can reject submissions.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const track = getTrack(trackId);
  if (!track) {
    await ctx.reply("That submission no longer exists.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  if (track.status !== "pending") {
    await ctx.reply(`"${track.title}" has already been ${track.status}.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  ctx.session.awaitingRejectReason = trackId;
  await ctx.reply(
    `Rejecting "${track.title}" by ${track.artist}.\n\nProvide a reason (or type "skip"):`,
    {
      reply_markup: { force_reply: true, input_field_placeholder: "Rejection reason…" },
    },
  );
});

composer.on("message:text", async (ctx, next) => {
  if (!ctx.session.awaitingRejectReason) return next();

  const trackId = ctx.session.awaitingRejectReason;
  const reason = ctx.message.text.trim().toLowerCase() === "skip"
    ? ""
    : ctx.message.text.trim();

  ctx.session.awaitingRejectReason = undefined;

  const track = getTrack(trackId);
  if (!track) {
    await ctx.reply("That submission no longer exists.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  rejectSubmission(trackId, reason);

  await ctx.reply(
    `❌ Rejected\n\n"${track.title}" by ${track.artist} has been rejected.`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );

  // Notify the submitter
  try {
    const reasonText = reason ? `\n\nReason: ${reason}` : "";
    await ctx.api.sendMessage(
      track.uploader_id,
      `❌ Your track "${track.title}" by ${track.artist} was not approved.${reasonText}`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
  } catch {
    // 403 if submitter never started the bot — skip silently
  }
});

export default composer;
