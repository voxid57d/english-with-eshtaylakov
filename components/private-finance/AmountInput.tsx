"use client";

import { useLayoutEffect, useRef } from "react";

/** Keep the stored value numeric while displaying grouping, including mid-value edits. */
export default function AmountInput({ value, onValueChange, min = 0.01, max, required = true }: {
   value: string; onValueChange: (value: string) => void; min?: number; max?: number; required?: boolean;
}) {
   const input = useRef<HTMLInputElement>(null);
   const caret = useRef<number | null>(null);
   const [whole, fraction] = value.split(".");
   const display = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction === undefined ? "" : `.${fraction}`);
   useLayoutEffect(() => {
      const field = input.current;
      if (!field) return;
      const number = Number(value);
      field.setCustomValidity(value && (!Number.isFinite(number) || number < min || (max !== undefined && number > max)) ? `Enter an amount ${max === undefined ? `of at least ${min}` : `between ${min} and ${max}`}.` : "");
      if (caret.current !== null) {
         let position = 0, characters = 0;
         while (position < display.length && characters < caret.current) { if (display[position] !== ",") characters++; position++; }
         field.setSelectionRange(position, position); caret.current = null;
      }
   }, [display, value, min, max]);
   return <input ref={input} type="text" inputMode="decimal" autoComplete="off" value={display} placeholder="0" required={required}
      onChange={(event) => {
         const text = event.target.value;
         const raw = text.replace(/,/g, "");
         if (!/^-?\d*(\.\d{0,2})?$/.test(raw) || (min >= 0 && raw.startsWith("-"))) return;
         caret.current = text.slice(0, event.target.selectionStart ?? text.length).replace(/,/g, "").length;
         onValueChange(raw);
      }} />;
}
