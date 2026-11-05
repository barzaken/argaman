import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">הדף לא נמצא</h1>
      <p className="text-muted-foreground text-sm">הקישור שגוי או שהדף הוסר.</p>
      <Button asChild>
        <Link href="/dashboard">לדאשבורד</Link>
      </Button>
    </main>
  );
}
