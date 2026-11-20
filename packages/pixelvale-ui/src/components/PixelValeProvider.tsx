import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cx } from '../lib/cx';
import {
  BASE_MESSAGES,
  getLocaleMessages,
  interpolateMessage,
  type LocaleMessageKey,
  type LocaleMessagesOverride,
  type PixelValeLocale,
  type TranslateFunction,
} from '../lib/locale';

export type PixelValeTheme = 'day' | 'night' | 'autumn';

export type SoundName =
  'hover' | 'click' | 'open' | 'close' | 'toggle' | 'success' | 'error' | 'coin';

export interface SoundContextValue {
  enabled: boolean;
  volume: number;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  play: (name: SoundName) => void;
}

interface PixelValeContextValue {
  theme: PixelValeTheme;
  portalHost: HTMLDivElement | null;
  locale: PixelValeLocale;
  t: TranslateFunction;
}

export interface LocaleContextValue {
  locale: PixelValeLocale;
  t: TranslateFunction;
}

const noop = () => undefined;

const FALLBACK_SOUND: SoundContextValue = {
  enabled: false,
  volume: 0,
  setEnabled: noop,
  setVolume: noop,
  play: noop,
};

const fallbackT: TranslateFunction = (key: LocaleMessageKey, params) =>
  interpolateMessage(BASE_MESSAGES.en[key], params);

const FALLBACK_CONTEXT: PixelValeContextValue = {
  theme: 'day',
  portalHost: null,
  locale: 'en',
  t: fallbackT,
};

const SoundContext = createContext<SoundContextValue>(FALLBACK_SOUND);
const PixelValeContext = createContext<PixelValeContextValue>(FALLBACK_CONTEXT);

type Note = readonly [
  frequency: number,
  offset: number,
  duration: number,
  wave?: OscillatorType,
  gain?: number,
];

/**
 * Tiny synthesized chiptune cues. No audio files, no network requests, and
 * every oscillator is stopped by the note's own envelope.
 */
const SOUND_PATTERNS: Record<SoundName, readonly Note[]> = {
  hover: [[720, 0, 0.035, 'square', 0.35]],
  click: [
    [520, 0, 0.045, 'square', 0.5],
    [780, 0.045, 0.055, 'square', 0.38],
  ],
  open: [
    [440, 0, 0.06, 'triangle', 0.55],
    [660, 0.055, 0.09, 'triangle', 0.5],
  ],
  close: [
    [560, 0, 0.06, 'triangle', 0.45],
    [350, 0.05, 0.09, 'triangle', 0.4],
  ],
  toggle: [
    [620, 0, 0.04, 'square', 0.4],
    [880, 0.04, 0.05, 'square', 0.3],
  ],
  success: [
    [523, 0, 0.09, 'triangle', 0.55],
    [659, 0.09, 0.09, 'triangle', 0.5],
    [784, 0.18, 0.16, 'triangle', 0.45],
  ],
  error: [
    [180, 0, 0.12, 'sawtooth', 0.4],
    [130, 0.1, 0.18, 'sawtooth', 0.35],
  ],
  coin: [
    [988, 0, 0.055, 'square', 0.35],
    [1319, 0.055, 0.12, 'square', 0.3],
  ],
};

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return null;

  try {
    return new AudioContextClass();
  } catch {
    return null;
  }
}

function playNote(context: AudioContext, note: Note, volume: number): void {
  const [frequency, offset, duration, wave = 'square', level = 0.5] = note;
  const start = context.currentTime + 0.012 + offset;
  const end = start + duration;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, volume * 0.055 * level),
    start + 0.012,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

export interface PixelValeProviderProps {
  children: ReactNode;
  /** Color theme for every component and portal. Defaults to "day". */
  theme?: PixelValeTheme;
  /** Initial state of the synthesized sound effects. Defaults to true. */
  defaultSoundEnabled?: boolean;
  /** Initial sound level between 0 and 1. Defaults to 0.55. */
  defaultVolume?: number;
  /** Built-in interface language. Defaults to English. */
  locale?: PixelValeLocale;
  /** Optional overrides for individual built-in strings. */
  messages?: LocaleMessagesOverride;
  className?: string;
  style?: CSSProperties;
}

/**
 * Theme + sound host. It also owns a themed portal root so dialogs, tooltips,
 * and toasts inherit the same CSS variables as the rest of the app.
 */
export function PixelValeProvider({
  children,
  theme = 'day',
  defaultSoundEnabled = true,
  defaultVolume = 0.55,
  locale = 'en',
  messages,
  className,
  style,
}: PixelValeProviderProps) {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [enabled, setEnabled] = useState(defaultSoundEnabled);
  const [volume, setVolumeState] = useState(() =>
    Math.min(1, Math.max(0, defaultVolume)),
  );

  const contextRef = useRef<AudioContext | null>(null);
  const lastHoverRef = useRef(0);

  const setVolume = useCallback((next: number) => {
    setVolumeState(Math.min(1, Math.max(0, Number.isFinite(next) ? next : 0)));
  }, []);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled || volume <= 0) return;

      if (name === 'hover') {
        const now = Date.now();
        if (now - lastHoverRef.current < 90) return;
        lastHoverRef.current = now;
      }

      const context = contextRef.current ?? getAudioContext();
      if (!context) return;
      contextRef.current = context;

      if (context.state === 'suspended') {
        void context.resume().catch(noop);
      }

      try {
        for (const note of SOUND_PATTERNS[name]) {
          playNote(context, note, volume);
        }
      } catch {
        // Audio is decorative; a blocked or closed context must never break the UI.
      }
    },
    [enabled, volume],
  );

  useEffect(() => {
    return () => {
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== 'closed') {
        void context.close().catch(noop);
      }
    };
  }, []);

  const resolvedMessages = useMemo(
    () => getLocaleMessages(locale, messages),
    [locale, messages],
  );
  const t = useCallback<TranslateFunction>(
    (key, params) =>
      interpolateMessage(resolvedMessages[key] ?? BASE_MESSAGES.en[key] ?? key, params),
    [resolvedMessages],
  );

  const soundValue = useMemo<SoundContextValue>(
    () => ({ enabled, volume, setEnabled, setVolume, play }),
    [enabled, volume, play, setVolume],
  );

  const pixelValeValue = useMemo<PixelValeContextValue>(
    () => ({ theme, portalHost, locale, t }),
    [theme, portalHost, locale, t],
  );

  return (
    <PixelValeContext.Provider value={pixelValeValue}>
      <SoundContext.Provider value={soundValue}>
        <div
          className={cx('pv-root', className)}
          data-pv-theme={theme}
          data-pv-locale={locale}
          lang={locale}
          style={style}
        >
          {children}
          <div ref={setPortalHost} className="pv-portal" />
        </div>
      </SoundContext.Provider>
    </PixelValeContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  return useContext(SoundContext);
}

export function usePixelVale(): PixelValeContextValue {
  return useContext(PixelValeContext);
}

export function useLocale(): LocaleContextValue {
  const { locale, t } = useContext(PixelValeContext);
  return { locale, t };
}

/**
 * Internal helper shared by overlays. Falls back to document.body when the
 * consumer forgot a provider (the overlay still works, minus theme variables).
 */
export function usePortalHost(): HTMLElement | null {
  const { portalHost } = useContext(PixelValeContext);
  if (portalHost) return portalHost;
  return typeof document === 'undefined' ? null : document.body;
}
