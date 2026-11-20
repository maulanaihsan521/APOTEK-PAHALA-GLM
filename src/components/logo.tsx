export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#087F6B" />
      <rect x="2" y="2" width="44" height="44" rx="10" fill="url(#lg)" />
      <defs>
        <linearGradient id="lg" x1="2" y1="2" x2="46" y2="46">
          <stop stopColor="#0E8A72" />
          <stop offset="1" stopColor="#0B5F52" />
        </linearGradient>
      </defs>
      <rect x="19.4" y="10" width="9.2" height="28" rx="3.2" fill="white" />
      <rect x="10" y="19.4" width="28" height="9.2" rx="3.2" fill="white" />
      <circle cx="36.5" cy="11.5" r="4.2" fill="#20B58A" />
      <path d="M36.5 7.9c1.9 1.2 3 3 3 4.9-1.9-.6-3.6-2.2-3-4.9Z" fill="#0B5F52" opacity="0.55" />
    </svg>
  );
}

export function LogoTitle({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={compact ? 36 : 44} />
      <div>
        <div className="font-bold text-white leading-tight text-[17px]">Apotek Pahala</div>
        <div className="text-[11px] text-emerald-100/80 leading-tight">Pharmacy Intelligence</div>
      </div>
    </div>
  );
}

/** Ilustrasi apotek sederhana untuk sapaan mobile */
export function ApotekArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 78" className={className} aria-hidden="true">
      <rect x="8" y="26" width="104" height="48" rx="6" fill="#FFFFFF" stroke="#E3EBEF" />
      <rect x="8" y="26" width="104" height="16" rx="6" fill="#087F6B" />
      <text x="60" y="38" textAnchor="middle" fontSize="10" fontWeight="700" fill="#FFFFFF" letterSpacing="2">APOTEK</text>
      <rect x="20" y="50" width="26" height="24" rx="3" fill="#20B58A" opacity="0.85" />
      <rect x="54" y="50" width="22" height="16" rx="3" fill="#F5F8FA" stroke="#E3EBEF" />
      <rect x="84" y="50" width="22" height="16" rx="3" fill="#F5F8FA" stroke="#E3EBEF" />
      <rect x="57" y="54" width="16" height="8" rx="2" fill="#087F6B" opacity="0.25" />
      <circle cx="104" cy="14" r="7" fill="#F2A93B" opacity="0.9" />
      <path d="M10 24c14-12 34-16 50-14" stroke="#5BD0A9" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
