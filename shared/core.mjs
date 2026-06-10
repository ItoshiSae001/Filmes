const KNOWN_MOVIES = {
  pixels: {
    title: "Pixels",
    synopsis:
      "Uma raça alienígena cria monstros inspirados em videogames da década de 1980 para conquistar a Terra, e jogadores são convocados para deter o ataque.",
    runtime: 105,
    genre: "Comédia, Ficção científica, Aventura",
    platform: "Netflix, Prime Video, Apple TV",
    release_date: "2015-07-16"
  },
  interestelar: {
    title: "Interestelar",
    synopsis:
      "Uma equipe viaja além desta galáxia para descobrir se a humanidade tem futuro entre as estrelas.",
    runtime: 169,
    genre: "Ficção científica, Drama, Aventura",
    platform: "Max, Prime Video, Apple TV",
    release_date: "2014-11-06"
  },
  avatar: {
    title: "Avatar",
    synopsis:
      "Um ex-fuzileiro recebe um corpo Avatar e acaba dividido entre uma missão militar e a proteção do mundo de Pandora.",
    runtime: 162,
    genre: "Ficção científica, Aventura, Ação",
    platform: "Disney+, Apple TV",
    release_date: "2009-12-18"
  },
  barbie: {
    title: "Barbie",
    synopsis:
      "Barbie embarca em uma jornada de autodescoberta depois que seu mundo perfeito começa a apresentar falhas inesperadas.",
    runtime: 114,
    genre: "Comédia, Fantasia, Aventura",
    platform: "Max, Prime Video, Apple TV",
    release_date: "2023-07-20"
  }
};

export function nowIso() {
  return new Date().toISOString();
}

export function uid(prefix = "") {
  const body = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${body}`;
}

export function makeInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createPosterDataUrl(title) {
  const safeTitle = String(title || "Filme").slice(0, 32);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#101932"/>
          <stop offset="50%" stop-color="#35216d"/>
          <stop offset="100%" stop-color="#0d5f5b"/>
        </linearGradient>
      </defs>
      <rect width="600" height="900" rx="34" fill="url(#bg)"/>
      <circle cx="480" cy="120" r="80" fill="rgba(52,211,153,0.18)"/>
      <circle cx="120" cy="760" r="120" fill="rgba(168,85,247,0.18)"/>
      <text x="300" y="410" text-anchor="middle" fill="#ffffff" font-size="38" font-family="Arial, Helvetica, sans-serif" opacity="0.75">ListFli8x</text>
      <text x="300" y="500" text-anchor="middle" fill="#ffffff" font-size="56" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(
        safeTitle
      )}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildMockMovie(title) {
  const normalized = String(title || "").trim();
  const key = normalized.toLowerCase();
  const known = KNOWN_MOVIES[key];

  const base = known ?? {
    title: normalized || "Filme",
    synopsis: `Sinopse simulada para "${normalized || "Filme"}". Configure o TMDb para trocar este modo de demonstração pela busca real.`,
    runtime: 110,
    genre: "Drama, Aventura",
    platform: "Netflix, Prime Video",
    release_date: "2024-01-01"
  };

  return {
    title: base.title,
    synopsis: base.synopsis,
    runtime: base.runtime,
    poster_url: createPosterDataUrl(base.title),
    genre: base.genre,
    platform: base.platform,
    tmdb_id: null,
    release_date: base.release_date
  };
}

export function createEmptyDemoDb() {
  return {
    users: [],
    profiles: [],
    lists: [],
    listMembers: [],
    movies: [],
    currentUserId: null
  };
}

export function createDemoUser(db, { email, password, displayName }) {
  const existing = db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    throw new Error("Já existe uma conta com este e-mail.");
  }

  const user = {
    id: uid("usr_"),
    email,
    password,
    displayName: displayName.trim() || email.split("@")[0],
    createdAt: nowIso()
  };

  db.users.push(user);
  db.currentUserId = user.id;
  ensureDemoProfile(db, user.id, user.displayName);
  ensurePersonalList(db, user.id);

  return user;
}

export function signInDemoUser(db, { email, password }) {
  const user = db.users.find(
    (item) => item.email.toLowerCase() === email.toLowerCase() && item.password === password
  );

  if (!user) {
    throw new Error("E-mail ou senha inválidos.");
  }

  db.currentUserId = user.id;
  ensureDemoProfile(db, user.id, user.displayName);
  ensurePersonalList(db, user.id);

  return user;
}

export function getDemoCurrentUser(db) {
  if (!db.currentUserId) {
    return null;
  }

  return db.users.find((user) => user.id === db.currentUserId) ?? null;
}

export function signOutDemoUser(db) {
  db.currentUserId = null;
}

export function ensureDemoProfile(db, userId, displayName) {
  let profile = db.profiles.find((item) => item.id === userId);

  if (!profile) {
    profile = {
      id: userId,
      display_name: displayName || "Usuário",
      created_at: nowIso()
    };
    db.profiles.push(profile);
  } else if (displayName) {
    profile.display_name = displayName;
  }

  return profile;
}

export function ensurePersonalList(db, userId) {
  let list = db.lists.find((item) => item.owner_id === userId && item.kind === "personal");

  if (!list) {
    list = {
      id: uid("lst_"),
      name: "Minha lista",
      kind: "personal",
      invite_code: null,
      owner_id: userId,
      created_at: nowIso()
    };
    db.lists.push(list);
  }

  if (!db.listMembers.some((item) => item.list_id === list.id && item.user_id === userId)) {
    db.listMembers.push({
      list_id: list.id,
      user_id: userId,
      created_at: nowIso()
    });
  }

  return list;
}

export function listUserLists(db, userId) {
  const listIds = db.listMembers.filter((item) => item.user_id === userId).map((item) => item.list_id);

  return db.lists
    .filter((list) => listIds.includes(list.id))
    .sort((left, right) => {
      if (left.kind === right.kind) {
        return left.name.localeCompare(right.name);
      }
      return left.kind === "personal" ? -1 : 1;
    });
}

export function createSharedList(db, userId, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new Error("Digite um nome para a lista compartilhada.");
  }

  const list = {
    id: uid("lst_"),
    name: trimmed,
    kind: "shared",
    invite_code: makeInviteCode(),
    owner_id: userId,
    created_at: nowIso()
  };

  db.lists.push(list);
  db.listMembers.push({
    list_id: list.id,
    user_id: userId,
    created_at: nowIso()
  });

  return list;
}

export function joinSharedList(db, userId, code) {
  const normalizedCode = String(code ?? "").trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error("Digite o código do convite.");
  }

  const list = db.lists.find((item) => item.kind === "shared" && item.invite_code === normalizedCode);
  if (!list) {
    throw new Error("Código não encontrado.");
  }

  if (!db.listMembers.some((item) => item.list_id === list.id && item.user_id === userId)) {
    db.listMembers.push({
      list_id: list.id,
      user_id: userId,
      created_at: nowIso()
    });
  }

  return list;
}

export function listMovies(db, listId) {
  return db.movies
    .filter((item) => item.list_id === listId)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

export function addMovie(db, input) {
  const movie = {
    id: uid("mov_"),
    list_id: input.list_id,
    title: input.title,
    platform: input.platform ?? null,
    genre: input.genre ?? null,
    synopsis: input.synopsis ?? null,
    runtime: input.runtime ?? null,
    poster_url: input.poster_url ?? null,
    watched: Boolean(input.watched),
    rating: input.rating ?? null,
    added_by: input.added_by,
    added_by_name: input.added_by_name,
    tmdb_id: input.tmdb_id ?? null,
    release_date: input.release_date ?? null,
    created_at: nowIso(),
    updated_at: nowIso()
  };

  db.movies.push(movie);
  return movie;
}

export function updateMovie(db, movieId, patch) {
  const movie = db.movies.find((item) => item.id === movieId);
  if (!movie) {
    throw new Error("Filme não encontrado.");
  }

  Object.assign(movie, patch, { updated_at: nowIso() });

  if (movie.rating !== null && movie.rating !== undefined) {
    const rating = Number(movie.rating);
    if (Number.isNaN(rating) || rating < 0 || rating > 10) {
      throw new Error("A nota precisa estar entre 0 e 10.");
    }
    movie.rating = rating;
  }

  return movie;
}


export function normalizePlatformGroup(movie) {
  const platforms = splitCsv(movie?.platform).map((item) => item.toLowerCase()).sort();
  return platforms.length ? platforms.join(" | ") : "sem plataforma";
}

export function getPlatformGroupLabel(movie) {
  const platforms = splitCsv(movie?.platform).sort((left, right) => left.localeCompare(right, "pt-BR"));
  return platforms.length ? platforms.join(" • ") : "Sem plataforma informada";
}

export function sortMoviesForView(movies, filter = "all", ratingOrder = "desc") {
  const source = [...(movies ?? [])];

  if (filter === "pending") {
    return source.filter((movie) => !movie.watched);
  }

  if (filter === "watched") {
    return source.filter((movie) => movie.watched);
  }

  if (filter === "rating") {
    const direction = ratingOrder === "asc" ? 1 : -1;
    return source.sort((left, right) => {
      const leftRating = left.rating ?? (direction === -1 ? -1 : 999);
      const rightRating = right.rating ?? (direction === -1 ? -1 : 999);

      if (leftRating !== rightRating) {
        return (leftRating - rightRating) * direction;
      }

      return String(left.title ?? "").localeCompare(String(right.title ?? ""), "pt-BR");
    });
  }

  if (filter === "platform") {
    return source.sort((left, right) => {
      const platformCompare = getPlatformGroupLabel(left).localeCompare(getPlatformGroupLabel(right), "pt-BR");
      if (platformCompare !== 0) {
        return platformCompare;
      }

      return String(left.title ?? "").localeCompare(String(right.title ?? ""), "pt-BR");
    });
  }

  return source;
}

export function removeMovie(db, movieId) {
  const index = db.movies.findIndex((item) => item.id === movieId);
  if (index === -1) {
    throw new Error("Filme não encontrado.");
  }

  db.movies.splice(index, 1);
}
