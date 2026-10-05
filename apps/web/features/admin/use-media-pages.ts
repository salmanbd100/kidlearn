import type { AssetKind, Locale, MediaAsset } from "@kidlearn/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMediaAssets } from "@/features/admin/media-api";

/** Matches the server's default; a full page is how the client knows to offer more. */
export const MEDIA_PAGE_SIZE = 100;

type MediaFilters = { kind?: AssetKind; language?: Locale };

/**
 * The media library, a page at a time, newest first. A page shorter than
 * `MEDIA_PAGE_SIZE` is the last one, so `hasMore` costs no extra request.
 */
export function useMediaPages(
  { kind, language }: MediaFilters,
  { isEnabled = true }: { isEnabled?: boolean } = {},
) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloads, setReloads] = useState(0);
  // A "Show older" answer that lands after the filters changed belongs to the
  // old list; this is how it knows.
  const filtersKey = useRef("");

  useEffect(() => {
    if (!isEnabled) return;
    const key = `${kind}|${language}|${reloads}`;
    filtersKey.current = key;
    setStatus("loading");
    setIsLoadingMore(false);

    void fetchMediaAssets({ kind, language, limit: MEDIA_PAGE_SIZE }).then(
      (result) => {
        if (filtersKey.current !== key) return;
        if (!result.ok) {
          setStatus("error");
          return;
        }
        setAssets(result.data);
        setHasMore(result.data.length === MEDIA_PAGE_SIZE);
        setStatus("ready");
      },
    );
  }, [kind, language, isEnabled, reloads]);

  const loadMore = useCallback(async () => {
    const last = assets.at(-1);
    if (!last || isLoadingMore) return;
    const key = filtersKey.current;
    setIsLoadingMore(true);

    const result = await fetchMediaAssets({
      kind,
      language,
      limit: MEDIA_PAGE_SIZE,
      before: last.id,
    });

    if (filtersKey.current !== key) return;
    setIsLoadingMore(false);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setAssets((current) => [...current, ...result.data]);
    setHasMore(result.data.length === MEDIA_PAGE_SIZE);
  }, [assets, isLoadingMore, kind, language]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);

  return { assets, status, hasMore, isLoadingMore, loadMore, reload };
}
