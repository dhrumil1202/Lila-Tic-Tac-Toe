import { useEffect, useMemo, useState } from "react";
import Board from "../components/Board";
import GameOver from "../components/GameOver";

var MOVE_OP_CODE = 1;
var GAME_STATE_OP_CODE = 2;
var GAME_OVER_OP_CODE = 3;
var INVALID_MOVE_OP_CODE = 4;
var PLAYER_INFO_OP_CODE = 5;
var TIMER_UPDATE_OP_CODE = 6;

function createEmptyBoard() {
  return ["", "", "", "", "", "", "", "", ""];
}

function readPayload(data) {
  if (data == null) {
    return {};
  }

  // Nakama can send match payloads as binary; decode before JSON parse.
  if (typeof Uint8Array !== "undefined" && data instanceof Uint8Array) {
    try {
      var decoded = new TextDecoder().decode(data);
      return JSON.parse(decoded);
    } catch (error) {
      return {};
    }
  }

  if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
    try {
      var decodedBuffer = new TextDecoder().decode(new Uint8Array(data));
      return JSON.parse(decodedBuffer);
    } catch (error) {
      return {};
    }
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  return data;
}

function getMessageOpCode(message) {
  if (message && message.op_code != null) {
    return Number(message.op_code);
  }

  if (message && message.opCode != null) {
    return Number(message.opCode);
  }

  return -1;
}

function getMessageMatchId(message) {
  if (message && message.match_id) {
    return message.match_id;
  }

  if (message && message.matchId) {
    return message.matchId;
  }

  return "";
}

function getSessionUserId(session) {
  if (!session) {
    return "";
  }

  return session.user_id || session.userId || "";
}

function getSymbolForUser(playerInfo, userId) {
  if (!userId) {
    return "";
  }

  if (playerInfo.X && playerInfo.X.userId === userId) {
    return "X";
  }

  if (playerInfo.O && playerInfo.O.userId === userId) {
    return "O";
  }

  return "";
}

function deriveRemainingSeconds(payload) {
  if (payload && typeof payload.remainingSeconds === "number") {
    return Math.max(0, payload.remainingSeconds);
  }

  if (
    payload &&
    typeof payload.turnStartTime === "number" &&
    typeof payload.timeLimit === "number"
  ) {
    var remainingMs = payload.timeLimit - (Date.now() - payload.turnStartTime);
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  return 30;
}

export default function GamePage({ socket, matchId, session, setPage }) {
  const [board, setBoard] = useState(createEmptyBoard());
  const [currentTurn, setCurrentTurn] = useState("X");
  const [playerInfo, setPlayerInfo] = useState({ X: null, O: null });
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [mySymbol, setMySymbol] = useState("");
  const [status, setStatus] = useState("waiting");
  const [toastMessage, setToastMessage] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(30);
  const [mode, setMode] = useState("classic");
  const [currentTurnToken, setCurrentTurnToken] = useState("");
  const [nextMoveId, setNextMoveId] = useState(1);

  useEffect(() => {
    if (!socket || !matchId || !session) {
      console.warn("[DBG][Game] Missing socket/match/session, returning to lobby", {
        hasSocket: Boolean(socket),
        hasMatchId: Boolean(matchId),
        hasSession: Boolean(session),
      });
      setPage("lobby");
      return;
    }

    var previousHandler = socket.onmatchdata;
    var previousDisconnectHandler = socket.ondisconnect;
    console.info("[DBG][Game] Listening for match data", { matchId });

    socket.ondisconnect = function ondisconnect() {
      setToastMessage("Connection lost. Please return to lobby and rejoin.");
    };

    socket.onmatchdata = function onmatchdata(message) {
      var incomingMatchId = getMessageMatchId(message);

      if (incomingMatchId && incomingMatchId !== matchId) {
        console.info("[DBG][Game] Ignoring data for different match", incomingMatchId);
        return;
      }

      var opCode = getMessageOpCode(message);
      var payload = readPayload(message.data);
      console.info("[DBG][Game] onmatchdata", { opCode: opCode, payload: payload });

      if (opCode === GAME_STATE_OP_CODE) {
        if (payload.board && Array.isArray(payload.board)) {
          setBoard(payload.board);
        }

        if (payload.currentTurn) {
          setCurrentTurn(payload.currentTurn);
        }

        if (payload.players) {
          setPlayerInfo(payload.players);
          setMySymbol(getSymbolForUser(payload.players, getSessionUserId(session)));
        }

        setStatus(payload.status || "active");
        setGameOver(payload.status === "finished");
        setWinner(payload.winner || null);
        setMode(payload.mode === "timed" ? "timed" : "classic");
        setCurrentTurnToken(payload.currentTurnToken || "");
        setRemainingSeconds(deriveRemainingSeconds(payload));
        return;
      }

      if (opCode === GAME_OVER_OP_CODE) {
        if (payload.board && Array.isArray(payload.board)) {
          setBoard(payload.board);
        }

        if (payload.players) {
          setPlayerInfo(payload.players);
          setMySymbol(getSymbolForUser(payload.players, getSessionUserId(session)));
        }

        if (payload.currentTurn) {
          setCurrentTurn(payload.currentTurn);
        }

        setStatus("finished");
        setGameOver(true);
        setWinner(payload.winner || "draw");
        setMode(payload.mode === "timed" ? "timed" : "classic");
        setCurrentTurnToken("");
        setRemainingSeconds(0);
        return;
      }

      if (opCode === INVALID_MOVE_OP_CODE) {
        setToastMessage(payload.reason || "Invalid move.");
        return;
      }

      if (opCode === PLAYER_INFO_OP_CODE) {
        setPlayerInfo(payload);
        setMySymbol(getSymbolForUser(payload, getSessionUserId(session)));
        return;
      }

      if (opCode === TIMER_UPDATE_OP_CODE) {
        setMode("timed");
        setRemainingSeconds(deriveRemainingSeconds(payload));
      }
    };

    return function cleanup() {
      console.info("[DBG][Game] Cleaning up match data listener", { matchId });
      socket.onmatchdata = previousHandler;
      socket.ondisconnect = previousDisconnectHandler;
    };
  }, [socket, matchId, session, setPage]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    var timer = setTimeout(function clearToast() {
      setToastMessage("");
    }, 2200);

    return function cleanupTimer() {
      clearTimeout(timer);
    };
  }, [toastMessage]);

  var turnText = useMemo(function buildTurnText() {
    var player = playerInfo[currentTurn];

    if (!player) {
      return "Waiting for players...";
    }

    return player.displayName + "'s turn (" + currentTurn + ")";
  }, [currentTurn, playerInfo]);

  async function handleCellClick(index) {
    if (!socket || !matchId) {
      return;
    }

    if (status !== "active") {
      setToastMessage("Game is not active.");
      return;
    }

    if (!mySymbol) {
      setToastMessage("You are not assigned a symbol yet.");
      return;
    }

    if (currentTurn !== mySymbol) {
      setToastMessage("It is not your turn yet.");
      return;
    }

    if (board[index] !== "") {
      setToastMessage("That cell is already occupied.");
      return;
    }

    if (!currentTurnToken) {
      setToastMessage("Waiting for secure turn token...");
      return;
    }

    try {
      var moveId = nextMoveId;
      console.info("[DBG][Game] Sending move", {
        matchId: matchId,
        index: index,
        symbol: mySymbol,
        moveId: moveId,
      });
      await socket.sendMatchState(
        matchId,
        MOVE_OP_CODE,
        JSON.stringify({ position: index, moveId: moveId, turnToken: currentTurnToken })
      );
      setNextMoveId(moveId + 1);
    } catch (error) {
      console.error("[DBG][Game] sendMatchState failed", error);
      setToastMessage("Could not send your move. Please try again.");
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Match In Progress</h1>
        <div style={styles.playersRow}>
          <p style={styles.playerTag}>
            X: {playerInfo.X ? playerInfo.X.displayName : "Waiting..."}
          </p>
          <p style={styles.playerTag}>
            O: {playerInfo.O ? playerInfo.O.displayName : "Waiting..."}
          </p>
        </div>

        <p style={styles.turn}>{turnText}</p>
        <p style={styles.modeBadge}>Mode: {mode === "timed" ? "Timed" : "Classic"}</p>
        {mode === "timed" ? (
          <div
            style={
              remainingSeconds <= 10
                ? { ...styles.timerWrap, ...styles.timerWrapWarning }
                : styles.timerWrap
            }
          >
            <span style={styles.timerLabel}>Turn Timer</span>
            <span style={styles.timerValue}>{remainingSeconds}s</span>
          </div>
        ) : null}

        <Board
          board={board}
          onCellClick={handleCellClick}
          currentTurn={currentTurn}
          mySymbol={mySymbol}
          gameActive={status === "active"}
        />

        {toastMessage ? <div style={styles.toast}>{toastMessage}</div> : null}
      </section>

      {gameOver ? (
        <GameOver
          winner={winner}
          mySymbol={mySymbol}
          playerInfo={playerInfo}
          onPlayAgain={function onPlayAgain() {
            setPage("lobby");
          }}
        />
      ) : null}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at 10% 10%, #2b3b63 0%, #121a31 46%, #090d1d 100%)",
    color: "#e7ecff",
    fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
    padding: "clamp(12px, 3.8vw, 24px)",
  },
  card: {
    width: "min(620px, 96vw)",
    borderRadius: "18px",
    padding: "clamp(14px, 4.2vw, 24px)",
    background: "linear-gradient(160deg, #121a30 0%, #0b1224 100%)",
    border: "1px solid rgba(140, 162, 255, 0.25)",
    boxShadow: "0 24px 55px rgba(0, 0, 0, 0.4)",
  },
  title: {
    margin: "0 0 12px",
    fontSize: "clamp(1.4rem, 5vw, 2rem)",
  },
  playersRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
  },
  playerTag: {
    margin: 0,
    padding: "8px 10px",
    borderRadius: "10px",
    background: "rgba(123, 149, 255, 0.14)",
  },
  turn: {
    margin: "14px 0 16px",
    color: "#89dcff",
    fontWeight: 700,
    fontSize: "clamp(0.95rem, 3.5vw, 1.05rem)",
  },
  modeBadge: {
    margin: "-6px 0 12px",
    color: "#a8dbff",
    fontWeight: 700,
    fontSize: "0.9rem",
    letterSpacing: "0.02em",
  },
  timerWrap: {
    marginBottom: "14px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid rgba(120, 189, 255, 0.42)",
    background: "rgba(41, 114, 177, 0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerWrapWarning: {
    border: "1px solid rgba(255, 113, 113, 0.6)",
    background: "rgba(189, 43, 43, 0.22)",
  },
  timerLabel: {
    fontSize: "0.88rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    color: "#d2ecff",
  },
  timerValue: {
    fontSize: "1.25rem",
    fontWeight: 800,
    color: "#ffffff",
    minWidth: "52px",
    textAlign: "right",
  },
  toast: {
    marginTop: "14px",
    borderRadius: "10px",
    border: "1px solid rgba(255, 126, 126, 0.45)",
    background: "rgba(255, 106, 106, 0.16)",
    color: "#ffd4d4",
    padding: "10px 12px",
  },
};
