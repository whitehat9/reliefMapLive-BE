// Browser `Origin` headers are always bare scheme + host (e.g.
// "https://reliefmap-six.vercel.app") — never a trailing slash and never a
// path. Keep every entry in that form; corsOptions normalizes before matching.
const allowOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://reliefmap-six.vercel.app",
  "https://reliefmap.live",
  "https://www.reliefmap.live",
];

// Add environment-specific origins
if (process.env.NODE_ENV === "production" && process.env.FRONTEND_URL) {
  allowOrigins.push(process.env.FRONTEND_URL);
}

export default allowOrigins;
