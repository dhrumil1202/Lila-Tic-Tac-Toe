# Lila Tic-Tac-Toe

Real-time multiplayer Tic-Tac-Toe built on an authoritative [Nakama](https://heroiclabs.com/nakama/) game server and a React frontend. Two players are matched together via Nakama's matchmaker and play a live game where all move validation and win/draw detection happens server-side.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [System Requirements](#system-requirements)
4. [Installation](#installation)
5. [Running the App](#running-the-app)
6. [How to Log In](#how-to-log-in)
7. [How to Play](#how-to-play)
8. [Match Modes](#match-modes)
9. [Leaderboard](#leaderboard)
10. [Security Model](#security-model)
11. [Troubleshooting](#troubleshooting)
12. [Production Build](#production-build)
13. [Future Improvements](#future-improvements)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8 |
| Nakama SDK | @heroiclabs/nakama-js 2.8.0 |
| Backend | Nakama 3.30.0 (JavaScript runtime) |
| Database | PostgreSQL 14 |
| Infrastructure | Docker Compose |
| Unique IDs | uuid 13 |

---

## Project Structure

```
Lila-Tic-Tac-Toe/
├── frontend/                   React web client
│   ├── src/
│   │   ├── components/         Board, Cell, GameOver UI components
│   │   ├── nakama/             Nakama SDK client wrapper + auth helpers
│   │   ├── pages/              LoginPage, LobbyPage, GamePage
│   │   ├── App.jsx             Root component with session restore
│   │   └── styles.css          Global responsive styles
│   ├── package.json
│   └── vite.config.js
├── nakama/
│   ├── data/
│   │   └── modules/
│   │       └── main.js         Authoritative server runtime (match handler, RPCs)
│   └── docker-compose.yml      Nakama + PostgreSQL service definitions
├── requirements.txt            System dependency reference
└── README.md
```

---

## System Requirements

- **Node.js** 18 or later (LTS recommended)
- **npm** 9 or later
- **Docker Desktop** (Windows/macOS) or Docker Engine + Compose plugin (Linux)

See [requirements.txt](requirements.txt) for exact version details.

---

## Installation

### 1. Clone the repository

```powershell
git clone <your-repo-url>
cd "Lila-Tic-Tac-Toe"
```

### 2. Install frontend dependencies

```powershell
cd frontend
npm install
cd ..
```

> No install step needed for the backend — it runs entirely inside Docker.

---

## Running the App

### Start the backend

```powershell
cd nakama
docker compose up -d
```

This starts two containers:

- **nakama-postgres-1** — PostgreSQL 14 database
- **nakama-nakama-1** — Nakama API server with the JS runtime loaded from `nakama/data/modules/main.js`

Useful backend commands:

```powershell
# Check running containers
docker compose ps

# Stream live logs
docker compose logs -f nakama

# Reload runtime after editing main.js
docker compose restart nakama

# Stop all containers (data preserved)
docker compose down

# Stop and wipe all data (full reset)
docker compose down -v
```

### Start the frontend

Open a second terminal:

```powershell
cd frontend
npm run dev
```

Vite starts a dev server, typically at **http://localhost:5173**. Open that URL in your browser.

### Running two clients for testing

Open the same URL in a second browser window or a private/incognito tab. Each browser window acts as an independent player.

---

## How to Log In

The login page serves as both registration and login — no separate sign-up step is needed.

### Option A — Password account (recommended, persistent)

1. Enter a username (letters, numbers, `_`, `-`, `.` allowed).
2. Enter a password (minimum 8 characters).
3. Click **Start Playing**.

- First time with these credentials → account is created automatically.
- Next time on any device → same credentials log you back into the same account.
- Sessions are encrypted and cached locally, so you stay logged in across page refreshes without re-entering credentials.

### Option B — Device account (quick, local only)

1. Enter a username.
2. Leave the password field empty.
3. Click **Start Playing**.

- Account is tied to the current browser's local storage (device ID).
- Works only on the same browser. Clearing browser data or switching browser loses access.
- Not recommended if you want persistent access.

### Logging out

Click **Logout / Change Account** at the bottom of the Lobby. This clears the saved session and returns you to the login screen. You can then log in with any account.

---

## How to Play

### Finding a match

1. After logging in, you land in the **Lobby**.
2. Select a match mode: **Classic** or **Timed (30s)**.
3. Click **Find Match**.
4. The matchmaker searches for another player in the same mode.
5. When a match is found, you are taken to the game screen automatically.

### During a match

- Players are assigned **X** (first) and **O** (second) randomly.
- The current turn player's name is shown above the board.
- Only the player whose turn it is can click a cell.
- Click any empty cell to place your mark.
- The first player to complete a row, column, or diagonal wins.
- If all 9 cells are filled with no winner, the match ends as a **draw**.

### Timed mode

- Each player has **30 seconds** per turn.
- A countdown timer is displayed above the board.
- The timer turns **red** when 10 seconds or fewer remain.
- If a player does not move in time, they **forfeit** that match and the opponent wins.

### After a match

- A Game Over screen shows the result (win, loss, or draw).
- Click **Play Again** to return to the Lobby and queue for a new match.
- Press **Refresh** on the Leaderboard to see updated stats.

---

## Match Modes

Matchmaking is strictly mode-based. Players only match with others in the same mode.

| Mode | Timer per turn | Timeout forfeit |
|---|---|---|
| Classic | None | No |
| Timed (30s) | 30 seconds | Yes |

**Example:** If Player 1 queues in Classic and Player 2 queues in Timed, they will never be matched together. Both must be in the same mode.

---

## Leaderboard

The leaderboard is visible in the Lobby and updates after every completed match.

### What is tracked

| Column | Description |
|---|---|
| W | Total wins |
| L | Total losses |
| Streak | Current win streak (resets on loss or draw) |

Best win streak is also tracked server-side (not shown in the current UI).

### Ordering rules

The leaderboard is sorted in this priority order:

1. **Most wins** — player with highest win count ranked first.
2. **Highest best win streak** — tiebreaker when two players have equal wins.
3. **Fewest losses** — final tiebreaker when wins and best streak are also equal.

### How stats are stored

- Wins and losses are written to Nakama's leaderboard and storage systems at match end.
- Stats are server-authoritative — they cannot be modified from the client.
- The leaderboard does not auto-refresh; press the **Refresh** button to pull the latest data.

---

## Security Model

All gameplay logic runs on the server. The client only sends intended moves; the server decides everything else.

| Protection | How it works |
|---|---|
| Turn enforcement | Server tracks whose turn it is; moves from wrong player are rejected |
| Turn token | A unique token issued each turn; move must include current valid token |
| Replay prevention | Each move carries a monotonically increasing move ID per player; replayed IDs are rejected |
| Board authority | Clients never set board state; server broadcasts canonical state after each accepted move |
| Account security | Password accounts require correct credentials; device accounts require ownership of local device ID |
| Session validation | Restored local sessions are verified against the server on app load; stale sessions are cleared automatically |

---

## Troubleshooting

### Frontend shows blank or "Loading…" forever

- Check that both Docker containers are running: `docker compose ps` in the `nakama/` folder.
- Look for runtime errors in backend logs: `docker compose logs -f nakama`.

### "Could not reach the game server"

- Backend is not running or not reachable on port 7350.
- Start it: `cd nakama && docker compose up -d`.

### Matchmaking never finds a game

- Both players must be in the **same mode** (Classic or Timed).
- Confirm both browsers show "Finding opponent…" at the same time.
- Check backend logs for matchmaker activity.

### "Could not send your move" during a game

- Usually caused by a stale session after a server restart or database reset.
- Log out, log in again, and start a new match.

### Leaderboard not updating after a match

- Press the **Refresh** button on the Lobby page.
- Ensure the match completed normally (Game Over screen appeared).
- Check backend logs for leaderboard write confirmations.

### Duplicate username on leaderboard

- Can occur if the same username was used with both device auth and password auth.
- The leaderboard RPC merges duplicate entries by display name automatically; press Refresh to see the merged result.

### Full data reset (wipe everything and start clean)

```powershell
cd nakama
docker compose down -v
docker compose up -d
```

This deletes all accounts, stats, and leaderboard data.

---

## Production Build

```powershell
cd frontend
npm run build
```

Output goes to `frontend/dist/`. Preview the production build locally:

```powershell
npm run preview
```

For actual deployment, update the Nakama server address in `frontend/src/nakama/client.js` from `127.0.0.1` to your server's public hostname or IP.

---

## Future Improvements

The following features are not currently implemented but are identified as useful additions depending on future needs:

### Real-time username availability check

Currently, username uniqueness is enforced by the database at account creation time. A duplicate is only discovered after the user submits the form.

A future improvement would add a server-side RPC that checks if a username is taken as the user types. For large-scale deployments, a **Bloom filter** maintained in server memory could answer "definitely not taken" in O(1) with no database query, making the check near-instant. For smaller deployments, a simple indexed DB lookup via RPC would also be sufficient.

### Forgot password / Change password

There is currently no way to recover a password-protected account if the password is forgotten, nor is there a UI to change an existing password. A future implementation would require:

- An email verification flow (needs an SMTP/email provider integrated with Nakama hooks).
- A secure, time-limited reset token sent to the user's registered email.
- A change-password page in the frontend.

### Play again with the same opponent

After a match ends, the **Play Again** button returns to the lobby and enters general matchmaking. The matchmaker selects whoever is available first — there is no guarantee of being rematched with the same opponent.

A future feature would add a "Rematch" invitation system where the Game Over screen offers a direct rematch request to the opponent. This would require:

- A server-side RPC or notification channel for rematch invitations.
- Both players accepting before a private match is created.
- A timeout on the invitation if the opponent does not respond.

### Win rate and match history

The current stats are limited to wins, losses, and streaks. A match history log (opponent, result, date, mode, duration) per player would enable richer stats like win rate, average game length, and most frequent opponents.

### Private / invite-only matches

Currently all matches are public matchmaking. A future feature could allow creating a private match with a shareable code, letting friends play directly against each other without going through the random queue.

### Spectator mode

Matches are currently private between the two participants. A spectator system would allow additional users to observe an ongoing match in real time without being able to interact with the board.
