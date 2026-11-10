import './globals.css';
export const metadata = { title: 'Apex Trading OS', description: 'Control, backtest and journal every Apex bot from one place.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
