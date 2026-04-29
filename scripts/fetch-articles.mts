/**
 * Fetch latest articles from HackerNews, Reddit, and ClickHouse blog.
 * Run via: npx tsx scripts/fetch-articles.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const OUTPUT = join(DATA_DIR, "articles.json");

interface Article {
  id: string;
  title: string;
  url: string;
  source: "HackerNews" | "Reddit" | "ClickHouse";
  score?: number;
  comments?: number;
  date: string;
}

// ─── HackerNews ──────────────────────────────────────────────

async function fetchHN(): Promise<Article[]> {
  const res = await fetch(
    "https://hacker-news.firebaseio.com/v0/topstories.json"
  );
  const ids: number[] = await res.json();
  const topIds = ids.slice(0, 15);

  const items = await Promise.all(
    topIds.map(async (id) => {
      const r = await fetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`
      );
      return r.json();
    })
  );

  return items
    .filter((item) => item && item.title && item.url)
    .slice(0, 10)
    .map((item) => ({
      id: `hn-${item.id}`,
      title: item.title,
      url: item.url,
      source: "HackerNews" as const,
      score: item.score || 0,
      comments: item.descendants || 0,
      date: new Date(item.time * 1000).toISOString(),
    }));
}

// ─── Reddit ──────────────────────────────────────────────────

async function fetchReddit(): Promise<Article[]> {
  const subreddits = ["programming", "technology", "MachineLearning"];
  
  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; blog-aggregator/1.0; +https://github.com/maruyue/blog-aggregator)",
            "Accept": "application/json",
          },
        }
      );

      if (!res.ok) {
        console.error(`Reddit r/${sub} failed: ${res.status}`);
        continue;
      }

      const text = await res.text();
      // Reddit sometimes wraps in a weird way
      const data = JSON.parse(text);
      const posts = data.data?.children || [];

      const articles = posts
        .filter((p: any) => !p.data?.stickied && p.data?.url)
        .slice(0, 10)
        .map((p: any) => ({
          id: `reddit-${p.data.id}`,
          title: p.data.title,
          url: p.data.url.startsWith("http")
            ? p.data.url
            : `https://reddit.com${p.data.permalink}`,
          source: "Reddit" as const,
          score: p.data.score,
          comments: p.data.num_comments,
          date: new Date(p.data.created_utc * 1000).toISOString(),
        }));

      if (articles.length > 0) {
        console.log(`Reddit r/${sub}: ${articles.length} articles`);
        return articles;
      }
    } catch (err) {
      console.error(`Reddit r/${sub} error:`, err);
    }
  }

  // Fallback: try old.reddit.com
  try {
    const res = await fetch(
      "https://old.reddit.com/r/programming/top.json?limit=15&t=day",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; blog-aggregator/1.0)",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      const posts = data.data?.children || [];
      const articles = posts
        .filter((p: any) => !p.data?.stickied && p.data?.url)
        .slice(0, 10)
        .map((p: any) => ({
          id: `reddit-${p.data.id}`,
          title: p.data.title,
          url: p.data.url.startsWith("http")
            ? p.data.url
            : `https://reddit.com${p.data.permalink}`,
          source: "Reddit" as const,
          score: p.data.score,
          comments: p.data.num_comments,
          date: new Date(p.data.created_utc * 1000).toISOString(),
        }));
      console.log(`Reddit old: ${articles.length} articles`);
      return articles;
    }
  } catch (err) {
    console.error("Reddit old error:", err);
  }

  console.error("All Reddit sources failed");
  return [];
}

// ─── ClickHouse Blog ─────────────────────────────────────────

async function fetchClickHouse(): Promise<Article[]> {
  const res = await fetch("https://clickhouse.com/blog");

  if (!res.ok) {
    console.error(`ClickHouse fetch failed: ${res.status}`);
    return [];
  }

  const html = await res.text();

  // Extract blog post links and titles from the blog listing page
  const articles: Article[] = [];
  const regex =
    /<a[^>]*href="(\/blog\/[^"]+)"[^>]*>\s*(.*?)\s*<\/a>/gi;
  const dateRegex = /(\w{3}\s\d{1,2},\s\d{4})/;

  let match;
  const seen = new Set<string>();

  while ((match = regex.exec(html)) !== null) {
    const url = `https://clickhouse.com${match[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);

    // Extract title (strip HTML tags)
    const title = match[2].replace(/<[^>]+>/g, "").trim();

    if (!title || title.length < 5 || title === "Blog") continue;

    articles.push({
      id: `ch-${Buffer.from(url).toString("base64").slice(0, 12)}`,
      title,
      url,
      source: "ClickHouse" as const,
      date: new Date().toISOString(),
    });

    if (articles.length >= 10) break;
  }

  return articles;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log("Fetching articles...");

  const [hn, reddit, ch] = await Promise.allSettled([
    fetchHN(),
    fetchReddit(),
    fetchClickHouse(),
  ]);

  const allArticles: Article[] = [];

  if (hn.status === "fulfilled") {
    console.log(`  HackerNews: ${hn.value.length} articles`);
    allArticles.push(...hn.value);
  } else {
    console.error("  HackerNews: failed", hn.reason);
  }

  if (reddit.status === "fulfilled") {
    console.log(`  Reddit: ${reddit.value.length} articles`);
    allArticles.push(...reddit.value);
  } else {
    console.error("  Reddit: failed", reddit.reason);
  }

  if (ch.status === "fulfilled") {
    console.log(`  ClickHouse: ${ch.value.length} articles`);
    allArticles.push(...ch.value);
  } else {
    console.error("  ClickHouse: failed", ch.reason);
  }

  // Sort by date, newest first
  allArticles.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const output = {
    updatedAt: new Date().toISOString(),
    total: allArticles.length,
    articles: allArticles,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log(`\nSaved ${allArticles.length} articles to ${OUTPUT}`);
}

main().catch(console.error);
