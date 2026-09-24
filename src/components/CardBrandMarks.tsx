/**
 * Card scheme marks used on the payment method selector.
 * Brand colours are fixed by Visa / Mastercard brand rules, so they are
 * intentionally literal here rather than design tokens.
 */

export const VisaMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 16" role="img" aria-label="Visa" className={className}>
    <text
      x="24"
      y="13"
      textAnchor="middle"
      fontFamily="Georgia, 'Times New Roman', serif"
      fontSize="14"
      fontStyle="italic"
      fontWeight="700"
      letterSpacing="0.5"
      fill="#1A1F71"
    >
      VISA
    </text>
  </svg>
);

export const MastercardMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 36 22" role="img" aria-label="Mastercard" className={className}>
    <circle cx="14" cy="11" r="9" fill="#EB001B" />
    <circle cx="22" cy="11" r="9" fill="#F79E1B" />
    <path
      d="M18 4.2a8.98 8.98 0 0 0 0 13.6 8.98 8.98 0 0 0 0-13.6Z"
      fill="#FF5F00"
    />
  </svg>
);
