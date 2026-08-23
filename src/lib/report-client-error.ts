export function reportClientError(error: Error & { digest?: string }) {
  fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      path: window.location.pathname,
    }),
  }).catch(() => {});
}
