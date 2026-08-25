import React from 'react';

interface KiteLogoProps {
  size?: number;
  className?: string;
}

export const KiteLogo: React.FC<KiteLogoProps> = ({ size = 32, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="kite-grad-top" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9945FF" />
        <stop offset="100%" stopColor="#14F195" />
      </linearGradient>
    </defs>
    <path
      d="M24 4L44 24L24 44L4 24L24 4Z"
      fill="#9945FF"
      fillOpacity="0.12"
      stroke="url(#kite-grad-top)"
      strokeWidth="2"
    />
    <path d="M24 4L44 24L24 24L24 4Z" fill="#9945FF" fillOpacity="0.9" />
    <path d="M24 4L4 24L24 24L24 4Z" fill="#9945FF" fillOpacity="0.55" />
    <path d="M24 44L44 24L24 24L24 44Z" fill="#14F195" fillOpacity="0.7" />
    <path d="M24 44L4 24L24 24L24 44Z" fill="#14F195" fillOpacity="0.4" />
    <line x1="24" y1="44" x2="28" y2="52" stroke="#14F195" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="28" cy="52" r="1.5" fill="#14F195" fillOpacity="0.6" />
  </svg>
);
