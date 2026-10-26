/* The site's mark on a 200 grid, drawn `size` px square: a disc split by the bolt into two halves, the bolt a gap in the page colour. */
export function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="77" fill="#E8B04B" />
      <path d="M100 23 A77 77 0 0 1 100 177 L86 106 L114 94 Z" fill="#D6508A" />
      <circle cx="100" cy="100" r="77" fill="none" stroke="#ECEAE4" strokeWidth="6" />
      <path d="M100 23 L114 94 L86 106 L100 177" fill="none" stroke="#0B0B0D" strokeWidth="10" strokeLinecap="square" />
    </svg>
  );
}

/*
 * The mark on an opaque square tile of the page colour, `size` px: the home-screen icon. The ring's outer edge sits at 40 % of the
 * tile, inside the circle a launcher's mask keeps, so one tile serves as drawn and under a mask.
 */
export function Tile({ size }: { size: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0D" }}>
      <Mark size={size} />
    </div>
  );
}
