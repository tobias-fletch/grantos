import "./globals.css";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { UIProvider } from "@/components/ui/provider";

export const metadata = {
  title: "GrantOS",
  description: "Find it. Qualify it. Apply for it. Track it. Get funded.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="data" defaultMode="system" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <UIProvider>{children}</UIProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
