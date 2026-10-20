import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const preference = vi.hoisted(() => ({ isMotionReduced: false }));

vi.mock("@kidlearn/ui", () => ({
  useIsMotionReduced: () => preference.isMotionReduced,
}));

const { Reveal } = await import("./Reveal");

const page = (
  <Reveal>
    <a href="/guide/parents">Parents</a>
  </Reveal>
);

/** The server cannot see the preference; this is the HTML every visitor is sent. */
async function hydrateAsVisitor(): Promise<HTMLElement> {
  preference.isMotionReduced = false;
  const container = document.createElement("div");
  container.innerHTML = renderToString(page);
  document.body.append(container);

  preference.isMotionReduced = true;
  await act(async () => {
    hydrateRoot(container, page);
  });
  return container;
}

describe("Reveal", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("ships its children at the animation start in the server HTML", () => {
    preference.isMotionReduced = false;
    expect(renderToString(page)).toContain("opacity:0");
  });

  it("shows its children once hydrated under reduced motion, rather than leaving them invisible", async () => {
    const container = await hydrateAsVisitor();

    const wrapper = container.querySelector("a")?.parentElement;
    expect(wrapper?.style.opacity).toBe("1");
    expect(wrapper?.style.transform).toBe("none");
  });
});
