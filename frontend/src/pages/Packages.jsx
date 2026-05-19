import { useQuery } from "@tanstack/react-query";
import { packagesApi } from "../api/client";
import { Package } from "lucide-react";

export default function Packages() {
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ["packages"],
    queryFn: () => packagesApi.list().then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Packages</h2>
        <p className="text-gray-500 text-sm">ISP subscription packages</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isLoading ? (
          <div className="text-gray-600">Loading...</div>
        ) : packages.length === 0 ? (
          <div className="col-span-3 text-center p-12 text-gray-600">No packages configured</div>
        ) : (
          packages.map((pkg) => (
            <div key={pkg.id} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <Package size={18} className="text-brand-500" />
                <h3 className="font-semibold">{pkg.name}</h3>
              </div>
              {pkg.description && <p className="text-xs text-gray-500 mb-3">{pkg.description}</p>}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">${pkg.price}</p>
                  <p className="text-xs text-gray-500">/month</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">{(pkg.channel_ids || []).length} channels</p>
                  <p className="text-xs text-gray-600">{pkg.max_devices} devices</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
