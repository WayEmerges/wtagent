import { Box } from "ink";
import { useEffect } from "react";
import { useStore } from "./state/store.js";
import { ApprovalCard } from "./ui/approval.js";
import { Composer } from "./ui/composer.js";
import { Footer } from "./ui/footer.js";
import { SetupCard } from "./ui/setup-card.js";
import { ActivityLine, Transcript } from "./ui/transcript.js";

export function App() {
  const needsSetup = useStore((s) => s.config.missing || Boolean(s.config.invalid));

  useEffect(() => {
    const first = useStore.getState().consumeInitialPrompt();
    if (first) {
      useStore.getState().submitUser(first);
    }
  }, []);

  return (
    <Box flexDirection="column">
      {needsSetup ? <SetupCard /> : <Transcript />}
      <ActivityLine />
      <ApprovalCard />
      <Composer />
      <Footer />
    </Box>
  );
}
