import type { BattleStream } from "../battleStream";

export function BattleBanners({ stream }: { stream: BattleStream }) {
  return (
    <>
      {stream.error ? <div className="notice warn" role="alert">{stream.error}</div> : null}
      {stream.reconnecting ? <div className="notice" role="status">Reconnecting…</div> : null}
    </>
  );
}
