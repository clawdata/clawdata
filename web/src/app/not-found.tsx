import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Page Not Found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
