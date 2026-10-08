import type { Metadata } from "next";
import { TaskListView } from "@/components/app/task-list-view";

export const metadata: Metadata = { title: "Tarefas" };

export default function TasksPage() {
  return <TaskListView />;
}
