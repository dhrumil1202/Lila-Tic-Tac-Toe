var MOVE_OP_CODE = 1;
var GAME_STATE_OP_CODE = 2;
var GAME_OVER_OP_CODE = 3;
var INVALID_MOVE_OP_CODE = 4;
var PLAYER_INFO_OP_CODE = 5;
var TIMER_UPDATE_OP_CODE = 6;
var WINS_LEADERBOARD_ID = "tictactoe_wins";
var PLAYER_STATS_COLLECTION = "player_stats";
var PLAYER_STATS_KEY = "summary";

function debugLog(logger, message) {
	logger.info("[DBG] " + message);
}

function playerCount(state) {
	var count = 0;
	if (state.players.X) {
		count += 1;
	}
	if (state.players.O) {
		count += 1;
	}
	return count;
}

function normalizeMode(value) {
	if (value === "timed") {
		return "timed";
	}

	return "classic";
}

function createInitialState(mode) {
	var selectedMode = normalizeMode(mode);
	var isTimed = selectedMode === "timed";

	return {
		board: ["", "", "", "", "", "", "", "", ""],
		currentTurn: "X",
		players: {
			X: null,
			O: null,
		},
		status: "waiting",
		winner: null,
		mode: selectedMode,
		turnStartTime: isTimed ? Date.now() : 0,
		timeLimit: isTimed ? 30000 : 0,
		currentTurnToken: "",
		lastMoveIdByUser: {},
	};
}

function makeTurnToken() {
	return String(Date.now()) + "-" + String(Math.floor(Math.random() * 1000000000));
}

function rotateTurnToken(state) {
	state.currentTurnToken = makeTurnToken();
}

function getRemainingMs(state, now) {
	var elapsed = now - state.turnStartTime;
	var remaining = state.timeLimit - elapsed;

	if (remaining < 0) {
		return 0;
	}

	return remaining;
}

function getRemainingSeconds(remainingMs) {
	return Math.ceil(remainingMs / 1000);
}

function broadcastTimerUpdate(dispatcher, state, now) {
	var remainingMs = getRemainingMs(state, now);
	broadcastToAll(dispatcher, TIMER_UPDATE_OP_CODE, {
		currentTurn: state.currentTurn,
		turnStartTime: state.turnStartTime,
		timeLimit: state.timeLimit,
		remainingMs: remainingMs,
		remainingSeconds: getRemainingSeconds(remainingMs),
	});
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

function writeWinsRecord(nk, logger, player, incrementBy) {
	if (!player || !player.userId) {
		debugLog(logger, "leaderboard write skipped missing player");
		return;
	}

	try {
		var writeResult = nk.leaderboardRecordWrite(
			WINS_LEADERBOARD_ID,
			player.userId,
			player.displayName || "",
			incrementBy,
			0,
			{}
		);
		debugLog(
			logger,
			"leaderboard write ok user=" +
				player.userId +
				" name=" +
				(player.displayName || "") +
				" increment=" +
				incrementBy +
				" score=" +
				(writeResult && typeof writeResult.score === "number" ? writeResult.score : "-")
		);
	} catch (error) {
		debugLog(logger, "leaderboard write failed user=" + player.userId + " error=" + error.message);
	}
}

function parseStatsValue(value) {
	if (!value) {
		return null;
	}

	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch (error) {
			return null;
		}
	}

	if (typeof value === "object") {
		return value;
	}

	return null;
}

function getDefaultStats() {
	return {
		wins: 0,
		losses: 0,
		currentWinStreak: 0,
		bestWinStreak: 0,
	};
}

function readStatsByUserIds(nk, userIds) {
	var reads = [];
	var statsByUser = {};

	for (var i = 0; i < userIds.length; i += 1) {
		reads.push({
			collection: PLAYER_STATS_COLLECTION,
			key: PLAYER_STATS_KEY,
			userId: userIds[i],
		});
	}

	var items = nk.storageRead(reads);

	for (var itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
		var item = items[itemIndex];
		var parsedValue = parseStatsValue(item.value) || getDefaultStats();
		statsByUser[item.userId || item.user_id] = parsedValue;
	}

	for (var userIndex = 0; userIndex < userIds.length; userIndex += 1) {
		var userId = userIds[userIndex];
		if (!statsByUser[userId]) {
			statsByUser[userId] = getDefaultStats();
		}
	}

	return statsByUser;
}

function writeStats(nk, userId, stats) {
	try {
		nk.storageWrite([
			{
				collection: PLAYER_STATS_COLLECTION,
				key: PLAYER_STATS_KEY,
				userId: userId,
				value: stats,
				permissionRead: 0,
				permissionWrite: 0,
			},
		]);
	} catch (error) {
		// Stats persistence must not terminate a live match.
		// Keep gameplay and leaderboard updates running even if storage write fails.
	}
}

function getLeaderboardWinsForUser(nk, userId) {
	if (!userId) {
		return 0;
	}

	try {
		var result = nk.leaderboardRecordsList(WINS_LEADERBOARD_ID, [userId], 1, null, null);
		var records = result && result.records ? result.records : [];
		if (records.length === 0) {
			return 0;
		}

		var score = records[0].score;
		if (typeof score === "number") {
			return score;
		}
	} catch (error) {
		return 0;
	}

	return 0;
}

function updatePlayerStatsForResult(nk, logger, state, winnerSymbol, xOldLeaderboardWins, oOldLeaderboardWins) {
	var playerX = state.players.X;
	var playerO = state.players.O;

	if (!playerX || !playerO) {
		return;
	}

	var statsByUser = readStatsByUserIds(nk, [playerX.userId, playerO.userId]);
	var xStats = statsByUser[playerX.userId] || getDefaultStats();
	var oStats = statsByUser[playerO.userId] || getDefaultStats();

	// Backfill from leaderboard only if user has no local stats and has leaderboard entries
	if (xStats.wins === 0 && xStats.losses === 0 && xStats.bestWinStreak === 0 && xOldLeaderboardWins > 0) {
		xStats.wins = xOldLeaderboardWins;
	}

	if (oStats.wins === 0 && oStats.losses === 0 && oStats.bestWinStreak === 0 && oOldLeaderboardWins > 0) {
		oStats.wins = oOldLeaderboardWins;
	}

	if (winnerSymbol === "X") {
		xStats.wins += 1;
		xStats.currentWinStreak += 1;
		if (xStats.currentWinStreak > xStats.bestWinStreak) {
			xStats.bestWinStreak = xStats.currentWinStreak;
		}

		oStats.losses += 1;
		oStats.currentWinStreak = 0;
	} else if (winnerSymbol === "O") {
		oStats.wins += 1;
		oStats.currentWinStreak += 1;
		if (oStats.currentWinStreak > oStats.bestWinStreak) {
			oStats.bestWinStreak = oStats.currentWinStreak;
		}

		xStats.losses += 1;
		xStats.currentWinStreak = 0;
	} else {
		xStats.currentWinStreak = 0;
		oStats.currentWinStreak = 0;
	}

	writeStats(nk, playerX.userId, xStats);
	writeStats(nk, playerO.userId, oStats);

	debugLog(
		logger,
		"player stats updated winner=" +
			(winnerSymbol || "draw") +
			" X(w/l/streak)=" +
			xStats.wins +
			"/" +
			xStats.losses +
			"/" +
			xStats.currentWinStreak +
			" O(w/l/streak)=" +
			oStats.wins +
			"/" +
			oStats.losses +
			"/" +
			oStats.currentWinStreak
	);
}

function updateLeaderboardForResult(nk, logger, state, winnerSymbol) {
	var playerX = state.players.X;
	var playerO = state.players.O;

	if (!playerX && !playerO) {
		return;
	}

	var xIncrement = winnerSymbol === "X" ? 1 : 0;
	var oIncrement = winnerSymbol === "O" ? 1 : 0;

	// Read leaderboard scores BEFORE incrementing for accurate backfill
	var xOldLeaderboardWins = playerX ? getLeaderboardWinsForUser(nk, playerX.userId) : 0;
	var oOldLeaderboardWins = playerO ? getLeaderboardWinsForUser(nk, playerO.userId) : 0;

	debugLog(
		logger,
		"leaderboard update result winner=" +
			(winnerSymbol || "draw") +
			" X=" +
			(playerX ? playerX.userId : "-") +
			" O=" +
			(playerO ? playerO.userId : "-")
	);

	writeWinsRecord(nk, logger, playerX, xIncrement);
	writeWinsRecord(nk, logger, playerO, oIncrement);
	updatePlayerStatsForResult(nk, logger, state, winnerSymbol, xOldLeaderboardWins, oOldLeaderboardWins);
}

function decodePayloadString(data) {
	if (typeof data === "string") {
		return data;
	}

	if (Object.prototype.toString.call(data) === "[object ArrayBuffer]") {
		var bytes = null;

		if (typeof Uint8Array !== "undefined") {
			try {
				bytes = new Uint8Array(data);
			} catch (error) {
				bytes = null;
			}
		}

		if (!bytes && typeof DataView !== "undefined") {
			try {
				var view = new DataView(data);
				var arr = [];
				for (var v = 0; v < view.byteLength; v += 1) {
					arr.push(view.getUint8(v));
				}
				bytes = arr;
			} catch (error) {
				bytes = null;
			}
		}

		if (bytes) {
			var outFromBuffer = "";
			for (var b = 0; b < bytes.length; b += 1) {
				outFromBuffer += String.fromCharCode(bytes[b]);
			}
			return outFromBuffer;
		}
	}

	if (data && typeof data.length === "number") {
		var out = "";
		for (var i = 0; i < data.length; i += 1) {
			out += String.fromCharCode(data[i]);
		}
		return out;
	}

	return "";
}

function previewText(value, maxLen) {
	if (value == null) {
		return "";
	}

	var text = String(value);
	text = text.replace(/\s+/g, " ");

	if (text.length > maxLen) {
		return text.slice(0, maxLen) + "...";
	}

	return text;
}

function inspectMoveData(nk, data) {
	var parts = [];
	parts.push("type=" + typeof data);

	try {
		parts.push("tag=" + Object.prototype.toString.call(data));
	} catch (error) {
		parts.push("tag=<error>");
	}

	try {
		if (data && typeof data.length === "number") {
			parts.push("len=" + data.length);
		}
		if (Object.prototype.toString.call(data) === "[object ArrayBuffer]" && typeof data.byteLength === "number") {
			parts.push("byteLength=" + data.byteLength);
		}
	} catch (error) {
		parts.push("len=<error>");
	}

	try {
		if (data && typeof data === "object") {
			parts.push("keys=" + Object.keys(data).join(","));
		}
	} catch (error) {
		parts.push("keys=<error>");
	}

	try {
		if (nk && typeof nk.binaryToString === "function") {
			parts.push("binary=" + previewText(nk.binaryToString(data), 120));
		}
	} catch (error) {
		parts.push("binary=<decode_error>");
	}

	try {
		parts.push("string=" + previewText(decodePayloadString(data), 120));
	} catch (error) {
		parts.push("string=<decode_error>");
	}

	try {
		parts.push("toString=" + previewText(data && data.toString ? data.toString() : "", 120));
	} catch (error) {
		parts.push("toString=<error>");
	}

	return parts.join(" | ");
}

function parseMovePayload(nk, data) {
	if (!data && data !== 0) {
		return null;
	}

	if (typeof data === "object") {
		if (typeof data.position === "number" || typeof data.index === "number") {
			return data;
		}

		if (data.data != null) {
			return parseMovePayload(nk, data.data);
		}

		if (data.payload != null) {
			return parseMovePayload(nk, data.payload);
		}

		if (data.content != null) {
			return parseMovePayload(nk, data.content);
		}
	}

	var text = "";

	if (nk && typeof nk.binaryToString === "function") {
		try {
			text = nk.binaryToString(data);
		} catch (error) {
			text = "";
		}
	}

	if (!text) {
		text = decodePayloadString(data);
	}

	if (!text) {
		if (typeof data === "object") {
			var objectText = "";
			try {
				objectText = JSON.stringify(data);
			} catch (error) {
				objectText = "";
			}

			if (objectText && objectText !== "{}") {
				text = objectText;
			}
		}
	}

	if (!text && data && typeof data.toString === "function") {
		var asString = data.toString();
		if (asString && asString !== "[object Object]") {
			text = asString;
		}
	}

	if (!text) {
		return null;
	}

	var parsed = JSON.parse(text);

	if (typeof parsed === "string") {
		parsed = JSON.parse(parsed);
	}

	return parsed;
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

function matchInit(ctx, logger, nk, params) {
	var mode = params && params.mode ? normalizeMode(params.mode) : "classic";
	debugLog(logger, "matchInit tickRate=1 label=tictactoe mode=" + mode);
	return {
		state: createInitialState(mode),
		tickRate: 1,
		label: "tictactoe",
	};
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
	var count = 0;

	if (state.players.X) {
		count += 1;
	}

	if (state.players.O) {
		count += 1;
	}

	debugLog(
		logger,
		"matchJoinAttempt tick=" +
			tick +
			" user=" +
			presence.userId +
			" current_players=" +
			playerCount(state)
	);

	return {
		state: state,
		accept: count < 2,
	};
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
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

	debugLog(
		logger,
		"matchJoin tick=" +
			tick +
			" joined=" +
			presences.length +
			" players_now=" +
			playerCount(state) +
			" X=" +
			(state.players.X ? state.players.X.userId : "-") +
			" O=" +
			(state.players.O ? state.players.O.userId : "-")
	);

	if (state.players.X && state.players.O) {
		state.status = "active";
		rotateTurnToken(state);
		if (state.mode === "timed") {
			state.turnStartTime = Date.now();
		}
		debugLog(logger, "matchJoin both players present, broadcasting PLAYER_INFO + GAME_STATE");
		broadcastToAll(dispatcher, PLAYER_INFO_OP_CODE, getPlayerInfos(state));
		broadcastToAll(dispatcher, GAME_STATE_OP_CODE, state);
		if (state.mode === "timed") {
			broadcastTimerUpdate(dispatcher, state, Date.now());
		}
	}

	return { state: state };
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
	for (var index = 0; index < presences.length; index += 1) {
		var presence = presences[index];
		var symbol = getPlayerSymbol(state, presence.userId);

		if (!symbol) {
			continue;
		}

		debugLog(logger, "matchLeave tick=" + tick + " user=" + presence.userId + " symbol=" + symbol);

		state.players[symbol] = null;

		if (state.status === "active") {
			state.status = "finished";
			state.winner = symbol === "X" ? "O" : "X";
			updateLeaderboardForResult(nk, logger, state, state.winner);
			broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
		}
	}

	return { state: state };
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
	if (state.status === "active" && state.mode === "timed") {
		var now = Date.now();
		var elapsed = now - state.turnStartTime;

		broadcastTimerUpdate(dispatcher, state, now);

		if (elapsed > state.timeLimit) {
			var forfeitingSymbol = state.currentTurn;
			var winnerSymbol = forfeitingSymbol === "X" ? "O" : "X";

			state.status = "finished";
			state.winner = winnerSymbol;

			debugLog(
				logger,
				"turn timeout forfeit symbol=" + forfeitingSymbol + " winner=" + winnerSymbol + " tick=" + tick
			);

			updateLeaderboardForResult(nk, logger, state, winnerSymbol);
			broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
			return { state: state };
		}
	}

	if (tick % 5 === 0) {
		debugLog(
			logger,
			"matchLoop tick=" +
				tick +
				" players=" +
				playerCount(state) +
				" status=" +
				state.status +
				" messages=" +
				messages.length
		);
	}

	if (state.players.X || state.players.O) {
		broadcastToAll(dispatcher, PLAYER_INFO_OP_CODE, getPlayerInfos(state));

		if (state.status === "finished") {
			broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
		} else {
			broadcastToAll(dispatcher, GAME_STATE_OP_CODE, state);
		}
	}

	for (var index = 0; index < messages.length; index += 1) {
		var message = messages[index];
		debugLog(
			logger,
			"matchLoop message opCode=" + message.opCode + " sender=" + (message.sender ? message.sender.userId : "-")
		);
		debugLog(logger, "matchLoop message.data " + inspectMoveData(nk, message.data));

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
			payload = parseMovePayload(nk, message.data);
		} catch (error) {
			payload = null;
		}

		if (!payload) {
			debugLog(logger, "invalid move payload parse failed | " + inspectMoveData(nk, message.data));
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Move payload is invalid." }, message.sender);
			continue;
		}

		debugLog(logger, "parsed move payload=" + previewText(JSON.stringify(payload), 140));

		var moveId = payload.moveId;
		if (typeof moveId === "string" && moveId !== "") {
			moveId = Number(moveId);
		}

		if (typeof moveId !== "number" || moveId % 1 !== 0 || moveId < 1) {
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Invalid move sequence id." }, message.sender);
			continue;
		}

		var lastMoveId = state.lastMoveIdByUser[message.sender.userId] || 0;
		if (moveId <= lastMoveId) {
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Move replay detected." }, message.sender);
			continue;
		}

		if (!payload.turnToken || payload.turnToken !== state.currentTurnToken) {
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Turn token mismatch." }, message.sender);
			continue;
		}

		var cell = payload.position;

		if (typeof cell !== "number") {
			cell = payload.index;
		}

		if (typeof cell === "string" && cell !== "") {
			cell = Number(cell);
		}

		if (typeof cell !== "number" || cell < 0 || cell > 8 || cell % 1 !== 0) {
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Move index must be an integer from 0 to 8." }, message.sender);
			continue;
		}

		if (state.board[cell] !== "") {
			sendToPresence(dispatcher, INVALID_MOVE_OP_CODE, { reason: "Cell is already occupied." }, message.sender);
			continue;
		}

		state.board[cell] = symbol;
		state.lastMoveIdByUser[message.sender.userId] = moveId;

		var winner = checkWinner(state.board);

		if (winner) {
			state.status = "finished";
			state.winner = winner;
			updateLeaderboardForResult(nk, logger, state, winner);
			broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
			continue;
		}

		if (checkDraw(state.board)) {
			state.status = "finished";
			state.winner = "draw";
			updateLeaderboardForResult(nk, logger, state, null);
			broadcastToAll(dispatcher, GAME_OVER_OP_CODE, state);
			continue;
		}

		state.currentTurn = symbol === "X" ? "O" : "X";
		rotateTurnToken(state);
		if (state.mode === "timed") {
			state.turnStartTime = Date.now();
		}
		broadcastToAll(dispatcher, GAME_STATE_OP_CODE, state);
		if (state.mode === "timed") {
			broadcastTimerUpdate(dispatcher, state, Date.now());
		}
	}

	return { state: state };
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
	return { state: state };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
	return {
		state: state,
		data: data,
	};
}

var matchHandler = {
	matchInit: matchInit,
	matchJoinAttempt: matchJoinAttempt,
	matchJoin: matchJoin,
	matchLeave: matchLeave,
	matchLoop: matchLoop,
	matchTerminate: matchTerminate,
	matchSignal: matchSignal,
};

var matchmakingTicketsByUser = {};

function rpcFindMatch(ctx, logger, nk, payload) {
	var userId = ctx.userId || ctx.user_id || "";
	var sessionId = ctx.sessionId || ctx.session_id || "";

	debugLog(logger, "rpcFindMatch user=" + userId + " session=" + (sessionId || "-"));

	if (!userId) {
		throw new Error("User must be authenticated to join matchmaking.");
	}

	if (typeof nk.matchmakerAdd !== "function") {
		debugLog(logger, "rpcFindMatch matchmakerAdd unavailable, returning matchmaker_unavailable");
		return JSON.stringify({
			status: "matchmaker_unavailable",
		});
	}

	var body = {};
	if (payload && payload !== "") {
		body = JSON.parse(payload);
	}

	var selectedMode = normalizeMode(body.mode);
	var query = "+properties.mode:" + selectedMode;
	var stringProperties = { mode: selectedMode };
	var numericProperties = { skill: 1 };

	var ticket;

	try {
		ticket = nk.matchmakerAdd(
			userId,
			sessionId,
			"",
			query,
			2,
			2,
			stringProperties,
			numericProperties
		);
	} catch (error) {
		ticket = nk.matchmakerAdd(query, 2, 2, stringProperties, numericProperties);
	}

	matchmakingTicketsByUser[userId] = ticket;
	debugLog(logger, "rpcFindMatch queued ticket=" + ticket + " user=" + userId);

	return JSON.stringify({
		ticket: ticket,
		status: "queued",
		mode: selectedMode,
	});
}

function rpcCancelMatchmaking(ctx, logger, nk, payload) {
	var userId = ctx.userId || ctx.user_id || "";
	debugLog(logger, "rpcCancelMatchmaking user=" + (userId || "-"));

	if (!userId) {
		throw new Error("User must be authenticated to cancel matchmaking.");
	}

	if (typeof nk.matchmakerRemove !== "function") {
		return JSON.stringify({
			status: "matchmaker_unavailable",
		});
	}

	var body = {};

	if (payload && payload !== "") {
		body = JSON.parse(payload);
	}

	var ticket = body.ticket || matchmakingTicketsByUser[userId];

	if (!ticket) {
		return JSON.stringify({
			status: "no_ticket",
		});
	}

	nk.matchmakerRemove(ticket);
	delete matchmakingTicketsByUser[userId];
	debugLog(logger, "rpcCancelMatchmaking removed ticket=" + ticket + " user=" + userId);

	return JSON.stringify({
		status: "cancelled",
		ticket: ticket,
	});
}

function rpcGetLeaderboard(ctx, logger, nk, payload) {
	var userId = ctx.userId || ctx.user_id || "";
	debugLog(logger, "rpcGetLeaderboard requested by user=" + (userId || "anonymous"));

	var result = nk.leaderboardRecordsList(WINS_LEADERBOARD_ID, [], 10, null, null);
	var records = result && result.records ? result.records : [];
	var top = [];
	var userIds = [];

	for (var userIndex = 0; userIndex < records.length; userIndex += 1) {
		var userRecord = records[userIndex];
		var ownerId = userRecord.owner_id || userRecord.ownerId || "";
		if (ownerId) {
			userIds.push(ownerId);
		}
	}

	var statsByUser = userIds.length > 0 ? readStatsByUserIds(nk, userIds) : {};

	for (var i = 0; i < records.length; i += 1) {
		var record = records[i];
		var topOwnerId = record.owner_id || record.ownerId || "";
		var stats = statsByUser[topOwnerId] || getDefaultStats();
		var wins = stats.wins;
		if (typeof wins !== "number" || wins <= 0) {
			wins = record.score || 0;
		}
		top.push({
			ownerId: topOwnerId,
			displayName: record.username || record.display_name || record.displayName || "Player",
			score: record.score || 0,
			rank: record.rank || i + 1,
			wins: wins,
			losses: stats.losses || 0,
			winStreak: stats.currentWinStreak || 0,
			bestWinStreak: stats.bestWinStreak || 0,
		});
	}

	// Deduplicate by display name — merge stats for accounts sharing the same username
	// (can happen when a user created both a device-auth and a password-auth account).
	var seen = {};
	var deduped = [];
	for (var di = 0; di < top.length; di += 1) {
		var entry = top[di];
		var nameKey = (entry.displayName || "").toLowerCase();
		if (seen[nameKey] !== undefined) {
			// Merge into the existing entry: sum wins/losses, keep higher streaks
			var existing = deduped[seen[nameKey]];
			existing.wins += entry.wins;
			existing.losses += entry.losses;
			if (entry.winStreak > existing.winStreak) {
				existing.winStreak = entry.winStreak;
			}
			if (entry.bestWinStreak > existing.bestWinStreak) {
				existing.bestWinStreak = entry.bestWinStreak;
			}
			existing.score += entry.score;
		} else {
			seen[nameKey] = deduped.length;
			deduped.push(entry);
		}
	}
	top = deduped;

	// Sort by wins descending (most wins first)
	top.sort(function (a, b) {
		if (b.wins !== a.wins) {
			return b.wins - a.wins;
		}
		// If wins are equal, sort by best streak descending
		if (b.bestWinStreak !== a.bestWinStreak) {
			return b.bestWinStreak - a.bestWinStreak;
		}
		// Then by losses ascending (fewer losses first)
		return a.losses - b.losses;
	});

	// Update ranks after sorting
	for (var rankIndex = 0; rankIndex < top.length; rankIndex += 1) {
		top[rankIndex].rank = rankIndex + 1;
	}

	debugLog(logger, "rpcGetLeaderboard returning records=" + top.length);

	return JSON.stringify({
		leaderboardId: WINS_LEADERBOARD_ID,
		records: top,
	});
}

function rpcEnsurePlayerStats(ctx, logger, nk, payload) {
	var userId = ctx.userId || ctx.user_id || "";

	if (!userId) {
		throw new Error("User must be authenticated.");
	}

	var statsByUser = readStatsByUserIds(nk, [userId]);
	var stats = statsByUser[userId] || getDefaultStats();
	writeStats(nk, userId, stats);

	return JSON.stringify({
		status: "ok",
		stats: stats,
	});
}

function matchmakerMatched(ctx, logger, nk, matches) {
	debugLog(logger, "matchmakerMatched users=" + (matches ? matches.length : 0));
	if (!matches || matches.length < 2) {
		debugLog(logger, "matchmakerMatched insufficient users, returning empty match id");
		return "";
	}

	var mode = "classic";
	var firstMatch = matches[0];
	if (firstMatch) {
		var rawMode = "";
		if (firstMatch.properties && firstMatch.properties.mode) {
			rawMode = firstMatch.properties.mode;
		} else if (firstMatch.stringProperties && firstMatch.stringProperties.mode) {
			rawMode = firstMatch.stringProperties.mode;
		} else if (firstMatch.string_properties && firstMatch.string_properties.mode) {
			rawMode = firstMatch.string_properties.mode;
		}

		mode = normalizeMode(rawMode);
	}

	var createdMatchId = nk.matchCreate("tictactoe", { mode: mode });
	debugLog(logger, "matchmakerMatched created matchId=" + createdMatchId);
	return createdMatchId;
}

function InitModule(ctx, logger, nk, initializer) {
	try {
		nk.leaderboardCreate(
			WINS_LEADERBOARD_ID,
			true,
			"desc",
			"increment",
			null,
			{},
			false
		);
		debugLog(logger, "leaderboard created id=" + WINS_LEADERBOARD_ID);
	} catch (error) {
		debugLog(logger, "leaderboard create skipped id=" + WINS_LEADERBOARD_ID + " reason=" + error.message);
	}

	initializer.registerMatch("tictactoe", matchHandler);
	initializer.registerRpc("find_match", rpcFindMatch);
	initializer.registerRpc("cancel_matchmaking", rpcCancelMatchmaking);
	initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
	initializer.registerRpc("ensure_player_stats", rpcEnsurePlayerStats);
	initializer.registerMatchmakerMatched(matchmakerMatched);

	logger.info("Tic-Tac-Toe modules loaded.");
}
