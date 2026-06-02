import { AddVideoForm } from '@/components/AddVideoForm';
import { VideoCard } from '@/components/VideoCard';
import { videoRepo } from '@/lib/repositories';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let videos = await safeList();

  return (
    <div className="container-page">
      <section className="pt-12 pb-16 sm:pt-20 sm:pb-24">
        <p className="mb-6 text-xs uppercase tracking-[0.18em] text-mute">
          paste a youtube url → get karaoke
        </p>
        <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tightest sm:text-7xl">
          sing along.
          <br />
          <span className="text-mute">any video.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-mute">
          s1ng downloads the audio, transcribes it with word-level timing, and shows you two lines
          at a time. Japanese and Korean come out in romaji so you can actually sing them.
        </p>
        <div className="mt-10 max-w-3xl">
          <AddVideoForm />
        </div>
      </section>

      <section className="pb-24">
        <div className="hairline mb-8 flex items-baseline justify-between pt-6">
          <h2 className="text-xs uppercase tracking-[0.18em] text-mute">library</h2>
          <span className="text-xs uppercase tracking-[0.18em] text-mute">
            {videos.length} {videos.length === 1 ? 'video' : 'videos'}
          </span>
        </div>
        {videos.length === 0 ? (
          <p className="py-16 text-center text-sm text-mute">
            no videos yet. paste a url above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function safeList() {
  try {
    return await videoRepo.listRecent();
  } catch {
    return [];
  }
}
