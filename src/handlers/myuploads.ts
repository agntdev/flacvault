import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { getUserTracks } from "../data.js";

registerMainMenuItem({ label: "📁 My uploads", data: "myuploads:show", order: 50 });

const composer = new Composer<Ctx>();

composer.command("myuploads", async (ctx) => {
  await showMyUploads(ctx, 0);
});

composer.callbackQuery("myuploads:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.myUploadsPage = 0;
  await showMyUploads(ctx, 0);
});

composer.callbackQuery(/^myuploads:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1], 10);
  ctx.session.myUploadsPage = page;
  await showMyUploads(ctx, page);
});

async function showMyUploads(ctx: Ctx, page: number) {
  const userId = ctx.from?.id ?? 0;
  const tracks = getUserTracks(userId);

  if (tracks.length === 0) {
    await ctx.reply(
      "You haven't uploaded any tracks yet. Tap Submit Track to add one.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const { pageItems, controls } = paginate(tracks, {
    page,
    perPage: 5,
    callbackPrefix: "myuploads:page",
  });

  const lines = ["Your uploads:\n"];
  for (const t of pageItems) {
    const status = t.status === "approved" ? "✅" : t.status === "pending" ? "⏳" : "❌";
    lines.push(`${status} ${t.title} — ${t.artist}`);
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

export default composer;
