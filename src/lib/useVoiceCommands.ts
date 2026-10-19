"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice commands for the capture flow (Spanish grammar, field-friendly).
 *
 * Design notes:
 * - Continuous listening with auto-restart: the worker's hands are often
 *   dirty or holding the phone; a push-to-talk button defeats the purpose.
 * - Only listens while explicitly enabled (toggle) — construction sites are
 *   loud and always-on mics drain battery and mis-trigger.
 * - Graceful no-op on browsers without webkitSpeechRecognition (iOS Safari
 *   supports it as of 14.5+; Firefox does not).
 */

export type VoiceCommand =
  | "capturar"
  | "analizar"
  | "iniciar"
  | "detener"
  | "voltear"
  | "linterna"
  | "limpiar";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Map a Spanish transcript to a command. Tolerant to filler words.
 *  Order matters: "limpia las fotos" / "analiza las fotos" contain the noun
 *  "fotos", so capture is checked LAST; stop/flip are checked before start
 *  so "cierra cámara" is not hijacked by the "cámara" noun. */
export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const text = transcript.toLowerCase().trim();
  if (!text) return null;
  // 'para' alone is a common preposition — require parar/detener/alto/cierra/apaga
  if (/\b(detente|detener|parar|alto|cierra|cerrar|apaga)\b/.test(text)) return "detener";
  if (/\b(limpia|limpiar|borra|borrar|reinicia|reiniciar)\b/.test(text)) return "limpiar";
  if (/\b(voltea|voltear|gira|girar|cambia|cambiar)\b/.test(text)) return "voltear";
  if (/\b(linterna|flash|luz)\b/.test(text)) return "linterna";
  // start: action verbs only — never the bare noun "cámara" (matches too much)
  if (/\b(inicia|iniciar|activa|activar|empieza|empezar|abre|abrir)\b/.test(text)) return "iniciar";
  if (/\b(analiza|analizar|finaliza|finalizar|termina|terminar|diagnostico)\b/.test(text)) return "analizar";
  if (/\b(captura|capturar|toma|tomar|foto|fotos|dispara)\b/.test(text)) return "capturar";
  return null;
}

type Options = {
  /** Called with the matched command. Must be stable (useCallback) or memoized. */
  onCommand: (command: VoiceCommand) => void;
  lang?: string;
};

export function useVoiceCommands({ onCommand, lang = "es-ES" }: Options) {
  const [supported] = useState<boolean>(() => getRecognitionCtor() !== null);
  const [enabled, setEnabled] = useState(false);
  const [lastHeard, setLastHeard] = useState<string>("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const enabledRef = useRef(false);
  const onCommandRef = useRef(onCommand);
  const restartingRef = useRef(false);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const stopListening = useCallback(() => {
    restartingRef.current = true; // suppress auto-restart during intentional stop
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    recognitionRef.current = null;
  }, []);

  const startListeningRef = useRef<() => void>(() => undefined);

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;
    try {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        // Only the latest final result matters
        const result = event.results[event.results.length - 1];
        const transcript = result?.[0]?.transcript || "";
        if (!transcript) return;
        setLastHeard(transcript.slice(0, 40));
        const command = matchVoiceCommand(transcript);
        if (command) onCommandRef.current(command);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        // Chrome ends the session periodically; restart while enabled
        if (enabledRef.current && !restartingRef.current) {
          window.setTimeout(() => {
            if (enabledRef.current) startListeningRef.current();
          }, 250);
        }
      };

      recognition.onerror = () => {
        // 'no-speech' and 'aborted' are normal in continuous mode; onend restarts
      };

      restartingRef.current = false;
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, [lang]);

  // Indirection lets onend restart without referencing the callback mid-declaration
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      enabledRef.current = next;
      if (next) {
        setLastHeard("");
        startListening();
      } else {
        stopListening();
      }
      return next;
    });
  }, [startListening, stopListening]);

  // Stop on unmount
  useEffect(() => {
    return () => {
      enabledRef.current = false;
      stopListening();
    };
  }, [stopListening]);

  /** Temporarily release the mic (e.g. before getUserMedia claims it) while
   *  staying enabled — recognition restarts on resume(). */
  const pause = useCallback(() => {
    if (!enabledRef.current) return;
    stopListening();
  }, [stopListening]);

  const resume = useCallback(() => {
    if (!enabledRef.current) return;
    startListening();
  }, [startListening]);

  return { supported, enabled, toggle, lastHeard, pause, resume };
}
