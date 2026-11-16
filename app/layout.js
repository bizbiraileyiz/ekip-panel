import './globals.css';

export const metadata = { title: 'Ekip Paneli', description: 'Murat · Claude · ChatGPT' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
