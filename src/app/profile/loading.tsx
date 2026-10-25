import BrandLoader from '@/components/brand/BrandLoader';

export default function ProfileLoading() {
  return (
    <div className="min-h-screen pb-[60px] relative bg-[var(--gh-bg-base)] flex items-center justify-center">
      <BrandLoader />
    </div>
  );
}
