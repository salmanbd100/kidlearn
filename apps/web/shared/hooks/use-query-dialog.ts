"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A dialog whose open state is one query parameter, so a redirect can open it. Closing drops only that
 * parameter, with `replace`; links that open it should `replace` too, or Back after closing lands on a
 * duplicate of the page beneath.
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
