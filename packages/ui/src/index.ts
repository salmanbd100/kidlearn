// Public surface of @kidlearn/ui. Re-export primitives + helpers here so
// consumers import from "@kidlearn/ui" rather than deep paths.
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
