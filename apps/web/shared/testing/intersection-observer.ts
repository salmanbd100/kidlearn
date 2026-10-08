// jsdom has no IntersectionObserver; Motion's `whileInView` (the homepage pictures) needs one to mount.
// Nothing intersects until a test says so, so a scroll-triggered animation starts where it would on load.

const observers = new Set<FakeIntersectionObserver>();

export class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];
  private readonly targets = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.add(this);
  }

  observe(target: Element): void {
    this.targets.add(target);
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
    observers.delete(this);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  intersectAll(): void {
    const entries = [...this.targets].map(
      (target) =>
        ({
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          // The rest of the entry is geometry no observer in this app reads.
        }) as IntersectionObserverEntry,
    );
    if (entries.length > 0) this.callback(entries, this);
  }
}

/** Every observed element enters the viewport fully, as if the visitor scrolled the page through. */
export function scrollEverythingIntoView(): void {
  for (const observer of observers) observer.intersectAll();
}
