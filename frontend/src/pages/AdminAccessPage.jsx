import { useState } from "react";
import { authenticateWithPassword } from "../nakama/client";

const ADMIN_USERNAME = "lila_admin";

function toFriendlyAuthError(authError) {
  const message = String(authError?.message || "");
  const lower = message.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("service unavailable") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return "Could not reach authentication service. Please try again in a few seconds.";
  }

  if (lower.includes("invalid") || lower.includes("password")) {
    return "Invalid admin password.";
  }

  if (lower.includes("at least 8 characters")) {
    return "Password must be at least 8 characters.";
  }

  return message || "Admin authentication failed.";
}

export default function AdminAccessPage({ setPage, setSession, setPlayerName }) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!password) {
      setError("Password is required.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await authenticateWithPassword(ADMIN_USERNAME, password);
      setSession(result.session);
      setPlayerName(result.username);
      setPage("admin");
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
        <h1 style={styles.title}>Admin Access</h1>
        <p style={styles.subtitle}>Enter admin password to continue.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label htmlFor="adminPassword" style={styles.label}>Admin Password</label>
          <input
            id="adminPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter admin password"
            disabled={isLoading}
            style={styles.input}
          />

          <button type="submit" disabled={isLoading} style={styles.button}>
            {isLoading ? "Authenticating..." : "Enter Admin"}
          </button>
        </form>

        <button
          type="button"
          style={styles.backButton}
          onClick={() => setPage("login")}
          disabled={isLoading}
        >
          Back to Player Login
        </button>

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
    color: "#edf2ff",
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
  backButton: {
    marginTop: "10px",
    width: "100%",
    borderRadius: "12px",
    border: "1px solid rgba(162, 181, 255, 0.4)",
    background: "rgba(72, 97, 188, 0.2)",
    color: "#cedaff",
    cursor: "pointer",
    padding: "10px 12px",
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
