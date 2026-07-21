import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        {children}
      </body>
    </html>
  );
}
