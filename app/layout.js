import './globals.css';

export const metadata = {
  title: 'Signal Board',
  description: 'A cooperative spectrum clue party game',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
