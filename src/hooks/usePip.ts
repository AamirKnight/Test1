// src/hooks/usePiP.ts
//
// Typed TypeScript wrapper around our custom Kotlin PipModule.
// Zero npm dependencies — talks directly to the native module we wrote.
//
// Usage:
//   const { inPipMode, enterPip, isPipSupported } = usePiP();
//
// enterPip() — call on back-button press; enters PiP with 9:16 portrait ratio
// inPipMode  — boolean, true while the app is in the PiP window
// isPipSupported — boolean, false on API < 26 or unsupported devices

import { useEffect, useRef, useState } from 'react';
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
} from 'react-native';

// ── Types ────────────────────────────────────────────────────────────────────

interface PipModuleInterface {
  /** Enter PiP with a rational aspect ratio.  enterPipMode(9,16) = portrait. */
  enterPipMode(width: number, height: number): void;
  /** Resolves true if the device supports PiP (API 26+ with feature flag). */
  isPipSupported(): Promise<boolean>;
  /** Resolves true if the activity is currently in PiP mode. */
  isInPipMode(): Promise<boolean>;
  /** Required NativeEventEmitter boilerplate (RN ≥ 0.65). */
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

interface PipModeChangedEvent {
  isInPipMode: boolean;
}

// ── Raw native module reference ───────────────────────────────────────────────

const PipNativeModule: PipModuleInterface | null =
  Platform.OS === 'android' ? NativeModules.PipModule ?? null : null;

// ── usePiP hook ───────────────────────────────────────────────────────────────

export function usePiP() {
  const [inPipMode, setInPipMode] = useState(false);
  const [isPipSupported, setIsPipSupported] = useState(false);
  const emitterRef = useRef<NativeEventEmitter | null>(null);

  // Check device support once on mount
  useEffect(() => {
    if (!PipNativeModule) return;
    PipNativeModule.isPipSupported().then(setIsPipSupported).catch(() => {});
  }, []);

  // Subscribe to mode-change events from MainActivity callback
  useEffect(() => {
    if (!PipNativeModule) return;

    const emitter = new NativeEventEmitter(PipNativeModule as any);
    emitterRef.current = emitter;

    const subscription = emitter.addListener(
      'onPipModeChanged',
      (event: PipModeChangedEvent) => {
        setInPipMode(event.isInPipMode);
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // enterPip — enters portrait PiP (9:16). Pass custom ratio if needed.
  const enterPip = (width = 9, height = 16) => {
    if (!PipNativeModule) return;
    PipNativeModule.enterPipMode(width, height);
  };

  return { inPipMode, isPipSupported, enterPip };
}