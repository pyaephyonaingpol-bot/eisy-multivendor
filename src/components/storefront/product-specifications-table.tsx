import type { ProductSpecification } from "@/lib/types/database";

type ProductSpecificationsTableProps = {
  specifications: ProductSpecification[];
};

export function ProductSpecificationsTable({
  specifications,
}: ProductSpecificationsTableProps) {
  if (specifications.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        Specifications
      </h2>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <tbody>
            {specifications.map((spec, index) => (
              <tr
                key={`${spec.key}-${index}`}
                className={index % 2 === 0 ? "bg-white" : "bg-zinc-50"}
              >
                <th
                  scope="row"
                  className="w-2/5 px-3 py-3 align-top text-xs font-medium text-zinc-600 sm:px-4 sm:text-sm"
                >
                  {spec.key}
                </th>
                <td className="break-words px-3 py-3 text-zinc-950 sm:px-4">{spec.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
