<?php
// movie-watchlist-api/api.php
declare(strict_types=1);

// ---------- CORS + JSON ----------
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *"); // OK for class project
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
  http_response_code(204);
  exit;
}

const PAGE_SIZE = 10;
$dataFile = __DIR__ . "/data/movies.json";

// ---------- Helpers ----------
function respond($data, int $status = 200): void {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function errorOut(string $msg, int $status = 400): void {
  respond(["error" => $msg], $status);
}
function readJson(string $path): array {
  if (!file_exists($path)) return [];
  $raw = file_get_contents($path);
  $arr = json_decode($raw ?: "[]", true);
  return is_array($arr) ? $arr : [];
}
function writeJson(string $path, array $data): void {
  $tmp = $path . ".tmp";
  file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  rename($tmp, $path);
}
function getBody(): array {
  $raw = file_get_contents("php://input");
  $obj = json_decode($raw ?: "{}", true);
  return is_array($obj) ? $obj : [];
}
function normalizeStr($v): string {
  return trim((string)($v ?? ""));
}
function toBool($v): bool {
  return filter_var($v, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) ?? false;
}
function validateMovie(array $m, bool $requireAllFields = true): array {
  $title = normalizeStr($m["title"] ?? "");
  $genre = normalizeStr($m["genre"] ?? "");
  $year  = $m["year"] ?? null;
  $rating = $m["rating"] ?? null;

  $currentYear = (int)date("Y");

  if ($requireAllFields) {
    if ($title === "") return [false, "Title is required."];
    if ($genre === "") return [false, "Genre is required."];
    if (!is_numeric($year)) return [false, "Year must be a number."];
  }

  if ($title !== "" && mb_strlen($title) > 80) return [false, "Title is too long (max 80)."];
  if ($genre !== "" && mb_strlen($genre) > 40) return [false, "Genre is too long (max 40)."];

  if ($year !== null) {
    if (!is_numeric($year)) return [false, "Year must be a number."];
    $y = (int)$year;
    if ($y < 1888 || $y > $currentYear + 1) return [false, "Year must be between 1888 and " . ($currentYear + 1) . "."];
  }

  if ($rating !== null && $rating !== "") {
    if (!is_numeric($rating)) return [false, "Rating must be a number."];
    $r = (float)$rating;
    if ($r < 1 || $r > 10) return [false, "Rating must be between 1 and 10."];
  }

  return [true, ""];
}
function findIndexById(array $movies, string $id): int {
  foreach ($movies as $i => $m) {
    if (($m["id"] ?? "") === $id) return $i;
  }
  return -1;
}

// ---------- Routing ----------
$method = $_SERVER["REQUEST_METHOD"];
$uri = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH) ?? "";
// Expect: /movie-watchlist-api/api.php/... (PATH_INFO might not be set on some setups)
$pathInfo = $_SERVER["PATH_INFO"] ?? "";
$path = $pathInfo !== "" ? $pathInfo : ""; // "" or "/movies" or "/movies/{id}" or "/stats"

$movies = readJson($dataFile);

// GET /stats
if ($method === "GET" && $path === "/stats") {
  $total = count($movies);
  $watched = 0;
  $ratings = [];
  $genreCounts = [];

  foreach ($movies as $m) {
    if (!empty($m["watched"])) $watched++;
    if (isset($m["rating"]) && is_numeric($m["rating"])) $ratings[] = (float)$m["rating"];
    $g = normalizeStr($m["genre"] ?? "Unknown");
    if ($g === "") $g = "Unknown";
    $genreCounts[$g] = ($genreCounts[$g] ?? 0) + 1;
  }

  $avgRating = null;
  if (count($ratings) > 0) $avgRating = array_sum($ratings) / count($ratings);

  arsort($genreCounts);
  $topGenre = count($genreCounts) ? array_key_first($genreCounts) : null;

  respond([
    "total" => $total,
    "watched" => $watched,
    "avgRating" => $avgRating,
    "topGenre" => $topGenre,
    "genreCounts" => $genreCounts
  ]);
}

// GET /movies?page=1  (paged)
if ($method === "GET" && $path === "/movies") {
  $page = isset($_GET["page"]) ? (int)$_GET["page"] : 1;
  if ($page < 1) $page = 1;

  $total = count($movies);
  $totalPages = (int)ceil($total / PAGE_SIZE);
  if ($totalPages < 1) $totalPages = 1;
  if ($page > $totalPages) $page = $totalPages;

  $start = ($page - 1) * PAGE_SIZE;
  $slice = array_slice($movies, $start, PAGE_SIZE);

  respond([
    "movies" => $slice,
    "page" => $page,
    "pageSize" => PAGE_SIZE,
    "total" => $total,
    "totalPages" => $totalPages
  ]);
}

// POST /movies (create)
if ($method === "POST" && $path === "/movies") {
  $body = getBody();
  [$ok, $msg] = validateMovie($body, true);
  if (!$ok) errorOut($msg, 422);

  $id = "m_" . time() . "_" . bin2hex(random_bytes(3));

  $new = [
    "id" => $id,
    "title" => normalizeStr($body["title"] ?? ""),
    "genre" => normalizeStr($body["genre"] ?? ""),
    "year" => (int)$body["year"],
    "rating" => ($body["rating"] === "" || $body["rating"] === null) ? null : (float)$body["rating"],
    "watched" => toBool($body["watched"] ?? false),
  ];

  array_unshift($movies, $new);
  writeJson($dataFile, $movies);

  respond($new, 201);
}

// PUT /movies/{id} (update)
if ($method === "PUT" && preg_match("#^/movies/([^/]+)$#", $path, $m)) {
  $id = $m[1];
  $idx = findIndexById($movies, $id);
  if ($idx === -1) errorOut("Movie not found.", 404);

  $body = getBody();
  [$ok, $msg] = validateMovie($body, true);
  if (!$ok) errorOut($msg, 422);

  $movies[$idx] = [
    "id" => $id,
    "title" => normalizeStr($body["title"] ?? ""),
    "genre" => normalizeStr($body["genre"] ?? ""),
    "year" => (int)$body["year"],
    "rating" => ($body["rating"] === "" || $body["rating"] === null) ? null : (float)$body["rating"],
    "watched" => toBool($body["watched"] ?? false),
  ];

  writeJson($dataFile, $movies);
  respond($movies[$idx]);
}

// DELETE /movies/{id}
if ($method === "DELETE" && preg_match("#^/movies/([^/]+)$#", $path, $m)) {
  $id = $m[1];
  $idx = findIndexById($movies, $id);
  if ($idx === -1) errorOut("Movie not found.", 404);

  array_splice($movies, $idx, 1);
  writeJson($dataFile, $movies);

  respond(["ok" => true]);
}

errorOut("Route not found. Use /movies or /stats.", 404);
