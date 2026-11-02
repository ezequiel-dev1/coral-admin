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
  const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

  return (
    <html lang="en" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object') {
                for (var key in window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                  if (key === 'renderers') {
                    window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] = new Map();
                  } else {
                    window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] = typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__[key] === 'function' ? function(){} : null;
                  }
                }
              }
            `,
          }}
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
