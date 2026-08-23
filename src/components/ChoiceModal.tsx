"use client";

export function ChoiceModal({
  title,
  message,
  options,
  onCancel,
}: {
  title: string;
  message: string;
  options: Array<{ label: string; onClick: () => void; danger?: boolean }>;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background p-5 shadow-xl">
        <h2 className="mb-2 font-medium">{title}</h2>
        <p className="mb-4 text-sm text-foreground/60">{message}</p>
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={opt.onClick}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                opt.danger
                  ? "border border-red-500/30 text-red-500 hover:bg-red-500/10"
                  : "bg-accent text-white hover:bg-accent/90"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={onCancel}
            className="rounded-md border border-accent/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
