import { Platform, Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Two short beeps followed by a longer, higher beep — the same rhythm on every
// platform so the alert is recognisable no matter where the app runs.
const NOTES = [
  { at: 0, freq: 1047, dur: 0.12 },
  { at: 0.18, freq: 1047, dur: 0.12 },
  { at: 0.36, freq: 1568, dur: 0.34 },
];

const ALERT_SOURCE = require('../../assets/sounds/bill-alert.wav');

let nativePlayer: AudioPlayer | null = null;
let audioModeSet = false;
let webContext: AudioContext | null = null;

function playNativeSound() {
  try {
    if (!nativePlayer) nativePlayer = createAudioPlayer(ALERT_SOURCE);
    if (!audioModeSet) {
      audioModeSet = true;
      // POS alerts must be audible even when the device is on silent.
      setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    nativePlayer.seekTo(0).catch(() => {});
    nativePlayer.play();
  } catch {
    // Never let a missing/blocked sound break the action that triggered it.
  }
  // Backs up the chime when the speaker is muted or the device is face-down.
  try {
    Vibration.vibrate([0, 180, 90, 180]);
  } catch {
    // Ignore — vibration is best-effort.
  }
}

function playWebSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!webContext) webContext = new AudioContextCtor();
    const ctx = webContext;

    const schedule = () => {
      const start = ctx.currentTime + 0.01;
      for (const note of NOTES) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = note.freq;

        const began = start + note.at;
        const ends = began + note.dur;
        gain.gain.setValueAtTime(0.0001, began);
        gain.gain.exponentialRampToValueAtTime(0.3, began + 0.01);
        gain.gain.setValueAtTime(0.3, Math.max(began + 0.01, ends - 0.05));
        gain.gain.exponentialRampToValueAtTime(0.0001, ends);

        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(began);
        oscillator.stop(ends + 0.02);
      }
    };

    if (ctx.state === 'suspended') ctx.resume().then(schedule).catch(() => {});
    else schedule();
  } catch {
    // Ignore — sound is best-effort.
  }
}

/** Plays the alert chime. Safe to call repeatedly; never throws. */
export function playAlertSound(): void {
  if (Platform.OS === 'web') playWebSound();
  else playNativeSound();
}
