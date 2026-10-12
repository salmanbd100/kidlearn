import { Check, X } from "lucide-react";

const TIPS: { title: string; doThis: string; notThis: string }[] = [
  {
    title: "One idea per lesson",
    doThis: "The letter A",
    notThis: "Vowels",
  },
  {
    title: "Short sentences, known words",
    doThis: "Look! An apple. A, a, apple!",
    notThis: "Let's explore the fascinating vowel sound in apple.",
  },
  {
    title: "Pictures over words",
    doThis: "picture_select for Nursery and KG-1",
    notThis: "Text-only options for children who cannot read",
  },
  {
    title: "Bangla is written, not translated",
    doThis: "অ-তে অজগর",
    notThis: "A-তে আপেল",
  },
  {
    title: "Every prompt is heard",
    doThis: "Slow, warm audio in both languages",
    notThis: "Relying on the prompt text",
  },
  {
    title: "Nothing scary, no brands, no links",
    doThis: "A friendly cat",
    notThis: "A cartoon character someone owns",
  },
];

export function WritingTips() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {TIPS.map((tip) => (
        <li key={tip.title}>
          <div className="flex h-full flex-col gap-3 rounded-(--radius) border border-border bg-card p-4">
            <span className="font-medium text-foreground text-sm">
              {tip.title}
            </span>
            <span className="flex gap-2 text-foreground text-sm">
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-success"
              />
              <span className="sr-only">Do: </span>
              {tip.doThis}
            </span>
            <span className="flex gap-2 text-muted-foreground text-sm line-through decoration-muted-foreground/50">
              <X
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-destructive"
              />
              <span className="sr-only">Avoid: </span>
              {tip.notThis}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
