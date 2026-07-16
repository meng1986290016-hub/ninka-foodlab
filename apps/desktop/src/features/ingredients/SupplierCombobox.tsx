import { useCallback } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import { ReferenceCombobox } from "./ReferenceCombobox";

interface SupplierComboboxProps {
  api: DesktopApi;
  onChange: (supplierId: string | null) => void;
  value: string | null;
}

export function SupplierCombobox({
  api,
  onChange,
  value,
}: SupplierComboboxProps) {
  const loadItems = useCallback(() => api.listSuppliers(), [api]);
  const createItem = useCallback(
    (name: string) => api.createSupplier(name),
    [api],
  );

  return (
    <ReferenceCombobox
      createItem={createItem}
      label="供应商"
      loadItems={loadItems}
      noun="供应商"
      onChange={onChange}
      value={value}
    />
  );
}
