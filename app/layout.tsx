import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['300', '400'],
})

export const metadata: Metadata = {
  title: 'Kallikore News',
  description: 'Personalized global news powered by AI',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={montserrat.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
