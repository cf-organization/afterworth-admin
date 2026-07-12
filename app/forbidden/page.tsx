// Plain 403 — no data, no detail. Rendered by the middleware for a signed-in non-admin.
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="text-center">
        <p className="text-4xl font-semibold">403</p>
        <p className="mt-2 text-muted-foreground">You are not authorized to access this console.</p>
        <a href="/login" className="mt-4 inline-block text-sm underline">
          Sign in as an administrator
        </a>
      </div>
    </main>
  );
}
