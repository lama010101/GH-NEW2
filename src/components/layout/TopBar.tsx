import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Menu } from 'lucide-react'
import { rankForXp } from '@/core/rank'
import { getAccuracyColor } from '@/core/accuracyColor'
import { useIdentity } from '@/hooks/useIdentity'
import NotificationBell from '@/components/NotificationBell'
import PlayerAvatar from '@/components/compete/PlayerAvatar'
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
  const { playerId } = useIdentity()
  const [imgError, setImgError] = useState(false)
  useEffect(() => { setImgError(false) }, [avatarUrl])

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
          <span className={styles.xpPillAccuracy} style={{ color: getAccuracyColor(Number(accuracy)) }}>{accuracy}<span className={styles.xpPillSuffix}>%</span></span>
        </div>
      </div>
      <div className={styles.topbarRight}>
        <NotificationBell />
        <div className={styles.avatarBtn}>
          <PlayerAvatar
            avatarUrl={avatarUrl && !imgError ? avatarUrl : null}
            displayName={initials}
            playerId={playerId ?? undefined}
            size={36}
            initials={initials.slice(0, 2)}
            disableProfileNavigation={!playerId}
          />
        </div>
        <button
          onClick={onAvatarClick}
          className={styles.menuBtn}
          aria-label="Menu"
          type="button"
        >
          <Menu size={20} />
        </button>
      </div>
    </div>
  )
}
