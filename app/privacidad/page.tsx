import { Plus_Jakarta_Sans } from "next/font/google";

// Política de privacidad pública (Ley 25.326 de Protección de Datos Personales), enlazada desde
// el aviso al pie de /solicitud. BORRADOR: el texto lo tiene que revisar el asesor legal.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata = {
  title: "Política de privacidad — Ultranet",
  description: "Cómo trata Ultranet los datos personales que nos dejás en la web.",
};

const PURPLE_DARK = "#2E1252";
const CONTACTO = "contacto@ultranet.com.ar";

const SECCIONES: { titulo: string; parrafos: React.ReactNode[] }[] = [
  {
    titulo: "Quién es responsable de tus datos",
    parrafos: [
      <>El responsable de la base de datos es <strong>Ultranet</strong>. Para cualquier consulta sobre tus datos personales podés escribirnos a <a href={`mailto:${CONTACTO}`} className="underline">{CONTACTO}</a>.</>,
    ],
  },
  {
    titulo: "Qué datos recolectamos",
    parrafos: [
      "Cuando completás la solicitud de conexión o un formulario de contacto, recolectamos los datos que nos das: nombre y apellido, tipo y número de documento, teléfono, correo electrónico, domicilio y ubicación del lugar de instalación, la sucursal y el plan que elegiste, y lo que nos escribas en tu consulta.",
      "Los datos marcados como obligatorios son necesarios para poder procesar tu solicitud; si no los completás, no vamos a poder darle curso.",
    ],
  },
  {
    titulo: "Para qué los usamos",
    parrafos: [
      "Usamos tus datos únicamente para gestionar tu solicitud o consulta: verificar la factibilidad técnica en tu domicilio, contactarte para coordinar la instalación o responderte y, si contratás el servicio, para su prestación y facturación.",
      "No vendemos ni cedemos tus datos a terceros. Solo pueden acceder a ellos los proveedores que necesitamos para operar (por ejemplo, el alojamiento de nuestros sistemas), con la misma obligación de confidencialidad, o las autoridades cuando una ley lo exija.",
    ],
  },
  {
    titulo: "Cuánto tiempo los guardamos",
    parrafos: [
      "Conservamos tus datos mientras sean necesarios para la finalidad por la que nos los diste y durante los plazos que exijan las normas vigentes. Aplicamos medidas técnicas y organizativas para protegerlos de accesos no autorizados, pérdida o alteración.",
    ],
  },
  {
    titulo: "Tus derechos",
    parrafos: [
      <>Podés pedirnos en cualquier momento acceder a tus datos, actualizarlos, corregirlos o eliminarlos, escribiendo a <a href={`mailto:${CONTACTO}`} className="underline">{CONTACTO}</a>. Te vamos a responder dentro de los plazos que fija la Ley 25.326 (10 días corridos para el acceso y 5 días hábiles para la rectificación, actualización o supresión).</>,
      "El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.",
      "La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <div className={`${jakarta.className} min-h-screen bg-white`}>
      <div className="px-4 pt-10 pb-10 text-center" style={{ background: PURPLE_DARK }}>
        <a href="https://www.ultranet.com.ar" className="block w-fit mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ultranet-logo-blanco.svg" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 200 }} />
        </a>
        <h1 className="text-white text-2xl font-extrabold mt-7">Política de privacidad</h1>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8 text-sm leading-relaxed text-slate-700">
        {SECCIONES.map((s) => (
          <section key={s.titulo}>
            <h2 className="text-base font-extrabold mb-2" style={{ color: PURPLE_DARK }}>{s.titulo}</h2>
            <div className="space-y-2">
              {s.parrafos.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </section>
        ))}

        <p className="text-xs text-slate-400 pt-4 border-t border-slate-200">Última actualización: octubre de 2026.</p>

        <a href="/solicitud" className="inline-block text-sm font-semibold underline underline-offset-4" style={{ color: PURPLE_DARK }}>
          Volver a la solicitud
        </a>
      </main>
    </div>
  );
}
