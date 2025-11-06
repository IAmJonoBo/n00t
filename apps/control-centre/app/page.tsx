import { N00tonControlCentre } from "@n00t/ui";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 60%, #e0f2fe 100%)",
        padding: "32px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1280px",
        }}
      >
        <N00tonControlCentre />
      </div>
    </main>
  );
}
