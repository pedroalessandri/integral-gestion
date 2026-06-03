export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Gestión Integral</h1>
          <p className="mt-2 text-gray-600">Plataforma integral de gestión organizacional</p>
        </div>
        <a
          href="/auth/login"
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          Iniciar sesión con Auth0
        </a>
      </div>
    </div>
  );
}
