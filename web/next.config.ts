import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '192.168.0.24', 
    'localhost', 
    '192.168.0.24:3000', 
    'localhost:3000',
    'local-origin.dev', 
    '*.local-origin.dev'
  ]
};

export default nextConfig;
