/**
 * Generates small, realistic MOCK data files for the Insights page.
 *
 *   npm run mock-data
 *
 * Output goes to public/data/insights/. Player names are fictional on purpose:
 * the numbers are invented, so they must not be attributed to real people.
 *
 * Replace the generated files with the real backend output when it exists.
 * The shapes below are the contract the frontend (src/api.ts) expects.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "insights");
mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Deterministic random numbers, so re-running the script gives identical files.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2021);
const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Players (separation_leaderboard.json and man_vs_zone.json)
// ---------------------------------------------------------------------------
const FIRST = [
  "Marcus", "Devon", "Jalen", "Tyrell", "Caleb", "Andre", "Darius", "Elijah", "Gavin", "Isaiah",
  "Kendrick", "Lamar", "Micah", "Nolan", "Omar", "Preston", "Quentin", "Rashad", "Silas", "Terrance",
  "Victor", "Wesley", "Xavier", "Zane", "Brandon", "Colton", "Dante", "Emmett", "Floyd", "Grady",
];
const LAST = [
  "Whitfield", "Okafor", "Delacroix", "Hargrove", "Ibarra", "Jennings", "Kowalski", "Lindqvist", "Maddox",
  "Nakamura", "Oyelaran", "Pemberton", "Quintero", "Radcliffe", "Sandoval", "Thackeray", "Underhill",
  "Vasquez", "Winslow", "Yarbrough", "Zielinski", "Abernathy", "Blackwood", "Castellano", "Dunmore",
  "Everhart", "Fairbanks", "Galloway", "Holloway", "Iverson",
];

const POSITION_PROFILE = {
  WR: { count: 40, targets: [55, 28], sep: 3.1, catch: 0.64, speed: 4.6 },
  TE: { count: 18, targets: [38, 20], sep: 2.6, catch: 0.68, speed: 3.6 },
  RB: { count: 14, targets: [28, 14], sep: 3.0, catch: 0.76, speed: 3.8 },
};

const usedNames = new Set();
function uniqueName() {
  for (;;) {
    const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}

const players = [];
let idCounter = 43000;
for (const [position, p] of Object.entries(POSITION_PROFILE)) {
  for (let i = 0; i < p.count; i += 1) {
    const targets = Math.round(clamp(p.targets[0] + gauss() * p.targets[1], 6, 150));
    const targetsMan = Math.max(2, Math.round(targets * (0.35 + gauss() * 0.08)));
    const targetsZone = Math.max(2, targets - targetsMan);
    const skill = gauss() * 0.4; // latent "gets open" ability
    // Zone gives more space on average, so the zone mean sits a bit higher.
    const sepMan = clamp(p.sep + skill - 0.15 + gauss() * 0.4, 1.2, 5.2);
    const sepZone = clamp(p.sep + skill + 0.2 + gauss() * 0.4, 1.2, 5.6);
    const total = targetsMan + targetsZone;
    idCounter += 3 + Math.floor(rand() * 90);
    players.push({
      nfl_id: idCounter,
      name: uniqueName(),
      position,
      targets: total,
      catch_rate: round(clamp(p.catch + gauss() * 0.07, 0.35, 0.92), 3),
      avg_sep: round((sepMan * targetsMan + sepZone * targetsZone) / total, 2),
      avg_release_speed: round(clamp(p.speed + gauss() * 0.5, 2.4, 6.4), 2),
      _man: { sep: round(sepMan, 2), targets: targetsMan },
      _zone: { sep: round(sepZone, 2), targets: targetsZone },
    });
  }
}

const leaderboard = players
  .map(({ _man, _zone, ...row }) => row)
  .sort((a, b) => b.avg_sep - a.avg_sep);

const manVsZone = players.map((pl) => ({
  nfl_id: pl.nfl_id,
  name: pl.name,
  position: pl.position,
  sep_man: pl._man.sep,
  sep_zone: pl._zone.sep,
  // Convention: diff = sep_man - sep_zone (positive means better against man).
  diff: round(pl._man.sep - pl._zone.sep, 2),
  targets_man: pl._man.targets,
  targets_zone: pl._zone.targets,
}));

// ---------------------------------------------------------------------------
// Heatmap
//
// Grid: x_bin is yards from the line of scrimmage (lower edge of the bin,
// negative = behind the line, offense always moving to the right). y_bin is an
// index into grid.y_zones, which are lanes measured from the offense's left
// sideline (0 yds) to its right sideline (53.3 yds).
// ---------------------------------------------------------------------------
const X_BINS = [-5, 0, 5, 10, 15, 20, 25, 30, 35];

const grid = {
  x_bin_size: 5,
  x_min: -5,
  x_max: 40,
  min_plays: 10,
  y_zones: [
    { y0: 0, y1: 12, label: "left sideline", phrase: "outside the numbers (left)" },
    { y0: 12, y1: 23.6, label: "left of the hash", phrase: "inside the numbers (left)" },
    { y0: 23.6, y1: 29.7, label: "middle of the field", phrase: "up the middle" },
    { y0: 29.7, y1: 41.3, label: "right of the hash", phrase: "inside the numbers (right)" },
    { y0: 41.3, y1: 53.3, label: "right sideline", phrase: "outside the numbers (right)" },
  ],
};

const topics = [
  {
    id: "throw_locations",
    label: "Where throws go",
    description: "Every pass target, grouped by depth past the line of scrimmage and by lane across the field.",
    kind: "count",
    unit: "throws",
    positions: ["WR", "TE", "RB"],
    takeaway: "Most throws go {depth}, {lateral}.",
  },
  {
    id: "separation",
    label: "Space at the throw",
    description: "Average yards between the target and the nearest defender when the ball arrives.",
    kind: "mean",
    unit: "yds",
    positions: ["WR", "TE", "RB"],
    takeaway: "Receivers find the most space {depth}, {lateral}, averaging {value}.",
  },
  {
    id: "catch_rate",
    label: "Catch rate",
    description: "The share of targets that ended in a catch.",
    kind: "rate",
    unit: "%",
    positions: ["WR", "TE", "RB"],
    takeaway: "Targets are caught most often {depth}, {lateral}, at {value}.",
  },
  {
    id: "player_density",
    label: "Player density",
    description: "Where every player stands when the ball is thrown, with all plays aligned at the line of scrimmage.",
    kind: "count",
    unit: "players",
    positions: ["QB", "WR", "TE", "RB", "DB", "LB", "DL"],
    takeaway: "Players crowd most {depth}, {lateral}.",
  },
];

const DOWN_WEIGHT = { 1: 0.36, 2: 0.31, 3: 0.27, 4: 0.06 };
const COVERAGE_WEIGHT = { man: 0.35, zone: 0.65 };
const DOWNS = [1, 2, 3, 4];
const COVERAGES = ["man", "zone"];

// Depth and lane weights per target position (each sums to roughly 1).
const TARGET_PROFILE = {
  WR: {
    total: 5200,
    depth: [0.04, 0.16, 0.26, 0.17, 0.12, 0.09, 0.07, 0.06, 0.03],
    lane: [0.3, 0.17, 0.06, 0.17, 0.3],
    base: 3.0,
  },
  TE: {
    total: 2000,
    depth: [0.03, 0.24, 0.3, 0.2, 0.1, 0.06, 0.04, 0.02, 0.01],
    lane: [0.1, 0.25, 0.3, 0.25, 0.1],
    base: 2.6,
  },
  RB: {
    total: 1700,
    depth: [0.12, 0.5, 0.22, 0.09, 0.04, 0.02, 0.01, 0, 0],
    lane: [0.2, 0.22, 0.16, 0.22, 0.2],
    base: 3.1,
  },
};

const SEP_DEPTH_ADJ = [0.3, -0.2, 0, 0.2, 0.5, 0.7, 0.8, 0.8, 0.8];
const SEP_LANE_ADJ = [0.1, 0, -0.4, 0, 0.1];
const CATCH_DEPTH = [0.88, 0.78, 0.7, 0.64, 0.55, 0.46, 0.38, 0.33, 0.3];

const rows = [];

// Receiver topics share the same set of targets, so plays counts agree across topics.
for (const [position, prof] of Object.entries(TARGET_PROFILE)) {
  for (const coverage of COVERAGES) {
    for (const down of DOWNS) {
      X_BINS.forEach((xBin, xi) => {
        for (let yBin = 0; yBin < grid.y_zones.length; yBin += 1) {
          // Deep throws are thrown to the outside lanes more often.
          const deepLane = xi >= 4 && position === "WR" ? [1.25, 1, 0.6, 1, 1.25][yBin] : 1;
          const expected =
            prof.total * prof.depth[xi] * prof.lane[yBin] * deepLane * DOWN_WEIGHT[down] * COVERAGE_WEIGHT[coverage];
          const n = Math.round(expected * (0.85 + rand() * 0.3));
          if (n < 1) continue;

          const sepMean = clamp(
            prof.base + SEP_DEPTH_ADJ[xi] + SEP_LANE_ADJ[yBin] + (coverage === "zone" ? 0.35 : -0.15) + gauss() * 0.12,
            0.8,
            7,
          );
          const catchP = clamp(
            CATCH_DEPTH[xi] +
              (yBin === 0 || yBin === 4 ? -0.04 : 0) +
              (coverage === "man" ? -0.03 : 0) +
              (position === "RB" ? 0.04 : position === "TE" ? 0.02 : 0) +
              gauss() * 0.03,
            0.05,
            0.97,
          );
          const catches = clamp(Math.round(n * catchP), 0, n);
          const base = { x_bin: xBin, y_bin: yBin, position, down, coverage, count: n };

          rows.push({ topic: "throw_locations", ...base, value_sum: 0, catches: 0 });
          rows.push({ topic: "separation", ...base, value_sum: round(n * sepMean, 2), catches: 0 });
          rows.push({ topic: "catch_rate", ...base, value_sum: 0, catches });
        }
      });
    }
  }
}

// Player density: where all players stand at the throw, per position.
const PASS_PLAYS = 3000;
const DENSITY_PROFILE = {
  QB: { per: 1, depth: [0.75, 0.25, 0, 0, 0, 0, 0, 0, 0], lane: [0.04, 0.14, 0.64, 0.14, 0.04] },
  DL: { per: 4, depth: [0.55, 0.45, 0, 0, 0, 0, 0, 0, 0], lane: [0.1, 0.25, 0.3, 0.25, 0.1] },
  LB: { per: 3, depth: [0.05, 0.5, 0.35, 0.1, 0, 0, 0, 0, 0], lane: [0.15, 0.25, 0.2, 0.25, 0.15] },
  DB: { per: 4, depth: [0, 0.12, 0.22, 0.22, 0.16, 0.12, 0.08, 0.05, 0.03], lane: [0.25, 0.2, 0.1, 0.2, 0.25] },
  WR: { per: 2.8, depth: [0.1, 0.18, 0.2, 0.16, 0.12, 0.1, 0.07, 0.05, 0.02], lane: [0.35, 0.15, 0.05, 0.15, 0.3] },
  TE: { per: 1, depth: [0.15, 0.35, 0.25, 0.12, 0.07, 0.03, 0.02, 0.01, 0], lane: [0.15, 0.25, 0.2, 0.25, 0.15] },
  RB: { per: 1, depth: [0.55, 0.35, 0.07, 0.03, 0, 0, 0, 0, 0], lane: [0.2, 0.25, 0.1, 0.25, 0.2] },
};

for (const [position, prof] of Object.entries(DENSITY_PROFILE)) {
  for (const coverage of COVERAGES) {
    for (const down of DOWNS) {
      X_BINS.forEach((xBin, xi) => {
        for (let yBin = 0; yBin < grid.y_zones.length; yBin += 1) {
          const expected =
            PASS_PLAYS * prof.per * prof.depth[xi] * prof.lane[yBin] * DOWN_WEIGHT[down] * COVERAGE_WEIGHT[coverage];
          const n = Math.round(expected * (0.9 + rand() * 0.2));
          if (n < 1) continue;
          rows.push({
            topic: "player_density",
            x_bin: xBin,
            y_bin: yBin,
            position,
            down,
            coverage,
            count: n,
            value_sum: 0,
            catches: 0,
          });
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Write files. Heatmap rows go one per line to keep the file readable.
// ---------------------------------------------------------------------------
writeFileSync(join(OUT_DIR, "separation_leaderboard.json"), `${JSON.stringify(leaderboard, null, 2)}\n`);
writeFileSync(join(OUT_DIR, "man_vs_zone.json"), `${JSON.stringify(manVsZone, null, 2)}\n`);

const heatmapText =
  `{\n"grid": ${JSON.stringify(grid)},\n"topics": ${JSON.stringify(topics, null, 1)},\n"rows": [\n` +
  rows.map((r) => JSON.stringify(r)).join(",\n") +
  `\n]\n}\n`;
writeFileSync(join(OUT_DIR, "heatmap.json"), heatmapText);

console.log(`Wrote ${leaderboard.length} leaderboard rows, ${manVsZone.length} man/zone rows, ${rows.length} heatmap rows.`);
