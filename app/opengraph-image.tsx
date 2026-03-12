import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "CityTsek — GV2025 Property Valuation Analyser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: "60px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "16px",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "36px",
            color: "white",
            fontWeight: 800,
          }}
        >
          CT
        </div>
        <span
          style={{
            fontSize: "48px",
            fontWeight: 800,
            color: "white",
            letterSpacing: "-1px",
          }}
        >
          CityTsek
        </span>
      </div>

      <div
        style={{
          fontSize: "28px",
          color: "#94a3b8",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: "800px",
          marginBottom: "48px",
        }}
      >
        Is your Cape Town property over-valued? Check your GV2025 valuation against real comparable
        sales data.
      </div>

      <div
        style={{
          display: "flex",
          gap: "24px",
        }}
      >
        {["Lookup Property", "Compare Sales", "Get Report"].map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              background: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "12px",
              padding: "14px 24px",
              fontSize: "20px",
              color: "#93c5fd",
            }}
          >
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                color: "white",
              }}
            >
              {i + 1}
            </span>
            {step}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "30px",
          fontSize: "18px",
          color: "#475569",
        }}
      >
        citytsek.xyz — Free &amp; Open Source
      </div>
    </div>,
    { ...size },
  );
}
