import { useCallback } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import { ReferenceCombobox } from "./ReferenceCombobox";

interface CategoryComboboxProps {
  api: DesktopApi;
  onChange: (categoryId: string | null) => void;
  value: string | null;
}

export function CategoryCombobox({
  api,
  onChange,
  value,
}: CategoryComboboxProps) {
  const loadItems = useCallback(() => api.listCategories(), [api]);
  const createItem = useCallback(
    (name: string) => api.createCategory(name),
    [api],
  );

  return (
    <ReferenceCombobox
      createItem={createItem}
      label="分类"
      loadItems={loadItems}
      noun="分类"
      onChange={onChange}
      optional
      value={value}
    />
  );
}
