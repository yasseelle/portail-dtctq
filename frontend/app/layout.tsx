import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300","400","500","600"],
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-head",
  weight: ["400","500","600","700","800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Portail DTC/TQ — ONEE",
  description: "Portail interne de gestion — Division Technique Centre",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Theme init script — runs before paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${dmSans.variable} ${syne.variable} ${dmSans.className}`}>
        {children}
      </body>
    </html>
  );
}