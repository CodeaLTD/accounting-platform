// Base URL for the Codea Auth Server's License API. Update this — and the
// matching `http:default` allow-list entry in
// src-tauri/capabilities/default.json — together when the API moves (e.g.
// off Render's free tier onto Azure). They can't share a single source of
// truth: this one is a JS constant, the other is compiled into the Tauri
// binary as static capability config.
export const LICENSE_API_BASE_URL = "https://codea-auth-server.onrender.com";
