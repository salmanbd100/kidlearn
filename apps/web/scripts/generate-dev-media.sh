#!/usr/bin/env bash
# Regenerates the placeholder media in `apps/web/public/dev/` that the database
# seed points at. Everything it writes is gitignored — see ../public/dev/README.md
# for why, and `packages/db/prisma/seed.ts` for what references each file.
#
# Requires: macOS (`say`, `qlmanage`, `sips`) and `lame` (brew install lame).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/../public/dev"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

for tool in say qlmanage sips lame; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

EN_VOICE="${EN_VOICE:-Samantha}"
BN_VOICE="${BN_VOICE:-Piya}"

# `qlmanage` rasterises an SVG by STRETCHING it to a square thumbnail, so a
# non-square viewBox comes back distorted. Every scene is therefore authored on a
# square canvas — artwork in $2 x $3 coordinates, centred vertically by the
# wrapper below — and `sips -c` crops the square back to the intended aspect.
# Undistorted in, undistorted out.
#
# Reads the scene's inner SVG (no root <svg> element) on stdin.
scene() { # $1 name, $2 width, $3 height, $4 background
  local name="$1" w="$2" h="$3" bg="$4" side pad
  side="$w"; [ "$h" -gt "$w" ] && side="$h"
  pad=$(( (side - h) / 2 ))
  {
    printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s">' "$side" "$side" "$side" "$side"
    printf '<rect width="%s" height="%s" fill="%s"/><g transform="translate(%s,%s)">' "$side" "$side" "$bg" "$(( (side - w) / 2 ))" "$pad"
    cat
    printf '</g></svg>'
  } > "$TMP/$name.svg"
  qlmanage -t -s "$side" -o "$TMP" "$TMP/$name.svg" >/dev/null 2>&1
  sips -c "$h" "$w" "$TMP/$name.svg.png" --out "$TMP/$name.png" >/dev/null 2>&1
}

# Renders a scene to $OUT/$1.png at exactly $2 x $3.
render() {
  local name="$1"
  scene "$@"
  mv "$TMP/$name.png" "$OUT/$name.png"
  echo "  image  $name.png ($2 x $3)"
}

# Renders a scene to $OUT/$1.jpg at exactly $2 x $3 (video posters are jpg).
render_jpg() {
  local name="$1"
  scene "$@"
  sips -s format jpeg "$TMP/$name.png" --out "$OUT/$name.jpg" >/dev/null 2>&1
  echo "  image  $name.jpg ($2 x $3)"
}

# Speaks $3 in voice $2 to $OUT/$1.mp3. `say` writes AIFF; `lame` is the only
# step that needs installing, and the seeded urls all end in .mp3.
speak() {
  local name="$1" voice="$2" text="$3"
  say -v "$voice" -o "$TMP/$name.aiff" "$text"
  lame --quiet -q 2 -b 64 -m m "$TMP/$name.aiff" "$OUT/$name.mp3"
  echo "  audio  $name.mp3"
}

# --- scenes -------------------------------------------------------------------
# Flat shapes only: no gradients, no external fonts, no embedded images — the
# thumbnailer renders all three inconsistently.

echo "world mascots"

render mascot-ocean-dolphin 512 512 "#B3E5FC" <<'EOF'
<path d="M120 300 Q 200 160 330 170 Q 300 210 320 250 L 420 210 Q 400 280 330 310 Q 240 360 120 300 Z" fill="#0277BD"/>
<path d="M200 200 Q 230 150 260 195 Q 230 185 200 200 Z" fill="#01579B"/>
<path d="M130 300 Q 100 330 70 320 Q 100 300 95 275 Q 120 285 130 300 Z" fill="#0277BD"/>
<path d="M150 300 Q 240 350 330 305 Q 240 330 150 300 Z" fill="#E1F5FE"/>
<circle cx="300" cy="205" r="13" fill="#FFFFFF"/><circle cx="303" cy="207" r="7" fill="#01579B"/>
<path d="M330 232 Q 350 240 336 250" stroke="#01579B" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M40 420 Q 130 385 220 420 Q 310 455 470 415" stroke="#4FC3F7" stroke-width="16" fill="none" stroke-linecap="round"/>
EOF

echo "video posters"

poster() { # $1 name, $2 wash, $3 glyph, $4 glyph colour
  render_jpg "$1" 1280 720 "$2" <<EOF
<circle cx="640" cy="330" r="190" fill="#FFFFFF" opacity="0.9"/>
<text x="640" y="415" font-family="Helvetica,Arial" font-size="230" font-weight="bold" fill="$4" text-anchor="middle">$3</text>
<path d="M0 620 Q 320 560 640 620 Q 960 680 1280 610 L 1280 720 L 0 720 Z" fill="#FFFFFF" opacity="0.35"/>
EOF
}

poster letter-a.en         "#FFF3E0" "A" "#F57C00"
poster trace-letter-a.en   "#FFE0B2" "A" "#EF6C00"
poster meet-the-dolphin.en "#81D4FA" "D" "#0277BD"
poster count-the-fish.en   "#80DEEA" "3" "#00838F"

echo "story covers"

render story-sharing-monkey 512 512 "#E8F5E9" <<'EOF'
<circle cx="256" cy="150" r="110" fill="#2E7D32" opacity="0.35"/>
<rect x="240" y="230" width="32" height="150" fill="#6D4C41"/>
<circle cx="200" cy="330" r="70" fill="#8D6E63"/>
<circle cx="200" cy="330" r="52" fill="#D7CCC8"/>
<circle cx="182" cy="318" r="9" fill="#3E2723"/><circle cx="218" cy="318" r="9" fill="#3E2723"/>
<path d="M182 345 Q 200 362 218 345" stroke="#3E2723" stroke-width="7" fill="none" stroke-linecap="round"/>
<circle cx="140" cy="300" r="22" fill="#8D6E63"/><circle cx="260" cy="300" r="22" fill="#8D6E63"/>
<circle cx="330" cy="360" r="46" fill="#FDD835"/>
<path d="M330 316 Q 345 300 355 312" stroke="#2E7D32" stroke-width="8" fill="none" stroke-linecap="round"/>
<path d="M0 440 Q 128 410 256 440 Q 384 470 512 435 L 512 512 L 0 512 Z" fill="#66BB6A"/>
EOF

render story-dot-counts-the-fish 512 512 "#E1F5FE" <<'EOF'
<circle cx="256" cy="290" r="95" fill="#81C784"/>
<circle cx="256" cy="290" r="72" fill="#A5D6A7"/>
<path d="M190 250 Q 256 215 322 250" stroke="#4CAF50" stroke-width="10" fill="none"/>
<circle cx="256" cy="212" r="40" fill="#8D6E63"/>
<circle cx="242" cy="205" r="7" fill="#FFFFFF"/><circle cx="270" cy="205" r="7" fill="#FFFFFF"/>
<circle cx="243" cy="206" r="4" fill="#3E2723"/><circle cx="271" cy="206" r="4" fill="#3E2723"/>
<path d="M100 130 q 30 -22 60 0 q -30 22 -60 0 z" fill="#FF7043"/>
<path d="M390 165 q 26 -18 52 0 q -26 18 -52 0 z" fill="#FFA726"/>
<path d="M120 400 q 22 -16 44 0 q -22 16 -44 0 z" fill="#26C6DA"/>
<path d="M0 455 Q 128 425 256 455 Q 384 485 512 450 L 512 512 L 0 512 Z" fill="#4FC3F7"/>
EOF

echo "story pages"

# Reusable cast, in 1024x768 page coordinates.
MONKEY='<circle cx="300" cy="400" r="86" fill="#8D6E63"/><circle cx="300" cy="400" r="64" fill="#D7CCC8"/><circle cx="278" cy="385" r="11" fill="#3E2723"/><circle cx="322" cy="385" r="11" fill="#3E2723"/><path d="M278 430 Q 300 452 322 430" stroke="#3E2723" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="228" cy="366" r="27" fill="#8D6E63"/><circle cx="372" cy="366" r="27" fill="#8D6E63"/>'
PARROT='<circle cx="700" cy="410" r="70" fill="#43A047"/><circle cx="728" cy="378" r="34" fill="#66BB6A"/><path d="M755 376 l 30 12 l -30 12 z" fill="#FB8C00"/><circle cx="734" cy="372" r="7" fill="#1B5E20"/><path d="M660 430 q 40 40 80 10" stroke="#2E7D32" stroke-width="8" fill="none"/>'
CANOPY='<circle cx="512" cy="90" r="150" fill="#2E7D32" opacity="0.25"/>'
GROUND='<path d="M0 620 Q 256 585 512 620 Q 768 655 1024 615 L 1024 768 L 0 768 Z" fill="#66BB6A"/>'
mango() { printf '<circle cx="%s" cy="%s" r="40" fill="#FDD835"/><path d="M%s %s q 10 -14 22 -8" stroke="#2E7D32" stroke-width="6" fill="none"/>' "$1" "$2" "$1" "$(( $2 - 38 ))"; }

render story-sharing-monkey.p1 1024 768 "#E8F5E9" <<EOF
$CANOPY $MONKEY
$(mango 620 560) $(mango 700 572) $(mango 780 558) $(mango 660 500) $(mango 740 502)
$GROUND
EOF

render story-sharing-monkey.p2 1024 768 "#E8F5E9" <<EOF
$CANOPY $MONKEY
$(mango 300 520) $(mango 362 536) $(mango 238 536)
$GROUND
EOF

render story-sharing-monkey.p3 1024 768 "#E8F5E9" <<EOF
$CANOPY $MONKEY $PARROT
<path d="M770 470 q 16 18 -2 30" stroke="#EF6C00" stroke-width="6" fill="none"/>
$GROUND
EOF

render story-sharing-monkey.p4 1024 768 "#E8F5E9" <<EOF
$CANOPY $MONKEY $PARROT
$(mango 512 566)
<path d="M400 580 q 56 -34 112 -6" stroke="#FB8C00" stroke-width="7" fill="none" stroke-dasharray="12 10"/>
$GROUND
EOF

render story-sharing-monkey.p5 1024 768 "#FFF8E1" <<EOF
<text x="512" y="150" font-family="Helvetica,Arial" font-size="80" text-anchor="middle" fill="#F9A825">* * *</text>
$MONKEY $PARROT $(mango 300 540) $(mango 700 540)
$GROUND
EOF

TURTLE='<circle cx="300" cy="420" r="100" fill="#81C784"/><circle cx="300" cy="420" r="76" fill="#A5D6A7"/><path d="M234 380 Q 300 345 366 380" stroke="#4CAF50" stroke-width="10" fill="none"/><circle cx="300" cy="325" r="44" fill="#8D6E63"/><circle cx="285" cy="318" r="8" fill="#FFFFFF"/><circle cx="317" cy="318" r="8" fill="#FFFFFF"/><circle cx="286" cy="319" r="4" fill="#3E2723"/><circle cx="318" cy="319" r="4" fill="#3E2723"/>'
SEABED='<path d="M0 640 Q 256 605 512 640 Q 768 675 1024 635 L 1024 768 L 0 768 Z" fill="#4DD0E1"/>'
fish() { printf '<path d="M%s %s q 28 -20 56 0 q -28 20 -56 0 z" fill="%s"/><path d="M%s %s l -16 -12 l 0 24 z" fill="%s"/>' "$1" "$2" "$3" "$1" "$2" "$3"; }

render story-dot-counts-the-fish.p1 1024 768 "#E1F5FE" <<EOF
$TURTLE $(fish 620 280 "#FF7043") $(fish 740 400 "#FFA726") $SEABED
EOF

render story-dot-counts-the-fish.p2 1024 768 "#E1F5FE" <<EOF
$TURTLE
$(fish 600 240 "#FF7043") $(fish 700 320 "#FFA726") $(fish 800 280 "#FFA726")
$(fish 640 420 "#B0BEC5") $(fish 750 450 "#B0BEC5") $(fish 850 410 "#B0BEC5")
$SEABED
EOF

render story-dot-counts-the-fish.p3 1024 768 "#E1F5FE" <<EOF
$TURTLE $(fish 680 230 "#FF7043") $(fish 820 360 "#FFA726") $(fish 580 460 "#B0BEC5")
<path d="M600 280 q 80 60 180 20" stroke="#0288D1" stroke-width="6" fill="none" stroke-dasharray="14 12"/>
$SEABED
EOF

render story-dot-counts-the-fish.p4 1024 768 "#E1F5FE" <<EOF
$TURTLE
<ellipse cx="720" cy="450" rx="80" ry="56" fill="#EF5350"/>
<circle cx="696" cy="432" r="9" fill="#FFFFFF"/><circle cx="744" cy="432" r="9" fill="#FFFFFF"/>
<path d="M652 410 l -30 -26 M788 410 l 30 -26" stroke="#C62828" stroke-width="10" stroke-linecap="round"/>
$SEABED
EOF

render story-dot-counts-the-fish.p5 1024 768 "#E0F7FA" <<EOF
$TURTLE
$(fish 600 230 "#FF7043") $(fish 680 230 "#FF7043") $(fish 760 230 "#FFA726") $(fish 840 230 "#FFA726")
$(fish 600 340 "#B0BEC5") $(fish 680 340 "#B0BEC5") $(fish 760 340 "#26C6DA") $(fish 840 340 "#26C6DA")
<text x="720" y="540" font-family="Helvetica,Arial" font-size="72" text-anchor="middle" fill="#00838F">2 4 6 8</text>
$SEABED
EOF

# --- narration ----------------------------------------------------------------
echo "lesson narration"
speak letter-a-intro.en        "$EN_VOICE" "Hello! Today we are going to learn the letter A. A is for apple, and A is for alligator!"
speak trace-letter-a-intro.en  "$EN_VOICE" "Let's trace the letter A together! Follow the dots with your finger."
speak trace-letter-a-intro.bn  "$BN_VOICE" "চলো একসাথে A বর্ণটি আঁকি!"
speak meet-the-dolphin-intro.en "$EN_VOICE" "Welcome to the ocean! Let's put the dolphin picture back together."
speak meet-the-dolphin-intro.bn "$BN_VOICE" "সমুদ্রে স্বাগতম! চলো ডলফিনের ছবিটা মিলাই।"
speak count-the-fish-intro.en  "$EN_VOICE" "Let's count the fish in the reef. One, two, three!"
speak count-the-fish-intro.bn  "$BN_VOICE" "চলো প্রবালের মাছ গুনি। এক, দুই, তিন!"

echo "story narration"
speak story-sharing-monkey.title.en "$EN_VOICE" "The Sharing Monkey"
speak story-sharing-monkey.title.bn "$BN_VOICE" "ভাগ করে নেওয়া বানর"
speak story-sharing-monkey.1.en "$EN_VOICE" "Milo the monkey found five ripe mangoes under the big tree."
speak story-sharing-monkey.1.bn "$BN_VOICE" "মিলো বানর বড় গাছের নিচে পাঁচটি পাকা আম পেল।"
speak story-sharing-monkey.2.en "$EN_VOICE" "He held all five close. They were his, and he did not want to lose one."
speak story-sharing-monkey.2.bn "$BN_VOICE" "সে পাঁচটিই বুকে জড়িয়ে ধরল। এগুলো তার, একটিও হারাতে চায় না।"
speak story-sharing-monkey.3.en "$EN_VOICE" "Then Bina the parrot landed beside him. Her tummy rumbled loudly."
speak story-sharing-monkey.3.bn "$BN_VOICE" "তখন বিনা টিয়া তার পাশে এসে বসল। তার পেটে জোরে খিদে ডাকছিল।"
speak story-sharing-monkey.4.en "$EN_VOICE" "Milo thought for a moment. Then he rolled one big mango over to her."
speak story-sharing-monkey.4.bn "$BN_VOICE" "মিলো একটু ভাবল। তারপর একটি বড় আম তার দিকে গড়িয়ে দিল।"
speak story-sharing-monkey.5.en "$EN_VOICE" "They ate together, and the jungle filled with two happy voices."
speak story-sharing-monkey.5.bn "$BN_VOICE" "তারা একসঙ্গে খেল, আর জঙ্গল ভরে গেল দুটি খুশি কণ্ঠে।"
speak story-sharing-monkey.moral.en "$EN_VOICE" "Sharing makes playing more fun."
speak story-sharing-monkey.moral.bn "$BN_VOICE" "ভাগ করে নিলে খেলা আরও আনন্দের হয়।"

# English only, on purpose: this story is the `bn` fallback probe (see README).
speak story-dot-counts-the-fish.title.en "$EN_VOICE" "Dot Counts the Fish"
speak story-dot-counts-the-fish.1.en "$EN_VOICE" "Dot the little turtle wanted to know how many fish lived in the reef."
speak story-dot-counts-the-fish.moral.en "$EN_VOICE" "Asking questions is how we learn."

echo "done — $(ls -1 "$OUT" | grep -cv README) files in $OUT"
