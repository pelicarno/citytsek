import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "36px",
        background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "90px",
        fontWeight: 800,
        fontFamily: "sans-serif",
        letterSpacing: "-4px",
      }}
    >
      CT
    </div>,
    { ...size },
  );
}
