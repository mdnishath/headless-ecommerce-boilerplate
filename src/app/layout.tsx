import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@client/theme.css";
import { activeClient } from "@/client";
import { getCustomization } from "@core/studio/get-customization";
import { themeToCssVars } from "@core/studio/theme";
import { Slot } from "@core/studio/slot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: activeClient.identity.name,
  description: `${activeClient.identity.name} — headless storefront`,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const doc = await getCustomization("published");
  const cssVars = themeToCssVars(doc.theme) as React.CSSProperties;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={cssVars}
    >
      <body className="antialiased">
        <Slot name="header" doc={doc} />
        {children}
      </body>
    </html>
  );
}
