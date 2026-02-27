import { useEffect, useRef, useState } from 'react';

interface TypewriterOptions {
  text: string;
  speed?: number; // ms per character
  enabled?: boolean;
  onDone?: () => void;
}

export function useTypewriter({ text, speed = 10, enabled = true, onDone }: TypewriterOptions) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      return;
    }

    // Guard against text shrinking (shouldn't happen but be safe)
    if (text.length < indexRef.current) {
      indexRef.current = 0;
      setDisplayed('');
    }

    // Already fully displayed
    if (indexRef.current >= text.length) return;

    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= speed) {
        lastTimeRef.current = timestamp;
        indexRef.current += 1;
        setDisplayed(text.slice(0, indexRef.current));

        if (indexRef.current >= text.length) {
          onDoneRef.current?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, speed, enabled]);

  return displayed;
}
