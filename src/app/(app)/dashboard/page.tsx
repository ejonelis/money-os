import Image from "next/image";

export default function DashboardPage() {
  return (
    <Image
      src="/believe.png"
      alt="A taped-up hand-lettered BELIEVE sign"
      width={2140}
      height={1174}
      priority
      className="mx-auto w-full rounded-lg border border-foreground/10 shadow-sm"
    />
  );
}
