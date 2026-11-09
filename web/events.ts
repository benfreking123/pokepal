type Handler = (data: string) => void;
const handlers = new Map<string, Set<Handler>>();
let source: EventSource | null = null;
let users = 0;

export interface StreamStatus { onOpen: () => void; onError: (open: boolean) => void }

/**
 * The dashboard's single server-sent-events connection (battle state and save changes). Browsers allow about six
 * connections per host across all tabs, so a stream per panel starves ordinary requests until they never finish.
 */
export function subscribe(event: string, fn: Handler, status?: StreamStatus): () => void {
  if (!source) {
    source = new EventSource("/api/battle/stream");
    for (const name of ["battle-state", "save-changed"]) {
      source.addEventListener(name, (e) => handlers.get(name)?.forEach((h) => h((e as MessageEvent<string>).data)));
    }
  }
  users++;
  const set = handlers.get(event) ?? new Set<Handler>();
  set.add(fn);
  handlers.set(event, set);
  const es = source;
  const open = () => status?.onOpen();
  const error = () => status?.onError(es.readyState === EventSource.OPEN);
  if (status) { es.addEventListener("open", open); es.addEventListener("error", error); }
  return () => {
    set.delete(fn);
    if (status) { es.removeEventListener("open", open); es.removeEventListener("error", error); }
    if (--users === 0) { es.close(); source = null; }
  };
}

export const onSaveChanged = (fn: () => void) => subscribe("save-changed", () => fn());
