import Link from "next/link";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

/** How a lesson video gets made (FR-AI-06). */
export function VideoWorkflowCallout() {
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-border border-dashed bg-muted/40 p-4">
      <h2 className="font-medium text-foreground text-sm">Video workflow</h2>
      <p className="text-muted-foreground text-sm">
        Lesson videos are made outside this CMS. Narration and illustrations are
        generated here; video is not, and clicking Upload is the last step of
        the process rather than the whole of it.
      </p>
      <ol className="flex flex-col gap-1 pl-5 text-muted-foreground text-sm [list-style:decimal]">
        <li>
          Open the lesson&rsquo;s generation job in the{" "}
          <Link className="underline" href={ADMIN_ROUTES.aiQueue}>
            AI Queue
          </Link>{" "}
          and copy its narration script. That script is the brief — writing a
          fresh one is how the video ends up saying something the lesson does
          not teach.
        </li>
        <li>
          Produce the clip in Google Veo or Runway Gen-3. Keep it under a minute
          and silent: the voice comes from the generated narration, which is
          per-language, and a clip with English speech burnt in cannot serve a
          Bangla learner.
        </li>
        <li>
          Upload the file here with <strong>Upload</strong>, kind{" "}
          <strong>video</strong>, and the language it was made for.
        </li>
        <li>
          Attach it with <strong>Attach…</strong> on the new asset, as the
          lesson&rsquo;s video for that language. A poster frame is a second
          upload of kind <strong>image</strong>, attached the same way.
        </li>
      </ol>
      <p className="text-muted-foreground text-xs">
        Automated video jobs are post-MVP. Until then this is the whole of it —
        there is no queue entry and no review step for a video, because a person
        chose every frame of it.
      </p>
    </section>
  );
}
