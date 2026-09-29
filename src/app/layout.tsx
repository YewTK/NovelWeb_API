import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Sans_Thai, Kanit, Noto_Serif_Thai, Sarabun } from "next/font/google";
import "./globals.css";

/*
 * Self-hosted by next/font: no render-blocking request to Google on every
 * visit, and the UI face is preloaded. The reading faces load on demand.
 */
const plex = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});
const notoSerif = Noto_Serif_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-serif",
  preload: false,
});
const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sarabun",
  preload: false,
});
const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-kanit",
  preload: false,
});
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-cinzel",
});

export const metadata: Metadata = {
  title: "NovelFlow — ห้องสมุดนิยายแปลและสตูดิโอเขียนด้วย AI",
  description:
    "แปลนิยายจากลิงก์เป็นภาษาไทยแบบสตรีมทีละย่อหน้า พร้อมคลังคำศัพท์ที่คงเส้นคงวา และสตูดิโอที่ช่วยแต่งนิยายทั้งเรื่องจากเรื่องย่อในสไตล์นักเขียนชื่อดัง",
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
    { media: "(prefers-color-scheme: dark)", color: "#07080d" },
    { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${plex.variable} ${notoSerif.variable} ${sarabun.variable} ${kanit.variable} ${cinzel.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="grain min-h-dvh antialiased">
        <div className="atmosphere" aria-hidden />
        {children}
      </body>
    </html>
  );
}
