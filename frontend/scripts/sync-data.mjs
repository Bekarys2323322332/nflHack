/**
 * Copies the backend's JSON outputs into the frontend's public/ folder so the
 * dev server and the production build can serve them as static files.
 *
 *   npm run sync-data
 *
 * Source (relative to frontend/)          Destination (relative to frontend/)
 *   ../backend/outputs/insights/*.json  -> public/data/insights/
 *   ../backend/outputs/ml/*.json        -> public/data/ml/
 *   ../backend/outputs/ml/plays/*.json  -> public/data/ml/plays/
 *
 * Rules:
 *   - Only .json files are copied. .csv, .joblib and everything else is skipped.
 *   - Folders are not copied recursively: ml/plays has its own entry above.
 *   - Each file must parse as JSON before it is copied, so a half-written file
 *     or a git merge-conflict marker never reaches the browser.
 *   - Nothing is deleted. Files left in the destination that no longer exist in
 *     the source are listed so you can remove them by hand.
 *
 * Workflow:  git pull  ->  npm run sync-data  ->  refresh the browser.
 *
 * Exit code is 1 if a source folder is missing or any file is invalid JSON.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_OUT = resolve(FRONTEND_ROOT, "..", "backend", "outputs");

/** One entry per folder to sync. `from` is under backend/outputs, `to` under frontend/. */
const JOBS = [
  { from: "insights", to: join("public", "data", "insights") },
  { from: "ml", to: join("public", "data", "ml") },
  { from: join("ml", "plays"), to: join("public", "data", "ml", "plays") },
];

const COPY_EXTENSION = ".json";

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
/** Path shown to the user, relative to frontend/. */
const show = (absolutePath) => relative(FRONTEND_ROOT, absolutePath);

let copiedTotal = 0;
let skippedTotal = 0;
let problems = 0;

for (const job of JOBS) {
  const sourceDir = join(BACKEND_OUT, job.from);
  const destDir = join(FRONTEND_ROOT, job.to);

  console.log(`\n${show(sourceDir)}  ->  ${show(destDir)}`);

  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    console.error(`  ERROR: source folder not found. Did you run git pull, or the backend pipeline?`);
    problems += 1;
    continue;
  }

  // Plain files only; sub-folders (like ml/plays) are handled by their own job.
  const entries = readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  const toCopy = entries.filter((name) => extname(name).toLowerCase() === COPY_EXTENSION);
  const skipped = entries.filter((name) => !toCopy.includes(name));
  skippedTotal += skipped.length;

  mkdirSync(destDir, { recursive: true });

  let copied = 0;
  for (const name of toCopy) {
    const from = join(sourceDir, name);
    try {
      JSON.parse(readFileSync(from, "utf8"));
    } catch (error) {
      console.error(`  ERROR: ${name} is not valid JSON (${error.message}). Not copied.`);
      problems += 1;
      continue;
    }
    copyFileSync(from, join(destDir, name));
    console.log(`  copied  ${name}  (${kb(statSync(from).size)})`);
    copied += 1;
  }
  copiedTotal += copied;

  if (skipped.length > 0) console.log(`  skipped ${skipped.length} non-JSON file(s): ${skipped.join(", ")}`);

  // Report, but never delete, files that only exist in the destination.
  if (existsSync(destDir)) {
    const stale = readdirSync(destDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === COPY_EXTENSION)
      .map((entry) => entry.name)
      .filter((name) => !toCopy.includes(name));
    if (stale.length > 0) console.log(`  note: ${stale.length} file(s) only in destination (not removed): ${stale.join(", ")}`);
  }
}

console.log(`\nDone: ${copiedTotal} file(s) copied, ${skippedTotal} non-JSON file(s) skipped.`);
if (problems > 0) {
  console.error(`${problems} problem(s) found. See the errors above.`);
  process.exit(1);
}
