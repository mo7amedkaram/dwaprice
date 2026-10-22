// Feature detection, event types, messages and minimal typings of the Web Speech API (lib.dom
// does not declare the constructors). Kept apart from ./voice so the search box can detect
// support and show messages without loading the recognition code.

export type VoiceErrorCode = 'not-allowed' | 'no-speech' | 'network' | 'audio-capture' | 'unsupported' | 'other';

export type VoiceEvent =
  | { type: 'start' }
  | { type: 'interim'; text: string }
  | { type: 'final'; text: string; alternatives: string[] }
  | { type: 'end' }
  | { type: 'error'; code: VoiceErrorCode };

/** Short Arabic messages shown under the search box. */
export const VOICE_MESSAGES: Record<VoiceErrorCode, string> = {
  'not-allowed': 'الميكروفون مرفوض. اسمح به من أيقونة القفل بجانب عنوان الموقع ثم جرّب مرة أخرى.',
  'no-speech': 'لم نسمع شيئًا. اضغط الميكروفون وتكلم بوضوح.',
  network: 'التعرف على الكلام يحتاج اتصالًا بالإنترنت.',
  'audio-capture': 'لا يوجد ميكروفون متاح على هذا الجهاز.',
  unsupported: 'البحث بالصوت غير مدعوم في هذا المتصفح.',
  other: 'تعذّر البحث بالصوت. جرّب مرة أخرى.',
};

export interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}
export interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
export interface RecognitionResultEvent extends Event {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
export interface RecognitionErrorEvent extends Event {
  error: string;
}
export interface Recognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: ((e: Event) => void) | null;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionCtor = new () => Recognition;

/** The constructor when the browser has the API, else null (Firefox, older browsers). */
export function speechRecognitionCtor(w: Window | undefined = typeof window === 'undefined' ? undefined : window): RecognitionCtor | null {
  if (!w) return null;
  const g = w as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}
