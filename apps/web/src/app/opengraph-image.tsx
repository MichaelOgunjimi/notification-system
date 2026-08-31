import { readFile } from "node:fs/promises"
import path from "node:path"

import { ImageResponse } from "next/og"

export const alt = "Beaco"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpenGraphImage() {
  const lockup = await readFile(
    path.join(
      process.cwd(),
      "public/brand/png/beaco-lockup-horizontal-dark.png"
    )
  )
  const lockupSource = `data:image/png;base64,${lockup.toString("base64")}`

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at 50% 42%, rgba(233, 170, 49, 0.09), transparent 38%), linear-gradient(145deg, #10100e 0%, #060605 72%)",
        color: "#f1efe7",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(255, 255, 255, 0.09)",
          display: "flex",
          inset: 24,
          position: "absolute",
        }}
      />

      {[240, 480, 720, 960].map((left) => (
        <div
          key={left}
          style={{
            background: "rgba(255, 255, 255, 0.025)",
            bottom: 24,
            display: "flex",
            left,
            position: "absolute",
            top: 24,
            width: 1,
          }}
        />
      ))}
      {[210, 420].map((top) => (
        <div
          key={top}
          style={{
            background: "rgba(255, 255, 255, 0.025)",
            display: "flex",
            height: 1,
            left: 24,
            position: "absolute",
            right: 24,
            top,
          }}
        />
      ))}

      <img
        src={lockupSource}
        alt=""
        width="1220"
        height="458"
        style={{
          height: 458,
          objectFit: "contain",
          position: "relative",
          transform: "translateY(-4px)",
          width: 1220,
        }}
      />
    </div>,
    size
  )
}
