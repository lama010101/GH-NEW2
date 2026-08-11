'use client';

import { useTranslations } from 'next-intl';
import homeStyles from '@/app/home/home.module.css';

const JOURNEY_GRADIENT = 'linear-gradient(135deg, #2d1060 0%, #5b21b6 50%, #7c3aed 100%)';

export function JourneyPanel({ onStart }: { onStart: () => void }) {
  const t = useTranslations();
  const title = t('home.journey_name');
  const desc = t('home.journey_desc');

  return (
    <div className={homeStyles['mode-card']}>
      <div className={homeStyles['card-bg']} style={{ background: JOURNEY_GRADIENT }}>
        <div className={homeStyles.cardInnerHorizontal}>
          <div className={homeStyles.cardIconThumb} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/levels_large.webp"
              alt=""
              className={homeStyles.cardIconThumbImg}
              draggable={false}
            />
          </div>

          <div className={homeStyles.cardTextCol}>
            <h2 className={homeStyles.cardTitleLeft}>{title}</h2>
            <p className={homeStyles.cardDescLeft}>
              {desc.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i < desc.split('\n').length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>

          <button
            type="button"
            className={homeStyles.playPill}
            onClick={onStart}
            aria-label={t('home.play_mode_aria', { mode: title })}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
            {t('home.compete_play')}
          </button>
        </div>
      </div>
    </div>
  );
}
