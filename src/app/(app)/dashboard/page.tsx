import { NAV_LINKS, OTHER_LINK } from "../nav-links";
import { TileGrid } from "../TileGrid";

export default function DashboardPage() {
  return <TileGrid links={[...NAV_LINKS, OTHER_LINK]} />;
}
