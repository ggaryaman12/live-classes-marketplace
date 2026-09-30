export default function Loading() {
  return (
    <div className="skel-wrap">
      <div className="skel-storehero" />
      <div className="skel-menu">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="skel-row" key={i} style={{ animationDelay: `${i * 50}ms` }} />
        ))}
      </div>
    </div>
  );
}
