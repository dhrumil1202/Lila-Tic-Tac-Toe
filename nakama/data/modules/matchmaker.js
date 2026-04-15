function matchmakerMatched(ctx, logger, nk, matches) {
  if (!matches || matches.length < 2) {
    throw new Error("Matchmaker callback requires 2 matched users.");
  }

  return nk.matchCreate("tictactoe", {});
}
