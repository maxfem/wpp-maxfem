import { useEffect } from "react";
import { useParams } from "react-router-dom";

/**
 * Catches /r/:code and redirects to the link-redirect Edge Function.
 * This exists because wpp.maxapps.com.br points to the React app,
 * so we need the React Router to forward tracking links.
 */
export default function LinkRedirect() {
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    if (code) {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/link-redirect?c=${code}`;
      window.location.replace(url);
    }
  }, [code]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
