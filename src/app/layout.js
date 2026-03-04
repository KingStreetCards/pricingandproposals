import './globals.css';

export const metadata = {
  title: 'Mural Health — Pricing Engine',
  description: 'Internal pricing calculator for Mural Link clinical trial services',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
