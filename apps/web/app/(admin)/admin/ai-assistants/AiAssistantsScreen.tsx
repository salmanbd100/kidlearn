"use client";

import type { AdminAccessToken } from "@kidlearn/types";
import { ACCESS_TOKEN_LIFETIME_DAYS } from "@kidlearn/types";
import {
  Button,
  Input,
  Label,
  SelectMenu,
  SelectMenuContent,
  SelectMenuItem,
  SelectMenuTrigger,
} from "@kidlearn/ui";
import { KeyRound, PlugZap, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useAiCapabilitiesLoad } from "@/app/(admin)/context/ai-capabilities";
import {
  createAccessToken,
  fetchAccessTokens,
  revokeAccessToken,
} from "@/features/admin/api/ai-api";
import { ADMIN_ROUTES } from "@/features/admin/shell/admin-routes";
import { AdminEmptyState } from "@/features/admin/ui/AdminEmptyState";
import { AdminPageHeader } from "@/features/admin/ui/AdminPageHeader";
import {
  COPY_FAILED_LABEL,
  useCopyToClipboard,
} from "@/features/admin/ui/use-copy-to-clipboard";
import { useFocusWhenDropped } from "@/shared/hooks/use-focus-when-dropped";
import { ClientSetupList } from "./_components/ClientSetupList";
import { TOKEN_PLACEHOLDER } from "./_components/client-setup";

const LIFETIME_OPTIONS = [1, ACCESS_TOKEN_LIFETIME_DAYS.default, 14, 30];

const DESCRIPTION =
  "Connect the AI assistant you already use — Claude, Cursor, VS Code and others — and ask it to write lessons, stories and quizzes. Everything it submits arrives in the AI Queue as a draft for a person to review.";

export function AiAssistantsScreen() {
  const {
    capabilities,
    hasFailed: hasCapabilitiesFailed,
    retry: retryCapabilities,
  } = useAiCapabilitiesLoad();
  const [tokens, setTokens] = useState<AdminAccessToken[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ name: string; secret: string }>();
  const tokensHeadingRef = useFocusWhenDropped<HTMLHeadingElement>(created, {
    skipArrival: true,
  });

  const load = useCallback(async () => {
    setState("loading");
    const result = await fetchAccessTokens();
    if (!result.ok) {
      setState("error");
      return;
    }
    setTokens(result.data.tokens);
    setState("ready");
  }, []);

  const isMcpEnabled = capabilities?.mcp.enabled === true;

  useEffect(() => {
    if (isMcpEnabled) void load();
  }, [isMcpEnabled, load]);

  if (capabilities === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="AI assistants" description={DESCRIPTION} />
        {hasCapabilitiesFailed ? (
          <AdminEmptyState
            tone="error"
            icon={TriangleAlert}
            title="Assistant settings could not be loaded."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={retryCapabilities}
              >
                Try again
              </Button>
            }
          />
        ) : null}
      </div>
    );
  }

  if (!capabilities.mcp.enabled || capabilities.mcp.url === null) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="AI assistants" description={DESCRIPTION} />
        <AdminEmptyState
          icon={PlugZap}
          title="Assistant access is switched off on this server."
          description="Whoever runs the deployment turns it on by setting MCP_ENABLED=true for the API."
        />
      </div>
    );
  }

  const mcpUrl = capabilities.mcp.url;

  async function handleRevoke(id: string) {
    setError(undefined);
    const result = await revokeAccessToken(id);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTokens((current) =>
      current.map((one) => (one.id === id ? result.data : one)),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader title="AI assistants" description={DESCRIPTION} />

      <section className="flex flex-col gap-2 rounded-(--radius) border border-border bg-card p-4">
        <h2 className="font-medium text-foreground text-sm">How it works</h2>
        <p className="text-muted-foreground text-sm">
          Your assistant connects to <code className="font-mono">{mcpUrl}</code>{" "}
          with a token you create below. It reads the curriculum and
          KidLearn&rsquo;s writing rules, writes on your own subscription, and
          submits drafts — at most {capabilities.mcp.draftsPerDay} a day. It
          cannot approve, publish or see anything about a family. You review
          what it wrote in the{" "}
          <Link className="underline" href={ADMIN_ROUTES.aiQueue}>
            AI Queue
          </Link>
          , exactly as you would a Gemini draft.
        </p>
        <p className="text-muted-foreground text-sm">
          ChatGPT and claude.ai need a different sign-in that is not available
          yet; the clients below all work with a token.
        </p>
      </section>

      <CreateTokenForm
        onCreated={(token, secret) => {
          setCreated({ name: token.name, secret });
          setTokens((current) => [token, ...current]);
        }}
        onError={setError}
      />

      {created ? (
        <SecretNotice
          name={created.name}
          secret={created.secret}
          onDismiss={() => setCreated(undefined)}
        />
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-(--radius) border border-destructive/40 bg-destructive/5 px-3 py-2 text-foreground text-sm"
        >
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2
          ref={tokensHeadingRef}
          // Where focus lands when the secret notice's Done closes it.
          tabIndex={-1}
          className="font-medium text-foreground text-sm outline-none"
        >
          Your tokens
        </h2>
        {state === "error" ? (
          <AdminEmptyState
            tone="error"
            icon={TriangleAlert}
            title="Your tokens could not be loaded."
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => void load()}
              >
                Try again
              </Button>
            }
          />
        ) : state === "ready" && tokens.length === 0 ? (
          <AdminEmptyState icon={KeyRound} title="No tokens yet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onRevoke={() => void handleRevoke(token.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-foreground text-sm">
          Connect a client
        </h2>
        <p className="text-muted-foreground text-sm">
          {created
            ? "These include the token you just created."
            : `Create a token first, then replace ${TOKEN_PLACEHOLDER} with it.`}
        </p>
        <ClientSetupList
          url={mcpUrl}
          token={created?.secret ?? TOKEN_PLACEHOLDER}
        />
      </section>
    </div>
  );
}

function CreateTokenForm({
  onCreated,
  onError,
}: {
  onCreated: (token: AdminAccessToken, secret: string) => void;
  onError: (message: string | undefined) => void;
}) {
  const [name, setName] = useState("");
  const [days, setDays] = useState<number>(ACCESS_TOKEN_LIFETIME_DAYS.default);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError(undefined);
    setIsSaving(true);
    const result = await createAccessToken({
      name: name.trim(),
      expiresInDays: days,
    });
    setIsSaving(false);
    if (!result.ok) {
      onError(result.error.message);
      return;
    }
    setName("");
    onCreated(result.data.token, result.data.secret);
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-wrap items-end gap-3 rounded-(--radius) border border-border bg-card p-4"
    >
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="token-name">Token name</Label>
        <Input
          id="token-name"
          value={name}
          maxLength={80}
          placeholder="Claude Desktop — laptop"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="token-lifetime">Expires after</Label>
        <SelectMenu
          value={String(days)}
          onValueChange={(value) => setDays(Number(value))}
        >
          <SelectMenuTrigger id="token-lifetime" size="sm" className="w-32" />
          <SelectMenuContent>
            {LIFETIME_OPTIONS.map((option) => (
              <SelectMenuItem key={option} value={String(option)}>
                {option === 1 ? "1 day" : `${option} days`}
              </SelectMenuItem>
            ))}
          </SelectMenuContent>
        </SelectMenu>
      </div>
      <Button type="submit" disabled={name.trim() === ""} isLoading={isSaving}>
        Create token
      </Button>
    </form>
  );
}

function SecretNotice({
  name,
  secret,
  onDismiss,
}: {
  name: string;
  secret: string;
  onDismiss: () => void;
}) {
  const { copyState, copy } = useCopyToClipboard();
  // Creating clears the name field, which disables Create token under focus.
  const headingRef = useFocusWhenDropped<HTMLHeadingElement>(secret);

  return (
    <section
      role="status"
      className="flex flex-col gap-2 rounded-(--radius) border border-primary/40 bg-accent p-4"
    >
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-medium text-foreground text-sm outline-none"
      >
        Copy &ldquo;{name}&rdquo; now — it will not be shown again
      </h2>
      <p className="text-muted-foreground text-xs">
        Only a fingerprint of it is stored. Treat it like a password: anyone
        holding it can submit drafts as you until it expires or you revoke it.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-(--radius) bg-card px-3 py-2 font-mono text-foreground text-xs">
          {secret}
        </code>
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          onClick={() => void copy(secret)}
        >
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? COPY_FAILED_LABEL
              : "Copy token"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onDismiss}
        >
          Done
        </Button>
      </div>
    </section>
  );
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: AdminAccessToken;
  onRevoke: () => void;
}) {
  const isExpired = new Date(token.expiresAt).getTime() <= Date.now();
  const state =
    token.revokedAt !== null ? "Revoked" : isExpired ? "Expired" : "Active";
  const rowRef = useFocusWhenDropped<HTMLLIElement>(state, {
    skipArrival: true,
  });

  return (
    <li
      ref={rowRef}
      // Where focus lands when Revoke goes away with the token.
      tabIndex={-1}
      className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 rounded-(--radius) border border-border bg-card px-4 py-3 outline-none"
    >
      <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
        {token.name}
      </span>
      <code className="font-mono text-muted-foreground text-xs">
        {token.prefix}…
      </code>
      <span className="text-muted-foreground text-xs">{state}</span>
      <span className="text-muted-foreground text-xs">
        {state === "Active" ? `Expires ${formatDate(token.expiresAt)}` : null}
      </span>
      <span className="text-muted-foreground text-xs">
        {token.lastUsedAt === null
          ? "Never used"
          : `Last used ${formatDate(token.lastUsedAt)}`}
      </span>
      {state === "Active" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onRevoke}
        >
          Revoke
        </Button>
      ) : null}
    </li>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
