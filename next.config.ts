import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Sembunyikan badge dev "N" yang menutupi navigasi bawah di tampilan mobile
  devIndicators: false,
};

export default nextConfig;
