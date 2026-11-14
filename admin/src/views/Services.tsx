import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, RefreshCw } from "lucide-react";

import Badge from "../components/ui/Badge";
import EmptyState from "../components/ui/EmptyState";
import Notice from "../components/ui/Notice";
import PageHeader from "../components/ui/PageHeader";
import SearchInput from "../components/ui/SearchInput";
import SelectField from "../components/settings/SelectField";
import { buttonDanger, buttonPrimary, buttonQuiet, buttonSecondary, buttonSmall, focusRing, tableHead } from "../components/ui/styles";
import ServiceActionDialog, { type ServiceAction } from "../components/services/ServiceActionDialog";
import ServiceFormDialog from "../components/services/ServiceFormDialog";
import { formatCurrency, formatDateTime, formatNumber, getErrorMessage } from "../components/stock/format";
import { fetchAdminServices } from "../lib/adminApi";
import type { ManagedService, ServiceListResponse, ServiceSort, ServiceState } from "../types/admin";

const PAGE_SIZE = 50;

const STATE_OPTIONS = [
  { value: "active", label: "Active services" },
  { value: "archived", label: "Archived services" },
  { value: "all", label: "All services" },
];

type Dialog =
  | { kind: "form"; service: ManagedService | null }
  | { kind: "action"; service: ManagedService; action: ServiceAction }
  | null;

export default function Services() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ServiceState>("active");
  const [sort, setSort] = useState<ServiceSort>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<ServiceListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState("");

  // Search waits for a pause in typing, then starts again from page one.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    fetchAdminServices({ search: query, state, sort, direction, limit: PAGE_SIZE, offset }, controller.signal)
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query, state, sort, direction, offset, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const toggleSort = (field: ServiceSort) => {
    if (sort === field) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection(field === "name" ? "asc" : "desc");
    }
    setOffset(0);
  };

  const finish = (message: string) => {
    setDialog(null);
    setNotice(message);
    refresh();
  };

  const items = data?.items ?? [];
  const total = data?.count ?? 0;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="w-full min-w-0 space-y-6 pb-8 font-line-seed">
      <PageHeader
        title="Services"
        description="Manage the services offered at the counter. Price changes apply to new sales only; every change is recorded in activity history."
        meta={
          data && (
            <>
              <span>{formatNumber(data.active_count)} active</span>
              <span>{formatNumber(data.archived_count)} archived</span>
            </>
          )
        }
        actions={
          <>
            <button type="button" onClick={refresh} disabled={loading} className={buttonSecondary}>
              <RefreshCw size={14} aria-hidden="true" className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
            <button type="button" onClick={() => setDialog({ kind: "form", service: null })} className={buttonPrimary}>
              <Plus size={14} aria-hidden="true" />
              Add service
            </button>
          </>
        }
      />

      {notice && (
        <Notice tone="success" onDismiss={() => setNotice("")}>
          {notice}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          label="Search services"
          value={search}
          onChange={setSearch}
          placeholder="Search name or description"
          className="w-full sm:max-w-xs"
        />
        <div className="w-48">
          <SelectField
            id="services-state"
            value={state}
            onChange={(value) => {
              setState(value as ServiceState);
              setOffset(0);
            }}
            options={STATE_OPTIONS}
          />
        </div>
      </div>

      {error && (
        <Notice
          tone="danger"
          role="alert"
          title={`Services could not be loaded: ${error}`}
          action={
            <button type="button" onClick={refresh} className={`${buttonSecondary} ${buttonSmall}`}>
              Retry
            </button>
          }
        />
      )}

      {loading && !data ? (
        <p className="py-8 text-sm text-ctp-subtext0" role="status">
          Loading services…
        </p>
      ) : items.length === 0 && !error ? (
        <EmptyState
          title={query ? "No services match your search" : state === "archived" ? "No archived services" : "No services yet"}
          description={
            query
              ? "Try a different name, or switch to All services."
              : state === "archived"
                ? "Services you archive appear here and can be restored."
                : "Add the services your shop offers so cashiers can add them to a sale."
          }
          action={
            !query && state !== "archived" ? (
              <button type="button" onClick={() => setDialog({ kind: "form", service: null })} className={buttonPrimary}>
                <Plus size={14} aria-hidden="true" />
                Add service
              </button>
            ) : undefined
          }
        />
      ) : (
        <div
          className={`relative overflow-x-auto border-y border-ctp-surface0 transition-opacity ${loading ? "opacity-60" : ""}`}
          aria-busy={loading}
        >
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-ctp-surface0">
                <SortHeader field="name" sort={sort} direction={direction} onSort={toggleSort} className="pl-0">
                  Service
                </SortHeader>
                <SortHeader field="price" sort={sort} direction={direction} onSort={toggleSort} align="right">
                  Price
                </SortHeader>
                <th scope="col" className={`${tableHead} hidden text-right md:table-cell`}>
                  Est. cost
                </th>
                <SortHeader field="sold" sort={sort} direction={direction} onSort={toggleSort} align="right">
                  Sold
                </SortHeader>
                <SortHeader field="revenue" sort={sort} direction={direction} onSort={toggleSort} align="right">
                  Revenue
                </SortHeader>
                <SortHeader field="updated" sort={sort} direction={direction} onSort={toggleSort} className="hidden lg:table-cell">
                  Updated
                </SortHeader>
                <th scope="col" className={`${tableHead} pr-0 text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ctp-surface0">
              {items.map((service) => (
                <tr key={service.id} className={`transition-colors hover:bg-ctp-surface0/30 ${service.archived ? "opacity-70" : ""}`}>
                  <td className="max-w-[320px] py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ctp-text">{service.name}</span>
                      {service.archived && <Badge tone="warning">Archived</Badge>}
                    </div>
                    {service.description && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-ctp-subtext0">{service.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-ctp-text">{formatCurrency(service.price)}</td>
                  <td className="hidden px-3 py-2.5 text-right text-sm tabular-nums text-ctp-subtext1 md:table-cell">
                    {service.estimated_cost !== null ? formatCurrency(service.estimated_cost) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-ctp-subtext1">{formatNumber(service.times_sold)}</td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums text-ctp-subtext1">{formatCurrency(service.revenue)}</td>
                  <td className="hidden px-3 py-2.5 text-xs text-ctp-subtext0 lg:table-cell">
                    {service.updated_at ? formatDateTime(service.updated_at) : "—"}
                  </td>
                  <td className="py-2.5 pl-3 text-right">
                    <div className="flex justify-end gap-1">
                      {service.archived ? (
                        <button type="button" className={`${buttonQuiet} ${buttonSmall}`} onClick={() => setDialog({ kind: "action", service, action: "restore" })}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" className={`${buttonQuiet} ${buttonSmall}`} onClick={() => setDialog({ kind: "form", service })}>
                            Edit
                          </button>
                          <button type="button" className={`${buttonQuiet} ${buttonSmall}`} onClick={() => setDialog({ kind: "action", service, action: "archive" })}>
                            Archive
                          </button>
                        </>
                      )}
                      {service.can_delete && (
                        <button
                          type="button"
                          className={`${buttonDanger} ${buttonSmall}`}
                          onClick={() => setDialog({ kind: "action", service, action: "delete" })}
                          title="Never sold, so it can be deleted"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-ctp-subtext0">
          <span>
            Showing {offset + 1}–{pageEnd} of {formatNumber(total)}
          </span>
          <div className="flex gap-2">
            <button type="button" className={`${buttonSecondary} ${buttonSmall}`} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </button>
            <button type="button" className={`${buttonSecondary} ${buttonSmall}`} disabled={pageEnd >= total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </button>
          </div>
        </div>
      )}

      {dialog?.kind === "form" && (
        <ServiceFormDialog service={dialog.service} onClose={() => setDialog(null)} onSaved={finish} />
      )}
      {dialog?.kind === "action" && (
        <ServiceActionDialog service={dialog.service} action={dialog.action} onClose={() => setDialog(null)} onDone={finish} />
      )}
    </div>
  );
}

function SortHeader({
  field,
  sort,
  direction,
  onSort,
  align = "left",
  className = "",
  children,
}: {
  field: ServiceSort;
  sort: ServiceSort;
  direction: "asc" | "desc";
  onSort: (field: ServiceSort) => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`${tableHead} ${align === "right" ? "text-right" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 rounded hover:text-ctp-text ${active ? "text-ctp-text" : ""} ${focusRing}`}
      >
        {children}
        <Icon size={12} aria-hidden="true" className={active ? "" : "opacity-50"} />
      </button>
    </th>
  );
}
