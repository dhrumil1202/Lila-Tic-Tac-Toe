import { useEffect, useMemo, useRef, useState } from "react";
import client, { clearSessionStorage } from "../nakama/client";

function parseRpcPayload(payload) {
  if (!payload) {
    return {};
  }

  if (typeof payload === "object") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch (error) {
    return {};
  }
}

function toRpcPayload(value) {
  return JSON.stringify(value || {});
}

async function addModeMatchmaker(socket, mode) {
  const modeQuery = `+properties.mode:${mode}`;

  try {
    return await socket.addMatchmaker(modeQuery, 2, 2, { mode }, { skill: 1 });
  } catch (modeQueryError) {
    console.warn("[DBG][Lobby] mode query addMatchmaker failed, falling back to wildcard", modeQueryError);
    return socket.addMatchmaker("*", 2, 2, { mode }, { skill: 1 });
  }
}

function toUserMessage(error) {
  const message = error?.message || "";

  if (message.toLowerCase().includes("failed to fetch")) {
    return "Could not reach the game server. Please make sure Nakama is running and try again.";
  }

  if (message.toLowerCase().includes("network")) {
    return "Network issue while connecting to matchmaking. Please try again.";
  }

  if (message.toLowerCase().includes("timeout")) {
    return "Connection timed out while searching for a match. Please try again.";
  }

  return "Something went wrong while searching for a match. Please try again.";
}

export default function LobbyPage({ session, playerName, setPage, setMatchId, setSocket, setPlayerName, setSession }) {
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMode, setSelectedMode] = useState("classic");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("Ready to queue.");
  const [leaderboardRecords, setLeaderboardRecords] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const socketRef = useRef(null);
  const ticketRef = useRef("");
  const isSearchingRef = useRef(false);

  useEffect(() => {
    isSearchingRef.current = isSearching;
  }, [isSearching]);

  useEffect(() => {
    if (!session) {
      setPage("login");
    }
  }, [session, setPage]);

  useEffect(
    () => () => {
      if (socketRef.current) {
        socketRef.current.disconnect(false);
        socketRef.current = null;
      }
    },
    []
  );

  const displayName = useMemo(() => {
    if (!session) {
      return "Player";
    }

    if (session.username) {
      return session.username;
    }

    try {
      const tokenPart = session.token.split(".")[1];
      const claims = JSON.parse(atob(tokenPart));
      return claims.usn || "Player";
    } catch (error) {
      return "Player";
    }
  }, [session]);

  async function loadLeaderboard() {
    if (!session) {
      return;
    }

    setIsLeaderboardLoading(true);
    setLeaderboardError("");

    try {
      const leaderboardRpc = await client.rpc(session, "get_leaderboard", toRpcPayload({}));
      const payload = parseRpcPayload(leaderboardRpc.payload);
      setLeaderboardRecords(Array.isArray(payload.records) ? payload.records : []);
    } catch (fetchError) {
      console.error("[DBG][Lobby] leaderboard refresh failed", fetchError);
      setLeaderboardError(
        `Could not load leaderboard. ${fetchError?.message ? `(${fetchError.message})` : ""}`.trim()
      );
      setLeaderboardRecords([]);
    } finally {
      setIsLeaderboardLoading(false);
    }
  }

  useEffect(() => {
    if (!session) {
      return;
    }

    loadLeaderboard();
  }, [session]);

  async function handleFindMatch() {
    if (!session || isSearchingRef.current) {
      return;
    }

    setError("");
    setStatusText(`Opening realtime connection for ${selectedMode} mode...`);
    setIsSearching(true);

    const socket = client.createSocket(window.location.protocol === "https:", false);
    console.info("[DBG][Lobby] Created socket for matchmaking");
    socketRef.current = socket;

    socket.ondisconnect = function ondisconnect() {
      console.info("[DBG][Lobby] Socket disconnected while searching=", isSearchingRef.current);
      if (isSearchingRef.current) {
        setError("Disconnected while searching. Please try again.");
        setStatusText("Connection closed.");
        setIsSearching(false);
      }
    };

    socket.onmatchmakermatched = async function onmatchmakermatched(matchmakerMatched) {
      try {
        console.info("[DBG][Lobby] onmatchmakermatched payload", matchmakerMatched);
        setStatusText("Opponent found. Joining match...");
        const matchedId = matchmakerMatched.match_id || matchmakerMatched.matchId;

        if (!matchedId) {
          throw new Error("No match id returned by matchmaker.");
        }

        await socket.joinMatch(matchedId);
        console.info("[DBG][Lobby] joinMatch success matchId=", matchedId);
        setSocket(socket);
        setMatchId(matchedId);
        socketRef.current = null;
        setIsSearching(false);
        setStatusText("Match found.");
        setPage("game");
      } catch (joinError) {
        console.error("[DBG][Lobby] joinMatch failed", joinError);
        setError("Found an opponent, but failed to join the match. Please try again.");
        setStatusText("Join failed.");
        setIsSearching(false);

        if (socketRef.current) {
          socketRef.current.disconnect(false);
          socketRef.current = null;
        }
      }
    };

    try {
      await socket.connect(session);
      console.info("[DBG][Lobby] socket.connect success user=", session?.user_id || session?.userId);
      setStatusText(`Finding opponent for ${selectedMode} mode...`);

      try {
        const rpcResponse = await client.rpc(
          session,
          "find_match",
          toRpcPayload({ mode: selectedMode })
        );
        const payload = parseRpcPayload(rpcResponse.payload);

        if (payload.ticket) {
          console.info("[DBG][Lobby] rpc find_match ticket=", payload.ticket);
          ticketRef.current = payload.ticket;
        } else if (payload.status === "matchmaker_unavailable") {
          const fallbackTicket = await addModeMatchmaker(socket, selectedMode);
          console.info("[DBG][Lobby] fallback socket.addMatchmaker ticket=", fallbackTicket.ticket);
          ticketRef.current = fallbackTicket.ticket;
        } else {
          const fallbackTicket = await addModeMatchmaker(socket, selectedMode);
          console.info("[DBG][Lobby] rpc missing ticket, fallback socket.addMatchmaker ticket=", fallbackTicket.ticket);
          ticketRef.current = fallbackTicket.ticket;
        }
      } catch (rpcError) {
        console.warn("[DBG][Lobby] rpc find_match failed, using socket.addMatchmaker", rpcError);
        const fallbackTicket = await addModeMatchmaker(socket, selectedMode);
        console.info("[DBG][Lobby] fallback socket.addMatchmaker ticket=", fallbackTicket.ticket);
        ticketRef.current = fallbackTicket.ticket;
      }
    } catch (connectError) {
      console.error("[DBG][Lobby] socket connect/matchmaker setup failed", connectError);
      setError(toUserMessage(connectError));
      setStatusText("Not searching.");
      setIsSearching(false);

      if (socketRef.current) {
        socketRef.current.disconnect(false);
        socketRef.current = null;
      }
    }
  }

  async function handleCancelSearch() {
    if (!session || !isSearchingRef.current) {
      return;
    }

    setStatusText("Cancelling matchmaking...");

    try {
      try {
        if (ticketRef.current) {
          console.info("[DBG][Lobby] cancelling ticket=", ticketRef.current);
          const rpcCancel = await client.rpc(
            session,
            "cancel_matchmaking",
            toRpcPayload({ ticket: ticketRef.current })
          );
          const rpcCancelPayload = parseRpcPayload(rpcCancel.payload);

          if (
            rpcCancelPayload.status === "matchmaker_unavailable" &&
            socketRef.current
          ) {
            console.info("[DBG][Lobby] rpc cancel unavailable, fallback socket.removeMatchmaker");
            await socketRef.current.removeMatchmaker(ticketRef.current);
          }
        } else {
          await client.rpc(session, "cancel_matchmaking", toRpcPayload({}));
        }
      } catch (rpcCancelError) {
        console.warn("[DBG][Lobby] rpc cancel failed, fallback removeMatchmaker", rpcCancelError);
        if (socketRef.current && ticketRef.current) {
          await socketRef.current.removeMatchmaker(ticketRef.current);
        }
      }
    } catch (cancelError) {
      console.error("[DBG][Lobby] cancel search failed", cancelError);
      setError("Could not cancel matchmaking cleanly, but search was stopped locally.");
    }

    ticketRef.current = "";
    setIsSearching(false);
    setStatusText("Search cancelled.");

    if (socketRef.current) {
      socketRef.current.disconnect(false);
      socketRef.current = null;
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.kicker}>Connected as {displayName}</p>
        <h1 style={styles.title}>Welcome to the Lobby</h1>
        <p style={styles.subtitle}>Queue up and get matched for a Tic-Tac-Toe battle.</p>

        <section style={styles.modeSection}>
          <p style={styles.modeLabel}>Match Mode</p>
          <div style={styles.modeButtons}>
            <button
              type="button"
              onClick={() => setSelectedMode("classic")}
              style={
                selectedMode === "classic"
                  ? { ...styles.modeButton, ...styles.modeButtonActive }
                  : styles.modeButton
              }
              disabled={isSearching}
            >
              Classic
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode("timed")}
              style={
                selectedMode === "timed"
                  ? { ...styles.modeButton, ...styles.modeButtonActive }
                  : styles.modeButton
              }
              disabled={isSearching}
            >
              Timed (30s)
            </button>
          </div>
        </section>

        {!isSearching ? (
          <button type="button" onClick={handleFindMatch} style={styles.primaryButton}>
            Find Match ({selectedMode})
          </button>
        ) : (
          <div style={styles.searchingWrap}>
            <p style={styles.searchingText}>Finding opponent...</p>
            <button type="button" onClick={handleCancelSearch} style={styles.secondaryButton}>
              Cancel
            </button>
          </div>
        )}

        <p style={styles.status}>{statusText}</p>
        {error ? <p style={styles.error}>{error}</p> : null}

        <section style={styles.leaderboardSection}>
          <div style={styles.leaderboardHeader}>
            <h2 style={styles.leaderboardTitle}>Leaderboard</h2>
            <button
              type="button"
              onClick={loadLeaderboard}
              style={styles.refreshButton}
              disabled={isLeaderboardLoading}
            >
              {isLeaderboardLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {leaderboardError ? <p style={styles.leaderboardError}>{leaderboardError}</p> : null}

          {!leaderboardError && leaderboardRecords.length === 0 ? (
            <p style={styles.emptyLeaderboard}>No wins recorded yet.</p>
          ) : null}

          {leaderboardRecords.length > 0 ? (
            <ol style={styles.leaderboardList}>
              {leaderboardRecords.map((record, index) => (
                <li key={record.ownerId || String(index)} style={styles.leaderboardItem}>
                  <span style={styles.rank}>#{record.rank || index + 1}</span>
                  <span style={styles.name}>{record.displayName || "Player"}</span>
                  <span style={styles.statChip}>W {record.wins ?? record.score ?? 0}</span>
                  <span style={styles.statChip}>L {record.losses ?? 0}</span>
                  <span style={styles.statChip}>Streak {record.winStreak ?? 0}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        <div style={styles.footerSection}>
          <button
            type="button"
            onClick={() => {
              clearSessionStorage();
              setPlayerName("");
              setSession(null);
              setPage("login");
            }}
            style={styles.logoutButton}
          >
            Logout / Change Account
          </button>
        </div>
      </section>
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
      "radial-gradient(circle at 20% 20%, #2c355f 0%, #101426 42%, #090b14 100%)",
    color: "#f1f5ff",
    padding: "clamp(12px, 3.8vw, 24px)",
    fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
  },
  card: {
    width: "min(560px, 96vw)",
    background: "linear-gradient(160deg, #121a30 0%, #0c1122 100%)",
    border: "1px solid rgba(140, 162, 255, 0.28)",
    borderRadius: "18px",
    padding: "clamp(16px, 4.5vw, 28px)",
    boxShadow: "0 20px 55px rgba(0, 0, 0, 0.45)",
  },
  kicker: {
    margin: 0,
    color: "#9fb5ff",
    fontSize: "0.92rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  title: {
    margin: "10px 0 8px",
    fontSize: "clamp(1.5rem, 5vw, 2rem)",
    lineHeight: 1.1,
  },
  subtitle: {
    margin: "0 0 22px",
    color: "#d0d9ff",
  },
  modeSection: {
    marginBottom: "14px",
  },
  modeLabel: {
    margin: "0 0 8px",
    color: "#b7c8ff",
    fontSize: "0.92rem",
    letterSpacing: "0.03em",
  },
  modeButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "8px",
  },
  modeButton: {
    border: "1px solid rgba(168, 188, 255, 0.38)",
    borderRadius: "11px",
    background: "rgba(94, 118, 198, 0.14)",
    color: "#d4e0ff",
    fontWeight: 700,
    padding: "10px 11px",
    cursor: "pointer",
  },
  modeButtonActive: {
    border: "1px solid rgba(129, 235, 255, 0.64)",
    background: "linear-gradient(95deg, rgba(69, 192, 240, 0.32) 0%, rgba(84, 228, 157, 0.26) 100%)",
    color: "#effaff",
  },
  primaryButton: {
    width: "100%",
    padding: "12px 14px",
    border: 0,
    borderRadius: "12px",
    background: "linear-gradient(90deg, #45d483 0%, #46b8ef 100%)",
    color: "#062012",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    width: "100%",
    marginTop: "8px",
    padding: "10px 12px",
    border: "1px solid rgba(180, 194, 255, 0.45)",
    borderRadius: "12px",
    background: "transparent",
    color: "#dbe5ff",
    fontWeight: 600,
    cursor: "pointer",
  },
  searchingWrap: {
    marginTop: "4px",
  },
  searchingText: {
    margin: "0 0 6px",
    color: "#8ee2ff",
    fontWeight: 600,
  },
  status: {
    margin: "16px 0 0",
    color: "#b5c4fb",
    minHeight: "1.2em",
  },
  error: {
    margin: "10px 0 0",
    color: "#ff8b95",
    background: "rgba(255, 90, 110, 0.12)",
    border: "1px solid rgba(255, 90, 110, 0.35)",
    borderRadius: "10px",
    padding: "10px 12px",
  },
  leaderboardSection: {
    marginTop: "20px",
    paddingTop: "14px",
    borderTop: "1px solid rgba(142, 164, 255, 0.22)",
  },
  leaderboardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "10px",
    gap: "10px",
  },
  leaderboardTitle: {
    margin: 0,
    fontSize: "1.05rem",
    color: "#beddff",
  },
  refreshButton: {
    border: "1px solid rgba(173, 192, 255, 0.45)",
    background: "rgba(120, 145, 235, 0.14)",
    color: "#dbe5ff",
    borderRadius: "10px",
    padding: "7px 10px",
    fontWeight: 600,
    cursor: "pointer",
  },
  leaderboardError: {
    margin: "0 0 8px",
    color: "#ff9aa5",
  },
  emptyLeaderboard: {
    margin: 0,
    color: "#9db2f8",
  },
  leaderboardList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gap: "8px",
  },
  leaderboardItem: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px 10px",
    border: "1px solid rgba(138, 161, 255, 0.24)",
    background: "rgba(81, 103, 184, 0.12)",
    borderRadius: "10px",
    padding: "8px 10px",
  },
  rank: {
    color: "#89dcff",
    fontWeight: 700,
    minWidth: "52px",
  },
  name: {
    flex: "1 1 150px",
    color: "#eaf0ff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  statChip: {
    color: "#d8e8ff",
    fontWeight: 700,
    border: "1px solid rgba(158, 183, 255, 0.26)",
    borderRadius: "8px",
    padding: "5px 8px",
    background: "rgba(97, 121, 205, 0.16)",
    whiteSpace: "nowrap",
  },
  footerSection: {
    marginTop: "20px",
    paddingTop: "14px",
    borderTop: "1px solid rgba(142, 164, 255, 0.22)",
    textAlign: "center",
  },
  logoutButton: {
    padding: "8px 12px",
    border: "1px solid rgba(200, 120, 120, 0.45)",
    borderRadius: "10px",
    background: "rgba(190, 80, 80, 0.12)",
    color: "#e5b5b5",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
};
