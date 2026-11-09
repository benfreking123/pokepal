import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { loadConfig } from "./config";
import { loadGameData } from "./data/loadData";
import { registerConfigRoutes } from "./routes/config";
import { registerDataRoutes } from "./routes/data";
import { openSpoilers, registerSpoilerRoutes } from "./routes/spoilers";
import { registerTrainerRoutes } from "./routes/trainers";

const config = await loadConfig();
const data = await loadGameData(config.dataDir, config.dataVersion).catch((e: Error) => e);
const spoilers = await openSpoilers(path.join(config.stateDir ?? "state", "spoilers.json"));

const app = Fastify({ logger: { level: "info" } });
await app.register(fastifyStatic, { root: path.resolve("dist/web") });
registerSpoilerRoutes(app, spoilers);
registerDataRoutes(app, data, spoilers, () => null);
if (!(data instanceof Error)) registerTrainerRoutes(app, data, spoilers);
registerConfigRoutes(app, config);

const host = config.lanAccess ? "0.0.0.0" : "127.0.0.1";
await app.listen({ port: config.port, host });
const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => `http://${i!.address}:${config.port}`);
console.log(`PokePal running at http://localhost:${config.port}${config.lanAccess ? `  (phone: ${lan.join(", ")})` : ""}`);
