import articlesData from "../data/articles.json";

interface Article {
  id: string;
  title: string;
  url: string;
  source: "HackerNews" | "Reddit" | "ClickHouse";
  score?: number;
  comments?: number;
  date: string;
}

interface Data {
  updatedAt: string;
  total: number;
  articles: Article[];
}

const data = articlesData as Data;

function SourceBadge({ source }: { source: Article["source"] }) {
  const classMap = {
    HackerNews: "badge-hn",
    Reddit: "badge-reddit",
    ClickHouse: "badge-ch",
  };
  return (
    <span className={`source-badge ${classMap[source]}`}>{source}</span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);

  if (diffH < 1) return "刚刚";
  if (diffH < 24) return `${diffH} 小时前`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} 天前`;
  return d.toLocaleDateString("zh-CN");
}

export default function Home() {
  const groups = {
    HackerNews: data.articles.filter((a) => a.source === "HackerNews"),
    Reddit: data.articles.filter((a) => a.source === "Reddit"),
    ClickHouse: data.articles.filter((a) => a.source === "ClickHouse"),
  };

  return (
    <div className="container">
      <header>
        <h1>📡 Tech Blog Aggregator</h1>
        <p>HackerNews · Reddit · ClickHouse</p>
        <div className="last-updated">
          ⏰ 更新于 {formatDate(data.updatedAt)} · 共 {data.total} 篇
        </div>
      </header>

      {(["HackerNews", "Reddit", "ClickHouse"] as const).map((source) => (
        <section key={source} className="source-section">
          <div className="source-header">
            <SourceBadge source={source} />
            <h2>
              {source === "HackerNews"
                ? "🔥 HackerNews"
                : source === "Reddit"
                ? "💬 Reddit"
                : "⚡ ClickHouse Blog"}
            </h2>
          </div>

          {groups[source].length === 0 ? (
            <p style={{ color: "#999", padding: "16px 0" }}>
              暂无数据，请稍后再试
            </p>
          ) : (
            <ul className="article-list">
              {groups[source].map((article, i) => (
                <li key={article.id} className="article-item">
                  <span className="article-index">{i + 1}</span>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="article-link"
                  >
                    {article.title}
                  </a>
                  <div className="article-meta">
                    {(article.score || article.score === 0) && (
                      <span>👍 {article.score}</span>
                    )}
                    {(article.comments || article.comments === 0) && (
                      <span>💬 {article.comments}</span>
                    )}
                    <span>{formatDate(article.date)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <footer>
        Auto-updated daily at 7:00 AM · Powered by Vercel
      </footer>
    </div>
  );
}
