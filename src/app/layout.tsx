import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovelFlow — แปลนิยายจากลิงก์ด้วย AI",
  description:
    "วางลิงก์นิยายหรือเนื้อหาดิบ แล้วให้ AI แปลเป็นภาษาไทยแบบสตรีมทีละย่อหน้า พร้อมล็อกคำศัพท์เฉพาะให้คงเส้นคงวา",
  applicationName: "NovelFlow",
  appleWebApp: { capable: true, title: "NovelFlow", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#08090f" },
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
  ],
};

/** Applies the saved theme before first paint so there is no flash. */
const themeScript = `
try {
  var raw = localStorage.getItem("novelflow.settings");
  var theme = raw ? (JSON.parse(raw).state || {}).theme : null;
  if (theme && theme !== "dark") document.documentElement.setAttribute("data-theme", theme);
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Noto+Serif+Thai:wght@400;500;600&family=Sarabun:wght@400;500;600&family=Kanit:wght@400;500;600&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="aurora min-h-dvh antialiased">{children}</body>
    </html>
  );
}
