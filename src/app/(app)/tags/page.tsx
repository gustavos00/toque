import type { Metadata } from "next";
import { TagListView } from "@/components/app/tag-list-view";

export const metadata: Metadata = { title: "Tags" };

export default function TagsPage() {
  return <TagListView />;
}
