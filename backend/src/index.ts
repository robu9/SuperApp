import { captureEngine } from "./capture/engine.js";
import { stopAudioRecording } from "./capture/audio.js";
import { loadRootEnv } from "./load-env.js";
import { startServer } from "./server.js";

loadRootEnv();
startServer();

function shutdown(): void {
  console.log("[server] shutting down");
  stopAudioRecording();
  captureEngine.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
