import { spawn } from "bun";
import * as fs from "fs";
import * as path from "path";

console.log("=======================================");
console.log("   CSV Merger & Enricher");
console.log("=======================================");

const envPath = path.join(import.meta.dir, ".env");

if (!fs.existsSync(envPath)) {
  console.log("\n=======================================");
  console.log(".env file not found.");
  const key = prompt("Please enter your Gemini API Key: ");
  fs.writeFileSync(
    envPath,
    [
      `GEMINI_API_KEY=${key || ''}`,
      `PORT=3001`,
      `LOG_ENABLED=true`,
      `# SKIP_KEYWORDS=true`,
      `# WILD_GUESS=true`,
      `# LOG_FILE=enrichment.log`,
    ].join('\n') + '\n'
  );
  console.log("✅ Created .env file.");
  console.log("=======================================\n");
}

// Read PORT from .env (default 3001)
let port = 3001;
try {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^PORT=(\d+)/m);
  if (match) port = parseInt(match[1], 10);
} catch {}

console.log("Starting server...\n");

const server = spawn(["bun", "--env-file=.env", "apps/web/src/server.ts"], {
  cwd: import.meta.dir,
  stdout: "pipe",
  stderr: "pipe",
});

async function prefixStream(stream: ReadableStream | null, prefix: string) {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`${prefix} ${line}\n`);
    }
  }
}

prefixStream(server.stdout, "\x1b[34m[SERVER]\x1b[0m");
prefixStream(server.stderr, "\x1b[31m[SERVER ERR]\x1b[0m");

setTimeout(() => {
  console.log("\n=======================================");
  console.log(`🚀 Server started! Opening browser...`);
  console.log(`   http://localhost:${port}`);
  console.log("=======================================\n");
  spawn(["cmd", "/c", "start", `http://localhost:${port}`]);
}, 2500);
