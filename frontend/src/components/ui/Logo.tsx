import { useId } from 'react';

/** The Solace mark: a tapering ring and the small bright orb it orbits. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Solace OS logo">
      <defs>
        <linearGradient id={`${gid}-ring`} x1="10" y1="12" x2="56" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.04" />
        </linearGradient>
        <filter id={`${gid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      <circle cx="33" cy="33" r="23" fill="none" stroke={`url(#${gid}-ring)`} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="17" cy="17.5" r="6.5" fill="currentColor" opacity="0.55" filter={`url(#${gid}-glow)`} />
      <circle cx="17" cy="17.5" r="5.6" fill="currentColor" />
    </svg>
  );
}
