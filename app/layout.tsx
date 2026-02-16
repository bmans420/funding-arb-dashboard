import './globals.css'
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0d1117',
}

export const metadata: Metadata = {
  title: 'Funding Rates Dashboard',
  description: 'Real-time cryptocurrency funding rates and arbitrage opportunities',
  keywords: ['funding rates', 'cryptocurrency', 'arbitrage', 'trading', 'DeFi'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
