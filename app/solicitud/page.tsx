import SolicitudPublicaForm from "@/app/components/SolicitudPublicaForm";

export const metadata = {
  title: "Solicitud de Conexión — Ultranet",
  description: "Solicitá la instalación de Internet y TV de Ultranet.",
};

export default async function SolicitudPublicaPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { sucursal } = await searchParams;
  const sucursalNum = sucursal ? parseInt(sucursal, 10) : null;

  return <SolicitudPublicaForm sucursalInicial={sucursalNum && !isNaN(sucursalNum) ? sucursalNum : null} />;
}
