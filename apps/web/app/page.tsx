import { Button } from "@kidlearn/ui";

// Temporary scaffold-verification page: exercises @kidlearn/ui + design tokens.
// Replace with the real Student Portal entry once routes land.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-[clamp(2.5rem,8vw,3.5rem)] leading-none text-foreground">
          kidlearn
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Design system wired up.{" "}
          <code className="font-mono">@kidlearn/ui</code> + tokens are live.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button size="kid">Let&apos;s go!</Button>
        <Button size="kid" variant="secondary">
          Play
        </Button>
        <Button size="kid" variant="success">
          Correct!
        </Button>
        <Button size="kid" variant="outline">
          Skip
        </Button>
      </div>
    </main>
  );
}
