"use client";

// ============================================================================
// STANDALONE PROTOTYPE — Home page (grid variant C, i18n + RTL)
// Route: /prototype/home-grid   (direct access, fully self-contained)
//
// Variant C of the home page mode cards where:
//   1. The compete card spans full width on top (row 1) and contains the
//      same CompetePanel (3-tab mini-card + JOIN GAME / CREATE GAME buttons)
//      as the first prototype. A decorative mode icon watermark sits in the
//      top-right corner (top-left in RTL).
//   2. The 3 non-compete cards (daily / levelup / practice) are compact
//      vertical cards arranged in a grid: daily + levelup side by side in
//      row 2 (2 columns), practice full width in row 3. Each card has the
//      mode icon at the TOP center (56x56px in a semi-transparent circle),
//      title below the icon (centered), description below the title
//      (centered, 2-line clamp), and a small "PLAY" pill button at the
//      bottom center. The daily card also has a timer box below the desc.
//   3. A language selector at the top lets you switch between all 11 prod
//      locales (en, fr, es, de, it, pt, nl, ru, ja, zh, ar). Arabic (ar)
//      flips the whole UI to right-to-left (dir="rtl").
//   4. The compete card mirrors prod CompetePanel: JOIN GAME (outline,
//      toggles a join-code input) + CREATE GAME (solid).
//
// All translations are copied verbatim from src/i18n/<locale>.json
// (home.*_desc, home.*_name, home.tagline, home.compete_*). No app imports.
// ============================================================================

import { useEffect, useState } from "react";
import styles from "./home.module.css";

// ── Inline icons (mirror prod CompetePanel PeopleIcon / PlusIcon) ──
function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── Locale model (mirrors src/i18n/config.ts) ──
type Locale = "en" | "fr" | "es" | "de" | "it" | "pt" | "nl" | "ru" | "ja" | "zh" | "ar";

const LOCALES: Locale[] = ["en", "fr", "es", "de", "it", "pt", "nl", "ru", "ja", "zh", "ar"];

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

const LOCALE_META: Record<Locale, { label: string; flag: string }> = {
  en: { label: "English",         flag: "🇬🇧" },
  fr: { label: "Français",        flag: "🇫🇷" },
  es: { label: "Español",         flag: "🇪🇸" },
  de: { label: "Deutsch",         flag: "🇩🇪" },
  it: { label: "Italiano",        flag: "🇮🇹" },
  pt: { label: "Português (BR)",  flag: "🇧🇷" },
  nl: { label: "Nederlands",      flag: "🇳🇱" },
  ru: { label: "Русский",         flag: "🇷🇺" },
  ja: { label: "日本語",           flag: "🇯🇵" },
  zh: { label: "中文",             flag: "🇨🇳" },
  ar: { label: "العربية",          flag: "🇸🇦" },
};

// ── Mock profile data ──
const PROFILE = {
  displayName: "Alex Rivera",
  initials: "AR",
  level: 14,
  levelProgress: 0.62, // 62% to next level
  avgAccuracy: 87,
};

// ── Mode card metadata (mirrors prod home/types.ts) ──
type Mode = "compete" | "daily" | "levelup" | "practice";

const MODE_GRADIENT: Record<Mode, string> = {
  compete:  "linear-gradient(135deg, #0369a1 0%, #0891b2 40%, #22d3ee 100%)",
  daily:    "linear-gradient(135deg, #7a0a0a 0%, #b01010 50%, #c81818 100%)",
  levelup:  "linear-gradient(135deg, #2d1060 0%, #5b21b6 50%, #7c3aed 100%)",
  practice: "linear-gradient(135deg, #7c3008 0%, #c05010 50%, #ea6820 100%)",
};

const MODE_ICON: Record<Mode, string> = {
  compete:  "/icons/compete_large.webp",
  daily:    "/icons/daily_large.webp",
  levelup:  "/icons/levels_large.webp",
  practice: "/icons/practice_large.webp",
};

const MODE_ORDER: Mode[] = ["compete", "daily", "levelup", "practice"];

// ── Translations (copied verbatim from src/i18n/<locale>.json) ──
type Strings = {
  tagline: string;
  compete_name: string;
  daily_name: string;
  levelup_name: string;
  practice_name: string;
  compete_desc: string;
  daily_desc: string;
  levelup_desc: string;
  practice_desc: string;
  compete_join_game: string;
  compete_create_game: string;
  compete_go: string;
  compete_code_placeholder: string;
  new_challenge: string;
  compete_tab_invitations: string;
  compete_tab_your_turn: string;
  compete_tab_completed: string;
  compete_no_invitations: string;
  compete_no_your_turn: string;
  compete_no_completed: string;
  compete_invite_sent: string;
  compete_invite_meta: string;
  compete_mode_rush: string;
  compete_mode_relax: string;
  compete_round_label: string;
  compete_play: string;
  compete_win: string;
  compete_loss: string;
  compete_draw: string;
  compete_completed: string;
  compete_xp_unit: string;
};

const STRINGS: Record<Locale, Strings> = {
  en: {
    tagline: "Where and when did it happen?",
    compete_name: "CHALLENGE",
    daily_name: "DAILY",
    levelup_name: "LEVEL UP",
    practice_name: "PRACTICE",
    compete_desc: "Play against your friends.\nReal-time or Turn-based",
    daily_desc: "New competition every day,\nSame events for everyone.",
    levelup_desc: "Progressive difficulty\nClimb the leaderboard",
    practice_desc: "Hone your skills solo\nUnlimited custom games.",
    compete_join_game: "JOIN GAME",
    compete_create_game: "CREATE GAME",
    compete_go: "Go to Lobby",
    compete_code_placeholder: "Enter code",
    new_challenge: "New challenge",
    compete_tab_invitations: "INVITATIONS",
    compete_tab_your_turn: "YOUR TURN",
    compete_tab_completed: "COMPLETED",
    compete_no_invitations: "No pending invitations",
    compete_no_your_turn: "No games waiting for your turn",
    compete_no_completed: "No completed games yet",
    compete_invite_sent: "sent {time}",
    compete_invite_meta: "{mode} · sent {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Round {current} / {total}",
    compete_play: "PLAY",
    compete_win: "W",
    compete_loss: "L",
    compete_draw: "D",
    compete_completed: "Completed",
    compete_xp_unit: "XP",
  },
  fr: {
    tagline: "Où et quand cela s'est-il passé ?",
    compete_name: "DÉFI",
    daily_name: "QUOTIDIEN",
    levelup_name: "PROGRESSION",
    practice_name: "ENTRAÎNEMENT",
    compete_desc: "Jouez contre vos amis.\nTemps réel ou par tour.",
    daily_desc: "Une nouvelle compétition chaque jour,\nLes mêmes événements pour tous.",
    levelup_desc: "Difficulté progressive\nGrimpez au classement.",
    practice_desc: "Perfectionnez-vous en solo\nParties personnalisées illimitées.",
    compete_join_game: "REJOINDRE",
    compete_create_game: "CRÉER",
    compete_go: "Aller au salon",
    compete_code_placeholder: "Entrer le code",
    new_challenge: "Nouveau défi",
    compete_tab_invitations: "INVITATIONS",
    compete_tab_your_turn: "VOTRE TOUR",
    compete_tab_completed: "TERMINÉ",
    compete_no_invitations: "Aucune invitation en attente",
    compete_no_your_turn: "Aucune partie en attente",
    compete_no_completed: "Aucune partie terminée",
    compete_invite_sent: "envoyé {time}",
    compete_invite_meta: "{mode} · envoyé {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Manche {current} / {total}",
    compete_play: "JOUER",
    compete_win: "G",
    compete_loss: "P",
    compete_draw: "N",
    compete_completed: "Terminé",
    compete_xp_unit: "XP",
  },
  es: {
    tagline: "¿Dónde y cuándo ocurrió?",
    compete_name: "DESAFÍO",
    daily_name: "DIARIO",
    levelup_name: "SUBIR NIVEL",
    practice_name: "PRÁCTICA",
    compete_desc: "Juega contra tus amigos.\nTiempo real o por turnos.",
    daily_desc: "Nueva competición cada día,\nLos mismos eventos para todos.",
    levelup_desc: "Dificultad progresiva\nSube en la clasificación.",
    practice_desc: "Mejora tus habilidades en solitario\nPartidas personalizadas ilimitadas.",
    compete_join_game: "UNIRSE",
    compete_create_game: "CREAR PARTIDA",
    compete_go: "Ir a la sala",
    compete_code_placeholder: "Introduce código",
    new_challenge: "Nuevo reto",
    compete_tab_invitations: "INVITACIONES",
    compete_tab_your_turn: "TU TURNO",
    compete_tab_completed: "COMPLETADAS",
    compete_no_invitations: "Sin invitaciones pendientes",
    compete_no_your_turn: "Sin partidas esperando tu turno",
    compete_no_completed: "Sin partidas completadas",
    compete_invite_sent: "enviado {time}",
    compete_invite_meta: "{mode} · enviado {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Ronda {current} / {total}",
    compete_play: "JUGAR",
    compete_win: "G",
    compete_loss: "P",
    compete_draw: "E",
    compete_completed: "Completada",
    compete_xp_unit: "XP",
  },
  de: {
    tagline: "Wo und wann ist es passiert?",
    compete_name: "WETTSTREIT",
    daily_name: "TÄGLICH",
    levelup_name: "LEVEL",
    practice_name: "ÜBUNG",
    compete_desc: "Spiele gegen deine Freunde.\nEchtzeit oder rundenbasiert.",
    daily_desc: "Jeden Tag ein neuer Wettbewerb,\nGleiche Ereignisse für alle.",
    levelup_desc: "Progressive Schwierigkeit\nSteige in der Bestenliste auf.",
    practice_desc: "Verbessere deine Fähigkeiten solo\nUnbegrenzte individuelle Spiele.",
    compete_join_game: "BEITRETEN",
    compete_create_game: "SPIEL ERSTELLEN",
    compete_go: "Zur Lobby",
    compete_code_placeholder: "Code eingeben",
    new_challenge: "Neue Herausforderung",
    compete_tab_invitations: "EINLADUNGEN",
    compete_tab_your_turn: "DEIN ZUG",
    compete_tab_completed: "ABGESCHLOSSEN",
    compete_no_invitations: "Keine ausstehenden Einladungen",
    compete_no_your_turn: "Keine Spiele warten auf deinen Zug",
    compete_no_completed: "Noch keine abgeschlossenen Spiele",
    compete_invite_sent: "gesendet {time}",
    compete_invite_meta: "{mode} · gesendet {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Runde {current} / {total}",
    compete_play: "SPIELEN",
    compete_win: "S",
    compete_loss: "N",
    compete_draw: "U",
    compete_completed: "Abgeschlossen",
    compete_xp_unit: "XP",
  },
  it: {
    tagline: "Dove e quando è successo?",
    compete_name: "SFIDA",
    daily_name: "QUOTIDIANA",
    levelup_name: "SALÌ DI LIVELLO",
    practice_name: "ALLENAMENTO",
    compete_desc: "Gioca contro i tuoi amici.\nTempo reale o a turni.",
    daily_desc: "Una nuova competizione ogni giorno,\nGli stessi eventi per tutti.",
    levelup_desc: "Difficoltà progressiva\nScala la classifica.",
    practice_desc: "Affina le abilità da solo\nPartite personalizzate illimitate.",
    compete_join_game: "ENTRA IN PARTITA",
    compete_create_game: "CREA PARTITA",
    compete_go: "Vai alla sala",
    compete_code_placeholder: "Inserisci codice",
    new_challenge: "Nuova sfida",
    compete_tab_invitations: "INVITI",
    compete_tab_your_turn: "IL TUO TURNO",
    compete_tab_completed: "COMPLETATE",
    compete_no_invitations: "Nessun invito in sospeso",
    compete_no_your_turn: "Nessuna partita in attesa del tuo turno",
    compete_no_completed: "Nessuna partita completata",
    compete_invite_sent: "inviato {time}",
    compete_invite_meta: "{mode} · inviato {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Round {current} / {total}",
    compete_play: "GIOCA",
    compete_win: "V",
    compete_loss: "P",
    compete_draw: "N",
    compete_completed: "Completata",
    compete_xp_unit: "XP",
  },
  pt: {
    tagline: "Onde e quando aconteceu?",
    compete_name: "DESAFIO",
    daily_name: "DIÁRIO",
    levelup_name: "SUBIR NÍVEL",
    practice_name: "PRÁTICA",
    compete_desc: "Jogue contra seus amigos.\nTempo real ou por turnos.",
    daily_desc: "Nova competição todo dia,\nOs mesmos eventos para todos.",
    levelup_desc: "Dificuldade progressiva\nSuba no ranking.",
    practice_desc: "Aprimore suas habilidades solo\nPartidas personalizadas ilimitadas.",
    compete_join_game: "ENTRAR",
    compete_create_game: "CRIAR PARTIDA",
    compete_go: "Ir para a sala",
    compete_code_placeholder: "Digite o código",
    new_challenge: "Novo desafio",
    compete_tab_invitations: "CONVITES",
    compete_tab_your_turn: "SUA VEZ",
    compete_tab_completed: "CONCLUÍDAS",
    compete_no_invitations: "Sem convites pendentes",
    compete_no_your_turn: "Sem partidas aguardando sua vez",
    compete_no_completed: "Sem partidas concluídas",
    compete_invite_sent: "enviado {time}",
    compete_invite_meta: "{mode} · enviado {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Rodada {current} / {total}",
    compete_play: "JOGAR",
    compete_win: "V",
    compete_loss: "D",
    compete_draw: "E",
    compete_completed: "Concluída",
    compete_xp_unit: "XP",
  },
  nl: {
    tagline: "Waar en wanneer gebeurde het?",
    compete_name: "CHALLENGE",
    daily_name: "DAGELIJKS",
    levelup_name: "LEVEL UP",
    practice_name: "OEFENEN",
    compete_desc: "Speel tegen je vrienden.\nReal-time of beurt-gebaseerd.",
    daily_desc: "Elke dag een nieuwe wedstrijd,\nDezelfde events voor iedereen.",
    levelup_desc: "Progressieve moeilijkheid\nBeklim de ranglijst.",
    practice_desc: "Slijp je vaardigheden solo\nOnbeperkte aangepaste spellen.",
    compete_join_game: "TREDEN TOE",
    compete_create_game: "MAAK SPEL",
    compete_go: "Naar lobby",
    compete_code_placeholder: "Voer code in",
    new_challenge: "Nieuwe uitdaging",
    compete_tab_invitations: "UITNODIGINGEN",
    compete_tab_your_turn: "JOUW BEURT",
    compete_tab_completed: "VOLTOOID",
    compete_no_invitations: "Geen openstaande uitnodigingen",
    compete_no_your_turn: "Geen spellen wachten op je beurt",
    compete_no_completed: "Nog geen voltooide spellen",
    compete_invite_sent: "verzonden {time}",
    compete_invite_meta: "{mode} · verzonden {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Ronde {current} / {total}",
    compete_play: "SPEEL",
    compete_win: "W",
    compete_loss: "V",
    compete_draw: "G",
    compete_completed: "Voltooid",
    compete_xp_unit: "XP",
  },
  ru: {
    tagline: "Где и когда это произошло?",
    compete_name: "ВЫЗОВ",
    daily_name: "ЕЖЕДНЕВНО",
    levelup_name: "УРОВЕНЬ",
    practice_name: "ПРАКТИКА",
    compete_desc: "Играйте против друзей.\nРеальное время или по ходам.",
    daily_desc: "Новое соревнование каждый день,\nОдинаковые события для всех.",
    levelup_desc: "Прогрессивная сложность\nПоднимайтесь в рейтинге.",
    practice_desc: "Тренируйтесь самостоятельно\nНеограниченные пользовательские игры.",
    compete_join_game: "ВОЙТИ",
    compete_create_game: "СОЗДАТЬ ИГРУ",
    compete_go: "В лобби",
    compete_code_placeholder: "Введите код",
    new_challenge: "Новый вызов",
    compete_tab_invitations: "ПРИГЛАШЕНИЯ",
    compete_tab_your_turn: "ВАШ ХОД",
    compete_tab_completed: "ЗАВЕРШЕНО",
    compete_no_invitations: "Нет ожидающих приглашений",
    compete_no_your_turn: "Нет игр, ожидающих вашего хода",
    compete_no_completed: "Нет завершённых игр",
    compete_invite_sent: "отправлено {time}",
    compete_invite_meta: "{mode} · отправлено {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "Раунд {current} / {total}",
    compete_play: "ИГРАТЬ",
    compete_win: "П",
    compete_loss: "В",
    compete_draw: "Н",
    compete_completed: "Завершено",
    compete_xp_unit: "XP",
  },
  ja: {
    tagline: "どこで、いつ起きた？",
    compete_name: "チャレンジ",
    daily_name: "デイリー",
    levelup_name: "レベルアップ",
    practice_name: "練習",
    compete_desc: "フレンドと対戦。\nリアルタイムまたはターン制。",
    daily_desc: "毎日新しい競技、\n全員に同じイベント。",
    levelup_desc: "段階的難易度\nランキングを登る。",
    practice_desc: "ソロでスキル向上\n無制限のカスタムゲーム。",
    compete_join_game: "参加",
    compete_create_game: "ゲーム作成",
    compete_go: "ロビーへ",
    compete_code_placeholder: "コード入力",
    new_challenge: "新しいチャレンジ",
    compete_tab_invitations: "招待",
    compete_tab_your_turn: "あなたのターン",
    compete_tab_completed: "完了",
    compete_no_invitations: "保留中の招待はありません",
    compete_no_your_turn: "あなたのターンのゲームはありません",
    compete_no_completed: "完了したゲームはまだありません",
    compete_invite_sent: "送信 {time}",
    compete_invite_meta: "{mode} · 送信 {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "ラウンド {current} / {total}",
    compete_play: "プレイ",
    compete_win: "勝",
    compete_loss: "負",
    compete_draw: "分",
    compete_completed: "完了",
    compete_xp_unit: "XP",
  },
  zh: {
    tagline: "它发生在哪里，何时？",
    compete_name: "挑战",
    daily_name: "每日",
    levelup_name: "升级",
    practice_name: "练习",
    compete_desc: "与好友对战。\n实时或回合制。",
    daily_desc: "每天新竞赛，\n所有人相同的事件。",
    levelup_desc: "渐进式难度\n攀登排行榜。",
    practice_desc: "独自练习提升技能\n无限自定义游戏。",
    compete_join_game: "加入游戏",
    compete_create_game: "创建游戏",
    compete_go: "进入大厅",
    compete_code_placeholder: "输入代码",
    new_challenge: "新挑战",
    compete_tab_invitations: "邀请",
    compete_tab_your_turn: "你的回合",
    compete_tab_completed: "已结束",
    compete_no_invitations: "没有待处理的邀请",
    compete_no_your_turn: "没有等待你的回合的游戏",
    compete_no_completed: "还没有已结束的游戏",
    compete_invite_sent: "发送于 {time}",
    compete_invite_meta: "{mode} · 发送于 {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "第 {current} / {total} 回合",
    compete_play: "开始",
    compete_win: "胜",
    compete_loss: "负",
    compete_draw: "平",
    compete_completed: "已结束",
    compete_xp_unit: "经验值",
  },
  ar: {
    tagline: "أين ومتى حدث؟",
    compete_name: "تحدي",
    daily_name: "يومي",
    levelup_name: "تطوّر المستوى",
    practice_name: "تدريب",
    compete_desc: "العب ضد أصدقاءك.\nفوري أو بالتناوب.",
    daily_desc: "مسابقة جديدة كل يوم،\nنفس الأحداث للجميع.",
    levelup_desc: "صعوبة تصاعدية\nاصعد لوحة المتصدرين.",
    practice_desc: "صق مهاراتك فردياً\nألعاب مخصصة غير محدودة.",
    compete_join_game: "انضم للعبة",
    compete_create_game: "أنشئ لعبة",
    compete_go: "اذهب إلى الردة",
    compete_code_placeholder: "أدخل الرمز",
    new_challenge: "تحدي جديد",
    compete_tab_invitations: "دعوات",
    compete_tab_your_turn: "دورك",
    compete_tab_completed: "مكتملة",
    compete_no_invitations: "لا توجد دعوات معلّقة",
    compete_no_your_turn: "لا توجد ألعاب بانتظار دورك",
    compete_no_completed: "لا توجد ألعاب مكتملة بعد",
    compete_invite_sent: "أُرسلت {time}",
    compete_invite_meta: "{mode} · أُرسلت {time}",
    compete_mode_rush: "Rush",
    compete_mode_relax: "Relax",
    compete_round_label: "الجولة {current} / {total}",
    compete_play: "العب",
    compete_win: "ف",
    compete_loss: "خ",
    compete_draw: "ت",
    compete_completed: "مكتملة",
    compete_xp_unit: "نقطة",
  },
};

function modeTitle(mode: Mode, s: Strings): string {
  switch (mode) {
    case "compete":  return s.compete_name;
    case "daily":    return s.daily_name;
    case "levelup":  return s.levelup_name;
    case "practice": return s.practice_name;
  }
}

function modeDesc(mode: Mode, s: Strings): string {
  switch (mode) {
    case "compete":  return s.compete_desc;
    case "daily":    return s.daily_desc;
    case "levelup":  return s.levelup_desc;
    case "practice": return s.practice_desc;
  }
}

// ── Daily countdown (mock, updates every minute) ──
function useDailyCountdown(): string {
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const midnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      );
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);
  return countdown;
}

// ── Mock compete data (mirrors prod CompetePanel data shape) ──
type MockInvite = {
  id: string;
  inviter_name: string;
  mode: "sync" | "async";
  created_at: string;
};
type MockGame = {
  id: string;
  opponent_name: string;
  round_current: number;
  round_total: number;
  mode: "sync" | "async";
  status: "your_turn" | "completed";
  score_you?: number;
  score_them?: number;
  accuracy_you?: number;
};

const MOCK_INVITES: MockInvite[] = [
  { id: "i1", inviter_name: "Maria S.", mode: "sync", created_at: new Date(Date.now() - 5 * 60000).toISOString() },
  { id: "i2", inviter_name: "Kenji T.", mode: "async", created_at: new Date(Date.now() - 2 * 3600000).toISOString() },
];

const MOCK_GAMES: MockGame[] = [
  { id: "g1", opponent_name: "Sofia L.", round_current: 3, round_total: 5, mode: "async", status: "your_turn" },
  { id: "g2", opponent_name: "James B.", round_current: 1, round_total: 5, mode: "sync", status: "your_turn" },
  { id: "g3", opponent_name: "Yuki N.", round_current: 5, round_total: 5, mode: "async", status: "completed", score_you: 3, score_them: 2, accuracy_you: 84 },
  { id: "g4", opponent_name: "Omar K.", round_current: 5, round_total: 5, mode: "sync", status: "completed", score_you: 1, score_them: 4, accuracy_you: 52 },
];

function timeAgoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

function accColor(pct: number): string {
  if (pct >= 85) return "var(--gh-success)";
  if (pct >= 60) return "var(--gh-gold)";
  if (pct >= 40) return "var(--gh-orange)";
  return "var(--gh-danger)";
}

// ── Compete panel (mirrors prod CompetePanel: tabs + content + CTA row) ──
function CompetePanel({ s }: { s: Strings }) {
  const [tab, setTab] = useState<"invitations" | "your_turn" | "completed">("invitations");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [code, setCode] = useState("");

  const yourTurn = MOCK_GAMES.filter((g) => g.status === "your_turn");
  const completed = MOCK_GAMES.filter((g) => g.status === "completed");

  const tabs: Array<{ key: typeof tab; label: string; count: number }> = [
    { key: "invitations", label: s.compete_tab_invitations, count: MOCK_INVITES.length },
    { key: "your_turn", label: s.compete_tab_your_turn, count: yourTurn.length },
    { key: "completed", label: s.compete_tab_completed, count: completed.length },
  ];

  return (
    <>
      {/* Tab bar + content */}
      <div className={styles.cardSubPanel}>
        <div className={styles.tabBar}>
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`${styles.tab} ${tab === tb.key ? styles.tabActive : ""}`}
            >
              {tb.label}
              {tb.count > 0 && <span className={styles.tabBadge}>{tb.count}</span>}
            </button>
          ))}
        </div>

        {/* Invitations tab */}
        {tab === "invitations" &&
          (MOCK_INVITES.length === 0 ? (
            <div className={styles.emptyState}>{s.compete_no_invitations}</div>
          ) : (
            <div className={styles.gameList}>
              {MOCK_INVITES.map((inv) => (
                <div key={inv.id} className={styles.gameRow}>
                  <div className={styles.avatarFallback}>
                    {inv.inviter_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.gameInfo}>
                    <span className={styles.gameName}>{inv.inviter_name}</span>
                    <span className={styles.gameSub}>
                      {fillTemplate(s.compete_invite_meta, {
                        mode: inv.mode === "sync" ? s.compete_mode_rush : s.compete_mode_relax,
                        time: timeAgoLabel(inv.created_at),
                      })}
                    </span>
                  </div>
                  <button type="button" className={styles.declineBtn}>✕</button>
                </div>
              ))}
            </div>
          ))}

        {/* Your Turn tab */}
        {tab === "your_turn" &&
          (yourTurn.length === 0 ? (
            <div className={styles.emptyStateCenter}>{s.compete_no_your_turn}</div>
          ) : (
            <div className={styles.gameList}>
              {yourTurn.map((g) => (
                <div key={g.id} className={styles.gameRow}>
                  <div className={styles.avatarFallback}>
                    {g.opponent_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.gameInfo}>
                    <span className={styles.gameName}>{g.opponent_name}</span>
                    <span className={styles.gameSub}>
                      {fillTemplate(s.compete_round_label, {
                        current: String(g.round_current),
                        total: String(g.round_total),
                      })}
                    </span>
                  </div>
                  <span className={styles.modeBadge}>
                    {g.mode === "sync" ? s.compete_mode_rush : s.compete_mode_relax}
                  </span>
                  <span className={styles.playBadge}>{s.compete_play}</span>
                </div>
              ))}
            </div>
          ))}

        {/* Completed tab */}
        {tab === "completed" &&
          (completed.length === 0 ? (
            <div className={styles.emptyStateCenter}>{s.compete_no_completed}</div>
          ) : (
            <div className={styles.gameList}>
              {completed.map((g) => (
                <div key={g.id} className={styles.gameRow}>
                  <div className={styles.avatarFallback}>
                    {g.opponent_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className={styles.gameInfo}>
                    <span className={styles.gameName}>{g.opponent_name}</span>
                    <span className={styles.gameSub}>
                      {fillTemplate(s.compete_round_label, {
                        current: String(g.round_current),
                        total: String(g.round_total),
                      })}
                    </span>
                  </div>
                  <div className={styles.scoreWrap}>
                    {g.score_you != null && g.score_them != null ? (
                      <>
                        <span
                          className={`${styles.resultBadge} ${
                            g.score_you > g.score_them
                              ? styles.resultWin
                              : g.score_you < g.score_them
                              ? styles.resultLoss
                              : styles.resultDraw
                          }`}
                        >
                          {g.score_you > g.score_them
                            ? s.compete_win
                            : g.score_you < g.score_them
                            ? s.compete_loss
                            : s.compete_draw}
                        </span>
                        <span className={styles.accuracyValue} style={{ color: accColor(g.accuracy_you ?? 0) }}>
                          {g.accuracy_you ?? 0}
                        </span>
                        <span className={styles.xpValue}>
                          {g.score_you} {s.compete_xp_unit}
                        </span>
                      </>
                    ) : (
                      <span className={styles.completedLabel}>{s.compete_completed}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      {/* Join code input */}
      {showJoinInput && (
        <input
          value={code}
          onChange={(e) =>
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
          }
          placeholder={s.compete_code_placeholder}
          maxLength={6}
          className={styles.joinCodeInput}
          autoFocus
        />
      )}

      {/* CTA buttons */}
      <div className={styles.cardCtaRow}>
        <button
          type="button"
          onClick={() => setShowJoinInput((v) => !v)}
          disabled={showJoinInput && !code}
          className={`${styles.cardCtaBtn} ${styles.cardCtaBtnOutline}`}
        >
          <PeopleIcon /> {showJoinInput ? s.compete_go : s.compete_join_game}
        </button>
        <button
          type="button"
          className={`${styles.cardCtaBtn} ${styles.cardCtaBtnBlue}`}
        >
          <PlusIcon /> {s.compete_create_game}
        </button>
      </div>
    </>
  );
}

// ── Mode card (grid variant C) ──
// Compete card: full-width, horizontal layout with CompetePanel inside.
// Non-compete cards: compact vertical cards (icon top center, title, desc,
// optional timer, PLAY pill at bottom).
function ModeCard({ mode, s, rtl }: { mode: Mode; s: Strings; rtl: boolean }) {
  const countdown = useDailyCountdown();
  const gradient = MODE_GRADIENT[mode];
  const title = modeTitle(mode, s);
  const desc = modeDesc(mode, s);
  const iconSrc = MODE_ICON[mode];
  const isCompete = mode === "compete";

  if (isCompete) {
    return (
      <div className={styles.modeCard}>
        <div className={styles.cardBg} style={{ background: gradient }}>
          {/* Compete card: mode icon as a background watermark (top-right
              corner) — purely decorative, does NOT affect content layout. */}
          <div className={styles.competeIconBg} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconSrc}
              alt=""
              className={styles.competeIconBgImg}
              draggable={false}
            />
          </div>

          <div className={`${styles.cardInner} ${styles.cardInnerFull}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleSection}>
                <h2 className={styles.cardTitle}>{title}</h2>
                <div className={styles.cardDescWrap}>
                  <p className={styles.cardDesc}>
                    {desc.split("\n").map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < desc.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </div>

            {/* Compete card: full panel mirroring prod CompetePanel
                (tabs + content + join code + CTA row) */}
            <CompetePanel s={s} />
          </div>
        </div>
      </div>
    );
  }

  // Non-compete card: compact vertical card
  return (
    <div className={styles.modeCard}>
      <div className={styles.cardBg} style={{ background: gradient }}>
        <div className={styles.cardInnerVertical}>
          {/* Icon at top center (56x56px in a semi-transparent circle) */}
          <button
            type="button"
            aria-label={`Play ${title}`}
            className={styles.cardIconCircle}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={iconSrc}
              alt=""
              className={styles.cardIconCircleImg}
              draggable={false}
            />
          </button>

          {/* Title below the icon (centered) */}
          <h2 className={styles.cardTitleCenter}>{title}</h2>

          {/* Description below the title (centered, 2-line clamp) */}
          <p className={styles.cardDescCenter}>
            {desc.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i < desc.split("\n").length - 1 && <br />}
              </span>
            ))}
          </p>

          {/* Daily card: timer box below the description */}
          {mode === "daily" && (
            <div className={styles.timerBoxCenter}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" />
                <path
                  d="M12 7v5l3 3"
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <span className={styles.timerLabel}>
                {s.new_challenge} <span className={styles.timerCountdown}>{countdown}</span>
              </span>
            </div>
          )}

          {/* Small "PLAY" pill button at the bottom center */}
          <button type="button" className={styles.playPill} aria-label={`Play ${title}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {rtl ? (
                <path d="M16 5v14L5 12z" fill="currentColor" />
              ) : (
                <path d="M8 5v14l11-7z" fill="currentColor" />
              )}
            </svg>
            {s.compete_play}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Language selector (top bar) ──
function LanguageSelector({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.langSelector}>
      <button
        type="button"
        className={styles.langBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.langFlag}>{LOCALE_META[locale].flag}</span>
        <span className={styles.langLabel}>{LOCALE_META[locale].label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className={styles.langBackdrop} onClick={() => setOpen(false)} />
          <ul className={styles.langMenu} role="listbox">
            {LOCALES.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  role="option"
                  aria-selected={l === locale}
                  className={`${styles.langOption} ${l === locale ? styles.langOptionActive : ""}`}
                  onClick={() => {
                    onChange(l);
                    setOpen(false);
                  }}
                >
                  <span className={styles.langFlag}>{LOCALE_META[l].flag}</span>
                  <span className={styles.langLabel}>{LOCALE_META[l].label}</span>
                  {l === locale && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function HomeIconBgPrototypePage() {
  const [locale, setLocale] = useState<Locale>("en");
  const rtl = RTL_LOCALES.has(locale);
  const s = STRINGS[locale];

  return (
    <>
      <style jsx global>{`
        html, body { margin: 0; padding: 0; background: #080c14; }
      `}</style>
      <main className={styles.screen} dir={rtl ? "rtl" : "ltr"}>
        {/* Proto bar */}
        <div className={styles.protoBar}>
          <span className={styles.protoTitle}>Home — Grid Variant (C)</span>
          <div className={styles.protoLinks}>
            <a href="/prototype/home-icon-bg" className={styles.protoLink}>A: Icon BG</a>
            <a href="/prototype/home-list" className={styles.protoLink}>B: List</a>
          </div>
          <span className={styles.protoHint}>Mock data · {rtl ? "RTL" : "LTR"}</span>
        </div>

        {/* Background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home_background.webp" alt="" className={styles.bgImg} draggable={false} />
        <div className={styles.bgScrim} />

        {/* Top bar (inline, simplified) */}
        <div className={styles.topbar}>
          <button className={styles.topbarLogo} type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/logo.webp" alt="logo" width={120} height={32} className={styles.topbarLogoImg} />
          </button>
          <div className={styles.levelPill}>
            <span className={styles.levelPillBadge}>LV {PROFILE.level}</span>
            <div className={styles.levelPillBar}>
              <div
                className={styles.levelPillBarFill}
                style={{ width: `${PROFILE.levelProgress * 100}%` }}
              />
            </div>
            <span className={styles.levelPillAcc}>
              {PROFILE.avgAccuracy}
              <span className={styles.levelPillAccSuffix}>%</span>
            </span>
          </div>
          <div className={styles.topbarRight}>
            <LanguageSelector locale={locale} onChange={setLocale} />
            <button className={styles.avatarBtn} type="button">
              <span className={styles.avatarInitials}>{PROFILE.initials}</span>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.scroll}>
          <div className={styles.content}>
            {/* Tagline */}
            <div className={styles.tagline}>{s.tagline}</div>

            {/* Mode cards */}
            <div className={styles.cardsStack}>
              {MODE_ORDER.map((mode) => (
                <ModeCard key={mode} mode={mode} s={s} rtl={rtl} />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
