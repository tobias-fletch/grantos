import "./globals.css";

export const metadata = {
  title: "GrantOS",
  description: "Find it. Qualify it. Apply for it. Track it. Get funded.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
