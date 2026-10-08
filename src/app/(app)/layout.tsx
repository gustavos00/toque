import { Suspense } from "react";
import { TabBar, TabBarView } from "@/components/app/tab-bar";

/** Signed-in shell: centred column with the bottom tab bar. */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <main className="mx-auto w-full max-w-xl px-4 pb-[calc(env(safe-area-inset-bottom)+88px)]">{children}</main>
      <Suspense fallback={<TabBarView pathname={null} />}>
        <TabBar />
      </Suspense>
    </>
  );
}
