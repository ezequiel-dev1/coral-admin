"use client";

import React, { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type FooterSummaryFn<T> = (rows: T[]) => React.ReactNode;

interface CoralDataGridProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  height?: number;
  defaultPageSize?: number;
  defaultSorting?: SortingState;
  footerSummary?: FooterSummaryFn<T>;
}

export function CoralDataGrid<T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  height = 600,
  defaultPageSize = 50,
  defaultSorting = [],
  footerSummary,
}: CoralDataGridProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnFilters },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: defaultPageSize },
    },
  });

  const filteredRows = table.getFilteredRowModel().rows.map((r) => r.original);

  return (
    <div className="rounded-lg border bg-white flex flex-col" style={{ height }}>
      {/* Search */}
      <div className="p-2 border-b">
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search..."
          className="h-8 w-full max-w-sm rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-8 text-center text-sm text-[var(--text-muted)]">Loading...</p>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead className="sticky top-0 bg-[#f9f8f7] z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-1 text-left font-semibold text-sm border-b border-r border-[#e7e7e0] whitespace-nowrap select-none"
                      style={{ width: header.getSize(), minWidth: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex flex-col gap-1">
                          <button
                            className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer hover:text-[#3D4F9B]"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getIsSorted() === "asc" ? (
                              <ArrowUp size={12} />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown size={12} />
                            ) : (
                              <ArrowUpDown size={12} className="opacity-30" />
                            )}
                          </button>
                          {header.column.getCanFilter() && (
                            <input
                              type="text"
                              value={(header.column.getFilterValue() as string) ?? ""}
                              onChange={(e) => header.column.setFilterValue(e.target.value)}
                              placeholder="Filter..."
                              className="h-5 w-full rounded border border-[#e7e7e0] bg-white px-1.5 text-[11px] font-normal outline-none focus:border-[#3D4F9B]"
                            />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-[#e7e7e0] hover:bg-[#faf9f8]">
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-1.5 border-r border-[#e7e7e0] align-middle"
                      style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: summary + pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-[#f9f8f7] text-xs shrink-0">
        <div className="flex items-center gap-5">
          {footerSummary && footerSummary(filteredRows)}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)]">
            {table.getFilteredRowModel().rows.length} rows
          </span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="h-7 rounded border border-input bg-transparent px-2 text-xs outline-none"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>{size} / page</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="px-2 py-1 rounded border border-input bg-transparent disabled:opacity-30 cursor-pointer">←</button>
            <span className="px-2 py-1 text-[var(--text-muted)]">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="px-2 py-1 rounded border border-input bg-transparent disabled:opacity-30 cursor-pointer">→</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ColumnDef };
