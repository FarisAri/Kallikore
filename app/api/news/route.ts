import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";
import { loadSession } from "@/lib/session-store";
import { execSync } from 'child_process';

export const runtime = "nodejs";

type Body = { sessionId?: string };

type WorkerPayload = {
  mode?: "live" | "mock";
  message?: string;
  articles?: unknown[];
  warnings?: string[];
  debug_steps?: string[];
  query_modes?: Record<string, string>;
  error?: string;
};

function getPythonPath(): string {
  try {
    // Try to find python3 first, then python
    const command = process.platform === 'win32' ? 'where' : 'which';

    // Check python3
    try {
      return execSync(`${command} python3`).toString().trim().split('\r\n')[0];
    } catch {
      // If python3 fails, check python
      return execSync(`${command} python`).toString().trim().split('\r\n')[0];
    }
  } catch (err) {
    console.error("Python not found in system PATH.");
    return "python"; // Fallback to just the command string
  }
}


function runNewsWorker(profile: unknown): Promise<WorkerPayload> {
  const python = getPythonPath();
  const workerPath = path.join(process.cwd(), "news_pipeline", "worker.py");
  const input = JSON.stringify({ profile, top_n_per_focus: 5 });
  const startedAt = Date.now();

  console.log("[news] starting worker", { python, workerPath });

  return new Promise((resolve, reject) => {
    const child = spawn(python, [workerPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("News worker timed out"));
    }, 180_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) console.log(`[news:worker] ${line}`);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      let payload: WorkerPayload | null = null;
      try {
        payload = JSON.parse(stdout || "{}") as WorkerPayload;
      } catch {
        payload = null;
      }

      if (code !== 0) {
        reject(new Error(payload?.error ?? stderr.trim() ?? `News worker exited with code ${code}`));
        return;
      }
      if (!payload) {
        reject(new Error(stderr.trim() || "News worker returned invalid JSON"));
        return;
      }
      console.log("[news] worker complete", {
        ms: Date.now() - startedAt,
        mode: payload.mode,
        articles: payload.articles?.length ?? 0,
        warnings: payload.warnings?.length ?? 0,
        queryModes: payload.query_modes ?? {},
      });
      resolve(payload);
    });

    child.stdin.end(input);
  });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const session = await loadSession(sessionId);
    console.log("[news] loaded profile", {
      sessionId,
      focuses: session.profile.international_news_focus,
      topics: session.profile.news_topics,
      hobbies: session.profile.hobbies,
    });
    const result = await runNewsWorker(session.profile);
    return NextResponse.json({
      mode: result.mode ?? "unknown",
      message: result.message,
      articles: result.articles ?? [],
      warnings: result.warnings ?? [],
      debugSteps: result.debug_steps ?? [],
      queryModes: result.query_modes ?? {},
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
