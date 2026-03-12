import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "6px",
        background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "18px",
        fontWeight: 800,
        fontFamily: "sans-serif",
        letterSpacing: "-1px",
      }}
    >
      CT
    </div>,
    { ...size },
  );
}
