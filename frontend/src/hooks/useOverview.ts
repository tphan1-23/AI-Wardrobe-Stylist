import { useCallback, useEffect, useState } from "react";
import { loadOverview, type Overview } from "../services/household";
import { gateway } from "../services/supabase";

export function useOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await loadOverview(gateway);
    if (result.ok) setOverview(result.value);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { overview, loading, error, refresh };
}
