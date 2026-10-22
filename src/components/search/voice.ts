// Voice input for the search box through the browser's own speech recognition (Web Speech API:
// SpeechRecognition / webkitSpeechRecognition). Loaded with a dynamic import on the first tap
// of the microphone button, so it adds nothing to the page bundle. Nothing is recorded or
// stored here: the browser streams audio to its recognition service and hands back text.

import { speechRecognitionCtor, type Recognition, type VoiceErrorCode, type VoiceEvent } from './voice-detect';

function errorCode(error: string): VoiceErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'audio-capture':
      return 'audio-capture';
    case 'language-not-supported':
      return 'unsupported';
    default:
      return 'other';
  }
}

/**
 * One listening session: Egyptian Arabic, interim results on, stops by itself after a pause
 * (continuous = false). `stop()` cancels (the mic was tapped again, or the box unmounted).
 */
export class VoiceSession {
  private rec: Recognition | null = null;
  private ended = false;

  constructor(private readonly onEvent: (e: VoiceEvent) => void) {}

  start(): void {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      this.onEvent({ type: 'error', code: 'unsupported' });
      this.onEvent({ type: 'end' });
      return;
    }
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = 'ar-EG';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;
    rec.onstart = () => this.onEvent({ type: 'start' });
    rec.onresult = (e) => {
      let text = '';
      let finalText = '';
      const alternatives: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        text += r[0]?.transcript ?? '';
        if (r.isFinal) {
          finalText += r[0]?.transcript ?? '';
          for (let a = 1; a < r.length; a++) if (r[a]?.transcript) alternatives.push(r[a].transcript);
        }
      }
      if (finalText.trim()) this.onEvent({ type: 'final', text: finalText.trim(), alternatives: alternatives.map((t) => t.trim()).filter(Boolean) });
      else this.onEvent({ type: 'interim', text: text.trim() });
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return; // stop(): the user cancelled, not an error
      this.onEvent({ type: 'error', code: errorCode(e.error) });
    };
    rec.onend = () => {
      if (this.ended) return;
      this.ended = true;
      this.onEvent({ type: 'end' });
    };
    try {
      rec.start();
    } catch {
      this.onEvent({ type: 'error', code: 'other' });
      this.onEvent({ type: 'end' });
    }
  }

  stop(): void {
    try {
      this.rec?.abort();
    } catch {
      /* already stopped */
    }
  }
}
