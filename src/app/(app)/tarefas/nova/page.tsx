import type { Metadata } from "next";
import { TaskEditor } from "@/components/app/task-editor";

export const metadata: Metadata = { title: "Nova tarefa" };

export default function NewTaskPage() {
  return <TaskEditor taskId={null} />;
}
