const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3030);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DOWNLOAD_DIR = path.join(ROOT, "downloads");

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const jobs = new Map();

function existingDirs(dirs) {
  return dirs.filter(Boolean).filter(dir => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

function getToolDirs() {
  const home = process.env.USERPROFILE || "";
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  return existingDirs([
    path.join(localAppData, "Microsoft", "WinGet", "Links"),
    path.join(localAppData, "Programs", "yt-dlp"),
    path.join(localAppData, "Programs", "Python", "Python312", "Scripts"),
    path.join(localAppData, "Programs", "Python", "Python311", "Scripts"),
    path.join(localAppData, "Programs", "Python", "Python310", "Scripts"),
    path.join(appData, "Python", "Python312", "Scripts"),
    path.join(appData, "Python", "Python311", "Scripts"),
    path.join(appData, "Python", "Python310", "Scripts"),
    path.join(programFiles, "yt-dlp"),
    path.join(programFiles, "ffmpeg", "bin"),
    path.join(programFiles, "Gyan", "ffmpeg", "bin"),
    path.join(programFilesX86, "ffmpeg", "bin"),
    "C:\\ProgramData\\chocolatey\\bin"
  ]);
}

function findExecutable(name) {
  const explicit = name === "yt-dlp" ? process.env.YTDLP_PATH : process.env.FFMPEG_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of getToolDirs()) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${name}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return name;
}

function getSpawnEnv() {
  const delimiter = path.delimiter;
  const extraPath = getToolDirs().join(delimiter);
  return {
    ...process.env,
    PATH: extraPath ? `${extraPath}${delimiter}${process.env.PATH || ""}` : process.env.PATH
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function safeJoinDownload(fileName) {
  const resolved = path.resolve(DOWNLOAD_DIR, fileName);
  if (!resolved.startsWith(path.resolve(DOWNLOAD_DIR) + path.sep)) return null;
  return resolved;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";

  const fullPath = path.resolve(PUBLIC_DIR, "." + filePath);
  if (!fullPath.startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "content-type": type });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseTime(value) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!/^\d{1,3}(:[0-5]\d){1,2}$/.test(clean)) return null;
  const parts = clean.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(part => String(part).padStart(2, "0")).join(":");
}

function getDownloaderCommand() {
  return { command: findExecutable("yt-dlp"), args: [] };
}

function missingToolsMessage(err) {
  return [
    `Could not start yt-dlp: ${err.message}`,
    "Install yt-dlp and ffmpeg, restart this terminal, then run the app again.",
    "If yt-dlp already works in PowerShell, run the app with start-codex-node.bat so the app gets the same tool paths.",
    "Windows: winget install yt-dlp.yt-dlp",
    "Windows: winget install Gyan.FFmpeg"
  ];
}

function getVideoInfo(videoUrl) {
  return new Promise(resolve => {
    if (!/^https?:\/\/\S+$/i.test(videoUrl || "")) {
      resolve({ error: "Paste a valid http or https video URL." });
      return;
    }

    const base = getDownloaderCommand();
    const args = [
      ...base.args,
      "--dump-single-json",
      "--no-playlist",
      "--skip-download",
      videoUrl
    ];
    let child;
    try {
      child = spawn(base.command, args, {
        cwd: ROOT,
        env: getSpawnEnv(),
        windowsHide: true
      });
    } catch (err) {
      resolve({ error: missingToolsMessage(err).join("\n") });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", err => {
      resolve({ error: missingToolsMessage(err).join("\n") });
    });

    child.on("close", code => {
      if (code !== 0) {
        resolve({
          error: stderr.trim() || `yt-dlp could not read this video. Exit code: ${code}`
        });
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const thumbnail = Array.isArray(info.thumbnails) && info.thumbnails.length
          ? info.thumbnails[info.thumbnails.length - 1].url
          : info.thumbnail || "";

        resolve({
          title: info.title || "Untitled video",
          channel: info.channel || info.uploader || "",
          duration: Number(info.duration || 0),
          durationText: info.duration_string || formatTime(Number(info.duration || 0)),
          thumbnail,
          webpageUrl: info.webpage_url || videoUrl
        });
      } catch (err) {
        resolve({ error: `Could not parse video details: ${err.message}` });
      }
    });
  });
}

function startJob({ url, start, end, quality }) {
  const id = crypto.randomUUID();
  const startSeconds = parseTime(start);
  const endSeconds = parseTime(end);

  if (!/^https?:\/\/\S+$/i.test(url || "")) {
    return { error: "Paste a valid http or https video URL." };
  }

  if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) {
    return { error: "Use valid times like 01:20:00, and make end time later than start time." };
  }

  const maxSeconds = 4 * 60 * 60;
  if (endSeconds - startSeconds > maxSeconds) {
    return { error: "This app limits one clip to 4 hours to keep the download manageable." };
  }

  const outputTemplate = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`);
  const section = `*${formatTime(startSeconds)}-${formatTime(endSeconds)}`;
  const qualityFormat = quality === "small"
    ? "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]/best"
    : quality === "medium"
      ? "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/best[height<=1080]/best"
      : "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best";

  const base = getDownloaderCommand();
  const args = [
    ...base.args,
    "--no-playlist",
    "--restrict-filenames",
    "--force-keyframes-at-cuts",
    "--download-sections",
    section,
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "-f",
    qualityFormat,
    "-o",
    outputTemplate,
    url
  ];

  const job = {
    id,
    status: "running",
    log: [],
    fileName: null,
    startedAt: Date.now()
  };
  jobs.set(id, job);

  let child;
  try {
    child = spawn(base.command, args, {
      cwd: ROOT,
      env: getSpawnEnv(),
      windowsHide: true
    });
  } catch (err) {
    job.status = "failed";
    job.log.push(...missingToolsMessage(err));
    return { id };
  }

  const pushLog = chunk => {
    const text = chunk.toString();
    job.log.push(...text.split(/\r?\n/).filter(Boolean).slice(-20));
    job.log = job.log.slice(-80);
  };

  child.stdout.on("data", pushLog);
  child.stderr.on("data", pushLog);
  child.on("error", err => {
    job.status = "failed";
    job.log.push(...missingToolsMessage(err));
  });
  child.on("close", code => {
    if (job.status === "failed") return;
    if (code !== 0) {
      job.status = "failed";
      job.log.push(`yt-dlp exited with code ${code}.`);
      return;
    }

    const files = fs.readdirSync(DOWNLOAD_DIR).filter(file => file.startsWith(`${id}.`));
    if (!files.length) {
      job.status = "failed";
      job.log.push("The download finished, but no output file was found.");
      return;
    }

    job.fileName = files[0];
    job.status = "complete";
  });

  return { id };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/info") {
    try {
      const body = JSON.parse(await readBody(req));
      const result = await getVideoInfo(body.url);
      if (result.error) sendJson(res, 400, result);
      else sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Invalid request." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/clip") {
    try {
      const body = JSON.parse(await readBody(req));
      const result = startJob(body);
      if (result.error) sendJson(res, 400, result);
      else sendJson(res, 202, result);
    } catch (err) {
      sendJson(res, 400, { error: err.message || "Invalid request." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
    const id = url.pathname.split("/").pop();
    const job = jobs.get(id);
    if (!job) {
      sendJson(res, 404, { error: "Job not found." });
      return;
    }

    sendJson(res, 200, {
      id: job.id,
      status: job.status,
      log: job.log,
      downloadUrl: job.fileName ? `/download/${encodeURIComponent(job.fileName)}` : null
    });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/download/")) {
    const fileName = decodeURIComponent(url.pathname.replace("/download/", ""));
    const fullPath = safeJoinDownload(fileName);
    if (!fullPath || !fs.existsSync(fullPath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`
    });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Video Clipper is running at http://localhost:${PORT}`);
});
