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
  // Use RSS feeds which are less likely to be blocked than JSON API
  const feeds = [
    "https://www.reddit.com/r/programming/.rss",
    "https://www.reddit.com/r/programming/hot/.rss",
    "https://old.reddit.com/r/programming/.rss",
  ];

  for (const feed of feeds) {
    try {
      console.log(`Trying Reddit RSS: ${feed}`);
      const res = await fetch(feed, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!res.ok) {
        console.error(`Reddit RSS ${feed}: ${res.status}`);
        continue;
      }

      const xml = await res.text();

      // Parse RSS XML to extract entries
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const articles: Article[] = [];
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entry = match[1];
        const titleMatch = entry.match(/<title>(.*?)<\/title>/);
        // Reddit RSS uses <link href="..."/> for the external URL
        const linkMatch = entry.match(/<link\s+href="([^"]+)"/);
        const updatedMatch = entry.match(/<updated>(.*?)<\/updated>/);

        if (titleMatch && linkMatch) {
          const title = titleMatch[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#x27;/g, "'")
            .replace(/&#39;/g, "'")
            .trim();

          // Skip sticky/internal Reddit links
          if (title.startsWith("[mod]") || title.startsWith("[sticky]")) continue;

          articles.push({
            id: `reddit-${Buffer.from(linkMatch[1]).toString("base64").slice(0, 12)}`,
            title,
            url: linkMatch[1],
            source: "Reddit" as const,
            date: updatedMatch
              ? new Date(updatedMatch[1]).toISOString()
              : new Date().toISOString(),
          });

          if (articles.length >= 10) break;
        }
      }

      if (articles.length > 0) {
        console.log(`Reddit: ${articles.length} articles from ${feed}`);
        return articles;
      }
    } catch (err) {
      console.error(`Reddit RSS error:`, err);
    }
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
