import { useEffect, useState } from "react";

function getHeadline(winner, mySymbol) {
  if (winner === "draw") {
    return "DRAW!";
  }

  if (winner && winner === mySymbol) {
    return "YOU WIN!";
  }

  if (winner && winner !== mySymbol) {
    return "YOU LOSE";
  }

  return "GAME OVER";
}

function getWinnerName(winner, playerInfo) {
  if (winner === "draw") {
    return "No winner (draw)";
  }

  if (!winner || !playerInfo || !playerInfo[winner]) {
    return "Unknown";
  }

  return playerInfo[winner].displayName || "Unknown";
}

function getHeadlineStyle(winner, mySymbol) {
  if (winner === "draw") {
    return styles.draw;
  }

  if (winner && winner === mySymbol) {
    return styles.win;
  }

  if (winner && winner !== mySymbol) {
    return styles.lose;
  }

  return styles.defaultHeadline;
}

export default function GameOver({ winner, mySymbol, playerInfo, onPlayAgain }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    var raf = requestAnimationFrame(function show() {
      setVisible(true);
    });

    return function cleanup() {
      cancelAnimationFrame(raf);
    };
  }, []);

  var headline = getHeadline(winner, mySymbol);
  var winnerName = getWinnerName(winner, playerInfo);

  return (
    <div style={{ ...styles.overlay, opacity: visible ? 1 : 0 }}>
      <div
        style={{
          ...styles.modal,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.94)",
        }}
      >
        <h2 style={{ ...styles.title, ...getHeadlineStyle(winner, mySymbol) }}>{headline}</h2>
        <p style={styles.text}>Winning player: {winnerName}</p>
        <button type="button" onClick={onPlayAgain} style={styles.button}>
          Play Again
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(6, 8, 17, 0.78)",
    display: "grid",
    placeItems: "center",
    padding: "20px",
    zIndex: 20,
    transition: "opacity 220ms ease",
  },
  modal: {
    width: "min(420px, 94vw)",
    borderRadius: "16px",
    background: "linear-gradient(170deg, #121b36 0%, #0b1229 100%)",
    border: "1px solid rgba(158, 176, 255, 0.3)",
    padding: "24px",
    textAlign: "center",
    color: "#ecf1ff",
    transition: "opacity 220ms ease, transform 260ms ease",
    boxShadow: "0 18px 44px rgba(0, 0, 0, 0.45)",
  },
  title: {
    margin: "0 0 12px",
    fontSize: "2rem",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  win: {
    color: "#6bffad",
    textShadow: "0 0 18px rgba(84, 255, 170, 0.35)",
  },
  lose: {
    color: "#ff9ba7",
  },
  draw: {
    color: "#9fe9ff",
  },
  defaultHeadline: {
    color: "#ecf1ff",
  },
  text: {
    margin: "0 0 18px",
    color: "#cdd7ff",
  },
  button: {
    border: 0,
    borderRadius: "10px",
    padding: "11px 16px",
    cursor: "pointer",
    background: "linear-gradient(90deg, #4ad88b 0%, #49bff1 100%)",
    color: "#062012",
    fontWeight: 700,
  },
};
