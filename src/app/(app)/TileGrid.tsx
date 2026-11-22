import Link from "next/link";
import type { NavLink } from "./nav-links";

export function TileGrid({ links }: { links: NavLink[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
      {links.map(({ href, label, icon: Icon, color }) => (
        <Link
          key={href}
          href={href}
          className="group flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-[22px] border border-hairline bg-background shadow-card transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-card-hover active:scale-[0.985]"
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
