import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "AMTasker — Daily Task and Time Logger",
  description:
    "A local-first daily task and time logger: see at a glance whether you are logging, log time per task, keep notes and priorities. Your data stays in your browser.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark theme and colour theme before the first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var a='default';try{a=JSON.parse(localStorage.getItem('amtasker:profiles')).activeId||'default'}catch(e){}var k=function(b){return a==='default'?b:b+'@'+a};var t=localStorage.getItem(k('amtasker:theme'));var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);var x=localStorage.getItem(k('amtasker:accent'));if(x&&x!=='classic')document.documentElement.dataset.accent=x;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
