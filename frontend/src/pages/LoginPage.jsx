import { useState } from "react";
import {
  authenticateDevice,
  authenticateWithPassword,
  normalizeUsername,
} from "../nakama/client";

function toFriendlyAuthError(authError) {
  const message = String(authError?.message || "");
  const lower = message.toLowerCase();

  if (lower.includes("username") && (lower.includes("already") || lower.includes("exists") || lower.includes("in use"))) {
    return "That username is already taken. Please choose another one.";
  }

  if (lower.includes("username") && (lower.includes("invalid") || lower.includes("must"))) {
    return "Invalid username. Use letters, numbers, underscore, dash, or dot.";
  }

  if (lower.includes("invalid credentials") || lower.includes("password")) {
    return "Invalid username/password. Please try again.";
  }

  if (lower.includes("at least 8 characters")) {
    return "Password must be at least 8 characters.";
  }

  if (lower.includes("already exists on another account")) {
    return "This username is already linked elsewhere. Use its original password.";
  }

  return message || "Authentication failed.";
}

export default function LoginPage({
  playerName,
  setPlayerName,
  setPage,
  setSession,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const displayName = normalizeUsername(playerName);

    if (!displayName) {
      setError("Username is required.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = password
        ? await authenticateWithPassword(displayName, password)
        : await authenticateDevice(displayName);
      setSession(result.session);
      setPlayerName(result.username);
      setPage("lobby");
    } catch (authError) {
      setError(toFriendlyAuthError(authError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.kicker}>Lila Tic-Tac-Toe</p>
        <h1 style={styles.title}>Login</h1>
        <p style={styles.subtitle}>Pick your player name and jump into live matches.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label htmlFor="displayName" style={styles.label}>Username</label>
        <input
          id="displayName"
          type="text"
          value={playerName}
          onChange={(event) => setPlayerName(event.target.value)}
          placeholder="Enter username (e.g. lila_player_1)"
          disabled={isLoading}
          style={styles.input}
        />
          <label htmlFor="password" style={styles.label}>Password (optional)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Use password to reuse same account"
            disabled={isLoading}
            style={styles.input}
          />
          <button type="submit" disabled={isLoading} style={styles.button}>
            {isLoading ? "Authenticating..." : password ? "Login / Register" : "Start Playing"}
          </button>
        </form>

        <p style={styles.hint}>
          Tip: Enter a password to keep using the same username across restarts and devices.
        </p>

        {error ? (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        ) : null}
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
    padding: "clamp(12px, 3vw, 24px)",
    background:
      "radial-gradient(circle at 15% 12%, #2f3f6d 0%, #151d35 45%, #0a0f1e 100%)",
  },
  card: {
    width: "min(520px, 96vw)",
    borderRadius: "18px",
    background: "linear-gradient(165deg, #121c37 0%, #0b1124 100%)",
    border: "1px solid rgba(154, 175, 255, 0.3)",
    boxShadow: "0 20px 55px rgba(0, 0, 0, 0.44)",
    padding: "clamp(16px, 4.5vw, 30px)",
  },
  kicker: {
    margin: 0,
    fontSize: "0.82rem",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#9cb4ff",
  },
  title: {
    margin: "8px 0 8px",
    fontSize: "clamp(1.65rem, 4.5vw, 2.35rem)",
    lineHeight: 1.08,
  },
  subtitle: {
    margin: "0 0 18px",
    color: "#d1dbff",
  },
  form: {
    display: "grid",
    gap: "10px",
  },
  label: {
    color: "#bfceff",
    fontSize: "0.92rem",
  },
  input: {
    width: "100%",
    borderRadius: "12px",
    border: "1px solid rgba(150, 176, 255, 0.35)",
    background: "rgba(35, 53, 101, 0.33)",
    color: "#edf2ff",
    padding: "12px 14px",
  },
  button: {
    width: "100%",
    border: 0,
    borderRadius: "12px",
    background: "linear-gradient(92deg, #4ddf95 0%, #4ec4ff 100%)",
    color: "#072515",
    fontWeight: 700,
    cursor: "pointer",
    padding: "12px 14px",
    marginTop: "6px",
  },
  hint: {
    margin: "12px 0 0",
    color: "#a9bdfc",
    fontSize: "0.88rem",
  },
  error: {
    margin: "12px 0 0",
    borderRadius: "10px",
    border: "1px solid rgba(255, 104, 127, 0.45)",
    background: "rgba(240, 77, 109, 0.13)",
    color: "#ffb8c2",
    padding: "10px 12px",
  },
};
