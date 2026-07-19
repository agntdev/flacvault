import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { approveSubmission, getTrack, isAdmin } from "../data.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^moderation:approve:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const trackId = ctx.match[1];
  const userId = ctx.from?.id ?? 0;

  if (!isAdmin(userId)) {
    await ctx.reply("Only admins can approve submissions.", {
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

  approveSubmission(trackId);

  await ctx.reply(
    `✅ Approved!\n\n"${track.title}" by ${track.artist} is now live in the library.`,
    { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
  );

  // Notify the submitter
  try {
    await ctx.api.sendMessage(
      track.uploader_id,
      `✅ Your track "${track.title}" by ${track.artist} has been approved and is now available in the library.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
  } catch {
    // 403 if submitter never started the bot — skip silently
  }
});

export default composer;
