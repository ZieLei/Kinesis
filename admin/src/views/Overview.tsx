import {
  Server,
  Activity,
  Globe,
  Network,
  Wifi,
  Monitor,
  Smartphone,
  Database,
} from "lucide-react";

export default function Overview() {
  return (
    <div className="flex flex-row gap-5">
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-text">
              <Server size={21} />
            </div>
            <div>
              <h2 className="font-inter text-xl font-bold text-ctp-text">
                Server
              </h2>
              <p className="font-inter text-sm text-ctp-subtext0">
                Backend service status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-md border border-ctp-surface2/50 bg-ctp-base p-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ctp-surface2/15 text-ctp-text">
              <Activity size={24} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-inter text-sm text-ctp-subtext0">
                Server status
              </p>
              <p className="font-inter text-lg font-bold text-ctp-text">
                All systems operational
              </p>
            </div>

            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-ctp-green/15 px-3 py-1 font-inter text-xs font-bold text-ctp-green">
              <span className="h-2 w-2 rounded-full bg-ctp-green" />
              ONLINE
            </span>
          </div>

          <div className="mt-5 flex flex-col divide-y divide-ctp-surface0">
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Globe size={16} className="shrink-0 text-ctp-overlay1" />
                <span className="font-inter text-sm font-medium">FastAPI Host</span>
              </div>
              <span className="flex items-center gap-2 font-inter text-sm font-semibold text-ctp-green">
                <span className="h-2 w-2 rounded-full bg-ctp-green" />
                ONLINE
              </span>
            </div>

            <div className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Network size={16} className="shrink-0 text-ctp-overlay1" />
                <span className="font-inter text-sm font-medium">Local IP and Port</span>
              </div>
              <span className="break-all text-right font-mono text-sm font-medium text-ctp-text">
                192.168.1.100:8000
              </span>
            </div>
          </div>
        </div>

        {/* Network */}
        <div className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-text">
              <Wifi size={21} />
            </div>
            <div>
              <h2 className="font-inter text-xl font-bold text-ctp-text">
                Network
              </h2>
              <p className="font-inter text-sm text-ctp-subtext0">
                Connected devices and database
              </p>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-ctp-surface0">
            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Monitor size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
                <span className="font-inter text-sm font-medium">Host Machine</span>
              </div>
              <span className="max-w-[60%] text-right font-inter text-sm font-semibold text-ctp-text">
                Arch Linux
                <span className="block text-xs font-normal text-ctp-subtext0">
                  Python FastAPI
                </span>
              </span>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Smartphone size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
                <span className="font-inter text-sm font-medium">Active Terminals</span>
              </div>
              <div className="text-right">
                <p className="font-inter text-sm font-bold text-ctp-text">
                  2 / 4 devices
                </p>
                <p className="font-inter text-xs text-ctp-subtext0">
                  Connected via Wi-Fi
                </p>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 py-3">
              <div className="flex items-center gap-2 text-ctp-subtext1">
                <Database size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
                <span className="font-inter text-sm font-medium">Database</span>
              </div>
              <div className="text-right">
                <p className="font-inter text-sm font-semibold text-ctp-text">
                  SQLite
                </p>
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-ctp-green/15 px-2 py-0.5 font-inter text-xs font-semibold text-ctp-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-ctp-green" />
                  Healthy · 0.02 ms
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-5">

        <div className="self-start w-full bg-ctp-surface2/20 p-4 rounded-lg border border-ctp-surface0">
          <div className="mb-4">
            <span className="font-inter text-ctp-text font-bold text-2xl">
              Business Overview
            </span>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-ctp-base p-3 rounded-lg border border-ctp-surface0">
              <div className="flex flex-col text-center gap-1">
                <span className="font-inter font-bold text-sm text-ctp-subtext1">
                  Today's Sales
                </span>
                <span className="font-inter font-bold text-xl text-ctp-text">
                  ₱ 1,000.00
                </span>
              </div>
            </div>

            <div className="bg-ctp-base p-3 rounded-lg border border-ctp-surface0">
              <div className="flex flex-col text-center gap-1">
                <span className="font-inter font-bold text-sm text-ctp-subtext1">
                  Transactions
                </span>
                <span className="font-inter font-bold text-xl text-ctp-text">
                  223
                </span>
              </div>
            </div>

            <div className="bg-ctp-base p-3 rounded-lg border border-ctp-surface0">
              <div className="flex flex-col text-center gap-1">
                <span className="font-inter font-bold text-sm text-ctp-subtext1">
                  Low Stock Items
                </span>
                <span className="font-inter font-bold text-xl text-ctp-yellow">
                  10
                </span>
              </div>
            </div>

            <div className="bg-ctp-base p-3 rounded-lg border border-ctp-surface0">
              <div className="flex flex-col text-center gap-1">
                <span className="font-inter font-bold text-sm text-ctp-subtext1">
                  Out of Stock
                </span>
                <span className="font-inter font-bold text-xl text-ctp-red">
                  3
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-ctp-surface2/20 p-4 rounded-lg border border-ctp-surface0">
          <div className="mb-5">
            <span className="font-inter text-ctp-text font-bold text-2xl">
              Recent Activity
            </span>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-inter font-bold text-lg text-ctp-text">
                Low Stock Alerts
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { name: "NGK Spark Plug", stock: 3 },
                { name: "Brake Fluid DOT 4", stock: 2 },
                { name: "Motorcycle Chain 428", stock: 0 },
              ].map((product) => (
                <div
                  key={product.name}
                  className={`flex items-center gap-3 bg-ctp-base p-3 rounded-lg border ${product.stock === 0 ? "border border-ctp-red"
                    : product.stock <= 5 ? "border border-ctp-peach"
                      : null
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-inter font-semibold text-sm text-ctp-text">
                      {product.name}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">

                    <span className="font-inter text-xs text-ctp-subtext0">
                      In inventory
                    </span>
                    <span
                      className={`font-inter font-bold text-sm ${product.stock === 0
                        ? "text-ctp-red"
                        : "text-ctp-peach"
                        }`}
                    >
                      {product.stock === 0
                        ? "OUT OF STOCK"
                        : `${product.stock} LEFT`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>



          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="font-inter font-bold text-lg text-ctp-text">
                Top Selling Products
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { name: "Engine Oil 10W-40", sold: 86, revenue: 38700 },
                { name: "NGK Spark Plug", sold: 64, revenue: 16000 },
                { name: "Brake Pad Set", sold: 42, revenue: 28560 },
              ].map((product, index) => (
                <div
                  key={product.name}
                  className="flex items-center gap-3 bg-ctp-base p-3 rounded-lg border border-ctp-surface0"
                >
                  <div
                    className={`flex items-center justify-center h-8 w-8 shrink-0 rounded-lg font-inter font-bold ${index === 0
                      ? "bg-ctp-yellow/20 text-ctp-yellow"
                      : index === 1
                        ? "bg-ctp-overlay1/20 text-ctp-subtext1"
                        : index === 2
                          ? "bg-ctp-peach/20 text-ctp-peach"
                          : "bg-ctp-mauve/20 text-ctp-mauve"
                      }`}
                  >
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-inter font-semibold text-sm text-ctp-text">
                      {product.name}
                    </p>
                    <p className="font-inter text-xs text-ctp-subtext0 mt-1">
                      {product.sold} units sold
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-inter font-bold text-sm text-ctp-green">
                      ₱{product.revenue.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                    <p className="font-inter text-xs text-ctp-subtext0 mt-1">
                      Revenue
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-inter font-bold text-lg text-ctp-text">
                Recent Transactions
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {[
                { id: "TRX-1024", item: "Engine Oil 10W-40", time: "12:14 PM", amount: 450, status: "Completed" },
                { id: "TRX-1023", item: "Brake Pad Set", time: "11:52 AM", amount: 680, status: "Completed" },
                { id: "TRX-1022", item: "Spark Plug NGK", time: "11:31 AM", amount: 250, status: "Completed" },
                { id: "TRX-1021", item: "Motorcycle Chain", time: "10:48 AM", amount: 520, status: "Completed" },
              ].map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center gap-3 bg-ctp-base p-3 rounded-lg border border-ctp-surface0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-inter font-semibold text-sm text-ctp-text">
                      {transaction.item}
                    </p>
                    <p className="font-inter text-xs text-ctp-subtext0 mt-1">
                      {transaction.id} · {transaction.time}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="font-inter font-bold text-sm text-ctp-text">
                      ₱{transaction.amount.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="font-inter text-xs font-semibold text-ctp-green bg-ctp-green/20 px-2 py-[0.5px] rounded-full">
                      {transaction.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
