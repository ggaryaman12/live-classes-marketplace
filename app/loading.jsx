export default function Loading() {
  return (
    <div className="skel-wrap">
      <div className="skel-hero" />
      <div className="skel-grid">
        {Array.from({ length: 8 }).map((_, i) => <div className="skel-card" key={i} style={{ animationDelay: `${i * 40}ms` }} />)}
      </div>
    </div>
  );
}
