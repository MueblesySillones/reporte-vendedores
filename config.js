// Configuración de conexión a Supabase (proyecto emma-agency)
// La "publishable key" es pública por diseño: solo permite lo que habilitan
// las políticas RLS (leer vendedores/reportes e insertar reportes).
window.RV_CONFIG = {
  SUPABASE_URL: "https://agsniiuybebhmnbjfqix.supabase.co",
  SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnc25paXV5YmViaG1uYmpmcWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NzM1MzUsImV4cCI6MjA5MzM0OTUzNX0.Ka34seOfKIzotQCug1lUTOcTtMttsezVpT11QQcZt2k",
  BUCKET: "rv-reportes",
};
