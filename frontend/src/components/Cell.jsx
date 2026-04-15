export default function Cell({ value, onClick, isClickable }) {
  var displayColor = "#eef3ff";

  if (value === "X") {
    displayColor = "#ff7f7f";
  } else if (value === "O") {
    displayColor = "#61d4dc";
  }

  var interactiveStyle = isClickable && value === "" ? styles.clickable : styles.notClickable;

  return (
    <button
      type="button"
      onClick={onClick}
      className="ttt-cell"
      style={{
        ...styles.cell,
        ...interactiveStyle,
        color: displayColor,
      }}
      disabled={!isClickable}
      aria-label={value === "" ? "Empty cell" : "Cell " + value}
    >
      {value}
    </button>
  );
}

const styles = {
  cell: {
    aspectRatio: "1 / 1",
    width: "100%",
    minHeight: "clamp(68px, 20vw, 110px)",
    borderRadius: "12px",
    border: "1px solid rgba(127, 155, 255, 0.4)",
    background: "rgba(48, 67, 128, 0.34)",
    fontSize: "clamp(1.4rem, 6vw, 2rem)",
    fontWeight: 800,
    display: "grid",
    placeItems: "center",
    transition: "background-color 160ms ease, border-color 160ms ease, transform 120ms ease, color 180ms ease",
    boxSizing: "border-box",
  },
  clickable: {
    cursor: "pointer",
  },
  notClickable: {
    cursor: "default",
  },
};

const styleTagId = "ttt-cell-hover-style";

if (typeof document !== "undefined" && !document.getElementById(styleTagId)) {
  var styleTag = document.createElement("style");
  styleTag.id = styleTagId;
  styleTag.textContent =
    ".ttt-cell:not(:disabled):hover{background-color:rgba(78,105,190,0.45);border-color:rgba(152,177,255,0.62);transform:translateY(-1px)}";
  document.head.appendChild(styleTag);
}
