import clsx from 'clsx'

type BrandLogoProps = {
  variant?: 'mark' | 'horizontal'
  className?: string
}

export default function BrandLogo({ variant = 'horizontal', className }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label="ZeroTouch Orchestrator"
        className={clsx('brand-logo', className)}
      >
        <rect width="120" height="120" rx="28" fill="currentColor" opacity="0.08" />
        <rect x="50" y="10" width="24" height="96" rx="12" fill="currentColor" transform="rotate(45 62 58)" />
        <rect x="50" y="10" width="24" height="96" rx="12" fill="currentColor" transform="rotate(-45 62 58)" />
        <circle cx="60" cy="60" r="10" fill="#14B8A6" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="20 20 530 104"
      role="img"
      aria-label="ZeroTouch Enterprise Orchestrator"
      className={clsx('brand-logo', className)}
    >
      <g transform="translate(20,20) scale(0.6)">
        <rect x="80" y="20" width="40" height="160" rx="20" fill="currentColor" transform="rotate(45 100 100)" />
        <rect x="80" y="20" width="40" height="160" rx="20" fill="currentColor" transform="rotate(-45 100 100)" />
        <circle cx="100" cy="100" r="16" fill="#14B8A6" />
      </g>
      <text x="160" y="88" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="46" fontWeight="700" fill="currentColor">zerotouch</text>
      <text x="162" y="112" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="15" fontWeight="500" letterSpacing="3" fill="currentColor" opacity="0.72">ENTERPRISE ORCHESTRATOR</text>
    </svg>
  )
}
