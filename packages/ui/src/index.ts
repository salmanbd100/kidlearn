// Public surface of @kidlearn/ui. Re-export primitives + helpers here so
// consumers import from "@kidlearn/ui" rather than deep paths.

export { useIsMotionReduced } from "./hooks/use-reduced-motion";
export {
  A11Y_BOOTSTRAP_SCRIPT,
  A11Y_PREF_CLASSES,
  A11Y_PREF_KEYS,
  A11Y_STORAGE_KEY,
  type A11yPrefKey,
  type A11yPrefs,
  applyA11yPrefs,
  DEFAULT_A11Y_PREFS,
  readA11yPrefs,
  setA11yPref,
  writeA11yPrefs,
} from "./lib/a11y-prefs";
export { cn } from "./lib/cn";
export { Button, type ButtonProps, buttonVariants } from "./primitives/button";
export {
  Dialog,
  DialogClose,
  DialogContent,
  type DialogContentProps,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  type DialogHeaderProps,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
  dialogContentVariants,
  dialogHeaderVariants,
} from "./primitives/dialog";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  dropdownMenuContentVariants,
} from "./primitives/dropdown-menu";
export { Input, type InputProps, inputVariants } from "./primitives/input";
export { Label, type LabelProps, labelVariants } from "./primitives/label";
export { Select, type SelectProps, selectVariants } from "./primitives/select";
export {
  Textarea,
  type TextareaProps,
  textareaVariants,
} from "./primitives/textarea";
