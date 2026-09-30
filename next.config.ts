import type { NextConfig } from "next";

// GitHub Pages는 https://<계정>.github.io/<저장소>/ 경로로 서비스되므로
// 워크플로우에서 NEXT_PUBLIC_BASE_PATH=/<저장소> 를 넣어 빌드한다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
