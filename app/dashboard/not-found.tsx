import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardNotFound() {
  return (
    <div className="crm-enter flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <SearchX className="size-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">הרשומה לא נמצאה</h2>
        <p className="max-w-sm text-muted-foreground text-sm">
          ייתכן שהיא נמחקה, או שהקישור שגוי.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/dashboard">חזרה לדאשבורד</Link>
      </Button>
    </div>
  );
}
