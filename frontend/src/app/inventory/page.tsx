"use client";

// Inventory Dashboard (redesigned screen, 18/18) — component table, stat
// strip, search/category filters, and the BOM Check drawer, all wired to
// the Phase 4 backend via frontend/src/lib/inventory.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Topbar } from "@/components/Topbar";
import { FootNav } from "@/components/FootNav";
import { ComponentModal } from "@/components/inventory/ComponentModal";
import { BomDrawer } from "@/components/inventory/BomDrawer";
import { categoryStyle, CategoryIcon } from "@/lib/category-colors";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import {
  BOMCheckResponse,
  BOMReserveResponse,
  Category,
  Component,
  ComponentListResponse,
  StockFilter,
  checkBom,
  deleteComponent,
  listCategories,
  listComponents,
  reserveBom,
} from "@/lib/inventory";

const PAGE_SIZE = 25;

function InventoryContent() {
  const { token } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [listResponse, setListResponse] = useState<ComponentListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [offset, setOffset] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);

  const [bomResult, setBomResult] = useState<BOMCheckResponse | null>(null);
  const [bomLoading, setBomLoading] = useState(false);
  const [bomError, setBomError] = useState<string | null>(null);
  const [reserving, setReserving] = useState(false);
  const [reserveResult, setReserveResult] = useState<BOMReserveResponse | null>(null);
  const bomInputRef = useRef<HTMLInputElement>(null);

  // Debounce free-text search so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim());
      setOffset(0);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!token) return;
    listCategories(token)
      .then(setCategories)
      .catch(() => {
        // Non-fatal — category filter chips just won't render. The table
        // and stats still work without them.
      });
  }, [token]);

  const fetchComponents = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    listComponents(token, {
      q: query || undefined,
      category_id: categoryId ?? undefined,
      stock: stockFilter,
      limit: PAGE_SIZE,
      offset,
    })
      .then(setListResponse)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Couldn't load inventory. Please try again.");
      })
      .finally(() => setLoading(false));
  }, [token, query, categoryId, stockFilter, offset]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  function handleStatClick(filter: StockFilter) {
    setStockFilter(filter);
    setOffset(0);
  }

  function handleCategoryClick(id: string | null) {
    setCategoryId(id);
    setOffset(0);
  }

  function openAddModal() {
    setEditingComponent(null);
    setModalOpen(true);
  }

  function openEditModal(component: Component) {
    setEditingComponent(component);
    setModalOpen(true);
  }

  function handleSaved() {
    setModalOpen(false);
    setEditingComponent(null);
    fetchComponents();
  }

  async function handleDelete(component: Component) {
    if (!token) return;
    if (!window.confirm(`Delete "${component.name}"? This can't be undone.`)) return;
    try {
      await deleteComponent(token, component.id);
      fetchComponents();
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Couldn't delete that component. Please try again.");
    }
  }

  function handleUploadBomClick() {
    bomInputRef.current?.click();
  }

  async function handleBomFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setBomLoading(true);
    setBomError(null);
    setBomResult(null);
    setReserveResult(null);
    try {
      const result = await checkBom(token, file);
      setBomResult(result);
    } catch (err) {
      setBomError(err instanceof ApiError ? err.message : "Couldn't check that BOM. Please try again.");
    } finally {
      setBomLoading(false);
    }
  }

  async function handleReserve() {
    if (!token || !bomResult) return;
    setReserving(true);
    try {
      const result = await reserveBom(token, bomResult.bom_id);
      setReserveResult(result);
      fetchComponents();
    } catch (err) {
      setBomError(err instanceof ApiError ? err.message : "Couldn't reserve those items. Please try again.");
    } finally {
      setReserving(false);
    }
  }

  const stats = listResponse?.stats;
  const total = listResponse?.total ?? 0;
  const items = listResponse?.items ?? [];
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Topbar toolName="Inventory Management" />

      <div className="flex-1 px-4 pb-6 pt-5 sm:px-8 sm:pb-10 sm:pt-7">
        <div className="mb-[22px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">Component Inventory</h1>
            <p className="mt-1 text-[14px] text-slate-500">
              {total.toLocaleString()} component{total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-2.5">
            <Link href="/inventory/bulk-import" className="btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              Bulk Import
            </Link>
            <button type="button" onClick={handleUploadBomClick} className="btn-secondary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <path d="M17 8l-5-5-5 5" />
                <path d="M12 3v12" />
              </svg>
              Upload BOM
            </button>
            <input
              ref={bomInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={handleBomFile}
              className="hidden"
            />
            <button type="button" onClick={openAddModal} className="btn-primary">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add New Component
            </button>
          </div>
        </div>

        <div className="mb-[22px] grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => handleStatClick("all")}
            className={`card flex items-center justify-between px-[18px] py-4 text-left ${
              stockFilter === "all" ? "ring-2 ring-indigo-100" : ""
            }`}
          >
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">Total SKUs</div>
              <div className="mt-1 text-[24px] font-extrabold">{(stats?.total_skus ?? 0).toLocaleString()}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                <path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" />
              </svg>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleStatClick("low")}
            className={`card flex items-center justify-between px-[18px] py-4 text-left ${
              stockFilter === "low" ? "ring-2 ring-indigo-100" : ""
            }`}
          >
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">Low Stock</div>
              <div className="mt-1 text-[24px] font-extrabold text-amber-500">{stats?.low_stock ?? 0}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-amber-50" style={{ color: "#b45309" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </div>
          </button>

          <div className="card flex items-center justify-between px-[18px] py-4">
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">Categories</div>
              <div className="mt-1 text-[24px] font-extrabold">{stats?.categories ?? 0}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
              </svg>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleStatClick("out")}
            className={`card flex items-center justify-between px-[18px] py-4 text-left ${
              stockFilter === "out" ? "ring-2 ring-indigo-100" : ""
            }`}
          >
            <div>
              <div className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-500">Out of Stock</div>
              <div className="mt-1 text-[24px] font-extrabold text-rose-500">{stats?.out_of_stock ?? 0}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-rose-50" style={{ color: "#b91c1c" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8" />
              </svg>
            </div>
          </button>
        </div>

        <div className="card mb-[18px] p-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2.5 rounded-[10px] border-[1.5px] border-indigo-100 bg-slate-50 px-3.5 py-2.5">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="shrink-0">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, description, or keywords…"
                className="w-full border-none bg-transparent text-[14.5px] text-slate-700 outline-none"
              />
            </div>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
            <span className="mr-0.5 text-[12.5px] font-semibold text-slate-500">Category:</span>
            <button
              type="button"
              onClick={() => handleCategoryClick(null)}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                categoryId === null ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${
                  categoryId === cat.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Stacks (table above, BOM drawer below) below `lg`; side by side
            above it. The table itself keeps its full column set at any
            width and scrolls horizontally on narrow viewports instead of
            squishing every column unreadably thin. */}
        <div className="flex flex-col items-start gap-5 lg:flex-row">
          <div className="card w-full flex-1 overflow-hidden">
            {loadError && (
              <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600">
                {loadError}
              </div>
            )}
            <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <th className="w-11 border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    S/N
                  </th>
                  <th className="w-[230px] border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Component
                  </th>
                  <th className="border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Type
                  </th>
                  <th className="border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Category
                  </th>
                  <th className="border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Brand
                  </th>
                  <th className="border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Description
                  </th>
                  <th className="w-[70px] border-b border-slate-200 bg-slate-50 px-3.5 py-3 text-left text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                    Qty
                  </th>
                  <th className="w-[70px] border-b border-slate-200 bg-slate-50 px-3.5 py-3" />
                </tr>
              </thead>
              <tbody>
                {!loading && items.map((c, i) => {
                  const style = categoryStyle(c.category?.slug);
                  const qtyClass = c.is_out_of_stock
                    ? "text-rose-500"
                    : c.is_low_stock
                      ? "text-amber-500"
                      : "text-emerald-500";
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-none hover:bg-slate-50">
                      <td className="px-3.5 py-3 font-semibold text-slate-400">{String(offset + i + 1).padStart(3, "0")}</td>
                      <td className="px-3.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg ${style.thumbBg} ${style.thumbText}`}>
                            {c.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <CategoryIcon icon={style.icon} />
                            )}
                          </div>
                          <div>
                            <div className="text-[13.5px] font-bold text-slate-900">{c.name}</div>
                            {c.sku && <div className="mt-0.5 text-[12px] text-slate-400">{c.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-slate-700">{c.type}</td>
                      <td className="px-3.5 py-3">
                        {c.category && (
                          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11.5px] font-bold ${style.badge}`}>
                            {c.category.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-[12.5px] font-semibold text-slate-600">{c.brand}</td>
                      <td className="max-w-[230px] truncate px-3.5 py-3 text-[12.5px] text-slate-500">{c.description}</td>
                      <td className={`px-3.5 py-3 font-bold ${qtyClass}`}>{c.quantity}</td>
                      <td className="px-3.5 py-3">
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500"
                            aria-label={`Edit ${c.name}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(c)}
                            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500"
                            aria-label={`Delete ${c.name}`}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && items.length === 0 && !loadError && (
                  <tr>
                    <td colSpan={8} className="px-3.5 py-14 text-center text-[13.5px] font-medium text-slate-400">
                      No components match these filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-3.5 py-14 text-center text-[13.5px] font-medium text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[12.5px] text-slate-500">
                <span>
                  Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    className="btn-secondary !px-3 !py-1.5 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    className="btn-secondary !px-3 !py-1.5 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <BomDrawer
            result={bomResult}
            loading={bomLoading}
            error={bomError}
            onUploadClick={handleUploadBomClick}
            onReserve={handleReserve}
            reserving={reserving}
            reserveResult={reserveResult}
          />
        </div>
      </div>

      <FootNav current="inventory" />

      {modalOpen && token && (
        <ComponentModal
          token={token}
          categories={categories}
          editing={editingComponent}
          onClose={() => {
            setModalOpen(false);
            setEditingComponent(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <ProtectedRoute>
      <InventoryContent />
    </ProtectedRoute>
  );
}
