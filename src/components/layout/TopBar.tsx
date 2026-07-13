import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { rankForXp } from '@/core/rank'
import NotificationBell from '@/components/NotificationBell'
import styles from './TopBar.module.css'

interface TopBarProps {
  accuracy: string
  xp: string
  avatarUrl: string | null
  initials: string
  onAvatarClick: () => void
}

export default function TopBar({ accuracy, xp, avatarUrl, initials, onAvatarClick }: TopBarProps) {
  const router = useRouter()
  const t = useTranslations('landing')

  // Derive rank tier from xp string for the "Rank" badge.
  // xp may be "--" (loading) or a locale-formatted number like "32 500".
  const xpNum = Number(xp.replace(/[^\d]/g, ''))
  const tier = Number.isFinite(xpNum) && xpNum >= 0 ? rankForXp(xpNum).tier : 1

  return (
    <div className={styles.topbar}>
      <button className={styles.topbarLeft} onClick={() => router.push('/home')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <Image src="/icons/logo.webp" alt={t('logo_alt')} width={120} height={32} className={styles.logoImg} priority />
      </button>
      <div className={styles.xpPillCol}>
        <div className={styles.xpPill}>
          <span className={styles.xpPillBadge}>{t('rank_label')} {tier}</span>
          <span className={styles.xpPillAccuracy} style={(() => {
            const n = Number(accuracy)
            if (!Number.isFinite(n)) return undefined
            const hue = Math.round((Math.max(0, Math.min(100, n)) / 100) * 120)
            return { color: `hsl(${hue}, 100%, var(--gh-acc-lightness, 50%))` }
          })()}>{accuracy}<span className={styles.xpPillSuffix}>%</span></span>
        </div>
      </div>
      <div className={styles.topbarRight}>
        <NotificationBell />
        <button
          onClick={onAvatarClick}
          className={styles.avatarBtn}
        >
          {avatarUrl
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className={styles.avatarBtnImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget as HTMLImageElement).nextElementSibling?.removeAttribute("hidden"); }} />
            )
            : null
          }
          <span className={styles.avatarBtnInitials} style={{ display: avatarUrl ? "none" : "inline" }}>{initials.slice(0,2)}</span>
        </button>
      </div>
    </div>
  )
}
