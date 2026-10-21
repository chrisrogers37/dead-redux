interface ShareCardProps {
  eyebrow: string;
  headline: string;
  line?: string;
  footer: string;
}

/**
 * The site's 1200×630 link-preview card, on the page colour: an amber eyebrow over a
 * large sans-serif headline, a line of detail under it when there is one, and a footer.
 */
export function ShareCard({ eyebrow, headline, line, footer }: ShareCardProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        backgroundColor: "#0B0B0D",
        color: "#ECEAE4",
        padding: "60px",
        position: "relative",
      }}
    >
      {/* Top: eyebrow */}
      <div
        style={{
          fontSize: 28,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#E8B04B",
          marginBottom: 20,
          display: "flex",
        }}
      >
        {eyebrow}
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 88,
          fontFamily: "sans-serif",
          textAlign: "center",
          lineHeight: 1.2,
          maxWidth: 900,
          display: "flex",
        }}
      >
        {headline}
      </div>

      {/* Detail line */}
      {line && (
        <div
          style={{
            fontSize: 36,
            color: "#A09C94",
            marginTop: 20,
            display: "flex",
          }}
        >
          {line}
        </div>
      )}

      {/* Bottom: footer */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          fontSize: 24,
          color: "#A09C94",
          display: "flex",
        }}
      >
        {footer}
      </div>
    </div>
  );
}
