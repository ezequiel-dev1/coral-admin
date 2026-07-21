import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coral Reef and Beef | Service dashboard",
  description: "A focused restaurant operations dashboard for Coral Reef and Beef.",
  openGraph: {
    title: "Coral Reef and Beef | Service dashboard",
    description: "Service, in hand.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coral Reef and Beef | Service dashboard",
    description: "Service, in hand.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/coral-icon.png",
    shortcut: "/coral-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
