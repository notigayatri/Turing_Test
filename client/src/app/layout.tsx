import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import { TeamProvider } from "@/context/TeamContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Turing Test – Multimedia & PR Detective",
  description: "Round 1: Detect AI vs Human multimedia content. Round 2: Analyze PR code reviews. A competitive real-time event.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SocketProvider>
          <TeamProvider>
            {children}
          </TeamProvider>
        </SocketProvider>
      </body>
    </html>
  );
}
