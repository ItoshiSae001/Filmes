import http from "node:http";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockMovie } from "./shared/core.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 3000);
const root = __dirname;

loadDotEnv(path.join(root, ".env"));
loadDotEnv(path.join(root, ".env.local"));

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".sql": "text/plain; charset=utf-8"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      return sendJson(response, 200, {
        ok: true,
        mode: process.env.TMDB_READ_ACCESS_TOKEN ? "tmdb" : "mock"
      });
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return sendJson(response, 200, {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        supabaseAnonKey:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          ""
      });
    }

    if (url.pathname === "/api/tmdb/search" && request.method === "GET") {
      return handleMovieSearch(url, response);
    }

    if (request.method !== "GET") {
      return sendText(response, 405, "Method not allowed.");
    }

    const safePath = resolveStaticPath(url.pathname);
    if (safePath && (await fileExists(safePath))) {
      return serveFile(safePath, response);
    }

    return serveFile(path.join(root, "index.html"), response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return sendJson(response, 500, { error: message });
  }
});

server.listen(port, () => {
  console.log(`ListFli8x rodando em http://localhost:${port}`);
});

function loadDotEnv(filePath) {
  try {
    const content = requireNodeStyleEnv(filePath);
    for (const [key, value] of Object.entries(content)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}
}

function requireNodeStyleEnv(filePath) {
  const raw = fsSync.readFileSync(filePath, "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }
  return result;
}

function resolveStaticPath(pathname) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const candidate = path.normalize(path.join(root, decodeURIComponent(clean)));

  if (!candidate.startsWith(root)) {
    return null;
  }

  return candidate;
}

async function serveFile(filePath, response) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return serveFile(path.join(filePath, "index.html"), response);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[ext] || "application/octet-stream";
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
  }
}

async function handleMovieSearch(url, response) {
  const title = url.searchParams.get("title")?.trim();
  if (!title) {
    return sendJson(response, 400, { error: "Informe o título do filme." });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return sendJson(response, 200, buildMockMovie(title));
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const baseUrl = "https://api.themoviedb.org/3";

  try {
    const searchResponse = await fetch(
      `${baseUrl}/search/movie?language=pt-BR&include_adult=false&query=${encodeURIComponent(title)}`,
      { headers }
    );

    if (!searchResponse.ok) {
      return sendJson(response, 502, { error: "Não foi possível consultar o TMDb." });
    }

    const searchPayload = await searchResponse.json();
    const firstMovie = searchPayload.results?.[0];

    if (!firstMovie) {
      return sendJson(response, 404, { error: "Nenhum filme encontrado com esse título." });
    }

    const [detailsResponse, providersResponse] = await Promise.all([
      fetch(`${baseUrl}/movie/${firstMovie.id}?language=pt-BR`, { headers }),
      fetch(`${baseUrl}/movie/${firstMovie.id}/watch/providers`, { headers })
    ]);

    if (!detailsResponse.ok) {
      return sendJson(response, 502, { error: "Não foi possível buscar os detalhes do filme." });
    }

    const details = await detailsResponse.json();
    const providers = providersResponse.ok ? await providersResponse.json() : { results: {} };

    return sendJson(response, 200, {
      title: details.title || firstMovie.title,
      synopsis: details.overview || firstMovie.overview || null,
      runtime: details.runtime ?? null,
      poster_url: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : firstMovie.poster_path
          ? `https://image.tmdb.org/t/p/w500${firstMovie.poster_path}`
          : buildMockMovie(title).poster_url,
      genre: Array.isArray(details.genres) ? details.genres.map((item) => item.name).join(", ") : null,
      platform: extractProviders(providers),
      tmdb_id: firstMovie.id,
      release_date: details.release_date || firstMovie.release_date || null
    });
  } catch {
    return sendJson(response, 500, { error: "Falha inesperada ao consultar o TMDb." });
  }
}

function extractProviders(payload) {
  const br = payload?.results?.BR;
  const merged = [...(br?.flatrate ?? []), ...(br?.rent ?? []), ...(br?.buy ?? [])].map(
    (item) => item.provider_name
  );
  const unique = [...new Set(merged)];
  return unique.length ? unique.join(", ") : null;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
