export const dynamic = "force-dynamic";

import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ChunkLoadErrorHandler } from '@/components/chunk-load-error-handler'
import { Providers } from '@/components/providers'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

const siteUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'LockonDocs',
  description: 'Securely scan, organize and store your personal documents.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/icons/apple-icon-180.png',
  },
  appleWebApp: {
    capable: true,
    title: 'LockonDocs',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'LockonDocs',
    description: 'Securely scan, organize and store your personal documents.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#b8902e',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-US" suppressHydrationWarning>
      <head>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ldInstallPrompt=e;window.dispatchEvent(new Event('ld-installready'));});",
          }}
        />
      </head>
      <body suppressHydrationWarning className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            {children}
          </Providers>
          <Toaster />
          {/* IMPORTANT: Do not remove - handles chunk loading race conditions in the dev server */}
          <ChunkLoadErrorHandler />
        </ThemeProvider>
      </body>
    </html>
  )
}
