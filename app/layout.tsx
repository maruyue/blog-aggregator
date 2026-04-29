import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tech Blog Aggregator",
  description: "Latest articles from HackerNews, Reddit, and ClickHouse",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
