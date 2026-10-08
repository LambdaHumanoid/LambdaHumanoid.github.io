import type { Metadata, Viewport } from "next";
import "./globals.css";

// Fit the desktop composition to phone screens; retain native pinch zoom.
export const viewport: Viewport = {
  width: 1440,
  initialScale: undefined,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "Scaling Open-World Egocentric Human Data for Humanoid Loco-Manipulation",
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
