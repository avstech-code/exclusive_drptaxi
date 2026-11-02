'use client';

import { useEffect, useRef, useState } from 'react';
import { autocomplete } from '@/lib/api-client';
import type { PlaceSuggestion } from '@/lib/types';

const newSession = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2, 14).padEnd(12, '0');

/**
 * Pickup/drop search box. Suggestions come from our own API (which asks Google), so no Google script or key is
 * loaded in the browser. Follows the ARIA combobox pattern: arrow keys move, Enter selects, Escape closes.
 */
export function PlaceInput({ inputId, label, placeholder = 'Enter min 3 char to search', onSelected, onUnavailable, prefill }: {
  inputId: string;
  label: string;
  placeholder?: string;
  /** The chosen place, or null as soon as the visitor edits the text again. */
  onSelected: (place: PlaceSuggestion | null) => void;
  /** Called when the place search itself fails (quota, outage) so the page can switch to the city lists. */
  onUnavailable: () => void;
  /** Fill the box with this text and select the best matching place (used by the Book now buttons). A new nonce applies it again. */
  prefill?: { text: string; nonce: number } | null;
}) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const session = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef('');

  useEffect(() => {
    session.current = newSession();
    return () => clearTimeout(timer.current);
  }, []);

  const prefillNonce = prefill?.nonce;
  useEffect(() => {
    if (!prefill) return;
    const q = prefill.text.trim();
    if (!q) return;
    let cancelled = false;
    setText(q);
    onSelected(null);
    latest.current = q;
    (async () => {
      const result = await autocomplete(q, session.current);
      if (cancelled || latest.current !== q) return;
      if (result === null) return onUnavailable();
      if (result.length) {
        const s = result[0];
        setText(s.secondaryText ? `${s.mainText}, ${s.secondaryText}` : s.mainText);
        onSelected(s);
        session.current = newSession();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillNonce]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  function onInput(value: string) {
    setText(value);
    onSelected(null);
    clearTimeout(timer.current);
    if (value.trim().length < 3) return close();
    timer.current = setTimeout(async () => {
      const q = value.trim();
      latest.current = q;
      setLoading(true);
      const result = await autocomplete(q, session.current);
      if (latest.current !== q) return; // a newer search is already running
      setLoading(false);
      if (result === null) return onUnavailable();
      setSuggestions(result);
      setActive(-1);
      setOpen(true);
    }, 250);
  }

  function choose(s: PlaceSuggestion) {
    setText(s.secondaryText ? `${s.mainText}, ${s.secondaryText}` : s.mainText);
    onSelected(s);
    close();
    session.current = newSession(); // a new billing session starts after each selection
  }

  function onKey(e: React.KeyboardEvent) {
    const n = suggestions.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      setOpen(true);
      setActive((active + 1) % n);
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      setActive((active - 1 + n) % n);
    } else if (e.key === 'Enter' && open && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') close();
  }

  return (
    <div className="place-field">
      <label className="req" htmlFor={inputId}>{label}</label>
      <div className="place-input">
        <input
          id={inputId} type="text" role="combobox" autoComplete="off" maxLength={100} placeholder={placeholder} value={text}
          aria-expanded={open} aria-controls={`${inputId}-list`} aria-activedescendant={active >= 0 ? `${inputId}-opt-${active}` : undefined}
          aria-autocomplete="list"
          onChange={(e) => onInput(e.target.value)} onKeyDown={onKey} onBlur={close}
          onFocus={() => suggestions.length && text.trim().length >= 3 && setOpen(true)}
        />
        {open && (
          <ul className="suggestions" role="listbox" id={`${inputId}-list`} onMouseDown={(e) => e.preventDefault()}>
            {suggestions.map((s, i) => (
              <li key={s.placeId} role="option" id={`${inputId}-opt-${i}`} className={i === active ? 'active' : undefined} aria-selected={i === active} onClick={() => choose(s)}>
                <strong>{s.mainText}</strong>
                {s.secondaryText && <span className="note"> {s.secondaryText}</span>}
              </li>
            ))}
            {suggestions.length === 0 && <li className="empty" role="presentation">{loading ? 'Searching…' : 'No places found'}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
