import { Skeleton } from "@/components/ui/skeleton";

export default function AgentsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-1 h-3 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-start gap-3 pb-2">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-1.5 pt-2">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-18 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
