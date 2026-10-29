import { Button, Select, TextInput } from "@/components/ui";

/** GET form: filters live in the address, so every filtered table is linkable and works without scripts. */
export function ListFilters({
  action,
  hidden,
  q,
  category,
  status,
  categories,
  showStatus,
}: {
  action: string;
  hidden: Record<string, string>;
  q: string;
  category: string;
  status: string;
  categories: { code: string; name: string }[];
  showStatus: boolean;
}) {
  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label="Filter opportunities"
      className="mb-4 grid grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] items-end gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-[5px]">
        <label htmlFor="f-q" className="text-ctl font-medium text-check-text">
          Search
        </label>
        <TextInput
          id="f-q"
          name="q"
          defaultValue={q}
          placeholder="Title, organisation or place"
          maxLength={100}
        />
      </div>
      <div className="grid gap-[5px]">
        <label htmlFor="f-category" className="text-ctl font-medium text-check-text">
          Category
        </label>
        <Select id="f-category" name="category" defaultValue={category}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {showStatus ? (
        <div className="grid gap-[5px]">
          <label htmlFor="f-status" className="text-ctl font-medium text-check-text">
            Status
          </label>
          <Select id="f-status" name="status" defaultValue={status}>
            <option value="">Any status</option>
            {["draft", "in_review", "approved", "rejected", "published", "expired", "withdrawn"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="max-lg:hidden" />
      )}
      <div className="flex gap-2">
        <Button type="submit">Apply</Button>
        <a
          href={action + (hidden.view ? `?view=${hidden.view}` : "")}
          className="inline-flex min-h-control items-center rounded-control border border-border-strong px-4 text-ctl text-secondary-text hover:bg-accent/5"
        >
          Clear
        </a>
      </div>
    </form>
  );
}
