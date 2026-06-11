import { Button } from "@ui/button";
import { activeClient } from "@/client";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">{activeClient.identity.name}</h1>
      <Button>Themed button</Button>
    </main>
  );
}
