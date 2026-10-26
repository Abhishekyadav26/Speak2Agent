"use client";
import { useEffect, useRef, useState } from "react";

export default function CommandBar({ onSubmit, busy }: { onSubmit: (text: string) => void; busy: boolean }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => recRef.current?.stop(), []);

  function toggleListen() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => WebSpeechRec; SpeechRecognition?: new () => WebSpeechRec }).webkitSpeechRecognition
      || (window as unknown as { SpeechRecognition?: new () => WebSpeechRec }).SpeechRecognition;
    if (!SR) {
      alert("Native speech recognition is unavailable in this browser. Dictate via Wispr Flow into this box, then press Generate.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e: { results: { length: number; [i: number]: { [j: number]: { transcript: string } } }; resultIndex: number }) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setText(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  interface WebSpeechRec { lang: string; interimResults: boolean; onresult: ((e: never) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void; }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleListen}
          aria-pressed={listening}
          className={`rounded-lg px-3 py-2 text-sm font-medium ${listening ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"}`}
        >
          {listening ? "● Stop" : "🎙 Dictate"}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim() && !busy) onSubmit(text.trim()); }}
          placeholder='Describe an agent — e.g. "Create a blockchain research agent that tracks a wallet…"'
          aria-label="Agent request"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <button
          onClick={() => text.trim() && onSubmit(text.trim())}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "…" : "Generate"}
        </button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Voice: use Wispr Flow to dictate anywhere, or the Dictate button (Web Speech API) where supported. Typing works identically.
      </p>
    </div>
  );
}
