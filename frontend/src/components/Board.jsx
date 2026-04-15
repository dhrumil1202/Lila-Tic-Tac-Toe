import Cell from "./Cell";

export default function Board({ board, onCellClick, currentTurn, mySymbol, gameActive }) {
  return (
    <div style={styles.grid}>
      {board.map(function renderCell(value, index) {
        var isClickable = Boolean(
          gameActive && value === "" && currentTurn === mySymbol
        );

        return (
          <Cell
            key={index}
            value={value}
            onClick={function onClick() {
              if (isClickable) {
                onCellClick(index);
              }
            }}
            isClickable={isClickable}
          />
        );
      })}
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    width: "min(100%, 520px)",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "clamp(6px, 2vw, 10px)",
    padding: "clamp(6px, 2vw, 10px)",
    borderRadius: "14px",
    border: "1px solid rgba(120, 147, 255, 0.35)",
    background: "rgba(6, 10, 22, 0.6)",
    boxSizing: "border-box",
  },
};
