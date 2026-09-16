export default function StatusPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-bold mb-4">
          🚧 System Maintenance
        </h1>

        <p className="mb-4 text-gray-600">
          We are currently experiencing database inconsistencies
          affecting core features like user and permit creation.
        </p>

        <div className="text-left bg-gray-100 p-4 rounded-lg text-sm">
          <p>🔴 Status: Partial Outage</p>
          <p>🛠 Fixing: Database relationships & API</p>
          <p>📌 Impact:</p>
          <ul className="list-disc ml-5">
            <li>User creation unavailable</li>
            <li>Permit creation unavailable</li>
            <li>Email notification delayed</li>
          </ul>
        </div>

        <p className="mt-4 text-gray-500 text-sm">
          We’ll update once resolved.
        </p>
      </div>
    </div>
  );
}