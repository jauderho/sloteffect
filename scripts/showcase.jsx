/**
 * showcase.jsx — the showcase's hand-written demo app (controls, cards, i18n).
 *
 * Source of truth for everything in index.html's script other than the inline
 * library port. `bun run build:index` transpiles this (JSX → plain JS) together
 * with src/ and splices the result into index.html — no in-browser compiler.
 * React comes from the page's UMD globals, so there are no imports here.
 */
const { useState, useEffect, useMemo, useRef, useLayoutEffect } = React;

// ---- demo plumbing ----------------------------------------------------
const STRINGS = {
  en: {
    lang: "中文",
    tagline:
      "Slot-machine-style rolls for numbers, letters, and text in React. Dependency-free, accessible, reduced-motion aware.",
    theme: "Theme",
    direction: "Direction",
    dir: { both: "Both", up: "Up", down: "Down" },
    randomSpin: "Random spin",
    counter: "Counter",
    scrub: "Value",
    onOff: { off: "Off", on: "On" },
    numberEyebrow: "SlotNumber",
    numberCtx: "Any number type — currency, percent, compact, negatives — via Intl.NumberFormat. Digits roll; the cents roll smaller and bottom-aligned.",
    counterEyebrow: "SlotNumber · Counter",
    counterCtx: "Scrub the slider: the low digits blur like a gear-reduction counter while the ten-thousands and up turn slowly. It rolls only while you scrub.",
    letterEyebrow: "SlotLetter",
    letterCtx: "A single character rolling through its alphabet, wrapping around.",
    textEyebrow: "SlotText",
    textCtx: "Any script — Latin, Japanese, Traditional Chinese. Each grapheme rolls; spacing stays natural.",
    install: "Install",
    usage: "Usage",
  },
  zh: {
    lang: "EN",
    tagline:
      "為 React 打造的拉霸機式數字滾動效果。零依賴、可存取、並支援減少動態偏好。",
    theme: "主題",
    direction: "方向",
    dir: { both: "雙向", up: "向上", down: "向下" },
    randomSpin: "隨機滾動",
    counter: "計數器",
    scrub: "數值",
    onOff: { off: "關", on: "開" },
    numberEyebrow: "SlotNumber",
    numberCtx: "任何數字類型——貨幣、百分比、精簡格式、負數——透過 Intl.NumberFormat。數字滾動；角分以較小字級並靠底對齊滾動。",
    counterEyebrow: "SlotNumber · 計數器",
    counterCtx: "拖動滑桿：低位數字像減速齒輪計數器般飛轉，萬位以上則緩緩轉動。僅在拖動時滾動。",
    letterEyebrow: "SlotLetter",
    letterCtx: "單一字元在字母表中循環滾動。",
    textEyebrow: "SlotText",
    textCtx: "任何文字——拉丁、日文、繁體中文。每個字元各自滾動，排版自然。",
    install: "安裝",
    usage: "用法",
  },
};

// Usage snippets shown in each card's "?" tooltip (code, not localized).
const USAGE = {
  number:
    '<SlotNumber value={1234.56} format={{ style: "currency", currency: "USD" }} cents />',
  counter:
    '<SlotNumber value={value} format={{ style: "currency", currency: "USD" }} cents counter />',
  letter: '<SlotLetter char="Q" direction="down" />',
  text: '<SlotText text="東京タワー" direction="both" />',
};

const NUMBERS = [1234.56, 13190.05, 597.99, 5970000.5, 81293.2, 42.07];
const LETTERS = ["A", "Q", "Z", "M", "E", "R", "S"];
// English mode mixes Latin (incl. a Title-case word), Japanese, and
// Traditional Chinese; Mandarin mode spins everyday Traditional Chinese.
const WORDS_EN = ["VOYAGE", "Harbor", "QUARTZ", "GARDEN", "東京タワー", "臺灣"];
const WORDS_ZH = ["春天", "圖書館", "海洋", "音樂會", "故宮"];
const PAUSE = 1900;

function useCycle(values) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setI((p) => (p + 1) % values.length),
      PAUSE,
    );
    return () => clearInterval(id);
  }, [values.length]);
  return values[i % values.length];
}

function DirectionControl({ value, onChange, t }) {
  return (
    <div>
      <span className="seg-label">{t.direction}</span>
      <div className="seg" role="group" aria-label={t.direction}>
        {["both", "up", "down"].map((o) => (
          <button
            key={o}
            type="button"
            className={"seg-btn" + (value === o ? " active" : "")}
            aria-pressed={value === o}
            onClick={() => onChange(o)}
          >
            {t.dir[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleControl({ value, onChange, label, t }) {
  return (
    <div>
      <span className="seg-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {[false, true].map((v) => (
          <button
            key={String(v)}
            type="button"
            className={"seg-btn" + (value === v ? " active" : "")}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
          >
            {v ? t.onOff.on : t.onOff.off}
          </button>
        ))}
      </div>
    </div>
  );
}

// The "?" usage tooltip shared by every card header.
function HelpTip({ eyebrow, usage, t }) {
  const tipId = "tip-" + eyebrow;
  return (
    <span className="help">
      <button
        type="button"
        className="help-btn"
        aria-label={t.usage}
        aria-describedby={tipId}
      >
        <span className="help-dot" aria-hidden="true">
          ?
        </span>
      </button>
      <span className="tip" role="tooltip" id={tipId}>
        <span className="tip-label">{t.usage}</span>
        <code className="tip-code">{usage}</code>
      </span>
    </span>
  );
}

function DemoCard({
  eyebrow,
  context,
  dir,
  setDir,
  randomSpin,
  setRandomSpin,
  t,
  usage,
  children,
}) {
  return (
    <section className="card">
      <div className="card-head">
        <p className="eyebrow">{eyebrow}</p>
        <HelpTip eyebrow={eyebrow} usage={usage} t={t} />
      </div>
      <div className="hero">{children}</div>
      <p className="context">{context}</p>
      <div className="controls">
        <DirectionControl value={dir} onChange={setDir} t={t} />
        <ToggleControl
          value={randomSpin}
          onChange={setRandomSpin}
          label={t.randomSpin}
          t={t}
        />
      </div>
    </section>
  );
}

// e × 10^6 → π × 10^6, in integer cents (avoids slider float drift).
const COUNTER_MIN = 271828182; // $2,718,281.82
const COUNTER_MAX = 314159265; // $3,141,592.65
const MONEY_FMT = { style: "currency", currency: "USD" };

// Scrubbable odometer. Counter mode rolls from the previous value, so it
// sits still on load and rolls only as the slider moves — the low digits
// blurring while the ten-thousands and up barely turn.
function CounterDemo({ t }) {
  const [cents, setCents] = useState(COUNTER_MIN);
  const [counter, setCounter] = useState(true);
  return (
    <section className="card">
      <div className="card-head">
        <p className="eyebrow">{t.counterEyebrow}</p>
        <HelpTip eyebrow={t.counterEyebrow} usage={USAGE.counter} t={t} />
      </div>
      <div className="hero">
        <SlotNumber
          value={cents / 100}
          format={MONEY_FMT}
          cents
          counter={counter}
          randomSpin={false}
        />
      </div>
      <p className="context">{t.counterCtx}</p>
      <div className="controls">
        <div className="slider-wrap">
          <span className="seg-label">{t.scrub}</span>
          <input
            type="range"
            className="slider"
            min={COUNTER_MIN}
            max={COUNTER_MAX}
            step="1"
            value={cents}
            onChange={(e) => setCents(+e.target.value)}
            aria-label={t.scrub}
          />
        </div>
        <ToggleControl
          value={counter}
          onChange={setCounter}
          label={t.counter}
          t={t}
        />
      </div>
    </section>
  );
}

const store = {
  get(k, fb) {
    try {
      return localStorage.getItem(k) ?? fb;
    } catch {
      return fb;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

function App() {
  const [theme, setTheme] = useState(() => store.get("se-theme", "dark"));
  const [lang, setLang] = useState(() => store.get("se-lang", "en"));
  const [numDir, setNumDir] = useState("both");
  const [letterDir, setLetterDir] = useState("both");
  const [textDir, setTextDir] = useState("both");
  const [numRandom, setNumRandom] = useState(false);
  const [letterRandom, setLetterRandom] = useState(false);
  const [textRandom, setTextRandom] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("lang", lang);
    store.set("se-theme", theme);
    store.set("se-lang", lang);
  }, [theme, lang]);

  const t = STRINGS[lang];
  const numValue = useCycle(NUMBERS);
  const letterValue = useCycle(LETTERS);
  const textValue = useCycle(lang === "zh" ? WORDS_ZH : WORDS_EN);

  return (
    <React.Fragment>
      <header className="site">
        <div>
          <h1 className="wordmark">sloteffect</h1>
          <p className="tagline">{t.tagline}</p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="lang-btn"
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            aria-label="Toggle language"
          >
            {t.lang}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t.theme}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <DemoCard
        eyebrow={t.numberEyebrow}
        context={t.numberCtx}
        dir={numDir}
        setDir={setNumDir}
        randomSpin={numRandom}
        setRandomSpin={setNumRandom}
        usage={USAGE.number}
        t={t}
      >
        <SlotNumber
          value={numValue}
          format={{ style: "currency", currency: "USD" }}
          cents
          direction={numDir}
          randomSpin={numRandom}
        />
      </DemoCard>

      <CounterDemo t={t} />

      <DemoCard
        eyebrow={t.textEyebrow}
        context={t.textCtx}
        dir={textDir}
        setDir={setTextDir}
        randomSpin={textRandom}
        setRandomSpin={setTextRandom}
        usage={USAGE.text}
        t={t}
      >
        <SlotText text={textValue} direction={textDir} randomSpin={textRandom} />
      </DemoCard>

      <DemoCard
        eyebrow={t.letterEyebrow}
        context={t.letterCtx}
        dir={letterDir}
        setDir={setLetterDir}
        randomSpin={letterRandom}
        setRandomSpin={setLetterRandom}
        usage={USAGE.letter}
        t={t}
      >
        <SlotLetter
          char={letterValue}
          direction={letterDir}
          randomSpin={letterRandom}
        />
      </DemoCard>

      <footer className="site">
        <a href="https://www.npmjs.com/package/sloteffect">npm</a>
        <a href="https://github.com/jauderho/sloteffect">GitHub</a>
        <span style={{ color: "var(--text3)" }}>
          {t.install}: <code>npm i sloteffect</code>
        </span>
      </footer>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
