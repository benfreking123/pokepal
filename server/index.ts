import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config";
import { loadGameData } from "./data/loadData";
import { openBattleHistory } from "./battle/history";
import { createBattleFeed, registerBattleRoutes } from "./routes/battle";
import { createOverlayWriter, overlayFile } from "./overlay/write";
import { registerConfigRoutes } from "./routes/config";
import { registerCrossplayRoutes } from "./routes/crossplay";
import { registerDataRoutes } from "./routes/data";
import { createSaveNotifier, latestFieldNotes, registerSaveRoutes } from "./routes/save";
import { openSpoilers, registerSpoilerRoutes } from "./routes/spoilers";
import { registerSpriteRoutes } from "./sprites";
import { registerTrainerRoutes } from "./routes/trainers";
import { registerWhatsNextRoutes } from "./routes/whatsNext";

const config = await loadConfig();
const data = await loadGameData(config.dataDir, config.dataVersion).catch((e: Error) => e);
const spoilers = await openSpoilers(path.join(config.stateDir ?? "state", "spoilers.json"));

const app = Fastify({ logger: { level: process.env.POKEPAL_DEBUG ? "debug" : "info" } });
await app.register(fastifyStatic, { root: path.resolve("dist/web") });
registerSpoilerRoutes(app, spoilers);
registerDataRoutes(app, data, spoilers, latestFieldNotes);
if (!(data instanceof Error)) registerTrainerRoutes(app, data, spoilers);
const battleHistory = await openBattleHistory(config.stateDir ? path.join(config.stateDir, "battle-history.json") : null, (m) => app.log.warn(m));
const battleFeed = createBattleFeed({
  file: config.battleStateFile,
  trainers: data instanceof Error ? {} : data.trainers,
  store: spoilers,
  history: battleHistory,
  log: (m) => app.log.debug(m),
});
const saveNotifier = createSaveNotifier(config.saveFile);
registerBattleRoutes(app, battleFeed, battleHistory, spoilers, saveNotifier);
app.addHook("onClose", async () => { await battleFeed.close(); await battleHistory.flush(); });
if (config.battleStateFile && !(data instanceof Error)) {
  const overlay = createOverlayWriter({
    file: overlayFile(config.battleStateFile),
    data: data.game,
    latest: battleFeed.latest,
    settings: () => ({ settings: spoilers.state.settings, found: new Set([...spoilers.state.foundFieldNotes, ...(latestFieldNotes() ?? [])]) }),
    log: (m) => app.log.debug(m),
  });
  battleFeed.subscribe(() => void overlay.refresh());
  app.addHook("onClose", () => overlay.close());
}
registerSpriteRoutes(app, config.gameDir, data);
registerSaveRoutes(app, config, data, saveNotifier);
registerWhatsNextRoutes(app, config, data, spoilers);
registerCrossplayRoutes(app, config, data);
registerConfigRoutes(app, config);

const host = config.lanAccess ? "0.0.0.0" : "127.0.0.1";
await app.listen({ port: config.port, host });
const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => `http://${i!.address}:${config.port}`);
console.log(`PokePal running at http://localhost:${config.port}${config.lanAccess ? `  (phone: ${lan.join(", ")})` : ""}`);
