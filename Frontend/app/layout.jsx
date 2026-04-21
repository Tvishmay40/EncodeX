import "./globals.css";

export const metadata = {
  title: "EncodeX Industrial Agentic Console",
  description: "FastAPI + Next.js manufacturing command center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
