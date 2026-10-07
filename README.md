# Clock

A minimal static clock: digital, analog, or both. No runtime dependencies; Vite is only used to build.

```sh
npm install
npm run dev      # local dev server
npm run build    # outputs static files to dist/
```

Deploy by uploading `dist/` to any static host. The build uses relative paths, so a subfolder works too.

- Settings (display, theme, font, 24h, seconds, date) are saved in localStorage.
- Shortcuts: `F` or double-click toggles fullscreen, `M` cycles the display mode.
- The screen is kept awake with the Screen Wake Lock API. Browsers only allow this over HTTPS (or on localhost).
