import type { Metadata, Viewport } from "next";
import "./globals.css";

// Fit the desktop composition to phone screens; retain native pinch zoom.
export const viewport: Viewport = {
  width: 1440,
  initialScale: undefined,
  userScalable: true,
};

export const metadata: Metadata = {
  alternates: { canonical: "https://lambdahumanoid.github.io/" },
  other: {
    citation_title: "λ₀: Scaling Open-World Egocentric Human Data for Humanoid Loco-Manipulation",
    citation_author: "Lambda-humanoid Team",
    citation_publication_date: "2026/10/13",
    citation_pdf_url: "https://arxiv.org/pdf/2610.18950",
    citation_abstract_html_url: "https://arxiv.org/abs/2610.18950",
  },
  title: "λ₀: Scaling Open-World Egocentric Human Data for Humanoid Loco-Manipulation",
  icons: { icon: { url: "/favicon.png?v=7f1805b9ef", type: "image/png" } },
  description:
    "λ₀ learns humanoid loco-manipulation from HumanVerse: 500 hours of whole-body human activity, a three-stage training recipe, and four real-world tasks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
