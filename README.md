# Clock

A minimal static clock: digital, analog, or both. No runtime dependencies; Vite is only used to build.

```sh
npm install
npm run dev      # local dev server
npm run build    # outputs static files to dist/
```

Deploy by uploading `dist/` to any static host. The build uses relative paths, so a subfolder works too.

- Settings (display, theme, font, 24h, seconds, date, show, page and clock titles) and the timer are saved in localStorage.
- Titles: the Title button sets an optional page title above everything (up to two lines; the clock and timer shrink to make room), plus a title for the clock and the running timer. The timer popup also takes a title.
- Timer: the Timer button sets a countdown (duration, plus optional time already passed). While a timer is set, Show picks Clock, Timer, or Both. The analog timer face fills like a pie as time passes, and three beeps play when it finishes. The timer survives a reload.
- Shortcuts: `F` or double-click toggles fullscreen, `M` cycles the display mode, `T` opens the timer, `Space` pauses or resumes it.
- The 7-Seg font is [DSEG7 Classic](https://www.keshikan.net/fonts-e.html) by keshikan (SIL OFL 1.1, see `src/fonts/DSEG-LICENSE.txt`).
- The screen is kept awake with the Screen Wake Lock API. Browsers only allow this over HTTPS (or on localhost).
