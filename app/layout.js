import './globals.css';

export const metadata = {
  title: 'Veridex — Truth in Every Token',
  description: 'Real-time verification engine for AI-generated content. Decompose claims, cross-check against authoritative sources, and generate trust certificates.',
  keywords: 'AI verification, hallucination detection, fact-checking, LLM, trust score, Veridex',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
