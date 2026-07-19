import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { searchTracks } from "../data.js";

registerMainMenuItem({ label: "🔍 Search", data: "search:start", order: 40 });

const composer = new Composer<Ctx>();

composer.command("search", async (ctx) => {
  const query = ctx.message?.text?.replace(/^\/search\s*/i, "").trim();
  if (!query) {
    ctx.session.step = "awaiting_search_query";
    await ctx.reply(
      "What are you looking for?\n\nSearch by title, artist, or album.",
      {
        reply_markup: { force_reply: true, input_field_placeholder: "Search query…" },
      },
    );
    return;
  }
  await doSearch(ctx, query, 0);
});

composer.callbackQuery("search:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_search_query";
  await ctx.reply(
    "What are you looking for?\n\nSearch by title, artist, or album.",
    {
      reply_markup: { force_reply: true, input_field_placeholder: "Search query…" },
    },
  );
});

composer.callbackQuery(/^search:page:(\d+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match[1], 10);
  const query = decodeURIComponent(ctx.match[2]);
  ctx.session.searchPage = page;
  await doSearch(ctx, query, page);
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_search_query") return next();
  const query = ctx.message.text.trim();
  ctx.session.step = undefined;
  await doSearch(ctx, query, 0);
});

async function doSearch(ctx: Ctx, query: string, page: number) {
  const tracks = searchTracks(query);

  if (tracks.length === 0) {
    await ctx.reply(
      `No tracks found matching "${query}". Try a different search term.`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const { pageItems, controls } = paginate(tracks, {
    page,
    perPage: 5,
    callbackPrefix: `search:page:${encodeURIComponent(query)}`,
  });

  const lines = [`Results for "${query}" (${tracks.length} found):\n`];
  for (const t of pageItems) {
    lines.push(`• ${t.title} — ${t.artist}${t.album ? ` (${t.album})` : ""}`);
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
