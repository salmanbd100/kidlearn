import type { GradeLevel, Language, MediaKind } from "@prisma/client";

// The development story library (FR-STORY-08).

export interface MediaFixture {
  /** Fixed so a re-seed updates the row it wrote last time (idempotence). */
  id: string;
  url: string;
  kind: MediaKind;
  language?: Language;
}

export interface StoryPageFixture {
  sortOrder: number;
  illustration?: MediaFixture;
  /** Required in both locales — page text is what a story *is* (FR-STORY-05). */
  text: Record<Language, string>;
  /** Best-effort per locale; a missing recording falls back to English. */
  narration?: Partial<Record<Language, MediaFixture>>;
}

export interface StoryFixture {
  slug: string;
  /** The admin label. What a child reads is `translations[locale].title`. */
  title: string;
  /** The authoring label for the moral (FR-STORY-03), never shown to a child. */
  theme: string;
  worldSlug: string;
  gradeLevels: GradeLevel[];
  cover?: MediaFixture;
  translations: Partial<
    Record<
      Language,
      {
        title: string;
        moral?: string;
        titleAudio?: MediaFixture;
        moralAudio?: MediaFixture;
      }
    >
  >;
  pages: StoryPageFixture[];
}

const asset = (
  id: string,
  url: string,
  kind: MediaKind,
  language?: Language,
): MediaFixture => ({
  id: `00000000-0000-0000-0000-${id}`,
  url,
  kind,
  language,
});

const SHARING_MONKEY: StoryFixture = {
  slug: "the-sharing-monkey",
  title: "The Sharing Monkey",
  theme: "sharing",
  worldSlug: "jungle",
  gradeLevels: ["NURSERY", "KG1"],
  cover: asset("000000000601", "/dev/story-sharing-monkey.png", "image"),
  translations: {
    en: {
      title: "The Sharing Monkey",
      moral: "Sharing makes playing more fun.",
      titleAudio: asset(
        "000000000602",
        "/dev/story-sharing-monkey.title.en.mp3",
        "audio",
        "en",
      ),
      moralAudio: asset(
        "000000000604",
        "/dev/story-sharing-monkey.moral.en.mp3",
        "audio",
        "en",
      ),
    },
    bn: {
      title: "ভাগ করে নেওয়া বানর",
      moral: "ভাগ করে নিলে খেলা আরও আনন্দের হয়।",
      titleAudio: asset(
        "000000000603",
        "/dev/story-sharing-monkey.title.bn.mp3",
        "audio",
        "bn",
      ),
      moralAudio: asset(
        "000000000605",
        "/dev/story-sharing-monkey.moral.bn.mp3",
        "audio",
        "bn",
      ),
    },
  },
  pages: [
    {
      sortOrder: 1,
      illustration: asset(
        "000000000641",
        "/dev/story-sharing-monkey.p1.png",
        "image",
      ),
      text: {
        en: "Milo the monkey found five ripe mangoes under the big tree.",
        bn: "মিলো বানর বড় গাছের নিচে পাঁচটি পাকা আম পেল।",
      },
      narration: {
        en: asset(
          "000000000651",
          "/dev/story-sharing-monkey.1.en.mp3",
          "audio",
          "en",
        ),
        bn: asset(
          "000000000661",
          "/dev/story-sharing-monkey.1.bn.mp3",
          "audio",
          "bn",
        ),
      },
    },
    {
      sortOrder: 2,
      illustration: asset(
        "000000000642",
        "/dev/story-sharing-monkey.p2.png",
        "image",
      ),
      text: {
        en: "He held all five close. They were his, and he did not want to lose one.",
        bn: "সে পাঁচটিই বুকে জড়িয়ে ধরল। এগুলো তার, একটিও হারাতে চায় না।",
      },
      narration: {
        en: asset(
          "000000000652",
          "/dev/story-sharing-monkey.2.en.mp3",
          "audio",
          "en",
        ),
        bn: asset(
          "000000000662",
          "/dev/story-sharing-monkey.2.bn.mp3",
          "audio",
          "bn",
        ),
      },
    },
    {
      sortOrder: 3,
      illustration: asset(
        "000000000643",
        "/dev/story-sharing-monkey.p3.png",
        "image",
      ),
      text: {
        en: "Then Bina the parrot landed beside him. Her tummy rumbled loudly.",
        bn: "তখন বিনা টিয়া তার পাশে এসে বসল। তার পেটে জোরে খিদে ডাকছিল।",
      },
      narration: {
        en: asset(
          "000000000653",
          "/dev/story-sharing-monkey.3.en.mp3",
          "audio",
          "en",
        ),
        bn: asset(
          "000000000663",
          "/dev/story-sharing-monkey.3.bn.mp3",
          "audio",
          "bn",
        ),
      },
    },
    {
      sortOrder: 4,
      illustration: asset(
        "000000000644",
        "/dev/story-sharing-monkey.p4.png",
        "image",
      ),
      text: {
        en: "Milo thought for a moment. Then he rolled one big mango over to her.",
        bn: "মিলো একটু ভাবল। তারপর একটি বড় আম তার দিকে গড়িয়ে দিল।",
      },
      narration: {
        en: asset(
          "000000000654",
          "/dev/story-sharing-monkey.4.en.mp3",
          "audio",
          "en",
        ),
        bn: asset(
          "000000000664",
          "/dev/story-sharing-monkey.4.bn.mp3",
          "audio",
          "bn",
        ),
      },
    },
    {
      sortOrder: 5,
      illustration: asset(
        "000000000645",
        "/dev/story-sharing-monkey.p5.png",
        "image",
      ),
      text: {
        en: "They ate together, and the jungle filled with two happy voices.",
        bn: "তারা একসঙ্গে খেল, আর জঙ্গল ভরে গেল দুটি খুশি কণ্ঠে।",
      },
      narration: {
        en: asset(
          "000000000655",
          "/dev/story-sharing-monkey.5.en.mp3",
          "audio",
          "en",
        ),
        bn: asset(
          "000000000665",
          "/dev/story-sharing-monkey.5.bn.mp3",
          "audio",
          "bn",
        ),
      },
    },
  ],
};

/**
 * Deliberately thinner than the story above: no Bangla narration and no Bangla
 * moral. A `bn` child on this story reads Bangla text, hears the English
 * voice-over, and is served `moral: null` rather than the authoring label — the
 * three fallback paths `storyService` implements, all visible on one cover.
 */
const DOT_COUNTS_THE_FISH: StoryFixture = {
  slug: "dot-counts-the-fish",
  title: "Dot Counts the Fish",
  theme: "curiosity",
  worldSlug: "ocean",
  gradeLevels: ["NURSERY", "KG1"],
  cover: asset("000000000621", "/dev/story-dot-counts-the-fish.png", "image"),
  translations: {
    en: {
      title: "Dot Counts the Fish",
      moral: "Asking questions is how we learn.",
      titleAudio: asset(
        "000000000622",
        "/dev/story-dot-counts-the-fish.title.en.mp3",
        "audio",
        "en",
      ),
      moralAudio: asset(
        "000000000623",
        "/dev/story-dot-counts-the-fish.moral.en.mp3",
        "audio",
        "en",
      ),
    },
    bn: { title: "ডট মাছ গোনে" },
  },
  pages: [
    {
      sortOrder: 1,
      illustration: asset(
        "000000000671",
        "/dev/story-dot-counts-the-fish.p1.png",
        "image",
      ),
      text: {
        en: "Dot the little turtle wanted to know how many fish lived in the reef.",
        bn: "ছোট কাছিম ডট জানতে চাইল প্রবালে কতগুলো মাছ থাকে।",
      },
      narration: {
        en: asset(
          "000000000631",
          "/dev/story-dot-counts-the-fish.1.en.mp3",
          "audio",
          "en",
        ),
      },
    },
    {
      sortOrder: 2,
      illustration: asset(
        "000000000672",
        "/dev/story-dot-counts-the-fish.p2.png",
        "image",
      ),
      text: {
        en: "One orange fish. Two striped fish. Three tiny silver fish.",
        bn: "একটি কমলা মাছ। দুটি ডোরাকাটা মাছ। তিনটি ছোট রুপালি মাছ।",
      },
    },
    {
      sortOrder: 3,
      illustration: asset(
        "000000000673",
        "/dev/story-dot-counts-the-fish.p3.png",
        "image",
      ),
      text: {
        en: "But every time she counted, the fish swam somewhere new.",
        bn: "কিন্তু যতবার সে গুনল, মাছগুলো নতুন জায়গায় সাঁতরে গেল।",
      },
    },
    {
      sortOrder: 4,
      illustration: asset(
        "000000000674",
        "/dev/story-dot-counts-the-fish.p4.png",
        "image",
      ),
      text: {
        en: "So Dot asked an old crab, and he showed her how to count in twos.",
        bn: "তাই ডট এক বুড়ো কাঁকড়াকে জিজ্ঞাসা করল, আর সে দুই দুই করে গোনা শেখাল।",
      },
    },
    {
      sortOrder: 5,
      illustration: asset(
        "000000000675",
        "/dev/story-dot-counts-the-fish.p5.png",
        "image",
      ),
      text: {
        en: "Two, four, six, eight. Dot counted them all, and asked one more question.",
        bn: "দুই, চার, ছয়, আট। ডট সব গুনে ফেলল, আর আরও একটি প্রশ্ন করল।",
      },
    },
  ],
};

export const DEV_STORIES: StoryFixture[] = [
  SHARING_MONKEY,
  DOT_COUNTS_THE_FISH,
];
