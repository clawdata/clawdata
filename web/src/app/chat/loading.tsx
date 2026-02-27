import { Skeleton } from "@/components/ui/skeleton";

export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex items-center gap-3 pb-4">
        <Skeleton className="h-8 w-20" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-9 w-44 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <div className="flex-1 rounded-lg border bg-card p-4">
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="flex gap-2 pt-3">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-md" />
      </div>
    </div>
  );
}
