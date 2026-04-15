import { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import AdminPage from "./pages/AdminPage";
import AdminAccessPage from "./pages/AdminAccessPage";
import { restoreSessionFromStorage } from "./nakama/client";

const ADMIN_USERNAME = "lila_admin";
const ADMIN_HASH_ROUTE = "#/admin";

function getPageFromHash(hash) {
  if (hash === ADMIN_HASH_ROUTE) {
    return "admin-access";
  }

  return null;
}

function syncHashForPage(nextPage) {
  if (typeof window === "undefined") {
    return;
  }

  if (nextPage === "admin-access" || nextPage === "admin") {
    if (window.location.hash !== ADMIN_HASH_ROUTE) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${ADMIN_HASH_ROUTE}`);
    }
    return;
  }

  if (window.location.hash === ADMIN_HASH_ROUTE) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
}

export default function App() {
  const [page, setPageState] = useState("login");
  const [playerName, setPlayerName] = useState("");
  const [matchId, setMatchId] = useState("");
  const [socket, setSocket] = useState(null);
  const [session, setSession] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);

  function setPage(nextPage) {
    setPageState((currentPage) => {
      const resolvedPage = typeof nextPage === "function" ? nextPage(currentPage) : nextPage;
      syncHashForPage(resolvedPage);
      return resolvedPage;
    });
  }

  // Restore session from encrypted localStorage on app load
  useEffect(() => {
    async function restoreSession() {
      const hashPage = getPageFromHash(window.location.hash);
      const restored = await restoreSessionFromStorage();

      if (restored) {
        setSession(restored.session);
        setPlayerName(restored.username);
      }

      if (hashPage) {
        setPage(hashPage);
      } else if (restored) {
        setPage("lobby");
      } else {
        setPage("login");
      }

      setIsRestoring(false);
    }

    restoreSession();
  }, []);

  useEffect(() => {
    function handleHashChange() {
      const hashPage = getPageFromHash(window.location.hash);

      if (hashPage) {
        setPage(hashPage);
      } else if (page === "admin-access" || page === "admin") {
        setPage("login");
      }
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [page]);

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

  if (page === "register") {
    return <RegisterPage {...sharedState} />;
  }

  if (page === "lobby") {
    return <LobbyPage {...sharedState} playerName={playerName} />;
  }

  if (page === "game") {
    return <GamePage {...sharedState} />;
  }

  if (page === "admin-access") {
    return (
      <AdminAccessPage
        setPage={setPage}
        setSession={setSession}
        setPlayerName={setPlayerName}
      />
    );
  }

  if (page === "admin") {
    if (playerName !== ADMIN_USERNAME) {
      return (
        <AdminAccessPage
          setPage={setPage}
          setSession={setSession}
          setPlayerName={setPlayerName}
        />
      );
    }

    return <AdminPage session={session} playerName={playerName} setPage={setPage} />;
  }

  return <LoginPage {...sharedState} />;
}
