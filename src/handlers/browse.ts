import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { getAllTags, getTracksByTag } from "../data.js";

registerMainMenuItem({ label: "🗂 Browse", data: "browse:start", order: 20 });

const composer = new Composer<Ctx>();

composer.command("browse", async (ctx) => {
  await showBrowse(ctx);
});

composer.callbackQuery("browse:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showBrowse(ctx);
});

composer.callbackQuery(/^browse:tag:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tag = ctx.match[1];
  ctx.session.browsePage = 0;
  await showTracksByTag(ctx, tag, 0);
});

composer.callbackQuery(/^browse:tagpage:(.+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tag = ctx.match[1];
  const page = parseInt(ctx.match[2], 10);
  ctx.session.browsePage = page;
  await showTracksByTag(ctx, tag, page);
});

async function showBrowse(ctx: Ctx) {
  const tags = getAllTags();
  if (tags.length === 0) {
    await ctx.reply(
      "No tags available yet. Tracks will appear here once they're submitted and approved.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const rows = tags.map(tag => [
    inlineButton(`${tag} (${getTracksByTag(tag).length})`, `browse:tag:${tag}`),
  ]);
  rows.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  await ctx.reply(
    "Browse tracks by tag:\n\nTap a tag to see matching tracks.",
    { reply_markup: inlineKeyboard(rows) },
  );
}

async function showTracksByTag(ctx: Ctx, tag: string, page: number) {
  const tracks = getTracksByTag(tag);
  if (tracks.length === 0) {
    await ctx.reply(
      `No tracks with the tag "${tag}" yet.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to tags", "browse:start")]]) },
    );
    return;
  }

  const { pageItems, controls, totalPages } = paginate(tracks, {
    page,
    perPage: 5,
    callbackPrefix: `browse:tagpage:${tag}`,
  });

  const lines = [`Tracks tagged "${tag}" (${tracks.length} total):\n`];
  for (const t of pageItems) {
    lines.push(`• ${t.title} — ${t.artist}`);
  }

  const keyboard = inlineKeyboard([
    ...pageItems.map(t => [
      inlineButton(`${t.title} by ${t.artist}`, `track:detail:${t.id}`),
    ]),
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to tags", "browse:start")],
  ]);

  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

export default composer;
