import { useEffect, useState } from "react";
import client from "../nakama/client";

const ADMIN_USERNAME = "lila_admin";

export default function AdminPage({ session, playerName, setPage }) {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  async function loadUsers() {
    setIsLoading(true);
    setError("");
    try {
      const result = await client.rpc(session, "admin_list_users", JSON.stringify({}));
      const payload =
        typeof result.payload === "string"
          ? JSON.parse(result.payload)
          : result.payload || {};
      const list = payload.users || [];
      list.sort(function (a, b) {
        return (a.username || "").localeCompare(b.username || "");
      });
      setUsers(list);
    } catch (err) {
      setError(err?.message || "Failed to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (playerName !== ADMIN_USERNAME) {
      setPage("lobby");
      return;
    }

    loadUsers();
  }, [playerName, setPage]);

  async function handleDelete(userId, username) {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(userId);
    setStatusMessage("");
    try {
      await client.rpc(session, "admin_delete_user", JSON.stringify({ userId }));
      setStatusMessage(`Deleted "${username}" successfully.`);
      setUsers(function (prev) {
        return prev.filter(function (u) {
          return u.userId !== userId;
        });
      });
    } catch (err) {
      setStatusMessage(`Failed to delete "${username}": ${err?.message || "Unknown error"}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.kicker}>Lila Tic-Tac-Toe</p>
          <h1 style={styles.title}>Admin Panel</h1>
          <p style={styles.subtitle}>Logged in as <strong>{playerName}</strong></p>
        </div>
        <button style={styles.backButton} onClick={() => setPage("lobby")}>
          ← Back to Lobby
        </button>
      </header>

      {statusMessage && (
        <div style={styles.statusBanner}>{statusMessage}</div>
      )}

      {error && (
        <div style={styles.errorBanner}>{error}</div>
      )}

      <div style={styles.toolbar}>
        <h2 style={styles.sectionTitle}>Users ({users.length})</h2>
        <button style={styles.refreshButton} onClick={loadUsers} disabled={isLoading}>
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <p style={styles.loadingText}>Loading users...</p>
      ) : users.length === 0 ? (
        <p style={styles.emptyText}>No users found.</p>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Username</th>
                <th style={{ ...styles.th, ...styles.numCol }}>Wins</th>
                <th style={{ ...styles.th, ...styles.numCol }}>Losses</th>
                <th style={{ ...styles.th, ...styles.numCol }}>Streak</th>
                <th style={{ ...styles.th, ...styles.actionCol }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map(function (user) {
                const stats = user.stats || {};
                const isDeleting = deletingId === user.userId;
                const isAdmin = user.username === playerName;
                return (
                  <tr key={user.userId} style={isAdmin ? styles.adminRow : {}}>
                    <td style={styles.td}>
                      {user.username || user.userId}
                      {isAdmin && (
                        <span style={styles.youBadge}> (you)</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, ...styles.numCol }}>{stats.wins ?? 0}</td>
                    <td style={{ ...styles.td, ...styles.numCol }}>{stats.losses ?? 0}</td>
                    <td style={{ ...styles.td, ...styles.numCol }}>
                      {stats.currentWinStreak ?? stats.winStreak ?? stats.streak ?? 0}
                    </td>
                    <td style={{ ...styles.td, ...styles.actionCol }}>
                      {isAdmin ? (
                        <span style={styles.protectedText}>protected</span>
                      ) : (
                        <button
                          style={styles.deleteButton}
                          onClick={() => handleDelete(user.userId, user.username)}
                          disabled={isDeleting || !!deletingId}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    maxWidth: "860px",
    margin: "0 auto",
    padding: "2rem 1rem",
    color: "#1d2433",
    background:
      "radial-gradient(circle at 10% 10%, rgba(172, 205, 255, 0.22) 0%, rgba(255, 255, 255, 0.96) 40%, #f2f6ff 100%)",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "1.5rem",
  },
  kicker: {
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#5a6780",
    margin: "0 0 0.25rem",
  },
  title: {
    fontSize: "1.6rem",
    fontWeight: 700,
    color: "#23314f",
    margin: "0 0 0.25rem",
  },
  subtitle: {
    color: "#344566",
    margin: 0,
    fontSize: "0.9rem",
  },
  backButton: {
    padding: "0.5rem 1rem",
    background: "#f4f7ff",
    border: "1px solid #b8c8ea",
    color: "#1f2a43",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.75rem",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#2a3b61",
    margin: 0,
  },
  refreshButton: {
    padding: "0.4rem 0.9rem",
    background: "#4a90d9",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  statusBanner: {
    background: "#e6f4ea",
    border: "1px solid #a8d5b5",
    borderRadius: "6px",
    padding: "0.6rem 1rem",
    marginBottom: "1rem",
    color: "#2d6a4f",
    fontSize: "0.875rem",
  },
  errorBanner: {
    background: "#fdecea",
    border: "1px solid #f5c2c7",
    borderRadius: "6px",
    padding: "0.6rem 1rem",
    marginBottom: "1rem",
    color: "#842029",
    fontSize: "0.875rem",
  },
  loadingText: {
    color: "#30415f",
    fontSize: "0.9rem",
  },
  emptyText: {
    color: "#30415f",
    fontSize: "0.9rem",
  },
  tableWrapper: {
    overflowX: "auto",
    borderRadius: "10px",
    border: "1px solid #d2def4",
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(19, 36, 71, 0.08)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
    color: "#202a3f",
  },
  th: {
    textAlign: "left",
    padding: "0.6rem 0.75rem",
    borderBottom: "2px solid #d7e3fa",
    fontWeight: 600,
    color: "#1f2a43",
    background: "#f4f8ff",
  },
  td: {
    padding: "0.55rem 0.75rem",
    borderBottom: "1px solid #e8effa",
    verticalAlign: "middle",
    color: "#1e2a41",
  },
  numCol: {
    textAlign: "center",
    width: "80px",
  },
  actionCol: {
    textAlign: "center",
    width: "100px",
  },
  adminRow: {
    background: "#eef4ff",
  },
  youBadge: {
    fontSize: "0.75rem",
    color: "#4e6084",
    fontStyle: "italic",
  },
  protectedText: {
    fontSize: "0.75rem",
    color: "#5e6f8f",
    fontStyle: "italic",
  },
  deleteButton: {
    padding: "0.3rem 0.7rem",
    background: "#e74c3c",
    color: "#fff",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
};
