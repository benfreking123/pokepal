import { useState } from "react";

/** The foe's front sprite from the user's Reborn install, or a plain placeholder when the server has none. */
export function Sprite({ species, form, className = "sprite" }: { species: string | null; form: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!species || failed) return <span className={`${className} sprite-missing`} aria-hidden="true">{species ? "◓" : "?"}</span>;
  return <img className={className} src={`/api/sprites/${encodeURIComponent(species)}/${form}`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
