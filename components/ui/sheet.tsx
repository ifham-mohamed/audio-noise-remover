"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;

const SheetContent = React.forwardRef<React.ElementRef<typeof Dialog.Content>, React.ComponentPropsWithoutRef<typeof Dialog.Content>>(({ className, children, ...props }, ref) => (
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out" />
    <Dialog.Content ref={ref} className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(88vw,20rem)] flex-col border-r border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl focus:outline-none", className)} {...props}>
      <Dialog.Title className="sr-only">Mobile navigation</Dialog.Title>
      <Dialog.Description className="sr-only">Choose a workspace surface.</Dialog.Description>
      {children}
      <Dialog.Close className="absolute right-3 top-3 grid min-h-11 min-w-11 place-items-center rounded-md p-2 text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]" aria-label="Close navigation">
        <X className="size-4" aria-hidden="true" />
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
));
SheetContent.displayName = Dialog.Content.displayName;

export { Sheet, SheetTrigger, SheetClose, SheetContent };
