import { AppHeader } from "@/components/app-header";
import { requireUserId } from "@/lib/session";
import { ToastProvider } from "@/components/toast-provider";
import { PendingEvaluationsProvider } from "@/components/pending-evaluations-context";
import { CommandPaletteProvider } from "@/components/command-palette";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUserId();

  return (
    <ToastProvider>
      <PendingEvaluationsProvider>
        <CommandPaletteProvider>
          <div className="flex flex-1 flex-col">
            <AppHeader />
            {children}
          </div>
        </CommandPaletteProvider>
      </PendingEvaluationsProvider>
    </ToastProvider>
  );
}
