set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

chrome := env("CHROME", "C:/Program Files/Google/Chrome/Application/chrome.exe")

default: check

# Run the dev server
dev:
    bun run dev

# Build the static site into dist/
build:
    bun run build

# Build, then serve dist/ the way a host would
preview: build
    bun run preview

# Format check, lint, types, tests
check:
    bun x biome check .
    bun x astro check
    bun test

# Fix formatting and autofixable lint
fmt:
    bun x biome check --write .

test *args:
    bun test {{args}}

# Redraw the favicon set from the Bayer ramp
icons:
    bun tools/icons.ts

# Render tools/og.html to public/og.png at 1200x630
og:
    & "{{chrome}}" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=4000 "--screenshot=$PWD/public/og.png" "file:///$PWD/tools/og.html"
