import { spawn } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (platform() === "win32") {
  const child = spawn(
    "powershell",
    [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(root, "scripts", "supermemory-start.ps1"),
    ],
    { stdio: "inherit", cwd: root }
  );
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  const child = spawn(
    "npx",
    ["supermemory", "local", "start", "--port", "6767"],
    { stdio: "inherit", cwd: root, shell: true }
  );
  child.on("exit", (code) => process.exit(code ?? 1));
}
