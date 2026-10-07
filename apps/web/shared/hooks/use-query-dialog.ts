"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A dialog whose open state is one query parameter, so a redirect can open it and Back closes it.
 * Closing drops only that parameter, with `replace`, so dismissing it adds no history entry.
 */
export function useQueryDialog(param: { name: string; value: string }): {
  isOpen: boolean;
  onOpenChange: (isNowOpen: boolean) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isOpen = searchParams?.get(param.name) === param.value;

  const onOpenChange = (isNowOpen: boolean) => {
    if (isNowOpen) return;
    const remaining = new URLSearchParams(searchParams?.toString());
    remaining.delete(param.name);
    const query = remaining.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  };

  return { isOpen, onOpenChange };
}
