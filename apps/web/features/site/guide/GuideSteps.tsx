import { GuideTrans } from "./GuideTrans";

export function GuideSteps({ i18nKeys }: { i18nKeys: readonly string[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {i18nKeys.map((key, index) => (
        <li key={key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2">
          <span
            aria-hidden="true"
            className="font-bold tabular-nums text-muted-foreground"
          >
            {index + 1}.
          </span>
          <span>
            <GuideTrans i18nKey={key} />
          </span>
        </li>
      ))}
    </ol>
  );
}
