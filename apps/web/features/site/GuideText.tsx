import { GuideTrans } from "./GuideTrans";

export function GuideText({ i18nKey }: { i18nKey: string }) {
  return (
    <p>
      <GuideTrans i18nKey={i18nKey} />
    </p>
  );
}
