import type { Metadata } from "next";
import { SettingsView } from "@/components/app/settings-view";

export const metadata: Metadata = { title: "Definições" };

export default function SettingsPage() {
  return <SettingsView />;
}
