import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brasserie No. 8 | Service dashboard",
  description: "A focused restaurant operations dashboard for Brasserie No. 8.",
  openGraph: {
    title: "Brasserie No. 8 | Service dashboard",
    description: "Dinner service, in hand.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Brasserie No. 8 | Service dashboard",
    description: "Dinner service, in hand.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
