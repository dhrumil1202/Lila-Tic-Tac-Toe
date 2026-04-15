import { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import { restoreSessionFromStorage } from "./nakama/client";

export default function App() {
  const [page, setPage] = useState("login");
  const [playerName, setPlayerName] = useState("");
  const [matchId, setMatchId] = useState("");
  const [socket, setSocket] = useState(null);
  const [session, setSession] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);

  // Restore session from encrypted localStorage on app load
  useEffect(() => {
    async function restoreSession() {
      const restored = await restoreSessionFromStorage();
      if (restored) {
        setSession(restored.session);
        setPlayerName(restored.username);
        setPage("lobby");
      }
      setIsRestoring(false);
    }
    restoreSession();
  }, []);

  // Show loading state while restoring session
  if (isRestoring) {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", flexDirection: "column" }}>
        <p>Lila Tic-Tac-Toe</p>
        <p style={{ color: "#666", marginTop: "1rem" }}>Loading...</p>
      </main>
    );
  }

  const sharedState = {
    page,
    setPage,
    playerName,
    setPlayerName,
    matchId,
    setMatchId,
    socket,
    setSocket,
    session,
    setSession,
  };

  if (page === "login") {
    return <LoginPage {...sharedState} />;
  }

  if (page === "lobby") {
    return <LobbyPage {...sharedState} />;
  }

  if (page === "game") {
    return <GamePage {...sharedState} />;
  }

  return <LoginPage {...sharedState} />;
}
