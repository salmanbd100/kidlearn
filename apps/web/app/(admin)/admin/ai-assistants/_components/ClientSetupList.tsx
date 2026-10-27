import { CopyBlock } from "@/features/admin/guide/CopyBlock";
import { buildClientSetups, type ClientSetup } from "./client-setup";

export function ClientSetupList({
  url,
  token,
}: {
  url: string;
  token: string;
}) {
  return (
    <ul className="flex flex-col gap-4">
      {buildClientSetups(url, token).map((setup) => (
        <li key={setup.id}>
          <ClientSetupCard setup={setup} />
        </li>
      ))}
    </ul>
  );
}

function ClientSetupCard({ setup }: { setup: ClientSetup }) {
  return (
    <section
      aria-labelledby={`setup-${setup.id}`}
      className="flex flex-col gap-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id={`setup-${setup.id}`}
          className="font-medium text-foreground text-sm"
        >
          {setup.name}
        </h3>
        <a
          className="inline-flex min-h-11 items-center text-muted-foreground text-xs underline"
          href={setup.docsUrl}
          target="_blank"
          rel="noreferrer"
        >
          Vendor docs
        </a>
      </div>
      <CopyBlock label={setup.where} text={setup.snippet} />
    </section>
  );
}
