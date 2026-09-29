import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "λ₀: Scaling Egocentric Human Data for General Humanoid Control",
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
  description:
    "λ₀ learns humanoid loco-manipulation from HumanVerse-500: 500 hours of whole-body human activity, a three-stage training recipe, and four real-world tasks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
