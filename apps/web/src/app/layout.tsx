import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Auth0Provider } from '@auth0/nextjs-auth0/client';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Gestión Integral',
  description: 'Plataforma integral de gestión organizacional',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans">
        <Auth0Provider>
          {children}
        </Auth0Provider>
      </body>
    </html>
  );
}
