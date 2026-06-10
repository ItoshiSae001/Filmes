import test from "node:test";
import assert from "node:assert/strict";
import {
  addMovie,
  buildMockMovie,
  createDemoUser,
  createEmptyDemoDb,
  createSharedList,
  ensurePersonalList,
  joinSharedList,
  listMovies,
  listUserLists,
  signInDemoUser,
  sortMoviesForView,
  getPlatformGroupLabel,
  updateMovie
} from "../shared/core.mjs";

test("cria lista pessoal automaticamente para novo usuário", () => {
  const db = createEmptyDemoDb();
  const user = createDemoUser(db, {
    email: "ana@example.com",
    password: "123456",
    displayName: "Ana"
  });

  const personalList = ensurePersonalList(db, user.id);
  const lists = listUserLists(db, user.id);

  assert.equal(personalList.kind, "personal");
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, "Minha lista");
});

test("cria lista compartilhada e outro usuário entra com código", () => {
  const db = createEmptyDemoDb();
  const owner = createDemoUser(db, {
    email: "owner@example.com",
    password: "123456",
    displayName: "Owner"
  });

  const shared = createSharedList(db, owner.id, "Filmes do casal");

  const second = createDemoUser(db, {
    email: "bia@example.com",
    password: "abcdef",
    displayName: "Bia"
  });

  const joined = joinSharedList(db, second.id, shared.invite_code);
  const lists = listUserLists(db, second.id);

  assert.equal(joined.id, shared.id);
  assert.ok(lists.some((item) => item.id === shared.id));
});

test("adiciona filme e atualiza status", () => {
  const db = createEmptyDemoDb();
  const user = createDemoUser(db, {
    email: "leo@example.com",
    password: "123456",
    displayName: "Leo"
  });

  const list = ensurePersonalList(db, user.id);
  const movie = addMovie(db, {
    list_id: list.id,
    title: "Pixels",
    platform: "Netflix",
    genre: "Comédia",
    synopsis: "Teste",
    runtime: 105,
    poster_url: "poster",
    watched: false,
    rating: null,
    added_by: user.id,
    added_by_name: "Leo",
    tmdb_id: 1,
    release_date: "2015-07-16"
  });

  updateMovie(db, movie.id, {
    watched: true,
    rating: 8
  });

  const movies = listMovies(db, list.id);
  assert.equal(movies.length, 1);
  assert.equal(movies[0].watched, true);
  assert.equal(movies[0].rating, 8);
});

test("gera filme mock consistente", () => {
  const movie = buildMockMovie("Pixels");
  assert.equal(movie.title, "Pixels");
  assert.ok(movie.poster_url.startsWith("data:image/svg+xml"));
});

test("login demo valida e-mail e senha", () => {
  const db = createEmptyDemoDb();
  createDemoUser(db, {
    email: "maria@example.com",
    password: "654321",
    displayName: "Maria"
  });

  const signed = signInDemoUser(db, {
    email: "maria@example.com",
    password: "654321"
  });

  assert.equal(signed.displayName, "Maria");
});


test("ordena filmes por nota do maior para o menor", () => {
  const movies = [
    { title: "A", rating: 7, watched: true, platform: "Netflix", created_at: "2024-01-01" },
    { title: "B", rating: null, watched: false, platform: "Prime Video", created_at: "2024-01-02" },
    { title: "C", rating: 9, watched: true, platform: "Netflix", created_at: "2024-01-03" }
  ];

  const ordered = sortMoviesForView(movies, "rating", "desc");
  assert.deepEqual(ordered.map((item) => item.title), ["C", "A", "B"]);
});

test("agrupa visualização por plataformas iguais", () => {
  const movies = [
    { title: "A", rating: null, watched: false, platform: "Netflix, Apple TV" },
    { title: "B", rating: null, watched: false, platform: "Prime Video" },
    { title: "C", rating: null, watched: false, platform: "Apple TV, Netflix" }
  ];

  const ordered = sortMoviesForView(movies, "platform", "desc");
  assert.equal(getPlatformGroupLabel(ordered[0]), "Apple TV • Netflix");
  assert.equal(getPlatformGroupLabel(ordered[1]), "Apple TV • Netflix");
  assert.equal(getPlatformGroupLabel(ordered[2]), "Prime Video");
});


test("lista compartilhada divide o mesmo filme entre dois usuários", () => {
  const db = createEmptyDemoDb();
  const owner = createDemoUser(db, {
    email: "casal1@example.com",
    password: "123456",
    displayName: "Nina"
  });
  const second = createDemoUser(db, {
    email: "casal2@example.com",
    password: "654321",
    displayName: "Kai"
  });

  const shared = createSharedList(db, owner.id, "Filmes juntos");
  joinSharedList(db, second.id, shared.invite_code);

  addMovie(db, {
    list_id: shared.id,
    title: "Avatar",
    platform: "Disney+",
    genre: "Aventura",
    synopsis: "Teste",
    runtime: 162,
    poster_url: "https://image.tmdb.org/t/p/w500/teste.jpg",
    watched: false,
    rating: null,
    added_by: owner.id,
    added_by_name: "Nina",
    tmdb_id: 2,
    release_date: "2009-12-18"
  });

  const ownerMovies = listMovies(db, shared.id);
  const secondLists = listUserLists(db, second.id);

  assert.equal(ownerMovies.length, 1);
  assert.equal(ownerMovies[0].poster_url, "https://image.tmdb.org/t/p/w500/teste.jpg");
  assert.ok(secondLists.some((item) => item.id === shared.id));
});

test("pôster permanece salvo ao atualizar status do filme", () => {
  const db = createEmptyDemoDb();
  const user = createDemoUser(db, {
    email: "poster@example.com",
    password: "123456",
    displayName: "Poster"
  });

  const list = ensurePersonalList(db, user.id);
  const movie = addMovie(db, {
    list_id: list.id,
    title: "Barbie",
    platform: "Max",
    genre: "Comédia",
    synopsis: "Teste",
    runtime: 114,
    poster_url: "https://image.tmdb.org/t/p/w500/barbie.jpg",
    watched: false,
    rating: null,
    added_by: user.id,
    added_by_name: "Poster",
    tmdb_id: 3,
    release_date: "2023-07-20"
  });

  const updated = updateMovie(db, movie.id, { watched: true, rating: 9 });

  assert.equal(updated.poster_url, "https://image.tmdb.org/t/p/w500/barbie.jpg");
});
