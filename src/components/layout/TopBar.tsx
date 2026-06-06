import Image from 'next/image'
import { useRouter } from 'next/navigation'
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

  return (
    <div className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <Image src="/icons/logo.webp" alt="Guess-History" width={120} height={32} className={styles.logoImg} priority />
      </div>
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
              <img src={avatarUrl} alt="" className={styles.avatarBtnImg} />
            )
            : <span className={styles.avatarBtnInitials}>{initials.slice(0,2)}</span>
          }
        </button>
      </div>
    </div>
  )
}
