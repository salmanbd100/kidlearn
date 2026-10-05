import { Button } from "@kidlearn/ui";
import Link from "next/link";
import { ADMIN_ROUTES } from "@/features/admin/admin-routes";

export default function AdminNotFound() {
  return (
    <main className="flex flex-1 flex-col items-start gap-4 p-6">
      <p className="text-muted-foreground text-sm">No CMS page lives here.</p>
      <Button asChild variant="outline">
        <Link href={ADMIN_ROUTES.analytics}>Go to Analytics</Link>
      </Button>
    </main>
  );
}
