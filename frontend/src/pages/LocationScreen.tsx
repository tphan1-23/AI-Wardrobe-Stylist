import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../components/common/Button";
import { Screen } from "../components/common/Screen";
import { StepIndicator } from "../components/common/StepIndicator";
import { TextField } from "../components/common/TextField";
import { saveLocation } from "../services/household";
import { gateway } from "../services/supabase";

interface Props {
  initialLocation?: string;
  submitLabel?: string;
  // Set during onboarding to show the progress bar.
  step?: { current: number; total: number };
  // Present when the screen can be left without saving (changing an existing location).
  onBack?: () => void;
  onDone: () => void;
}

export function LocationScreen({ initialLocation = "", submitLabel = "Save location", step, onBack, onDone }: Props) {
  const [location, setLocation] = useState(initialLocation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await saveLocation(gateway, location);
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <Screen title="Where are you?" subtitle="We use your city or ZIP code to check the weather for your daily outfit.">
      {step && <StepIndicator step={step.current} total={step.total} />}
      <TextField
        label="City or ZIP code"
        value={location}
        onChangeText={setLocation}
        placeholder="City or ZIP"
        autoCorrect={false}
        error={error}
      />
      <View style={styles.actions}>
        <Button label={submitLabel} onPress={submit} busy={busy} />
        {onBack && <Button label="Back" variant="secondary" onPress={onBack} disabled={busy} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: "auto", gap: 12 },
});
