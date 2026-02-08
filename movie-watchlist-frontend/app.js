// Movie Watchlist — Solo Project 2 (Client/Server)
// Frontend uses fetch() to talk to PHP backend (JSON persistence)

const API_BASE = "http://localhost/movie-watchlist-api/api.php"; 
// Later (if you host PHP publicly), change to: https://your-php-host.com/api.php

let movies = [];          // current page only
let editingId = null;

let currentPage = 1;
let totalPages = 1;

// ---------- DOM ----------
const viewList = document.getElementById("viewList");
const viewForm = document.getElementById("viewForm");
const viewStats = document.getElementById("viewStats");

const btnViewList = document.getElementById("btnViewList");
const btnViewForm = document.getElementById("btnViewForm");
const btnViewStats = document.getElementById("btnViewStats");

const tbody = document.getElementById("moviesTbody");
const emptyMsg = document.getElementById("emptyMsg");

const searchInput = document.getElementById("searchInput");
const filterWatched = document.getElementById("filterWatched");

const formTitle = document.getElementById("formTitle");
const movieForm = document.getElementById("movieForm");
const btnSubmit = document.getElementById("btnSubmit");
const btnCancelEdit = document.getElementById("btnCancelEdit");
const btnNew = document.getElementById("btnNew");
const formError = document.getElementById("formError");

const inputTitle = document.getElementById("title");
const inputGenre = document.getElementById("genre");
const inputYear = document.getElementById("year");
const inputRating = document.getElementById("rating");
const inputWatched = document.getElementById("watched");

const statTotal = document.getElementById("statTotal");
const statWatched = document.getElementById("statWatched");
const statAvgRating = document.getElementById("statAvgRating");
const statTopGenre = document.getElementById("statTopGenre");
const genreBreakdown = document.getElementById("genreBreakdown");

// Paging DOM (added in index.html)
const btnPrevPage = document.getElementById("btnPrevPage");
const btnNextPage = document.getElementById("btnNextPage");
const pageNum = document.getElementById("pageNum");
const pageTotal = document.getElementById("pageTotal");

// ---------- Helpers ----------
function setActiveNav(activeBtn) {
  [btnViewList, btnViewForm, btnViewStats].forEach(b => b.classList.remove("active"));
  activeBtn.classList.add("active");
}
function showView(which) {
  viewList.classList.add("hidden");
  viewForm.classList.add("hidden");
  viewStats.classList.add("hidden");
  which.classList.remove("hidden");
}
function normalize(str) {
  return String(str || "").trim().toLowerCase();
}
function resetFormToAddMode() {
  editingId = null;
  formTitle.textContent = "Add Movie";
  btnSubmit.textContent = "Add Movie";
  btnCancelEdit.hidden = true;
  formError.hidden = true;
  movieForm.reset();
  inputWatched.checked = false;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- API ----------
async function apiJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function loadPage(page) {
  const data = await apiJson(`/movies?page=${page}`);
  movies = data.movies;
  currentPage = data.page;
  totalPages = data.totalPages;

  pageNum.textContent = String(currentPage);
  pageTotal.textContent = String(totalPages);

  btnPrevPage.disabled = currentPage <= 1;
  btnNextPage.disabled = currentPage >= totalPages;

  renderList();
}

async function loadStats() {
  const s = await apiJson(`/stats`);

  statTotal.textContent = String(s.total);
  statWatched.textContent = String(s.watched);

  statAvgRating.textContent = (typeof s.avgRating === "number")
    ? s.avgRating.toFixed(1)
    : "—";

  statTopGenre.textContent = s.topGenre ? String(s.topGenre) : "—";

  const entries = Object.entries(s.genreCounts || {}).sort((a, b) => b[1] - a[1]);
  genreBreakdown.innerHTML = entries
    .map(([g, c]) => `<div>${escapeHtml(g)}: <strong>${c}</strong></div>`)
    .join("");
}

// ---------- Render List (filters only apply to current page) ----------
function getFilteredMovies() {
  const q = normalize(searchInput.value);
  const watchedFilter = filterWatched.value;

  return movies.filter(m => {
    const matchesText =
      !q ||
      normalize(m.title).includes(q) ||
      normalize(m.genre).includes(q) ||
      String(m.year).includes(q);

    const matchesWatched =
      watchedFilter === "all" ||
      (watchedFilter === "watched" && m.watched) ||
      (watchedFilter === "unwatched" && !m.watched);

    return matchesText && matchesWatched;
  });
}

function renderList() {
  const list = getFilteredMovies();
  tbody.innerHTML = "";

  if (list.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  for (const m of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.title)}</td>
      <td>${escapeHtml(m.genre)}</td>
      <td>${m.year}</td>
      <td>${m.rating ?? "—"}</td>
      <td>${m.watched ? "✅" : "—"}</td>
      <td class="row gap">
        <button class="btn secondary" data-action="edit" data-id="${m.id}">Edit</button>
        <button class="btn danger" data-action="delete" data-id="${m.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ---------- CRUD ----------
movieForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    title: inputTitle.value,
    genre: inputGenre.value,
    year: inputYear.value,
    rating: inputRating.value,
    watched: inputWatched.checked
  };

  formError.hidden = true;

  try {
    if (editingId) {
      await apiJson(`/movies/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      await apiJson(`/movies`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      // after create, usually go back to page 1 so user sees the new movie
      currentPage = 1;
    }

    resetFormToAddMode();
    setActiveNav(btnViewList);
    showView(viewList);

    await loadPage(currentPage);
    await loadStats();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit") {
    const m = movies.find(x => x.id === id);
    if (!m) return;

    editingId = id;
    formTitle.textContent = "Edit Movie";
    btnSubmit.textContent = "Update Movie";
    btnCancelEdit.hidden = false;
    formError.hidden = true;

    inputTitle.value = m.title;
    inputGenre.value = m.genre;
    inputYear.value = m.year;
    inputRating.value = m.rating ?? "";
    inputWatched.checked = !!m.watched;

    setActiveNav(btnViewForm);
    showView(viewForm);
  }

  if (action === "delete") {
    const m = movies.find(x => x.id === id);
    if (!m) return;

    const ok = confirm(`Delete "${m.title}"? This cannot be undone.`);
    if (!ok) return;

    try {
      await apiJson(`/movies/${id}`, { method: "DELETE" });

      // If delete makes current page empty, step back a page if possible
      await loadPage(currentPage);
      if (movies.length === 0 && currentPage > 1) {
        currentPage -= 1;
        await loadPage(currentPage);
      }

      await loadStats();

      if (editingId === id) resetFormToAddMode();
    } catch (err) {
      alert(err.message);
    }
  }
});

// ---------- Navigation ----------
btnViewList.addEventListener("click", async () => {
  setActiveNav(btnViewList);
  showView(viewList);
  await loadPage(currentPage);
});

btnViewForm.addEventListener("click", () => {
  setActiveNav(btnViewForm);
  showView(viewForm);
});

btnViewStats.addEventListener("click", async () => {
  setActiveNav(btnViewStats);
  showView(viewStats);
  await loadStats();
});

btnCancelEdit.addEventListener("click", () => resetFormToAddMode());
btnNew.addEventListener("click", () => resetFormToAddMode());

searchInput.addEventListener("input", renderList);
filterWatched.addEventListener("change", renderList);

// Paging
btnPrevPage.addEventListener("click", async () => {
  if (currentPage > 1) await loadPage(currentPage - 1);
});
btnNextPage.addEventListener("click", async () => {
  if (currentPage < totalPages) await loadPage(currentPage + 1);
});

// ---------- Init ----------
async function init() {
  resetFormToAddMode();
  setActiveNav(btnViewList);
  showView(viewList);

  try {
    await loadPage(1);
    await loadStats();
  } catch (err) {
    emptyMsg.hidden = false;
    emptyMsg.textContent = "Backend not reachable. Start Apache and open the PHP API URL to test.";
    console.error(err);
  }
}
init();
