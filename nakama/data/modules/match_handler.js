var MOVE_OP_CODE = 1;
var GAME_STATE_OP_CODE = 2;
var GAME_OVER_OP_CODE = 3;
var INVALID_MOVE_OP_CODE = 4;
var PLAYER_INFO_OP_CODE = 5;
var WINS_LEADERBOARD_ID = "tictactoe_wins";

function createInitialState() {
  return {
    board: ["", "", "", "", "", "", "", "", ""],
    currentTurn: "X",
    players: {
      X: null,
      O: null,
    },
    status: "waiting",
    winner: null,
  };
}

function getPlayerSymbol(state, userId) {
  if (state.players.X && state.players.X.userId === userId) {
    return "X";
  }

  if (state.players.O && state.players.O.userId === userId) {
    return "O";
  }

  return null;
}

function getDisplayName(presence) {
  if (presence.username && presence.username !== "") {
    return presence.username;
  }

  return "Player";
}

function getOpenSymbol(state) {
  if (!state.players.X) {
    return "X";
  }

  if (!state.players.O) {
    return "O";
  }

  return null;
}

function getPlayerInfos(state) {
  return {
    X: state.players.X,
    O: state.players.O,
  };
}

function broadcastToAll(dispatcher, opCode, payload) {
  dispatcher.broadcastMessage(opCode, JSON.stringify(payload), null, null, true);
}

function sendToPresence(dispatcher, opCode, payload, presence) {
  dispatcher.broadcastMessage(opCode, JSON.stringify(payload), [presence], null, true);
}

function writeWinsRecord(nk, player, incrementBy) {
  if (!player || !player.userId) {
    return;
  }

  nk.leaderboardRecordWrite(
    WINS_LEADERBOARD_ID,
    player.userId,
    player.displayName || "",
    incrementBy,
    0,
    {}
  );
}

function updateLeaderboardForResult(nk, state, winnerSymbol) {
  var xIncrement = winnerSymbol === "X" ? 1 : 0;
  var oIncrement = winnerSymbol === "O" ? 1 : 0;

  writeWinsRecord(nk, state.players.X, xIncrement);
  writeWinsRecord(nk, state.players.O, oIncrement);
}

function checkWinner(board) {
  var winningLines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (var index = 0; index < winningLines.length; index += 1) {
    var line = winningLines[index];
    var a = line[0];
    var b = line[1];
    var c = line[2];

    if (board[a] !== "" && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function checkDraw(board) {
  for (var index = 0; index < board.length; index += 1) {
    if (board[index] === "") {
      return false;
    }
  }

  return checkWinner(board) === null;
}

var matchHandler = {
  matchInit: function matchInit(ctx, logger, nk, params) {
    return {
      state: createInitialState(),
      tickRate: 1,
      label: "tictactoe",
    };
  },

  matchJoinAttempt: function matchJoinAttempt(
    ctx,
    logger,
    nk,
    dispatcher,
    tick,
    state,
    presence,
    metadata
  ) {
    var playerCount = 0;

    if (state.players.X) {
      playerCount += 1;
    }

    if (state.players.O) {
      playerCount += 1;
    }

    return {
      state: state,
      accept: playerCount < 2,
    };
  },

  matchJoin: function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var index = 0; index < presences.length; index += 1) {
      var presence = presences[index];
      var symbol = getOpenSymbol(state);

      if (!symbol) {
        continue;
      }

      state.players[symbol] = {
        userId: presence.userId,
        displayName: getDisplayName(presence),
      };
    }

    if (state.players.X && state.players.O) {
      state.status = "active";
      broadcastToAll(dispatcher, PLAYER_INFO_OP_CODE, getPlayerInfos(state));
      broadcastToAll(dispatcher, GAME_STATE_OP_CODE, state);
    }

    return { state: state };
  },

  matchLeave: function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
    for (var index = 0; index < presences.length; index += 1) {
      var presence = presences[index];
      var symbol = getPlayerSymbol(state, presence.userId);

      if (!symbol) {
        continue;
      }

      state.players[symbol] = null;

      if (state.status === "active") {
        state.status = "finished";
        state.winner = symbol === "X" ? "O" : "X";
        broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
      }
    }

    return { state: state };
  },

  matchLoop: function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
    for (var index = 0; index < messages.length; index += 1) {
      var message = messages[index];

      if (message.opCode !== MOVE_OP_CODE) {
        continue;
      }

      if (state.status !== "active") {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Game is not active." }, message.sender);
        continue;
      }

      var symbol = getPlayerSymbol(state, message.sender.userId);

      if (!symbol) {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Player is not part of this match." }, message.sender);
        continue;
      }

      if (state.currentTurn !== symbol) {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "It is not your turn." }, message.sender);
        continue;
      }

      var payload;

      try {
        payload = JSON.parse(message.data);
      } catch (error) {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Move payload is invalid." }, message.sender);
        continue;
      }

      var cell = payload.index;

      if (typeof cell !== "number" || cell < 0 || cell > 8 || cell % 1 !== 0) {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Move index must be an integer from 0 to 8." }, message.sender);
        continue;
      }

      if (state.board[cell] !== "") {
        sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Cell is already occupied." }, message.sender);
        continue;
      }

      state.board[cell] = symbol;

      var winner = checkWinner(state.board);

      if (winner) {
        state.status = "finished";
        state.winner = winner;
        updateLeaderboardForResult(nk, state, winner);
        broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
        continue;
      }

      if (checkDraw(state.board)) {
        state.status = "finished";
        state.winner = "draw";
        updateLeaderboardForResult(nk, state, null);
        broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
        continue;
      }

      state.currentTurn = symbol === "X" ? "O" : "X";
      broadcastToAll(dispatcher, GAME_STATE_OP_CODE, state);
    }

    return { state: state };
  },

  matchTerminate: function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state: state };
  },
};
