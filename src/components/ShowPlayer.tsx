interface ShowPlayerProps {
  archiveId: string;
}

export function ShowPlayer({ archiveId }: ShowPlayerProps) {
  const embedUrl = `https://archive.org/embed/${archiveId}?playlist=1`;

  return (
    <div className="w-full bg-dead-charcoal/50">
      <iframe
        src={embedUrl}
        width="100%"
        height="400"
        allow="autoplay"
        title="Grateful Dead show audio player"
        className="block border-0"
      />
    </div>
  );
}
