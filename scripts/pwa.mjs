// Captain PWA build steps (BUILD_SPEC §8), run after `next build`:
//   node scripts/pwa.mjs sw    writes public/sw.js (Workbox): precaches the captain screens' assets
//   node scripts/pwa.mjs size  reports captain-route JS (gzipped) and fails over the 200 KB budget
// The build directory follows NEXT_DIST_DIR (default .next).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { generateSW } from "workbox-build";

const dist = process.env.NEXT_DIST_DIR || ".next";
const BUDGET = 200 * 1024;

/** Files the captain screens load: the root layout plus every (captain) layout and page. */
function captainFiles() {
  const { pages } = JSON.parse(readFileSync(join(dist, "app-build-manifest.json"), "utf8"));
  const keys = Object.keys(pages).filter((k) => k === "/layout" || k.startsWith("/(captain)/captain/"));
  return [...new Set(keys.flatMap((k) => pages[k]))];
}

function staticMedia() {
  const dir = join(dist, "static", "media");
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".woff2"))
      .map((f) => `static/media/${f}`);
  } catch {
    return [];
  }
}

async function buildServiceWorker() {
  const files = [...captainFiles(), ...staticMedia()];
  const { count, size, warnings } = await generateSW({
    swDest: "public/sw.js",
    globDirectory: dist,
    // Route groups and dynamic segments, "(captain)" and "[id]", are glob syntax: escape them.
    globPatterns: files.map((f) => f.replace(/[()[\]]/g, "\\$&")),
    modifyURLPrefix: { "static/": "/_next/static/" },
    // Hashed file names: never re-download a cached copy.
    dontCacheBustURLsMatching: /^\/_next\/static\//,
    additionalManifestEntries: [
      { url: "/manifest.webmanifest", revision: String(Date.now()) },
      { url: "/icons/icon-192.png", revision: "1" },
      { url: "/icons/icon-512.png", revision: "1" },
      { url: "/brand/globe-ink.svg", revision: "1" },
      { url: "/brand/globe-shell.svg", revision: "1" },
    ],
    inlineWorkboxRuntime: true,
    sourcemap: false,
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        // The captain page (user-specific HTML): network first, the last good copy when offline.
        // One cached page serves every view (?trip=, ?view=): views are client-side.
        urlPattern: ({ request, url }) => request.mode === "navigate" && url.pathname.startsWith("/captain"),
        handler: "NetworkFirst",
        options: {
          cacheName: "captain-pages",
          networkTimeoutSeconds: 5,
          matchOptions: { ignoreSearch: true },
          expiration: { maxEntries: 10 },
        },
      },
      {
        // Chunks loaded on demand that weren't precached.
        urlPattern: ({ url }) => url.pathname.startsWith("/_next/static/"),
        handler: "CacheFirst",
        options: { cacheName: "next-static", expiration: { maxEntries: 200 } },
      },
    ],
  });
  warnings.forEach((w) => console.warn(w));
  console.log(`sw.js: ${count} files precached (${Math.round(size / 1024)} KB)`);
}

function reportSize() {
  const js = captainFiles().filter((f) => f.endsWith(".js"));
  const rows = js.map((f) => ({
    file: f,
    gz: gzipSync(readFileSync(join(dist, f))).length,
    raw: statSync(join(dist, f)).size,
  }));
  const total = rows.reduce((n, r) => n + r.gz, 0);
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log("### Captain routes: JavaScript (gzipped)\n");
  console.log("| File | Gzipped |\n|---|---|");
  rows
    .sort((a, b) => b.gz - a.gz)
    .forEach((r) => console.log(`| ${r.file.replace("static/chunks/", "")} | ${kb(r.gz)} |`));
  console.log(`| **Total** | **${kb(total)}** (budget ${kb(BUDGET)}) |`);
  if (total > BUDGET) {
    console.error(`Captain routes are over budget: ${kb(total)} > ${kb(BUDGET)}`);
    process.exit(1);
  }
}

const command = process.argv[2];
if (command === "sw") await buildServiceWorker();
else if (command === "size") reportSize();
else {
  console.error("usage: node scripts/pwa.mjs sw|size");
  process.exit(2);
}
