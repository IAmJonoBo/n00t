export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">n00ton Control Centre</h1>
      <p className="text-muted-foreground max-w-2xl text-center">
        This is the web UI shell. The MCP host service will stream discovered capabilities here.
      </p>
    </main>
  );
}
