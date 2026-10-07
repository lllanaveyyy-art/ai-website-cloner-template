import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcflow Automation",
  description: "AI-assisted B2B lead operations and workflow automation."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
