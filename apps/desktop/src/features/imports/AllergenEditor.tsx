import { useEffect, useState } from "react";

import type { IngredientVariantAllergens } from "../../api/types";

interface AllergenEditorProps {
  value: IngredientVariantAllergens;
  onChange: (value: IngredientVariantAllergens) => void;
}

function parseAllergens(value: string) {
  return [
    ...new Set(
      value
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function AllergenEditor({ value, onChange }: AllergenEditorProps) {
  const [containsText, setContainsText] = useState(value.contains.join("、"));
  const [mayContainText, setMayContainText] = useState(value.mayContain.join("、"));

  useEffect(() => {
    setContainsText(value.contains.join("、"));
  }, [value.contains]);

  useEffect(() => {
    setMayContainText(value.mayContain.join("、"));
  }, [value.mayContain]);

  return (
    <fieldset className="allergen-editor field--full">
      <legend>过敏原信息</legend>
      <p>多个名称请用顿号或逗号分隔。</p>
      <label className="field">
        <span>所含过敏原</span>
        <input
          aria-label="所含过敏原"
          onBlur={() => onChange({ ...value, contains: parseAllergens(containsText) })}
          onChange={(event) => setContainsText(event.target.value)}
          placeholder="例如：乳、大豆"
          value={containsText}
        />
      </label>
      <label className="field">
        <span>可能含有的过敏原</span>
        <input
          aria-label="可能含有的过敏原"
          onBlur={() => onChange({ ...value, mayContain: parseAllergens(mayContainText) })}
          onChange={(event) => setMayContainText(event.target.value)}
          placeholder="例如：花生、坚果"
          value={mayContainText}
        />
      </label>
    </fieldset>
  );
}
