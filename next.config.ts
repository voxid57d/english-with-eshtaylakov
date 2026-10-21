import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   images: {
      remotePatterns: [
         {
            protocol: "https",
            hostname: "lh3.googleusercontent.com",
         },
         {
            protocol: "https",
            hostname: "xbyylxvnwbzpftmiygco.supabase.co",
         },
      ],
   },
   async rewrites() {
      return {
         beforeFiles: [
            {
               source: "/dashboard/reading",
               destination: "/dashboard/mock/reading",
            },
         ],
      };
   },
};

export default nextConfig;
