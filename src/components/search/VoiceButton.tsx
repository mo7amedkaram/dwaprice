'use client';

// Microphone button inside the search box. Rendered only when the browser has the Web Speech API
// (detected after hydration: the server renders nothing, the button fades in; no mismatch, no
// shift since the input simply keeps its width). The recognition code (./voice) is imported on
// the first tap, so it is not part of the page bundle, and the microphone never starts by itself.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MicIcon } from '../icons';
import { cx } from '../ui';
import type { VoiceSession } from './voice';
import { speechRecognitionCtor, type VoiceEvent } from './voice-detect';

export interface VoiceButtonProps {
  onEvent: (e: VoiceEvent) => void;
  /** Mirrors the session state for the parent (placeholder text, aria). */
  onListeningChange: (listening: boolean) => void;
  size?: 'md' | 'lg';
}

// Support never changes while the page lives: server snapshot false (nothing rendered),
// client snapshot = the real detection, applied by React right after hydration.
const noSubscribe = () => () => {};
const detect = () => speechRecognitionCtor() !== null;
const detectOnServer = () => false;

export function VoiceButton({ onEvent, onListeningChange, size = 'md' }: VoiceButtonProps) {
  const supported = useSyncExternalStore(noSubscribe, detect, detectOnServer);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useRef<VoiceSession | null>(null);

  useEffect(() => () => session.current?.stop(), []);

  const setState = (on: boolean) => {
    setListening(on);
    onListeningChange(on);
  };

  async function toggle() {
    if (listening || busy) {
      session.current?.stop();
      setState(false);
      return;
    }
    setBusy(true);
    try {
      const { VoiceSession } = await import('./voice');
      const s = new VoiceSession((e) => {
        if (e.type === 'start') setState(true);
        if (e.type === 'end') {
          setState(false);
          session.current = null;
        }
        onEvent(e);
      });
      session.current = s;
      s.start();
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="بحث بالصوت"
      aria-pressed={listening}
      title={listening ? 'إيقاف الاستماع' : 'بحث بالصوت'}
      className={cx(
        'tap voice-fade-in inline-flex shrink-0 items-center justify-center rounded-control-sm transition-colors',
        size === 'lg' ? 'size-12' : 'size-11',
        listening ? 'bg-up-bg text-up motion-safe:animate-pulse' : 'text-text-2 hover:bg-surface hover:text-primary',
      )}
    >
      <MicIcon size={size === 'lg' ? 22 : 20} />
    </button>
  );
}
