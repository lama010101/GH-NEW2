export interface TopBarSymbolProps {
  title?: string;
}

/**
 * Flat white brand symbol (ring + 4 ticks + clock hand with orange tip) on a
 * 40x40 brand-purple tile. Used only in the signed-in top bar.
 * Purple comes from --gh-primary (mid-stop of the Journey gradient).
 * Negative vertical margin keeps the 40px tile from growing the 36px-tall bar.
 */
export default function TopBarSymbol({ title }: TopBarSymbolProps) {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        margin: "-2px 0",
        borderRadius: 11,
        background: "var(--gh-primary)",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 40 40"
        width={28}
        height={28}
        role={title ? "img" : undefined}
        aria-hidden={title ? undefined : true}
      >
        {title ? <title>{title}</title> : null}
        <circle cx="20" cy="20" r="15" fill="none" stroke="#fff" strokeWidth="3" />
        <g stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          <line x1="20" y1="8.5" x2="20" y2="11" />
          <line x1="20" y1="29" x2="20" y2="31.5" />
          <line x1="8.5" y1="20" x2="11" y2="20" />
          <line x1="29" y1="20" x2="31.5" y2="20" />
        </g>
        <line x1="20" y1="20" x2="26" y2="13.5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <line x1="23.6" y1="16.4" x2="26.6" y2="13" stroke="#FF8A1F" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="20" cy="20" r="2.4" fill="#fff" />
      </svg>
    </span>
  );
}
