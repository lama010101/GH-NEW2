import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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

  return (
    <div className={styles.topbar}>
      <button className={styles.topbarLeft} onClick={() => router.push('/home')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <Image src="/icons/logo.webp" alt={t('logo_alt')} width={120} height={32} className={styles.logoImg} priority />
      </button>
      <button
        onClick={() => router.push('/leaderboard?tab=overall')}
        className={styles.xpPill}
      >
        <span className={styles.xpPillAccuracy}>{accuracy}<span className={styles.xpPillSuffix}>%</span></span>
        <span className={styles.xpPillDivider}>|</span>
        <span className={styles.xpPillXp}>{xp}<span className={styles.xpPillSuffix}>XP</span></span>
      </button>
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
