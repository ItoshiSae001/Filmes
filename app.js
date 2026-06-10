import {
  addMovie as addDemoMovie,
  buildMockMovie,
  createDemoUser,
  createEmptyDemoDb,
  createSharedList as createDemoSharedList,
  ensureDemoProfile,
  ensurePersonalList as ensureDemoPersonalList,
  getDemoCurrentUser,
  joinSharedList as joinDemoSharedList,
  listMovies as listDemoMovies,
  listUserLists as listDemoLists,
  removeMovie as removeDemoMovie,
  signInDemoUser,
  signOutDemoUser,
  sortMoviesForView,
  splitCsv,
  updateMovie as updateDemoMovie,
  getPlatformGroupLabel,
  normalizePlatformGroup
} from "./shared/core.mjs";

const app = document.querySelector("#app");
const DEMO_STORAGE_KEY = "listfli8x.demo.db";
const state = {
  backendMode: "demo",
  backendReady: false,
  supabase: null,
  session: null,
  currentRoute: "",
  lists: [],
  activeListId: "",
  activeList: null,
  movies: [],
  modalMovieId: null,
  posterTimer: null,
  busy: false,
  banner: "",
  error: "",
  success: "",
  filterMode: "all",
  ratingOrder: "desc"
};

const config = { ...(window.APP_CONFIG ?? {}), supabaseUrl: "", supabaseAnonKey: "" };

boot().catch((error) => {
  console.error(error);
  app.innerHTML = renderFatal(getErrorMessage(error, "Falha ao iniciar."));
});

async function boot() {
  await loadRuntimeConfig();
  const adapter = await createAdapter();
  state.adapter = adapter;
  state.backendMode = adapter.mode;
  state.backendReady = true;
  state.banner = adapter.mode === "demo"
    ? "Modo demo local ativo. O fluxo inteiro está funcionando sem Supabase."
    : "Modo nuvem ativo. Seus dados estão no Supabase.";

  window.addEventListener("popstate", () => {
    renderRoute().catch(showFatalError);
  });

  await refreshSession();
  await renderRoute();
}


async function loadRuntimeConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    config.supabaseUrl = String(payload.supabaseUrl ?? "").trim();
    config.supabaseAnonKey = String(payload.supabaseAnonKey ?? "").trim();
  } catch (error) {
    console.warn("Não foi possível carregar a configuração dinâmica. O app seguirá com a configuração local.", error);
  }

  if (!config.supabaseUrl && window.APP_CONFIG?.supabaseUrl) {
    config.supabaseUrl = String(window.APP_CONFIG.supabaseUrl).trim();
  }

  if (!config.supabaseAnonKey && window.APP_CONFIG?.supabaseAnonKey) {
    config.supabaseAnonKey = String(window.APP_CONFIG.supabaseAnonKey).trim();
  }
}

async function createAdapter() {
  if (config.supabaseUrl && config.supabaseAnonKey) {
    try {
      const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
      const client = module.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      return createSupabaseAdapter(client);
    } catch (error) {
      console.warn("Falha ao carregar Supabase no navegador. Voltando para o modo demo.", error);
    }
  }

  return createDemoAdapter();
}

async function refreshSession() {
  state.session = await state.adapter.getSession();
}

async function renderRoute() {
  state.currentRoute = location.pathname;

  if (!state.session && location.pathname !== "/") {
    navigate("/", null, true);
    return;
  }

  if (state.session && location.pathname === "/") {
    navigate("/lista", null, true);
    return;
  }

  clearPosterTimer();

  if (!state.session) {
    renderLoginPage();
    return;
  }

  if (location.pathname === "/lista") {
    await prepareDashboard();
    renderDashboard();
    return;
  }

  if (location.pathname === "/lista/adicionar") {
    await prepareDashboard();
    renderAddMoviePage();
    return;
  }

  if (location.pathname === "/lista/adicionar/confirmar") {
    await prepareDashboard();
    await renderConfirmMoviePage();
    return;
  }

  navigate(state.session ? "/lista" : "/", null, true);
}

function renderFatal(message) {
  return `
    <main class="page-shell">
      <div class="container center-card">
        <section class="card center-panel">
          <span class="badge">Erro</span>
          <h1>ListFli8x</h1>
          <div class="error-box">${escapeHtml(message)}</div>
        </section>
      </div>
    </main>
  `;
}

function showFatalError(error) {
  console.error(error);
  app.innerHTML = renderFatal(getErrorMessage(error, "Falha inesperada."));
}

async function prepareDashboard() {
  state.error = new URLSearchParams(location.search).get("error") || "";
  state.success = new URLSearchParams(location.search).get("success") || "";
  state.banner = state.adapter.mode === "demo"
    ? "Modo demo local ativo. O fluxo inteiro está funcionando sem Supabase."
    : "Modo nuvem ativo. Seus dados estão no Supabase.";

  const displayName = getDisplayNameFromSession(state.session);
  await state.adapter.ensureProfile(displayName);

  const personalList = await state.adapter.ensurePersonalList();
  const lists = await state.adapter.listLists();
  state.lists = lists;

  const searchListId = new URLSearchParams(location.search).get("list");
  const savedListId = localStorage.getItem("listfli8x.activeListId");
  const preferredListId = searchListId || savedListId || personalList.id;
  state.activeListId = lists.some((item) => item.id === preferredListId) ? preferredListId : personalList.id;
  localStorage.setItem("listfli8x.activeListId", state.activeListId);

  state.activeList = state.lists.find((item) => item.id === state.activeListId) ?? personalList;
  state.movies = await state.adapter.listMovies(state.activeListId);
}

function renderLoginPage() {
  const isCloud = state.backendMode === "supabase";

  app.innerHTML = `
    <main class="page-shell">
      <div class="container auth-grid">
        <section class="hero-panel">
          <span class="badge">ListFli8x</span>
          <h1>Organize os filmes que você quer assistir.</h1>
          <p>
            Digite só o título. O site busca capa, sinopse, duração, gênero e plataformas automaticamente.
          </p>
          <ul class="feature-list">
            <li>Lista pessoal automática</li>
            <li>Lista compartilhada opcional</li>
            <li>Login com Google na versão online</li>
            <li>Pôster salvo junto com o filme</li>
          </ul>
          <div class="mode-banner ${isCloud ? "success" : "warning"}">
            ${escapeHtml(state.banner || (isCloud
              ? "Modo nuvem ativo."
              : "Modo demo local. Funciona sem configurar nada."))}
          </div>
        </section>

        <section class="card auth-panel">
          ${
            isCloud
              ? `
                <div class="stack">
                  <span class="badge">Entrar</span>
                  <h2>Entre com sua conta Google</h2>
                  <p class="muted">
                    Depois do login, sua lista pessoal aparece automaticamente e você pode criar uma lista compartilhada com outra pessoa.
                  </p>
                  <button id="google-login-button" class="btn btn-google" type="button">
                    <span class="google-mark" aria-hidden="true">G</span>
                    Entrar com Google
                  </button>
                </div>
              `
              : `
                <div class="tabs">
                  <button class="tab tab-active" data-tab-button="login">Entrar</button>
                  <button class="tab" data-tab-button="signup">Criar conta</button>
                </div>

                <form id="login-form" class="stack form-visible">
                  <div class="field">
                    <label for="login-email">E-mail</label>
                    <input id="login-email" class="input" type="email" required />
                  </div>
                  <div class="field">
                    <label for="login-password">Senha</label>
                    <input id="login-password" class="input" type="password" required />
                  </div>
                  <button class="btn btn-primary" type="submit">Entrar</button>
                </form>

                <form id="signup-form" class="stack form-hidden">
                  <div class="field">
                    <label for="signup-name">Seu nome</label>
                    <input id="signup-name" class="input" required />
                  </div>
                  <div class="field">
                    <label for="signup-email">E-mail</label>
                    <input id="signup-email" class="input" type="email" required />
                  </div>
                  <div class="field">
                    <label for="signup-password">Senha</label>
                    <input id="signup-password" class="input" type="password" required />
                  </div>
                  <button class="btn btn-primary" type="submit">Criar conta</button>
                </form>
              `
          }

          <div id="auth-message" class="stack gap-sm"></div>
        </section>
      </div>
    </main>
  `;

  const message = document.querySelector("#auth-message");

  if (isCloud) {
    document.querySelector("#google-login-button").addEventListener("click", async () => {
      message.innerHTML = "";
      try {
        await state.adapter.signInWithGoogle();
      } catch (error) {
        message.innerHTML = `<div class="error-box">${escapeHtml(getErrorMessage(error, "Não foi possível iniciar o login com Google."))}</div>`;
      }
    });
    return;
  }

  const loginForm = document.querySelector("#login-form");
  const signupForm = document.querySelector("#signup-form");
  const buttons = [...document.querySelectorAll("[data-tab-button]")];

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tabButton;
      buttons.forEach((item) => item.classList.toggle("tab-active", item === button));
      loginForm.classList.toggle("form-visible", tab === "login");
      loginForm.classList.toggle("form-hidden", tab !== "login");
      signupForm.classList.toggle("form-visible", tab === "signup");
      signupForm.classList.toggle("form-hidden", tab !== "signup");
      message.innerHTML = "";
    });
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.innerHTML = "";
    try {
      await state.adapter.signIn({
        email: document.querySelector("#login-email").value.trim(),
        password: document.querySelector("#login-password").value
      });
      await refreshSession();
      navigate("/lista");
    } catch (error) {
      message.innerHTML = `<div class="error-box">${escapeHtml(getErrorMessage(error, "Não foi possível entrar."))}</div>`;
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.innerHTML = "";
    try {
      await state.adapter.signUp({
        displayName: document.querySelector("#signup-name").value.trim(),
        email: document.querySelector("#signup-email").value.trim(),
        password: document.querySelector("#signup-password").value
      });

      await refreshSession();
      navigate("/lista");
    } catch (error) {
      message.innerHTML = `<div class="error-box">${escapeHtml(getErrorMessage(error, "Não foi possível criar a conta."))}</div>`;
    }
  });
}


function renderDashboard() {
  const activeList = state.activeList;
  const inviteCode = activeList?.kind === "shared" ? activeList.invite_code : "";

  app.innerHTML = `
    <main class="page-shell">
      <div class="container">
        <header class="hero">
          <div>
            <span class="badge">Olá, ${escapeHtml(getDisplayNameFromSession(state.session))}</span>
            <h1>ListFli8x</h1>
            <p>
              Sua lista pessoal funciona sozinha. A lista compartilhada é opcional.
            </p>
          </div>

          <div class="hero-actions">
            <button id="add-title-button" class="btn btn-green" type="button">+ Adicionar novo título</button>
            <button id="logout-button" class="btn btn-secondary" type="button">Sair</button>
          </div>
        </header>

        ${state.banner ? `<div class="notice ${state.backendMode === "demo" ? "warning" : ""}">${escapeHtml(state.banner)}</div>` : ""}
        ${state.error ? `<div class="error-box">${escapeHtml(state.error)}</div>` : ""}
        ${state.success ? `<div class="success-box">${escapeHtml(state.success)}</div>` : ""}

        <section class="grid three">
          <article class="card">
            <div class="step">1</div>
            <h2>Lista atual</h2>
            <div class="field">
              <label for="active-list-select">Escolha a lista</label>
              <select id="active-list-select" class="input">
                ${state.lists
                  .map(
                    (list) => `
                      <option value="${escapeHtml(list.id)}" ${list.id === activeList?.id ? "selected" : ""}>
                        ${escapeHtml(list.name)}${list.kind === "personal" ? " (pessoal)" : ""}
                      </option>
                    `
                  )
                  .join("")}
              </select>
            </div>

            ${
              activeList
                ? `
                  <div class="mini-card">
                    <strong>${escapeHtml(activeList.name)}</strong>
                    <span>${activeList.kind === "personal" ? "Lista pessoal" : "Lista compartilhada"}</span>
                    ${
                      inviteCode
                        ? `
                          <div class="invite-row">
                            <code>${escapeHtml(inviteCode)}</code>
                            <button id="copy-invite-button" class="btn btn-ghost btn-small" type="button">Copiar código</button>
                          </div>
                        `
                        : `<span class="muted">Sem código. Esta lista é só sua.</span>`
                    }
                  </div>
                `
                : `<div class="empty-box">Nenhuma lista disponível.</div>`
            }
          </article>

          <article class="card">
            <div class="step">2</div>
            <h2>Criar lista compartilhada</h2>
            <form id="create-shared-list-form" class="stack">
              <div class="field">
                <label for="shared-list-name">Nome da lista</label>
                <input id="shared-list-name" class="input" placeholder="Ex.: Filmes do casal" />
              </div>
              <button class="btn btn-primary" type="submit">Criar lista compartilhada</button>
            </form>
          </article>

          <article class="card">
            <div class="step">3</div>
            <h2>Entrar com código</h2>
            <form id="join-shared-list-form" class="stack">
              <div class="field">
                <label for="shared-list-code">Código</label>
                <input id="shared-list-code" class="input" placeholder="Ex.: A1B2C3D4" />
              </div>
              <button class="btn btn-primary" type="submit">Entrar na lista</button>
            </form>
          </article>
        </section>

        <section class="card">
          <div class="section-header">
            <div>
              <h2>Filmes da lista</h2>
              <p>Clique em um filme para marcar assistido, dar nota, editar ou remover.</p>
            </div>

            <div class="toolbar">
              <label class="field inline-field">
                <span>Filtrar</span>
                <select id="filter-select" class="input input-compact">
                  <option value="all" ${state.filterMode === "all" ? "selected" : ""}>Todos</option>
                  <option value="pending" ${state.filterMode === "pending" ? "selected" : ""}>Não assistidos</option>
                  <option value="watched" ${state.filterMode === "watched" ? "selected" : ""}>Assistidos</option>
                  <option value="rating" ${state.filterMode === "rating" ? "selected" : ""}>Nota</option>
                  <option value="platform" ${state.filterMode === "platform" ? "selected" : ""}>Plataformas</option>
                </select>
              </label>

              <label id="rating-order-field" class="field inline-field ${state.filterMode === "rating" ? "" : "hidden"}">
                <span>Ordem</span>
                <select id="rating-order-select" class="input input-compact">
                  <option value="desc" ${state.ratingOrder === "desc" ? "selected" : ""}>Maior para menor</option>
                  <option value="asc" ${state.ratingOrder === "asc" ? "selected" : ""}>Menor para maior</option>
                </select>
              </label>
            </div>
          </div>

          <div id="movie-grid" class="movie-grid"></div>
        </section>
      </div>
    </main>

    ${renderMovieModal()}
  `;

  renderMovieGrid();

  const addButton = document.querySelector("#add-title-button");
  const logoutButton = document.querySelector("#logout-button");
  const createForm = document.querySelector("#create-shared-list-form");
  const joinForm = document.querySelector("#join-shared-list-form");
  const activeSelect = document.querySelector("#active-list-select");
  const copyInviteButton = document.querySelector("#copy-invite-button");
  const filterSelect = document.querySelector("#filter-select");
  const ratingOrderSelect = document.querySelector("#rating-order-select");

  addButton.addEventListener("click", () => {
    navigate(`/lista/adicionar?list=${encodeURIComponent(state.activeListId)}`);
  });

  logoutButton.addEventListener("click", async () => {
    await state.adapter.signOut();
    await refreshSession();
    navigate("/");
  });

  activeSelect.addEventListener("change", async (event) => {
    state.activeListId = event.target.value;
    localStorage.setItem("listfli8x.activeListId", state.activeListId);
    navigate(`/lista?list=${encodeURIComponent(state.activeListId)}`);
  });

  if (copyInviteButton && inviteCode) {
    copyInviteButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(inviteCode);
      state.success = "Código copiado.";
      renderDashboard();
    });
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const name = document.querySelector("#shared-list-name").value;
      const list = await state.adapter.createSharedList(name);
      state.activeListId = list.id;
      state.success = "Lista compartilhada criada.";
      navigate(`/lista?list=${encodeURIComponent(list.id)}&success=${encodeURIComponent(state.success)}`);
    } catch (error) {
      state.error = getErrorMessage(error, "Não foi possível criar a lista.");
      renderDashboard();
    }
  });

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const code = document.querySelector("#shared-list-code").value;
      const list = await state.adapter.joinSharedList(code);
      state.activeListId = list.id;
      state.success = "Você entrou na lista compartilhada.";
      navigate(`/lista?list=${encodeURIComponent(list.id)}&success=${encodeURIComponent(state.success)}`);
    } catch (error) {
      state.error = getErrorMessage(error, "Não foi possível entrar na lista.");
      renderDashboard();
    }
  });

  filterSelect.addEventListener("change", (event) => {
    state.filterMode = event.target.value;
    renderDashboard();
  });

  if (ratingOrderSelect) {
    ratingOrderSelect.addEventListener("change", (event) => {
      state.ratingOrder = event.target.value;
      renderDashboard();
    });
  }

  bindMovieCardEvents();
  bindModalEvents();
}

function getVisibleMovies() {
  return sortMoviesForView(state.movies, state.filterMode, state.ratingOrder);
}

function renderMovieGrid() {
  const grid = document.querySelector("#movie-grid");
  if (!grid) {
    return;
  }

  const visibleMovies = getVisibleMovies();
  grid.innerHTML = renderMovieGridContent(visibleMovies);
  bindMovieCardEvents();
}

function renderMovieGridContent(movies) {
  if (!movies.length) {
    return `<div class="empty-box grid-full">Nenhum filme encontrado para esse filtro.</div>`;
  }

  if (state.filterMode !== "platform") {
    return movies.map((movie) => renderMovieCard(movie)).join("");
  }

  let lastGroup = "";
  const parts = [];

  for (const movie of movies) {
    const groupKey = normalizePlatformGroup(movie);
    if (groupKey !== lastGroup) {
      lastGroup = groupKey;
      parts.push(`
        <div class="movie-grid-divider grid-full">
          <span>Plataformas iguais</span>
          <strong>${escapeHtml(getPlatformGroupLabel(movie))}</strong>
        </div>
      `);
    }

    parts.push(renderMovieCard(movie));
  }

  return parts.join("");
}

function bindMovieCardEvents() {
  document.querySelectorAll("[data-movie-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.modalMovieId = card.dataset.movieCard;
      renderDashboard();
    });
  });
}

function renderMovieCard(movie) {
  const platforms = splitCsv(movie.platform);
  const genres = splitCsv(movie.genre);
  const ratingBadge = movie.rating !== null && movie.rating !== undefined
    ? `<span class="poster-rating-badge" aria-label="Nota ${escapeHtml(String(movie.rating))}">${escapeHtml(String(movie.rating))}</span>`
    : "";
  const watchedBadge = movie.watched
    ? `<span class="poster-watched-badge">Assistido</span>`
    : "";

  return `
    <article class="movie-card" data-movie-card="${escapeHtml(movie.id)}">
      <div class="movie-card-poster">
        ${ratingBadge}
        ${watchedBadge}
        ${
          movie.poster_url
            ? `<img src="${escapeHtml(movie.poster_url)}" alt="${escapeHtml(movie.title)}" />`
            : `<div class="poster placeholder">Sem capa</div>`
        }
      </div>

      <div class="movie-card-body">
        <h3>${escapeHtml(movie.title)}</h3>
        <p class="muted">Adicionado por ${escapeHtml(movie.added_by_name)}</p>

        <div class="chip-row">
          <span class="chip ${movie.watched ? "chip-success" : "chip-muted"}">
            ${movie.watched ? "Assistido" : "Não assistido"}
          </span>
          ${
            movie.rating !== null && movie.rating !== undefined
              ? `<span class="chip chip-rating">Nota ${escapeHtml(String(movie.rating))}</span>`
              : `<span class="chip chip-muted">Sem nota</span>`
          }
        </div>

        ${genres.length ? `<div class="chip-row">${genres.map((genre) => `<span class="chip chip-genre">${escapeHtml(genre)}</span>`).join("")}</div>` : ""}
        ${platforms.length ? `<div class="chip-row">${platforms.map((platform) => `<span class="chip chip-platform">${escapeHtml(platform)}</span>`).join("")}</div>` : ""}
      </div>
    </article>
  `;
}

function renderMovieModal() {
  if (!state.modalMovieId) {
    return "";
  }

  const movie = state.movies.find((item) => item.id === state.modalMovieId);
  if (!movie) {
    return "";
  }

  const genres = splitCsv(movie.genre);
  const platforms = splitCsv(movie.platform);
  const selectedRating = movie.rating ?? "";

  return `
    <div id="movie-modal" class="modal-backdrop">
      <section class="modal-card">
        <button id="close-modal-button" class="modal-close" type="button" aria-label="Fechar">×</button>

        <div class="modal-grid">
          <div>
            ${
              movie.poster_url
                ? `<img class="modal-poster" src="${escapeHtml(movie.poster_url)}" alt="${escapeHtml(movie.title)}" />`
                : `<div class="poster placeholder">Sem capa</div>`
            }
          </div>

          <div class="stack">
            <h2>${escapeHtml(movie.title)}</h2>
            <p class="muted">Adicionado por ${escapeHtml(movie.added_by_name)}</p>
            <p>${escapeHtml(movie.synopsis || "Sem sinopse.")}</p>

            ${genres.length ? `<div class="chip-row">${genres.map((genre) => `<span class="chip chip-genre">${escapeHtml(genre)}</span>`).join("")}</div>` : ""}
            ${platforms.length ? `<div class="chip-row">${platforms.map((platform) => `<span class="chip chip-platform">${escapeHtml(platform)}</span>`).join("")}</div>` : ""}

            <form id="movie-status-form" class="stack">
              <label class="checkbox-row">
                <input id="movie-watched" type="checkbox" ${movie.watched ? "checked" : ""} />
                <span>Já assisti</span>
              </label>

              <div class="field">
                <label>Nota</label>
                <input id="movie-rating" type="hidden" value="${selectedRating}" />
                <div id="rating-bubbles" class="rating-bubbles">
                  ${Array.from({ length: 10 }, (_, index) => {
                    const value = index + 1;
                    return `
                      <button
                        class="rating-bubble ${value === movie.rating ? "rating-bubble-active" : ""}"
                        type="button"
                        data-rating-value="${value}"
                        aria-pressed="${value === movie.rating ? "true" : "false"}"
                      >
                        ${value}
                      </button>
                    `;
                  }).join("")}
                </div>
              </div>

              <div class="row">
                <button class="btn btn-primary" type="submit">Salvar status</button>
                <button id="toggle-edit-button" class="btn btn-ghost" type="button">Editar detalhes</button>
                <button id="remove-movie-button" class="btn btn-danger" type="button">Remover</button>
              </div>
            </form>

            <form id="movie-edit-form" class="stack hidden">
              <div class="field">
                <label for="edit-platform">Plataformas</label>
                <input id="edit-platform" class="input" value="${escapeHtml(movie.platform || "")}" />
              </div>
              <div class="field">
                <label for="edit-genre">Gêneros</label>
                <input id="edit-genre" class="input" value="${escapeHtml(movie.genre || "")}" />
              </div>
              <div class="field">
                <label for="edit-runtime">Duração (min)</label>
                <input id="edit-runtime" class="input" type="number" min="1" value="${movie.runtime ?? ""}" />
              </div>
              <div class="field">
                <label for="edit-synopsis">Sinopse</label>
                <textarea id="edit-synopsis" class="textarea">${escapeHtml(movie.synopsis || "")}</textarea>
              </div>
              <div class="field">
                <label for="edit-poster">URL da capa</label>
                <input id="edit-poster" class="input" value="${escapeHtml(movie.poster_url || "")}" />
              </div>
              <button class="btn btn-primary" type="submit">Salvar edição</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  `;
}

function bindModalEvents() {
  const modal = document.querySelector("#movie-modal");
  if (!modal) {
    return;
  }

  const closeModal = () => {
    state.modalMovieId = null;
    renderDashboard();
  };

  document.querySelector("#close-modal-button").addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.querySelectorAll("[data-rating-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const hiddenInput = document.querySelector("#movie-rating");
      hiddenInput.value = button.dataset.ratingValue;
      document.querySelectorAll("[data-rating-value]").forEach((item) => {
        item.classList.toggle("rating-bubble-active", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
    });
  });

  document.querySelector("#movie-status-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const movieId = state.modalMovieId;

    try {
      const ratingValue = document.querySelector("#movie-rating").value;
      await state.adapter.updateMovie(movieId, {
        watched: document.querySelector("#movie-watched").checked,
        rating: ratingValue === "" ? null : Number(ratingValue)
      });
      await prepareDashboard();
      state.modalMovieId = null;
      state.success = "Status salvo com sucesso.";
      renderDashboard();
    } catch (error) {
      state.error = getErrorMessage(error, "Não foi possível salvar o status.");
      renderDashboard();
    }
  });

  document.querySelector("#toggle-edit-button").addEventListener("click", () => {
    document.querySelector("#movie-edit-form").classList.toggle("hidden");
  });

  document.querySelector("#movie-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const movieId = state.modalMovieId;

    try {
      await state.adapter.updateMovie(movieId, {
        platform: document.querySelector("#edit-platform").value.trim() || null,
        genre: document.querySelector("#edit-genre").value.trim() || null,
        runtime: document.querySelector("#edit-runtime").value ? Number(document.querySelector("#edit-runtime").value) : null,
        synopsis: document.querySelector("#edit-synopsis").value.trim() || null,
        poster_url: document.querySelector("#edit-poster").value.trim() || null
      });
      await prepareDashboard();
      state.modalMovieId = null;
      state.success = "Detalhes atualizados.";
      renderDashboard();
    } catch (error) {
      state.error = getErrorMessage(error, "Não foi possível atualizar o filme.");
      renderDashboard();
    }
  });

  document.querySelector("#remove-movie-button").addEventListener("click", async () => {
    const confirmed = window.confirm("Tem certeza de que deseja excluir este filme da lista? Essa ação não poderá ser desfeita agora.");
    if (!confirmed) {
      return;
    }

    try {
      await state.adapter.removeMovie(state.modalMovieId);
      await prepareDashboard();
      state.modalMovieId = null;
      state.success = "Filme removido.";
      renderDashboard();
    } catch (error) {
      state.error = getErrorMessage(error, "Não foi possível remover o filme.");
      renderDashboard();
    }
  });
}

function renderAddMoviePage() {
  const posters = state.movies.map((movie) => movie.poster_url).filter(Boolean);
  const posterMarkup = posters.length
    ? `<img id="rotating-poster" src="${escapeHtml(posters[0])}" alt="Capas da sua lista" />`
    : `<div class="poster placeholder">As capas dos filmes adicionados vão aparecer aqui.</div>`;

  app.innerHTML = `
    <main class="page-shell">
      <div class="container center-card">
        <section class="card center-panel">
          <span class="badge">Novo filme</span>

          <div class="hero-poster">
            ${posterMarkup}
          </div>

          <h1>Título</h1>

          <form id="search-movie-form" class="field-grid max-narrow">
            <div class="field">
              <label for="movie-title">Título</label>
              <input id="movie-title" class="input" placeholder="Ex.: Pixels" required />
            </div>

            <div id="add-page-message"></div>

            <div class="row">
              <button id="back-dashboard-button" class="btn btn-ghost" type="button">Voltar para a lista</button>
              <button class="btn btn-green" type="submit">Continuar</button>
            </div>
          </form>
        </section>
      </div>
    </main>
  `;

  if (posters.length > 1) {
    let index = 0;
    state.posterTimer = window.setInterval(() => {
      index = (index + 1) % posters.length;
      const image = document.querySelector("#rotating-poster");
      if (image) {
        image.src = posters[index];
      }
    }, 2200);
  }

  document.querySelector("#back-dashboard-button").addEventListener("click", () => {
    navigate(`/lista?list=${encodeURIComponent(state.activeListId)}`);
  });

  document.querySelector("#search-movie-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = document.querySelector("#movie-title").value.trim();
    if (!title) {
      document.querySelector("#add-page-message").innerHTML = `<div class="error-box">Digite o título.</div>`;
      return;
    }

    navigate(
      `/lista/adicionar/confirmar?list=${encodeURIComponent(state.activeListId)}&title=${encodeURIComponent(title)}`
    );
  });
}

async function renderConfirmMoviePage() {
  const params = new URLSearchParams(location.search);
  const listId = params.get("list") || state.activeListId;
  const title = params.get("title") || "";

  if (!title) {
    navigate(`/lista/adicionar?list=${encodeURIComponent(listId)}`, null, true);
    return;
  }

  app.innerHTML = `
    <main class="page-shell">
      <div class="container center-card">
        <section class="card center-panel">
          <span class="badge">Confirmar filme</span>
          <div class="notice">Buscando dados do filme...</div>
        </section>
      </div>
    </main>
  `;

  try {
    const response = await fetch(`/api/tmdb/search?title=${encodeURIComponent(title)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Não foi possível localizar o filme.");
    }

    const platforms = splitCsv(payload.platform);
    const genres = splitCsv(payload.genre);

    app.innerHTML = `
      <main class="page-shell">
        <div class="container center-card">
          <section class="card center-panel">
            <span class="badge">Confirmar filme</span>

            <div class="hero-poster">
              ${
                payload.poster_url
                  ? `<img src="${escapeHtml(payload.poster_url)}" alt="${escapeHtml(payload.title)}" />`
                  : `<div class="poster placeholder">Sem capa</div>`
              }
            </div>

            <h1>${escapeHtml(payload.title)}</h1>
            <p>${escapeHtml(payload.synopsis || "Sem sinopse.")}</p>

            <div class="details-grid">
              <div class="mini-card">
                <strong>Duração</strong>
                <span>${payload.runtime ? `${escapeHtml(String(payload.runtime))} min` : "Não informada"}</span>
              </div>
              <div class="mini-card">
                <strong>Gêneros</strong>
                <div class="chip-row">
                  ${genres.length ? genres.map((genre) => `<span class="chip">${escapeHtml(genre)}</span>`).join("") : `<span class="chip chip-muted">Não informado</span>`}
                </div>
              </div>
              <div class="mini-card">
                <strong>Plataformas</strong>
                <div class="chip-row">
                  ${platforms.length ? platforms.map((platform) => `<span class="chip chip-platform">${escapeHtml(platform)}</span>`).join("") : `<span class="chip chip-muted">Não informado</span>`}
                </div>
              </div>
            </div>

            <div id="confirm-page-message"></div>

            <div class="row wrap-center">
              <button id="confirm-add-button" class="btn btn-green" type="button">Adicionar à lista</button>
              <button id="retry-search-button" class="btn btn-secondary" type="button">Não é esse título</button>
              <button id="back-list-button" class="btn btn-ghost" type="button">Voltar para a lista</button>
            </div>
          </section>
        </div>
      </main>
    `;

    document.querySelector("#back-list-button").addEventListener("click", () => {
      navigate(`/lista?list=${encodeURIComponent(listId)}`);
    });

    document.querySelector("#retry-search-button").addEventListener("click", () => {
      navigate(`/lista/adicionar?list=${encodeURIComponent(listId)}`);
    });

    document.querySelector("#confirm-add-button").addEventListener("click", async () => {
      try {
        await state.adapter.addMovie(listId, {
          title: payload.title,
          platform: payload.platform,
          genre: payload.genre,
          synopsis: payload.synopsis,
          runtime: payload.runtime,
          poster_url: payload.poster_url,
          tmdb_id: payload.tmdb_id,
          release_date: payload.release_date,
          watched: false,
          rating: null,
          added_by_name: getDisplayNameFromSession(state.session)
        });
        navigate(`/lista?list=${encodeURIComponent(listId)}&success=${encodeURIComponent("Filme adicionado com sucesso.")}`);
      } catch (error) {
        document.querySelector("#confirm-page-message").innerHTML = `<div class="error-box">${escapeHtml(getErrorMessage(error, "Não foi possível adicionar o filme."))}</div>`;
      }
    });
  } catch (error) {
    app.innerHTML = `
      <main class="page-shell">
        <div class="container center-card">
          <section class="card center-panel">
            <span class="badge">Confirmar filme</span>
            <div class="error-box">${escapeHtml(getErrorMessage(error, "Não foi possível localizar o filme."))}</div>
            <div class="row wrap-center">
              <button id="retry-search-button" class="btn btn-secondary" type="button">Tentar outro título</button>
              <button id="back-list-button" class="btn btn-ghost" type="button">Voltar para a lista</button>
            </div>
          </section>
        </div>
      </main>
    `;

    document.querySelector("#retry-search-button").addEventListener("click", () => {
      navigate(`/lista/adicionar?list=${encodeURIComponent(listId)}`);
    });

    document.querySelector("#back-list-button").addEventListener("click", () => {
      navigate(`/lista?list=${encodeURIComponent(listId)}`);
    });
  }
}

function navigate(url, _stateData = null, replace = false) {
  if (replace) {
    history.replaceState({}, "", url);
  } else {
    history.pushState({}, "", url);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
  renderRoute().catch(showFatalError);
}

function clearPosterTimer() {
  if (state.posterTimer) {
    window.clearInterval(state.posterTimer);
    state.posterTimer = null;
  }
}

function getDisplayNameFromSession(session) {
  return (
    session?.user?.displayName ||
    session?.user?.user_metadata?.display_name ||
    session?.user?.email?.split("@")[0] ||
    "Usuário"
  );
}

function getErrorMessage(error, fallback) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return error.message;
  }
  return fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createDemoAdapter() {
  const readDb = () => {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const empty = createEmptyDemoDb();
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(empty));
      return empty;
    }
    return JSON.parse(raw);
  };

  const writeDb = (db) => {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  };

  return {
    mode: "demo",
    async getSession() {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) return null;
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          user_metadata: {
            display_name: user.displayName
          }
        }
      };
    },

    async signUp({ displayName, email, password }) {
      const db = readDb();
      createDemoUser(db, { displayName, email, password });
      writeDb(db);
    },

    async signIn({ email, password }) {
      const db = readDb();
      signInDemoUser(db, { email, password });
      writeDb(db);
    },

    async signOut() {
      const db = readDb();
      signOutDemoUser(db);
      writeDb(db);
    },

    async ensureProfile(displayName) {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) {
        throw new Error("Sessão inválida.");
      }
      const profile = ensureDemoProfile(db, user.id, displayName || user.displayName);
      user.displayName = profile.display_name;
      writeDb(db);
      return profile;
    },

    async ensurePersonalList() {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) throw new Error("Sessão inválida.");
      const list = ensureDemoPersonalList(db, user.id);
      writeDb(db);
      return list;
    },

    async listLists() {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) throw new Error("Sessão inválida.");
      return listDemoLists(db, user.id);
    },

    async createSharedList(name) {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) throw new Error("Sessão inválida.");
      const list = createDemoSharedList(db, user.id, name);
      writeDb(db);
      return list;
    },

    async joinSharedList(code) {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) throw new Error("Sessão inválida.");
      const list = joinDemoSharedList(db, user.id, code);
      writeDb(db);
      return list;
    },

    async listMovies(listId) {
      const db = readDb();
      return listDemoMovies(db, listId);
    },

    async addMovie(listId, movie) {
      const db = readDb();
      const user = getDemoCurrentUser(db);
      if (!user) throw new Error("Sessão inválida.");
      const created = addDemoMovie(db, {
        list_id: listId,
        ...movie,
        added_by: user.id
      });
      writeDb(db);
      return created;
    },

    async updateMovie(movieId, patch) {
      const db = readDb();
      const movie = updateDemoMovie(db, movieId, patch);
      writeDb(db);
      return movie;
    },

    async removeMovie(movieId) {
      const db = readDb();
      removeDemoMovie(db, movieId);
      writeDb(db);
    }
  };
}


function createSupabaseAdapter(client) {
  async function getSessionUser() {
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }

    const session = data.session;
    if (!session?.user) {
      return null;
    }

    return {
      user: session.user
    };
  }

  function getCloudDisplayName(session, fallback = "Usuário") {
    return (
      session?.user?.user_metadata?.display_name ||
      session?.user?.user_metadata?.full_name ||
      session?.user?.email?.split("@")[0] ||
      fallback
    );
  }

  async function ensureCloudProfile(session, preferredName) {
    if (!session?.user) {
      throw new Error("Sessão inválida.");
    }

    const displayName = String(preferredName || getCloudDisplayName(session)).trim() || "Usuário";

    const { data: existing, error: selectError } = await client
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    if (!existing) {
      const { data: inserted, error: insertError } = await client
        .from("profiles")
        .insert({
          id: session.user.id,
          display_name: displayName
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      return inserted;
    }

    if (displayName && existing.display_name !== displayName) {
      const { data: updated, error: updateError } = await client
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", session.user.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      return updated;
    }

    return existing;
  }

  async function ensureMembership(listId, userId) {
    const { data: membership, error: membershipError } = await client
      .from("list_members")
      .select("list_id, user_id")
      .eq("list_id", listId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      const { error: insertError } = await client.from("list_members").insert({
        list_id: listId,
        user_id: userId
      });

      if (insertError) {
        throw insertError;
      }
    }
  }

  async function ensureCloudPersonalList(session) {
    if (!session?.user) {
      throw new Error("Sessão inválida.");
    }

    const { data: existing, error: selectError } = await client
      .from("lists")
      .select("*")
      .eq("owner_id", session.user.id)
      .eq("kind", "personal")
      .maybeSingle();

    if (selectError) {
      throw selectError;
    }

    let personalList = existing;

    if (!personalList) {
      const { data: inserted, error: insertError } = await client
        .from("lists")
        .insert({
          name: "Minha lista",
          kind: "personal",
          owner_id: session.user.id,
          invite_code: null
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      personalList = inserted;
    }

    await ensureMembership(personalList.id, session.user.id);

    return personalList;
  }

  async function listCloudLists(session) {
    const personalList = await ensureCloudPersonalList(session);

    const { data: memberships, error: membershipError } = await client
      .from("list_members")
      .select("list_id")
      .eq("user_id", session.user.id);

    if (membershipError) {
      throw membershipError;
    }

    const ids = [...new Set([personalList.id, ...(memberships ?? []).map((item) => item.list_id).filter(Boolean)])];

    const { data: lists, error: listsError } = await client
      .from("lists")
      .select("*")
      .in("id", ids);

    if (listsError) {
      throw listsError;
    }

    return (lists ?? [personalList]).sort((left, right) => {
      if (left.kind === right.kind) {
        return left.name.localeCompare(right.name);
      }
      return left.kind === "personal" ? -1 : 1;
    });
  }

  return {
    mode: "supabase",

    async getSession() {
      return getSessionUser();
    },

    async signUp({ displayName, email, password }) {
      const { error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName
          }
        }
      });

      if (error) {
        throw error;
      }
    },

    async signIn({ email, password }) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) {
        throw error;
      }
    },

    async signInWithGoogle() {
      const redirectTo = `${window.location.origin}/`;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account"
          }
        }
      });

      if (error) {
        throw error;
      }
    },

    async ensureProfile(displayName) {
      const session = await getSessionUser();
      return ensureCloudProfile(session, displayName || getCloudDisplayName(session));
    },

    async ensurePersonalList() {
      const session = await getSessionUser();
      await ensureCloudProfile(session, getCloudDisplayName(session));
      return ensureCloudPersonalList(session);
    },

    async listLists() {
      const session = await getSessionUser();
      if (!session?.user) {
        throw new Error("Sessão inválida.");
      }

      await ensureCloudProfile(session, getCloudDisplayName(session));
      return listCloudLists(session);
    },

    async createSharedList(name) {
      const session = await getSessionUser();
      if (!session?.user) {
        throw new Error("Sessão inválida.");
      }

      await ensureCloudProfile(session, getCloudDisplayName(session));
      await ensureCloudPersonalList(session);

      const trimmed = String(name ?? "").trim();
      if (!trimmed) {
        throw new Error("Digite um nome para a lista compartilhada.");
      }

      const { data: inserted, error: insertError } = await client
        .from("lists")
        .insert({
          name: trimmed,
          kind: "shared",
          owner_id: session.user.id,
          invite_code: Math.random().toString(36).slice(2, 10).toUpperCase()
        })
        .select("*")
        .single();

      if (insertError) {
        throw insertError;
      }

      await ensureMembership(inserted.id, session.user.id);

      return inserted;
    },

    async joinSharedList(code) {
      const session = await getSessionUser();
      if (!session?.user) {
        throw new Error("Sessão inválida.");
      }

      await ensureCloudProfile(session, getCloudDisplayName(session));
      await ensureCloudPersonalList(session);

      const normalized = String(code ?? "").trim().toUpperCase();
      if (!normalized) {
        throw new Error("Digite o código do convite.");
      }

      const { data: list, error: listError } = await client
        .from("lists")
        .select("*")
        .eq("invite_code", normalized)
        .eq("kind", "shared")
        .maybeSingle();

      if (listError) {
        throw listError;
      }

      if (!list) {
        throw new Error("Código não encontrado.");
      }

      await ensureMembership(list.id, session.user.id);

      return list;
    },

    async listMovies(listId) {
      const { data, error } = await client
        .from("movies")
        .select("*")
        .eq("list_id", listId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },

    async addMovie(listId, movie) {
      const session = await getSessionUser();
      if (!session?.user) {
        throw new Error("Sessão inválida.");
      }

      const { data, error } = await client
        .from("movies")
        .insert({
          list_id: listId,
          title: movie.title,
          platform: movie.platform,
          genre: movie.genre,
          synopsis: movie.synopsis,
          runtime: movie.runtime,
          poster_url: movie.poster_url,
          watched: false,
          rating: null,
          added_by: session.user.id,
          added_by_name: movie.added_by_name,
          tmdb_id: movie.tmdb_id,
          release_date: movie.release_date || null
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async updateMovie(movieId, patch) {
      const { data, error } = await client
        .from("movies")
        .update(patch)
        .eq("id", movieId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },

    async removeMovie(movieId) {
      const { error } = await client.from("movies").delete().eq("id", movieId);
      if (error) {
        throw error;
      }
    }
  };
}

