import { useCallback, useEffect, useState } from "react";
import { getHousehold, getProfile, type Household, type Profile } from "../services/household";
import { householdClient } from "../services/supabase";

export function useProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const profileResult = await getProfile(householdClient, userId);
    if (!profileResult.ok) {
      setError(profileResult.error);
      setLoading(false);
      return;
    }
    setProfile(profileResult.data);

    if (profileResult.data.household_id) {
      const householdResult = await getHousehold(householdClient, profileResult.data.household_id);
      if (householdResult.ok) setHousehold(householdResult.data);
      else setError(householdResult.error);
    } else {
      setHousehold(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, household, loading, error, refresh };
}
