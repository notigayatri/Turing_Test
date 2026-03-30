import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import { TeamProvider } from "@/context/TeamContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Turing Test – PR Detective",
  description: "Identify if the PR was authored by a Human or AI",
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
