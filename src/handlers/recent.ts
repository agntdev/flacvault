import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { getRecentTracks } from "../data.js";

registerMainMenuItem({ label: "🕐 Recent", data: "recent:show", order: 30 });

const composer = new Composer<Ctx>();

composer.command("recent", async (ctx) => {
  await showRecent(ctx, 0);
});

composer.callbackQuery("recent:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.recentPage = 0;
  await showRecent(ctx, 0);
});

composer.callbackQuery(/^recent:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1], 10);
  ctx.session.recentPage = page;
  await showRecent(ctx, page);
});

async function showRecent(ctx: Ctx, page: number) {
  const tracks = getRecentTracks(50);

  if (tracks.length === 0) {
    await ctx.reply(
      "No tracks submitted yet. Be the first to upload one!",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const { pageItems, controls } = paginate(tracks, {
    page,
    perPage: 5,
    callbackPrefix: "recent:page",
  });

  const lines = ["Recently submitted tracks:\n"];
  for (const t of pageItems) {
    const ago = timeAgo(t.upload_timestamp);
    lines.push(`• ${t.title} — ${t.artist} (${ago})`);
  }

  const keyboard = inlineKeyboard([
    ...pageItems.map(t => [
      inlineButton(`${t.title} by ${t.artist}`, `track:detail:${t.id}`),
    ]),
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);

  await ctx.reply(lines.join("\n"), { reply_markup: keyboard });
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default composer;
