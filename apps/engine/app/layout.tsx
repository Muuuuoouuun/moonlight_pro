import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#05070b", color: "#f5f7fb" }}>
        {children}
      </body>
    </html>
  );
}
