import { type ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardLayout({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-dash-bg text-dash-text-body antialiased">
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar currentPath={currentPath} dark={false} toggleTheme={() => {}} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
          <Topbar />
          <main className="relative flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1000px] px-4 py-8 md:px-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
