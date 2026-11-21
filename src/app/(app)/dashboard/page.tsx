import Link from "next/link";
import { NAV_LINKS, SITE_MAP_LINK } from "../nav-links";

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 sm:gap-6">
      {[...NAV_LINKS, SITE_MAP_LINK].map(({ href, label, icon: Icon, color }) => (
        <Link
          key={href}
          href={href}
          className="group flex aspect-square w-full max-w-[180px] flex-col items-center justify-center gap-3 rounded-[22px] border border-hairline bg-background shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-card-hover active:scale-[0.985]"
        >
          <Icon
            size={34}
            strokeWidth={1.35}
            color={color}
            className="transition-transform duration-300 ease-out group-hover:scale-110"
          />
          <span className="text-[15px] font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}
