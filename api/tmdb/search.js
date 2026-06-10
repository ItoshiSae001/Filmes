module.exports = async function handler(request, response) {
  const title = String(request.query?.title ?? "").trim();

  if (!title) {
    return response.status(400).json({ error: "Informe o título do filme." });
  }

  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return response.status(200).json(buildMockMovie(title));
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
      return response.status(502).json({ error: "Não foi possível consultar o TMDb." });
    }

    const searchPayload = await searchResponse.json();
    const firstMovie = searchPayload.results?.[0];

    if (!firstMovie) {
      return response.status(404).json({ error: "Nenhum filme encontrado com esse título." });
    }

    const [detailsResponse, providersResponse] = await Promise.all([
      fetch(`${baseUrl}/movie/${firstMovie.id}?language=pt-BR`, { headers }),
      fetch(`${baseUrl}/movie/${firstMovie.id}/watch/providers`, { headers })
    ]);

    if (!detailsResponse.ok) {
      return response.status(502).json({ error: "Não foi possível buscar os detalhes do filme." });
    }

    const details = await detailsResponse.json();
    const providers = providersResponse.ok ? await providersResponse.json() : { results: {} };

    return response.status(200).json({
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
    return response.status(500).json({ error: "Falha inesperada ao consultar o TMDb." });
  }
};

function extractProviders(payload) {
  const br = payload?.results?.BR;
  const merged = [...(br?.flatrate ?? []), ...(br?.rent ?? []), ...(br?.buy ?? [])].map(
    (item) => item.provider_name
  );
  const unique = [...new Set(merged)];
  return unique.length ? unique.join(", ") : null;
}

function buildMockMovie(title) {
  const text = escapeXml(String(title || "Filme").slice(0, 32));
  const poster = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#101932"/>
          <stop offset="50%" stop-color="#35216d"/>
          <stop offset="100%" stop-color="#0d5f5b"/>
        </linearGradient>
      </defs>
      <rect width="600" height="900" rx="34" fill="url(#bg)"/>
      <text x="300" y="410" text-anchor="middle" fill="#ffffff" font-size="38" font-family="Arial, Helvetica, sans-serif" opacity="0.75">ListFli8x</text>
      <text x="300" y="500" text-anchor="middle" fill="#ffffff" font-size="56" font-weight="700" font-family="Arial, Helvetica, sans-serif">${text}</text>
    </svg>
  `)}`;

  return {
    title: title,
    synopsis: `Sinopse simulada para "${title}". Configure o TMDb para usar a busca real.`,
    runtime: 110,
    poster_url: poster,
    genre: "Drama, Aventura",
    platform: "Netflix, Prime Video",
    tmdb_id: null,
    release_date: "2024-01-01"
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
