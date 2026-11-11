import './globals.css';

export const metadata = {
  title: 'Betterfold',
  description: 'Paper planes designed by simulation and folded by hand from one sheet of A4, with no tape, cuts or glue. Watch them fly, see the design search, learn to fold them, and help the search from your browser.',
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
