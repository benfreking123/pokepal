import { GUIDES } from "../guides";

export function GuidesTab() {
  return (
    <div className="grid">
      {GUIDES.map((g) => (
        <a key={g.url} className="card guide" href={g.url} target="_blank" rel="noreferrer">
          <strong>{g.title}</strong>
          <span>{g.note}</span>
        </a>
      ))}
    </div>
  );
}
