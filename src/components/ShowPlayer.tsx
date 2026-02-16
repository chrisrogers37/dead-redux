interface ShowPlayerProps {
  /** Archive.org item identifier */
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="w-full">
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className="border-0 rounded-lg"
      />
    </div>
  );
}
