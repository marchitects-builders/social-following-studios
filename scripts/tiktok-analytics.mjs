import fs from "node:fs/promises";
import path from "node:path";

const USAGE = `
Analyze a TikTok Studio analytics export: rank organic performance, find posting
windows, and exclude promoted posts.

  node scripts/tiktok-analytics.mjs --content <file> [options]

Required
  --content <file>      Content/Video export CSV from TikTok Studio > Analytics > Content

Optional
  --viewers <file>      Viewers export CSV (active-hours data) to overlay on posting times
  --promoted <file>     Promoted posts to exclude: CSV, or a plain text file with one
                        video link / id / title per line
  --tz-offset <hours>   Shift post timestamps by N hours before bucketing (default 0).
                        TikTok often exports in UTC -- set this to your local offset or
                        every hour-of-day conclusion will be wrong.
  --out <file>          Markdown report path (default tiktok-report.md)
  --min-sample <n>      Minimum videos in a time bucket before it counts as signal
                        (default 3)
`;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// TikTok renames these columns across locales and export versions, so match on a
// normalized form against a list of known spellings rather than an exact header.
const COLUMN_ALIASES = {
  videoId: ["videoid", "itemid", "id", "postid"],
  link: ["videolink", "link", "videourl", "url", "postlink", "sharelink"],
  title: ["videotitle", "title", "description", "videodescription", "caption", "content"],
  postTime: [
    "posttime", "publishtime", "createtime", "posteddate", "publisheddate",
    "postedtime", "datepublished", "date", "time", "createdtime",
  ],
  views: ["videoviews", "views", "totalviews", "playcount", "viewcount", "vv", "totalplays"],
  likes: ["likes", "totallikes", "likecount", "diggcount"],
  comments: ["comments", "totalcomments", "commentcount"],
  shares: ["shares", "totalshares", "sharecount"],
  avgWatchTime: ["averagewatchtime", "avgwatchtime", "averagetimewatched", "avgtimewatched"],
  completion: ["watchedfullvideo", "fullvideowatchrate", "completionrate", "finishrate"],
  newFollowers: ["newfollowers", "followersgained", "follows", "netfollowers"],
  promoted: ["promoted", "ispromoted", "paid", "promotion", "boosted", "adspend"],
};

const TRUTHY = new Set(["yes", "y", "true", "1", "promoted", "paid", "boosted", "on"]);

function normalizeHeader(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeTitle(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCsv(text) {
  const clean = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// TikTok sometimes puts a title banner or a blank line above the real header, so
// pick the first row that actually resolves to known columns.
function toRecords(rows) {
  if (rows.length === 0) return { records: [], headers: [] };

  let headerIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < Math.min(rows.length, 5); i += 1) {
    const normalized = rows[i].map(normalizeHeader);
    let score = 0;
    for (const aliases of Object.values(COLUMN_ALIASES)) {
      if (normalized.some((h) => aliases.includes(h))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }

  const headers = rows[headerIndex];
  const records = rows.slice(headerIndex + 1).map((cells) => {
    const record = {};
    headers.forEach((header, i) => {
      record[header] = cells[i] ?? "";
    });
    return record;
  });

  return { records, headers };
}

function resolveColumns(headers) {
  const resolved = {};
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));

  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    const exact = normalized.find((h) => aliases.includes(h.norm));
    if (exact) {
      resolved[key] = exact.raw;
      continue;
    }
    // Fall back to a containment match ("Video views (total)" -> views).
    const partial = normalized.find((h) => aliases.some((a) => h.norm.includes(a)));
    if (partial) resolved[key] = partial.raw;
  }

  return resolved;
}

function parseNumber(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (raw === "" || raw === "-" || raw === "--" || raw.toLowerCase() === "n/a") return null;

  const match = raw.replace(/,/g, "").match(/^(-?\d*\.?\d+)\s*([kmb])?%?$/i);
  if (!match) return null;

  let num = Number.parseFloat(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "k") num *= 1e3;
  if (suffix === "m") num *= 1e6;
  if (suffix === "b") num *= 1e9;

  return Number.isFinite(num) ? num : null;
}

function parseTimestamp(value, tzOffsetHours) {
  if (!value) return null;
  const raw = String(value).trim();
  if (raw === "") return null;

  // "2026-05-13 18:22:41" and "2026-05-13T18:22:41" are both common. Parse the
  // parts by hand so the runtime's local timezone never silently shifts an hour.
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (parts) {
    const [, y, mo, d, h = "0", mi = "0", s = "0"] = parts;
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    return new Date(ms + tzOffsetHours * 3600_000);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return new Date(fallback.getTime() + tzOffsetHours * 3600_000);
  }

  return null;
}

function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function extractIds(text) {
  return new Set(String(text).match(/\d{15,25}/g) ?? []);
}

async function loadPromotedSet(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const ids = extractIds(text);
  const titles = new Set();

  const rows = parseCsv(text);
  const { records, headers } = toRecords(rows);
  const columns = resolveColumns(headers);

  if (columns.title && records.length > 0) {
    for (const record of records) {
      const title = normalizeTitle(record[columns.title]);
      if (title) titles.add(title);
    }
  } else {
    // Plain text list: one link, id, or title per line.
    for (const line of text.split(/\r?\n/)) {
      const trimmed = normalizeTitle(line);
      if (trimmed && !/^\d[\d\s,.-]*$/.test(trimmed) && !trimmed.startsWith("http")) {
        titles.add(trimmed);
      }
    }
  }

  return { ids, titles };
}

function buildVideos(records, columns, tzOffsetHours) {
  return records.map((record) => {
    const get = (key) => (columns[key] ? record[columns[key]] : undefined);
    const views = parseNumber(get("views"));
    const likes = parseNumber(get("likes")) ?? 0;
    const comments = parseNumber(get("comments")) ?? 0;
    const shares = parseNumber(get("shares")) ?? 0;
    const postedAt = parseTimestamp(get("postTime"), tzOffsetHours);
    const linkText = `${get("link") ?? ""} ${get("videoId") ?? ""}`;

    return {
      id: [...extractIds(linkText)][0] ?? null,
      title: String(get("title") ?? "").trim(),
      normalizedTitle: normalizeTitle(get("title")),
      postedAt,
      hour: postedAt ? postedAt.getUTCHours() : null,
      weekday: postedAt ? postedAt.getUTCDay() : null,
      views,
      likes,
      comments,
      shares,
      engagements: likes + comments + shares,
      engagementRate: views && views > 0 ? (likes + comments + shares) / views : null,
      newFollowers: parseNumber(get("newFollowers")),
      completion: parseNumber(get("completion")),
      promotedFlag: TRUTHY.has(String(get("promoted") ?? "").trim().toLowerCase())
        || (parseNumber(get("promoted")) ?? 0) > 0,
    };
  });
}

function bucketBy(videos, keyFn) {
  const buckets = new Map();
  for (const video of videos) {
    const key = keyFn(video);
    if (key == null) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(video);
  }
  return buckets;
}

function summarizeBuckets(buckets, minSample) {
  return [...buckets.entries()]
    .map(([key, items]) => ({
      key,
      count: items.length,
      medianViews: median(items.map((v) => v.views)),
      medianEngagementRate: median(items.map((v) => v.engagementRate)),
      confident: items.length >= minSample,
    }))
    .sort((a, b) => (b.medianViews ?? 0) - (a.medianViews ?? 0));
}

function parseViewerActivity(text) {
  const rows = parseCsv(text);
  const { records, headers } = toRecords(rows);
  if (records.length === 0) return null;

  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const hourCol = normalized.find((h) => /hour|time/.test(h.norm));
  const countCol = normalized.find((h) => /viewer|count|active|value|follower/.test(h.norm));
  if (!hourCol || !countCol) return null;

  const byHour = new Map();
  for (const record of records) {
    const hourMatch = String(record[hourCol.raw]).match(/(\d{1,2})/);
    const count = parseNumber(record[countCol.raw]);
    if (!hourMatch || count == null) continue;
    const hour = Number(hourMatch[1]) % 24;
    byHour.set(hour, (byHour.get(hour) ?? 0) + count);
  }

  return byHour.size > 0 ? byHour : null;
}

function formatNumber(value) {
  if (value == null) return "n/a";
  return Math.round(value).toLocaleString("en-US");
}

function formatPercent(value) {
  if (value == null) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

function formatHour(hour) {
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${suffix}`;
}

function truncate(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") return "(no title)";
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

function parseArgs(argv) {
  const options = { tzOffset: 0, out: "tiktok-report.md", minSample: 3 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--content") options.content = next();
    else if (arg === "--viewers") options.viewers = next();
    else if (arg === "--promoted") options.promoted = next();
    else if (arg === "--out") options.out = next();
    else if (arg === "--tz-offset") options.tzOffset = Number(next());
    else if (arg === "--min-sample") options.minSample = Number(next());
    else if (arg === "--help" || arg === "-h") options.help = true;
  }

  return options;
}

function buildReport(data) {
  const {
    kept, excluded, exclusionMethod, hourStats, dayStats, viewerActivity,
    columns, options, engMinViews,
  } = data;

  const lines = [];
  const dated = kept.filter((v) => v.postedAt).sort((a, b) => a.postedAt - b.postedAt);
  const range = dated.length > 0
    ? `${dated[0].postedAt.toISOString().slice(0, 10)} to ${dated[dated.length - 1].postedAt.toISOString().slice(0, 10)}`
    : "unknown";

  lines.push("# TikTok organic performance report", "");
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} from \`${path.basename(options.content)}\`.`, "");

  lines.push("## Dataset", "");
  lines.push(`- Videos analyzed (organic): **${kept.length}**`);
  lines.push(`- Videos excluded as promoted: **${excluded.length}** (${exclusionMethod})`);
  lines.push(`- Date range: ${range}`);
  lines.push(`- Timezone shift applied: ${options.tzOffset >= 0 ? "+" : ""}${options.tzOffset}h`);
  lines.push(`- Columns detected: ${Object.keys(columns).join(", ") || "none"}`);
  lines.push("");

  if (excluded.length === 0) {
    lines.push("> **No promoted posts were excluded.** Either none exist, or the export carried");
    lines.push("> no promotion flag and no `--promoted` list was supplied. If you have ever run");
    lines.push("> a Promote campaign, re-run with `--promoted` or every ranking below is");
    lines.push("> contaminated by paid reach.", "");
  }

  const byViews = [...kept].filter((v) => v.views != null).sort((a, b) => b.views - a.views);
  lines.push("## Top organic videos by views", "");
  lines.push("| # | Views | Eng. rate | Posted | Title |");
  lines.push("| --- | --- | --- | --- | --- |");
  byViews.slice(0, 10).forEach((v, i) => {
    const posted = v.postedAt
      ? `${DAY_NAMES[v.weekday].slice(0, 3)} ${formatHour(v.hour)}`
      : "n/a";
    lines.push(`| ${i + 1} | ${formatNumber(v.views)} | ${formatPercent(v.engagementRate)} | ${posted} | ${truncate(v.title, 60)} |`);
  });
  lines.push("");

  const byEngagement = [...kept]
    .filter((v) => v.engagementRate != null && v.views >= engMinViews)
    .sort((a, b) => b.engagementRate - a.engagementRate);
  lines.push("## Top organic videos by engagement rate", "");
  lines.push(`Videos under ${formatNumber(engMinViews)} views are excluded here -- a 3-view post with one like is not a 33% engagement rate worth chasing.`, "");
  lines.push("| # | Eng. rate | Views | Posted | Title |");
  lines.push("| --- | --- | --- | --- | --- |");
  byEngagement.slice(0, 10).forEach((v, i) => {
    const posted = v.postedAt
      ? `${DAY_NAMES[v.weekday].slice(0, 3)} ${formatHour(v.hour)}`
      : "n/a";
    lines.push(`| ${i + 1} | ${formatPercent(v.engagementRate)} | ${formatNumber(v.views)} | ${posted} | ${truncate(v.title, 60)} |`);
  });
  lines.push("");

  lines.push("## Performance by hour posted", "");
  lines.push(`Median views, not mean -- one viral video would otherwise crown whatever hour it happened to land in. Buckets with fewer than ${options.minSample} videos are marked low-confidence.`, "");
  lines.push("| Hour | Videos | Median views | Median eng. rate | Confidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const bucket of hourStats) {
    lines.push(`| ${formatHour(bucket.key)} | ${bucket.count} | ${formatNumber(bucket.medianViews)} | ${formatPercent(bucket.medianEngagementRate)} | ${bucket.confident ? "ok" : "low"} |`);
  }
  lines.push("");

  lines.push("## Performance by day of week", "");
  lines.push("| Day | Videos | Median views | Median eng. rate | Confidence |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const bucket of dayStats) {
    lines.push(`| ${DAY_NAMES[bucket.key]} | ${bucket.count} | ${formatNumber(bucket.medianViews)} | ${formatPercent(bucket.medianEngagementRate)} | ${bucket.confident ? "ok" : "low"} |`);
  }
  lines.push("");

  if (viewerActivity) {
    const peak = [...viewerActivity.entries()].sort((a, b) => b[1] - a[1]);
    lines.push("## When your audience is actually online", "");
    lines.push("| Hour | Active viewers | Videos you posted then |");
    lines.push("| --- | --- | --- |");
    for (const [hour, count] of peak.slice(0, 8)) {
      const posted = hourStats.find((b) => b.key === hour)?.count ?? 0;
      lines.push(`| ${formatHour(hour)} | ${formatNumber(count)} | ${posted} |`);
    }
    lines.push("");

    const uncovered = peak.slice(0, 5).filter(([hour]) => (hourStats.find((b) => b.key === hour)?.count ?? 0) === 0);
    if (uncovered.length > 0) {
      lines.push(`**Gap:** your audience peaks at ${uncovered.map(([h]) => formatHour(h)).join(", ")} and you have never posted in those hours. That is the cheapest experiment available to you.`, "");
    }
  } else {
    lines.push("## When your audience is actually online", "");
    lines.push("No viewers export supplied, so posting windows below rest only on how your own past posts performed. Re-run with `--viewers` to overlay real audience-active hours.", "");
  }

  lines.push("## Recommended posting windows", "");
  const confidentHours = hourStats.filter((b) => b.confident);
  if (confidentHours.length === 0) {
    lines.push(`Not enough data. No hour bucket has ${options.minSample}+ videos, so any "best time" here would be noise dressed up as a finding. Keep posting and re-run once you have more history.`, "");
  } else {
    confidentHours.slice(0, 3).forEach((bucket, i) => {
      lines.push(`${i + 1}. **${formatHour(bucket.key)}** -- median ${formatNumber(bucket.medianViews)} views across ${bucket.count} videos`);
    });
    lines.push("");
    const confidentDays = dayStats.filter((b) => b.confident).slice(0, 3);
    if (confidentDays.length > 0) {
      lines.push(`Best days: ${confidentDays.map((b) => `**${DAY_NAMES[b.key]}** (median ${formatNumber(b.medianViews)})`).join(", ")}.`, "");
    }
  }

  lines.push("## Read this before acting on the numbers", "");
  lines.push("- Posting time is usually a smaller lever than content quality. If the hour buckets above are close together, timing is not your bottleneck and you should optimize hooks and topics instead.");
  lines.push("- TikTok's algorithm keeps distributing videos for weeks. Recent posts are systematically undercounted against older ones, which biases any recency comparison downward.");
  lines.push(`- Hour-of-day is only meaningful if \`--tz-offset\` was right. It was set to ${options.tzOffset}. If the export was UTC and you are not, redo this.`);
  lines.push("- Correlation, not causation: you may have posted your best-prepared content at your favorite hour, which would make that hour look causal when the content did the work.");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || !options.content) {
    console.log(USAGE);
    process.exit(options.content ? 0 : 1);
  }

  const contentText = await fs.readFile(path.resolve(options.content), "utf8");
  const { records, headers } = toRecords(parseCsv(contentText));
  const columns = resolveColumns(headers);

  if (!columns.views) {
    throw new Error(
      `Could not find a views column in ${options.content}. Headers seen: ${headers.join(" | ")}`,
    );
  }

  const videos = buildVideos(records, columns, options.tzOffset);

  let promoted = null;
  if (options.promoted) {
    promoted = await loadPromotedSet(path.resolve(options.promoted));
  }

  const excluded = [];
  const kept = [];
  for (const video of videos) {
    const byFlag = video.promotedFlag;
    const byId = promoted && video.id && promoted.ids.has(video.id);
    const byTitle = promoted && video.normalizedTitle && promoted.titles.has(video.normalizedTitle);
    if (byFlag || byId || byTitle) excluded.push(video);
    else kept.push(video);
  }

  const methods = [];
  if (columns.promoted) methods.push("promotion column in export");
  if (promoted) methods.push("--promoted list");
  const exclusionMethod = methods.length > 0 ? methods.join(" + ") : "no exclusion source available";

  const hourStats = summarizeBuckets(bucketBy(kept, (v) => v.hour), options.minSample);
  const dayStats = summarizeBuckets(bucketBy(kept, (v) => v.weekday), options.minSample);

  const overallMedianViews = median(kept.map((v) => v.views)) ?? 0;
  const engMinViews = Math.max(50, Math.round(overallMedianViews * 0.1));

  let viewerActivity = null;
  if (options.viewers) {
    viewerActivity = parseViewerActivity(await fs.readFile(path.resolve(options.viewers), "utf8"));
    if (!viewerActivity) {
      console.warn(`Warning: could not read active-hours data from ${options.viewers}; skipping overlay.`);
    }
  }

  const report = buildReport({
    kept, excluded, exclusionMethod, hourStats, dayStats,
    viewerActivity, columns, options, engMinViews,
  });

  const outPath = path.resolve(options.out);
  await fs.writeFile(outPath, report);

  console.log(`Analyzed ${kept.length} organic videos (${excluded.length} promoted excluded).`);
  if (hourStats.filter((b) => b.confident).length === 0) {
    console.log(`No hour bucket reached ${options.minSample} videos -- timing conclusions are not yet supportable.`);
  } else {
    const best = hourStats.filter((b) => b.confident).slice(0, 3);
    console.log(`Strongest hours: ${best.map((b) => `${formatHour(b.key)} (median ${formatNumber(b.medianViews)} views)`).join(", ")}`);
  }
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
