export default function ProfileLoading() {
  return (
    <div className="min-h-screen pb-[60px] relative bg-[var(--gh-bg-base)]">
      {/* Hero background skeleton */}
      <div className="absolute top-0 left-0 right-0 h-[280px] bg-[var(--gh-bg-elevated)] z-0" />

      {/* Hero skeleton: avatar + name + member-since + rank bar */}
      <div className="relative z-10 max-w-[820px] mx-auto pt-32 px-6 flex flex-col items-center text-center">
        <div className="w-[110px] h-[110px] rounded-full bg-[var(--gh-border-medium)] animate-pulse mb-4" />
        <div className="w-40 h-5 rounded bg-[var(--gh-border-medium)] animate-pulse mb-2" />
        <div className="w-32 h-3 rounded bg-[var(--gh-border-medium)] animate-pulse mb-6" />
        <div className="w-full max-w-[400px] h-20 rounded-2xl bg-[var(--gh-border-medium)] animate-pulse" />
      </div>

      {/* Stat strip skeleton: 4 cells */}
      <div className="relative z-10 max-w-[820px] mx-auto px-6 mt-6 grid grid-cols-2 sm:grid-cols-4 gap-[10px] mb-6">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className="bg-[var(--gh-glass-bg)] border border-[var(--gh-border-subtle)] rounded-xl py-3.5 px-4 text-center"
          >
            <div className="h-7 w-12 mx-auto rounded bg-[var(--gh-border-medium)] animate-pulse mb-2" />
            <div className="h-3 w-16 mx-auto rounded bg-[var(--gh-border-medium)] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
