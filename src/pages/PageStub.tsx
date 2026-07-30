import { useParams } from 'react-router-dom';
import { PageHeader, EmptyState } from '@/components/shared';

/** Placeholder page — page agents replace these with real implementations. */
export default function PageStub({ title, subtitle }: { title: string; subtitle?: string }) {
  const params = useParams();
  const suffix = params.id ?? params.type;
  return (
    <div className="px-7 pb-8 pt-6">
      <PageHeader
        title={suffix ? `${title} — ${suffix}` : title}
        subtitle={subtitle ?? 'This module is scaffolded and ready for implementation.'}
      />
      <div className="rounded-xl border border-app-border bg-app-card shadow-card">
        <EmptyState
          title="Module under construction"
          hint="The route, layout and data layer are wired up — the page itself ships next."
        />
      </div>
    </div>
  );
}
