import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { SetupBanner } from "@/components/openclaw/setup-banner";
import { CommandPalette } from "@/components/command-palette";
import { AutoBreadcrumb } from "@/components/auto-breadcrumb";
import { GlobalChatSlideOver } from "@/components/chat/global-chat";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClawData — Data Engineering Assistant",
  description: "Manage your OpenClaw-powered data engineering assistant",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-icon.svg",
  },
  applicationName: "ClawData",
  appleWebApp: {
    capable: true,
    title: "ClawData",
    statusBarStyle: "black-translucent",
  },
  other: {
    "theme-color": "#0f172a",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex h-screen overflow-hidden">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto bg-background p-4 pt-14 md:p-6 md:pt-6">
              <SetupBanner />
              <AutoBreadcrumb />
              {children}
            </main>
          </div>
          <Toaster richColors closeButton position="bottom-right" />
          <CommandPalette />
          <GlobalChatSlideOver />
        </ThemeProvider>
      </body>
    </html>
  );
}
