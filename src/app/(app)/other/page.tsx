import { OTHER_LINKS } from "../nav-links";
import { TileGrid } from "../TileGrid";

export default function OtherPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Other</h1>
      <TileGrid links={OTHER_LINKS} />
    </div>
  );
}
