import { ContinueListeningSection } from '../components/home/ContinueListeningSection';
import { MostPlayedSection } from '../components/home/MostPlayedSection';
import { RediscoverSection } from '../components/home/RediscoverSection';
import { WrappedPreviewSection } from '../components/home/WrappedPreviewSection';

export function HomePage() {
  return (
    <div className="p-6 max-w-6xl space-y-10">
      <ContinueListeningSection />
      <MostPlayedSection />
      <RediscoverSection />
      <WrappedPreviewSection />
    </div>
  );
}
