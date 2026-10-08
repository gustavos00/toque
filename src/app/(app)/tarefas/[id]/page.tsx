import type { Metadata } from "next";
import { Suspense } from "react";
import { TaskEditorRoute } from "@/components/app/task-editor";
import { ListSkeleton } from "@/components/app/status";

export const metadata: Metadata = { title: "Tarefa" };

export default function EditTaskPage({ params }: PageProps<"/tarefas/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton sections={3} />}>
      <TaskEditorRoute params={params} />
    </Suspense>
  );
}
