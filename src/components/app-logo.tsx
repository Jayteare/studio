import Link from 'next/link';
import { ReceiptText } from 'lucide-react';

interface AppLogoProps {
  size?: number;
  iconSizeClass?: string;
  textSizeClass?: string;
  className?: string;
}

export function AppLogo({ 
  iconSizeClass = "h-8 w-8", 
  textSizeClass = "text-3xl",
  className = "" 
}: AppLogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-3 ${className}`} aria-label="Invoice Insights Home">
      <ReceiptText className={`${iconSizeClass} text-primary`} />
      <h1 className={`${textSizeClass} font-headline font-semibold text-primary`}>
        Invoice Insights
      </h1>
    </Link>
  );
}
