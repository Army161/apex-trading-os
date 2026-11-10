'use client';
// Voice in and out for the AI chats (idea from archive/chat/29). Read-aloud uses the browser's built-in speechSynthesis,
// which runs on your device. The mic uses the browser's SpeechRecognition: in Chrome that sends the audio to Google's
// speech service to transcribe it, Safari uses Apple's. Nothing is recorded or stored by Apex.
import { useEffect, useRef, useState } from 'react';

export function useVoice() {
  const [listening, setListening] = useState(false); const [speakOn, setSpeakOn] = useState(false); const [canListen, setCanListen] = useState(false);
  const rec = useRef<any>(null);
  useEffect(() => {
    setCanListen(typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    try { setSpeakOn(localStorage.getItem('apex:speak') === '1'); } catch { /* private mode */ }
  }, []);
  const listen = (onText: (t: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SR(); r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => onText(e.results[0][0].transcript); r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  };
  const speak = (text: string) => {
    if (!speakOn || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/[*#`_|]/g, '').slice(0, 1500)); u.rate = 1.05; window.speechSynthesis.speak(u);
  };
  const toggleSpeak = () => { const v = !speakOn; setSpeakOn(v); try { localStorage.setItem('apex:speak', v ? '1' : '0'); } catch { /* ignore */ } if (!v) window.speechSynthesis?.cancel(); };
  return { listening, canListen, speakOn, listen, speak, toggleSpeak };
}

export function VoiceButtons({ v, onText }: { v: ReturnType<typeof useVoice>; onText: (t: string) => void }) {
  return <>
    {v.canListen && <button className={`btn ${v.listening ? 'pri' : ''}`} title="Speak your question (Chrome sends audio to Google to transcribe)" onClick={() => v.listen(onText)}>{v.listening ? 'Listening… tap to stop' : 'Mic'}</button>}
    <button className="btn" title="Read replies aloud with your device's own voice" onClick={v.toggleSpeak}>{v.speakOn ? 'Voice on' : 'Voice off'}</button>
  </>;
}
