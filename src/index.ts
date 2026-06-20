/**
 * sloteffect — slot-machine-style rolls for numbers, letters, and
 * text. Dependency-free (React peer dependency only), accessible, and honoring
 * `prefers-reduced-motion`.
 */

export {
  DIGITS,
  LOWER,
  SLOT_EASING,
  type SlotDirection,
  UPPER,
} from "./reel";
export { SlotLetter, type SlotLetterProps } from "./SlotLetter";
export { SlotNumber, type SlotNumberProps } from "./SlotNumber";
export { SlotText, type SlotTextProps } from "./SlotText";
