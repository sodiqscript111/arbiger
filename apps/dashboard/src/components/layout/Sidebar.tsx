import { useMemo } from "react";
import { Moon, Sun, AlertTriangle, Settings, LayoutDashboard, LogOut, ChevronDown } from "lucide-react";
import { navigate } from "../../navigation";
import { useAuth } from "../../state/auth";

const navItemBase =
  "flex items-center gap-2 rounded px-2 py-1.5 text-sm tracking-[-0.09px] transition-colors text-dash-text-faded hover:text-dash-text-strong";

export function Sidebar({
  currentPath,
  dark,
  toggleTheme,
}: {
  currentPath: string;
  dark: boolean;
  toggleTheme: () => void;
}) {
  const { data, workspaces, setActiveWorkspace, clear } = useAuth();
  
  const mainNav = useMemo(
    () => [
      { label: "Overview", href: "fingerprints", icon: LayoutDashboard },
      { label: "Incidents", href: "incidents", icon: AlertTriangle },
    ],
    []
  );

  const activeWs = workspaces.find(w => w.id === data?.activeWorkspaceId) || workspaces[0];

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-dash-border-soft bg-dash-bg md:flex">
      {}
      <div className="flex shrink-0 flex-col gap-1 px-3 pt-4 pb-2 border-b border-dash-border-soft">
        {activeWs ? (
          <div className="flex items-center justify-between px-2 py-1.5 bg-dash-bg-elevated rounded cursor-pointer border border-dash-border-soft hover:border-dash-border transition-colors">
            <span className="text-sm font-medium text-dash-text-strong truncate">{activeWs.name}</span>
            <ChevronDown className="w-4 h-4 text-dash-text-faded" />
          </div>
        ) : (
          <div className="px-2 py-1.5">
            <span className="text-sm font-medium text-dash-text-strong truncate">Arbiger</span>
          </div>
        )}
      </div>

      <nav className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-4">
        <div className="flex flex-col gap-1">
          {mainNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath.startsWith(item.href);
            return (
              <button
                key={item.label}
                onClick={() => navigate(`/${item.href}`)}
                className={`${navItemBase} w-full ${
                  isActive ? "bg-dash-bg-elevated !text-dash-text-strong font-medium" : "hover:bg-dash-bg-elevated"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <div className="px-2 py-1.5">
            <span className="text-xs font-medium tracking-[-0.09px] text-dash-text-extra-faded">
              MORE
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => {}}
              className={`${navItemBase} w-full hover:bg-dash-bg-elevated opacity-40 cursor-not-allowed`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </button>
          </div>
        </div>
      </nav>

      <div className="flex shrink-0 flex-col gap-1 px-3 pb-4">
        <hr className="mb-4 border-dash-border-soft" />
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs text-dash-text-faded truncate" title={data?.user?.email}>
            {data?.user?.email}
          </span>
        </div>
        <button
          onClick={() => {
            clear();
            navigate("/login");
          }}
          className={`${navItemBase} w-full hover:bg-dash-bg-elevated text-red-500 hover:text-red-400`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
