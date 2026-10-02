import { UserPlus, Globe, MessageCircle, ExternalLink } from "lucide-react";
import BurbujasDecorativas from "@/app/components/BurbujasDecorativas";

export const metadata = {
  title: "Ultranet — Enlaces",
  description: "Suscribite, visitá nuestra web o seguinos en redes.",
};

const MORADO = "#3D1263";
const MORADO_CLARO = "#5B2A8A";
const CIAN = "#22C3DC";

// Lucide no incluye isotipos de marca (Instagram/Facebook/WhatsApp) a propósito — se arman acá
// como SVG inline, minimalistas y en un solo color para que combinen con el resto de los íconos.
function InstagramIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h-2.5A3.5 3.5 0 0 0 9 7.5V10H6.5v3H9v7h3v-7h2.5l.5-3H12V7.5c0-.55.45-1 1-1H15V4Z" />
    </svg>
  );
}

const ENLACES = [
  {
    label: "Suscribirme",
    sublabel: "Pedí tu instalación",
    href: "/solicitud",
    icon: UserPlus,
    destacado: true,
  },
  {
    label: "Visitar página web",
    sublabel: "ultranet.com.ar",
    href: "https://ultranet.com.ar",
    icon: Globe,
    destacado: false,
  },
  {
    label: "Instagram",
    sublabel: "@ultranet.catamarca",
    href: "https://instagram.com/ultranet.catamarca",
    icon: InstagramIcon,
    destacado: false,
  },
  {
    label: "Facebook",
    sublabel: "Ultranet Catamarca",
    href: "https://www.facebook.com/ultranetcatamarca",
    icon: FacebookIcon,
    destacado: false,
  },
  {
    label: "WhatsApp",
    sublabel: "Canal de atención",
    href: "https://wa.me/5493834658846",
    icon: MessageCircle,
    destacado: false,
  },
] as const;

export default function EnlacesPage() {
  return (
    <div className="relative overflow-hidden min-h-screen flex items-center" style={{ background: `linear-gradient(135deg, ${MORADO}, ${MORADO_CLARO})` }}>
      <BurbujasDecorativas />
      <div className="relative px-4 py-14 w-full">
        <div className="relative max-w-sm mx-auto text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ultranet-logo.png" alt="Ultranet — Internet a Ultra Velocidad" className="mx-auto" style={{ width: 220 }} />
          <p className="text-white/70 text-sm mt-3 mb-8">Elegí qué querés hacer</p>

          <div className="space-y-3">
            {ENLACES.map(({ label, sublabel, href, icon: Icon, destacado }) => {
              const externo = href.startsWith("http");
              return (
                <a
                  key={label}
                  href={href}
                  target={externo ? "_blank" : undefined}
                  rel={externo ? "noopener noreferrer" : undefined}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-transform hover:scale-[1.02]"
                  style={{
                    backgroundColor: destacado ? CIAN : "rgba(255,255,255,0.1)",
                    border: destacado ? "none" : "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <span
                    className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: destacado ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.12)", color: destacado ? "#ffffff" : CIAN }}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-sm text-white">{label}</span>
                    <span className={`block text-xs truncate ${destacado ? "text-white/80" : "text-white/50"}`}>{sublabel}</span>
                  </span>
                  {externo && <ExternalLink size={15} className={destacado ? "text-white/70" : "text-white/40"} />}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
