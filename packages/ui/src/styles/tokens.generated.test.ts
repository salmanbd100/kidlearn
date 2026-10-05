import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readTokenRegion,
  renderTokenRegions,
  TOKEN_REGIONS,
  writeTokenRegions,
} from "./render-tokens";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);

describe("tokens.css agrees with @kidlearn/tokens", () => {
  const rendered = renderTokenRegions();

  it.each(
    TOKEN_REGIONS,
  )("the %s region holds exactly the generated declarations", (region) => {
    // On failure: edit packages/tokens/src/index.ts, then run
    // `pnpm --filter @kidlearn/ui tokens:generate`. Never edit the region.
    expect(readTokenRegion(css, region)).toEqual(rendered[region]);
  });

  it("regenerating changes no declaration", () => {
    const again = writeTokenRegions(css);
    for (const region of TOKEN_REGIONS) {
      expect(readTokenRegion(again, region)).toEqual(
        readTokenRegion(css, region),
      );
    }
  });
});
