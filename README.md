# Lila Tic-Tac-Toe

Real-time multiplayer Tic-Tac-Toe built on an authoritative [Nakama](https://heroiclabs.com/nakama/) game server and a React frontend. Two players are matched together via Nakama's matchmaker and play a live game where all move validation and win/draw detection happens server-side.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture & Design Decisions](#architecture--design-decisions)
3. [Project Structure](#project-structure)
4. [System Requirements](#system-requirements)
5. [Installation](#installation)
6. [Running the App](#running-the-app)
7. [API & Server Configuration](#api--server-configuration)
8. [How to Register](#how-to-register)
9. [How to Log In](#how-to-log-in)
10. [How to Play](#how-to-play)
11. [Match Modes](#match-modes)
12. [Leaderboard](#leaderboard)
13. [Security Model](#security-model)
14. [Testing Multiplayer](#testing-multiplayer)
15. [Troubleshooting](#troubleshooting)
16. [Deployment](#deployment)
17. [Future Improvements](#future-improvements)

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

## Architecture & Design Decisions

### Authoritative server model

All game logic — move validation, turn enforcement, win/draw detection, and stat recording — runs exclusively inside the Nakama JavaScript runtime (`nakama/data/modules/main.js`). The React client is intentionally thin: it sends intended actions and renders the canonical board state broadcast by the server. No client can manipulate scores, skip turns, or replay moves because the server rejects anything that fails its own validation.

### Why Nakama

Nakama was chosen because it bundles the core infrastructure multiplayer games need without requiring separate services:

- A real-time WebSocket layer for low-latency match communication.
- A built-in matchmaker that queues players and fires a callback when a pair is ready.
- An authoritative match handler lifecycle (`matchInit`, `matchJoinAttempt`, `matchJoin`, `matchLeave`, `matchLoop`, `matchTerminate`).
- Built-in account management (email auth), a key-value storage system, and a leaderboard system.
- A JavaScript runtime so server logic and client logic share the same language.

### Frontend routing

The app uses a hand-rolled page state machine (a `page` string in React state) instead of a router library, keeping the bundle small and the routing logic explicit.

### Authentication design

All accounts use Nakama's email-auth system with a `@lila.local` internal email convention (`username@lila.local`). Users only ever type a username and password — the email address is derived automatically and never exposed. Registration and login are separate pages so it is always clear whether credentials are being created or verified.

Sessions are encrypted with AES-GCM (via the Web Crypto API) before being written to `localStorage`, so the raw session token is never stored in plaintext on the device.

### Stats storage

Player stats are written to two locations at the end of each match:

- **Nakama leaderboard** (`tictactoe_wins`) — enables fast server-sorted queries by win count.
- **Nakama storage** (`stats` collection, per user) — holds streak data (current win streak and best win streak) that the leaderboard system does not natively support.

The `get_leaderboard` RPC merges both sources before returning them to the client.

### Matchmaking

Nakama's built-in matchmaker is used with a per-mode query filter (`+properties.mode:classic` or `+properties.mode:timed`) to guarantee Classic and Timed players never match against each other. The match size is fixed at 2. When the matchmaker produces a ticket, the server creates the authoritative match and notifies both clients via a realtime op-code message.

---

## Project Structure

```
Lila-Tic-Tac-Toe/
├── frontend/                   React web client
│   ├── src/
│   │   ├── components/         Board, Cell, GameOver UI components
│   │   ├── nakama/             Nakama SDK client wrapper + auth helpers
│   │   ├── pages/              RegisterPage, LoginPage, LobbyPage, GamePage
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

## API & Server Configuration

### Frontend environment variables

Create `frontend/.env` for local overrides, or set these variables in your CI/hosting provider for production builds.

| Variable | Default | Description |
|---|---|---|
| `VITE_NAKAMA_HOST` | `127.0.0.1` | Hostname or IP of the Nakama server |
| `VITE_NAKAMA_PORT` | `7350` | Nakama HTTP/WebSocket port |
| `VITE_NAKAMA_SERVER_KEY` | `defaultkey` | Must match `NAKAMA_SERVER_KEY` set on the backend |
| `VITE_NAKAMA_USE_SSL` | `false` | Set to `true` when the server is behind HTTPS / WSS |

Example `frontend/.env.production`:

```
VITE_NAKAMA_HOST=your-nakama-host.example.com
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SERVER_KEY=your-production-server-key
VITE_NAKAMA_USE_SSL=true
```

### Backend environment variables

Configured in `nakama/docker-compose.yml` or as container environment variables on your hosting provider.

| Variable | Default | Description |
|---|---|---|
| `NAKAMA_SERVER_KEY` | `defaultkey` | Shared secret used by the client SDK to initialise connections |
| `NAKAMA_CORS_ALLOW_ORIGIN` | `http://localhost:5173` | Exact frontend origin permitted for cross-origin requests |
| `NAKAMA_SESSION_ENCRYPTION_KEY` | `defaultencryptionkey` | Key used to sign session tokens |
| `NAKAMA_REFRESH_ENCRYPTION_KEY` | `defaultrefreshencryptionkey` | Key used to sign refresh tokens |

> **Security:** Replace all default key values before deploying to production. Use long, randomly generated strings (32+ characters).

### Nakama ports

| Port | Protocol | Purpose |
|---|---|---|
| `7350` | HTTP / WebSocket | REST API and realtime socket — used by the frontend |
| `7349` | gRPC | gRPC API — not used by this application |
| `7351` | HTTP | Nakama developer console (dashboard UI) |

### RPC endpoints

All RPCs are invoked via `POST /v2/rpc/{id}` with a `Bearer <token>` header. The Nakama JS SDK handles encoding automatically.

| RPC ID | Auth | Request body | Description |
|---|---|---|---|
| `find_match` | Required | `{"mode":"classic"}` or `{"mode":"timed"}` | Adds the caller to the matchmaker queue for the given mode |
| `cancel_matchmaking` | Required | `{}` | Removes the caller from the matchmaker queue |
| `get_leaderboard` | Required | `{}` | Returns players sorted by wins → best streak → fewest losses |
| `ensure_player_stats` | Required | `{}` | Creates a stats storage document for the user if one does not exist |

---

## How to Register

1. Open the app — you will land on the **Login** page.
2. Click **Create an account** at the bottom of the login form.
3. Enter a username (letters, numbers, `_`, `-`, `.` allowed).
4. Enter a password (minimum 8 characters) and confirm it.
5. Click **Create Account**.

Your account is created and you are taken straight to the Lobby. The same credentials work on any device.

---

## How to Log In

1. Open the app — you will land on the **Login** page.
2. Enter your username and password.
3. Click **Login**.

Sessions are encrypted and cached locally, so you stay logged in across page refreshes without re-entering credentials.

### Logging out

Click **Logout / Change Account** at the bottom of the Lobby. This clears the saved session and returns you to the login screen.

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
| Account security | Password accounts require correct credentials at login; registration fails if username is already taken |
| Session validation | Restored local sessions are verified against the server on app load; stale sessions are cleared automatically |

---

## Testing Multiplayer

### Basic two-player local test

1. Start the backend: `cd nakama && docker compose up -d`
2. Start the frontend: `cd frontend && npm run dev`
3. Open **http://localhost:5173** in Browser Window 1. Register and log in as `player1`.
4. Open **http://localhost:5173** in a **private / incognito tab** or a second browser. Register and log in as `player2`.
5. In both windows, select the same mode (**Classic** or **Timed**) and click **Find Match**.
6. Both windows should navigate to the game board within a few seconds.
7. Take turns clicking cells — only the active player's clicks are accepted.
8. Complete the game and confirm the correct result appears on both Game Over screens.
9. Return to the Lobby and press **Refresh** on the leaderboard. Confirm wins and streaks updated for both players.

### Timed mode test

1. Follow the same steps but select **Timed (30s)** in both windows.
2. When it is your turn, do not click any cell.
3. After 30 seconds the server forfeits the turn and the opponent is declared the winner.
4. Confirm the timer turns red below 10 seconds and the Game Over screen fires automatically.

### Disconnect test

1. Start a match between two browser tabs.
2. Close one tab mid-game.
3. The remaining player should see a Game Over result indicating the opponent disconnected.
4. Reopen the closed tab, log back in, and confirm the Lobby loads correctly with updated stats.

### Verifying server authority

1. During a match, open DevTools → Console on one window.
2. The board state on screen always reflects the last server broadcast — it cannot be altered from the console in a way the server will accept.
3. Attempt to submit a move out of turn at the network level; the server will reject it and the board will not change.

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

### Full data reset (wipe everything and start clean)

```powershell
cd nakama
docker compose down -v
docker compose up -d
```

This deletes all accounts, stats, and leaderboard data.

---

## Production Build

## Deployment

### 1. Build the frontend

```powershell
cd frontend
npm run build
```

Output is written to `frontend/dist/`. This is a fully static site — deploy it to any static host (Netlify, Vercel, Cloudflare Pages, S3 + CloudFront, etc.).

### 2. Configure production environment variables

Create `frontend/.env.production` before building (or set these as environment variables in your CI pipeline):

```
VITE_NAKAMA_HOST=your-nakama-host.example.com
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SERVER_KEY=your-production-server-key
VITE_NAKAMA_USE_SSL=true
```

Do **not** commit this file. Add `*.env*` to `.gitignore`.

### 3. Preview the production build locally

```powershell
cd frontend
npm run preview
```

### 4. Deploy the backend

The Nakama backend runs as a Docker container. Any platform that supports Docker can host it (Render, Railway, Fly.io, or a bare VPS):

1. Push your repository to a remote (e.g. GitHub).
2. On your host, navigate to the `nakama/` directory and run:
	```bash
	docker compose up -d
	```
3. Set these environment variables on the service — **do not use the default values in production**:
	- `NAKAMA_SERVER_KEY` — a strong random string (32+ characters)
	- `NAKAMA_CORS_ALLOW_ORIGIN` — the exact URL of your deployed frontend (e.g. `https://lila-tictactoe.netlify.app`)
	- `NAKAMA_SESSION_ENCRYPTION_KEY` — a strong random string
	- `NAKAMA_REFRESH_ENCRYPTION_KEY` — a different strong random string
4. Ensure port `7350` is publicly reachable, or proxy it through a reverse proxy (nginx, Caddy) with TLS termination on port `443`.
5. After any change to `nakama/data/modules/main.js`, restart the Nakama container:
	```bash
	docker compose restart nakama
	```

### 5. Post-deployment verification

- Open your live frontend URL and register a new account to confirm the client can reach the backend.
- Run `docker compose logs -f nakama` and confirm all 6 RPCs are registered on startup.
- Play a full match end-to-end to verify stats and leaderboard writes succeed.

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
