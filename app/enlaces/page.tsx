import { Plus_Jakarta_Sans } from "next/font/google";

// Página pública tipo "linktree" — porteada 1:1 desde el enlaces.html real del sitio
// institucional (repo ultranet-web, a cargo del diseñador) para que comparta exactamente
// la misma estética: tipografía, paleta, fondo animado y estilo de lista.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata = {
  title: "Ultranet — Enlaces",
  description: "Suscribite, visitá nuestra web o seguinos en redes.",
};

// Burbujas que suben desde abajo, igual efecto que en /solicitud — en violeta/celeste, con
// más opacidad y tamaño que sobre fondo oscuro porque el mismo alfa se nota mucho menos
// sobre blanco (bajo contraste); el color de base sigue siendo el de la paleta del sitio.
const EL_BURBUJAS = [
  { top: "58%", left: "8%", size: 16, duracion: 9, delay: 0, drift: 14, color: "rgba(139,85,192,.45)" },
  { top: "72%", left: "28%", size: 11, duracion: 11, delay: 2.2, drift: -11, color: "rgba(0,174,204,.5)" },
  { top: "40%", left: "85%", size: 14, duracion: 8, delay: 1, drift: -13, color: "rgba(139,85,192,.4)" },
  { top: "80%", left: "62%", size: 12, duracion: 10, delay: 3.4, drift: 12, color: "rgba(0,174,204,.45)" },
  { top: "25%", left: "14%", size: 9, duracion: 9.5, delay: 4.2, drift: 9, color: "rgba(139,85,192,.42)" },
  { top: "90%", left: "40%", size: 11, duracion: 8.5, delay: 1.6, drift: -10, color: "rgba(0,174,204,.4)" },
  { top: "15%", left: "70%", size: 13, duracion: 10.5, delay: 2.8, drift: 15, color: "rgba(139,85,192,.48)" },
  { top: "65%", left: "92%", size: 9, duracion: 9, delay: 0.6, drift: -12, color: "rgba(0,174,204,.42)" },
  // Tanda extra generada con una fórmula fija (no Math.random) para sumar densidad sin
  // tener que tipear cada punto a mano — mismo criterio que en /solicitud.
  ...Array.from({ length: 14 }, (_, i) => ({
    top: `${10 + ((i * 17) % 85)}%`,
    left: `${(i * 23 + 5) % 96}%`,
    size: 8 + (i % 6),
    duracion: 8 + (i % 6) * 0.7,
    delay: (i % 7) * 0.6,
    drift: (i % 2 === 0 ? 1 : -1) * (8 + (i % 7)),
    color: i % 2 === 0 ? `rgba(139,85,192,${(0.38 + (i % 4) * 0.03).toFixed(2)})` : `rgba(0,174,204,${(0.38 + (i % 4) * 0.03).toFixed(2)})`,
  })),
];

const ENLACES = [
  {
    label: "Suscribirme",
    sublabel: "Pedí tu instalación",
    href: "/solicitud",
    externo: false,
    destacado: true,
    icon: (
      <svg viewBox="0 0 24 24" className="el-line">
        <path d="M5 12.5a10 10 0 0 1 14 0" />
        <path d="M8.5 15.8a5 5 0 0 1 7 0" />
        <circle cx="12" cy="19" r="1.2" fill="currentColor" />
        <path d="M2 9a15 15 0 0 1 20 0" />
      </svg>
    ),
  },
  {
    label: "Visitar página web",
    sublabel: "ultranet.com.ar",
    href: "https://ultranet.com.ar",
    externo: true,
    destacado: false,
    icon: (
      <svg viewBox="0 0 24 24" className="el-line">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    sublabel: "@ultranet.catamarca",
    href: "https://instagram.com/ultranet.catamarca",
    externo: true,
    destacado: false,
    icon: (
      <svg viewBox="0 0 64 64" fill="currentColor">
        <path d="M64,32c0,17.67-14.33,32-32,32S0,49.67,0,32,14.33,0,32,0s32,14.33,32,32ZM40.37,51.54c1.81,0,3.42-.43,4.98-1.06,4.27-1.73,6.21-5.77,6.42-10.29v-16.35c-.38-7.02-4.35-10.95-11.35-11.38h-16.84c-6.99.44-10.97,4.36-11.35,11.38v16.35c.38,7.02,4.36,10.94,11.35,11.38l16.78-.02Z" />
        <path d="M40.37,47.83h-16.68c-1.46,0-2.83-.36-4.1-1-2.65-1.34-3.72-4.43-3.72-7.42v-14.82c-.01-3.02,1.12-6.15,3.81-7.47,1.29-.63,2.67-.96,4.14-.96h16.49c1.46,0,2.83.36,4.1,1.01,2.46,1.25,3.71,4.24,3.71,7.04v15.59c0,2.76-1.22,5.73-3.63,6.99-1.25.65-2.59,1.04-4.12,1.04ZM44.54,21.65c0-1.15-.93-2.08-2.08-2.08s-2.08.93-2.08,2.08.93,2.08,2.08,2.08,2.08-.93,2.08-2.08ZM42.41,32c0-5.75-4.66-10.41-10.41-10.41s-10.41,4.66-10.41,10.41,4.66,10.41,10.41,10.41,10.41-4.66,10.41-10.41Z" />
      </svg>
    ),
  },
  {
    label: "Facebook",
    sublabel: "Ultranet Catamarca",
    href: "https://www.facebook.com/ultranetcatamarca",
    externo: true,
    destacado: false,
    icon: (
      <svg viewBox="0 0 64 64" fill="currentColor">
        <path d="M34,0l.58.11c15.59,1.22,28.09,13.72,29.31,29.32l.11.58v3.88s-.11.73-.11.73c-1.05,13.22-10.25,24.46-23.04,28.15v-23.68s6.89,0,6.89,0l1.04-8h-7.94s0-5.82,0-5.82c.09-.91.32-1.7.94-2.35.7-.5,1.56-.81,2.46-.81l4.75-.02v-7.16c-3.69-.22-7.64-.81-10.96.63-2.25,1.01-3.91,2.82-4.75,5.13-.48,1.36-.69,2.74-.73,4.2v6.2s-6.87,0-6.87,0v8s6.88.01,6.88.01v24.9c-10.08.17-19.48-4.36-25.67-12.16-9.2-11.6-9.2-28.06,0-39.68C12.57,4.99,20.98.62,30.02.05L34,0Z" />
      </svg>
    ),
  },
  {
    label: "WhatsApp",
    sublabel: "Canal de atención",
    href: "https://wa.me/5493834658846",
    externo: true,
    destacado: false,
    icon: (
      <svg viewBox="0 0 64 64" fill="currentColor">
        <path d="M16.92,59.59L0,64l4.53-16.42C-2.97,34.63-.37,18.23,10.8,8.18,21.72-1.66,38.18-2.74,50.21,5.6c15.66,10.76,18.45,32.62,5.96,46.92-9.66,11.13-25.97,14.26-39.25,7.07ZM17.73,53.85c10.27,6.63,23.65,5.37,32.48-2.88,6.27-5.85,9.32-14.23,8.15-22.9-1.04-7.75-5.75-14.91-12.71-19.03-10.74-6.35-24.42-4.31-32.87,4.68s-9.55,22.75-2.45,32.99l-2.69,9.74,10.08-2.61Z" />
        <path d="M41.15,35.72l6.73,3.23c.81.39.32,3.52-.52,4.72-1.04,1.48-2.72,2.49-4.47,2.98s-3.46.41-5.12-.05c-2.01-.56-3.88-1.26-5.76-2.14-5.73-2.69-10.88-8.27-14.15-13.63-2.51-4.11-2.81-9.01.64-12.56.56-.57,1.18-1.14,2.03-1.19,1.79-.1,2.96-.22,3.49,1.06l2.56,6.11c.25.6.36,1.16-.05,1.75-.63.89-1.32,1.79-2.02,2.63-.44.53-.43.95-.09,1.52,2.53,4.3,6.25,7.58,10.94,9.37.42.16,1.02.35,1.36-.06l3.03-3.67c.24-.29.99-.27,1.39-.07Z" />
      </svg>
    ),
  },
];

export default function EnlacesPage() {
  return (
    <div className={`${jakarta.className} el-body`}>
      {/* Estilos porteados del enlaces.html del repo ultranet-web (prefijo el- para no chocar
          con el resto del dashboard, que comparte este mismo bundle de CSS global). */}
      <style>{`
        .el-body { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
          padding: 56px 20px 32px; color: #2E1252; background: #fff; -webkit-font-smoothing: antialiased;
          isolation: isolate; }
        .el-body a { color: inherit; text-decoration: none; }

        .el-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
        .el-bubbles { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
        .el-bubble { position: absolute; border-radius: 999px;
          animation: el-burbuja-subir var(--dur) ease-in infinite; animation-delay: var(--delay); }
        @keyframes el-burbuja-subir {
          0%   { transform: translate(0, 0); opacity: 0; }
          8%   { opacity: 1; }
          85%  { opacity: .5; }
          100% { transform: translate(var(--drift, 8px), -150px); opacity: 0; }
        }
        .el-bg::before { content: ""; position: absolute; inset: -40%;
          background: radial-gradient(22% 28% at 20% 18%, rgba(63,224,245,.16), transparent 70%),
                      radial-gradient(26% 30% at 82% 80%, rgba(139,85,192,.16), transparent 70%);
          animation: el-flow 14s ease-in-out infinite alternate; }

        .el-wrap { width: 100%; max-width: 440px; }
        .el-logo { display: block; width: 210px; margin: 0 auto; }
        .el-lead { text-align: center; margin: 34px 0 18px; font-size: 15px; font-weight: 500; color: #8A8798; }
        .el-lead b { color: #2E1252; font-weight: 700; }

        .el-list { list-style: none; display: grid; gap: 12px; }
        .el-lnk { display: flex; align-items: center; gap: 14px; background: #F1F1F1; border-radius: 22px;
          padding: 14px 16px 14px 14px; transition: transform .35s cubic-bezier(.22,.8,.24,1), background .3s, box-shadow .3s; }
        .el-lnk:hover { transform: translateY(-2px); background: #EBE1F7; }
        .el-lnk:active { transform: scale(.98); }
        .el-ic { flex: none; width: 44px; height: 44px; display: grid; place-items: center; color: #2E1252;
          transition: transform .4s cubic-bezier(.22,.8,.24,1); }
        .el-ic svg { width: 40px; height: 40px; }
        .el-ic svg.el-line { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; width: 24px; height: 24px; }
        .el-ic:has(svg.el-line) { background: #2E1252; color: #fff; border-radius: 50%; width: 40px; height: 40px; margin: 2px; }
        .el-lnk:hover .el-ic { transform: scale(1.1) rotate(-6deg); }
        .el-lnk:active .el-ic { transform: scale(.94) rotate(0deg); }
        .el-lnk.el-main .el-ic { animation: el-ic-pulse 2.6s cubic-bezier(.22,.8,.24,1) infinite; }
        .el-lnk.el-main:hover .el-ic { animation-play-state: paused; }
        .el-tx { flex: 1; min-width: 0; display: grid; gap: 1px; }
        .el-tx b { font-size: 16px; font-weight: 700; }
        .el-tx small { font-size: 13.5px; color: #8A8798; font-weight: 500; }
        .el-chev { flex: none; width: 22px; height: 22px; border-radius: 50%; background: #8A8798; display: grid;
          place-items: center; transition: background .25s, transform .25s cubic-bezier(.22,.8,.24,1); }
        .el-chev svg { width: 13px; height: 13px; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
        .el-lnk:hover .el-chev { background: #2E1252; transform: translateX(2px); }

        .el-lnk.el-main { background: #2E1252; color: #fff; position: relative; isolation: isolate; overflow: hidden; padding: 18px 18px 18px 16px; }
        .el-lnk.el-main::before { content: ""; position: absolute; inset: -80%; z-index: -1; pointer-events: none;
          background: radial-gradient(22% 40% at 28% 40%, rgba(63,224,245,.30), transparent 70%),
                      radial-gradient(28% 45% at 72% 60%, rgba(139,85,192,.65), transparent 70%);
          animation: el-flow 6s ease-in-out infinite alternate; }
        .el-lnk.el-main:hover { background: #2E1252; box-shadow: 0 14px 30px rgba(46,18,82,.25); }
        .el-lnk.el-main .el-ic { background: #3FE0F5 !important; color: #2E1252 !important; }
        .el-lnk.el-main .el-tx b { font-size: 17px; font-weight: 800; }
        .el-lnk.el-main .el-tx small { color: #3FE0F5; }
        .el-lnk.el-main .el-chev { background: rgba(255,255,255,.22); }
        .el-lnk.el-main:hover .el-chev { background: #3FE0F5; }
        .el-lnk.el-main:hover .el-chev svg { stroke: #2E1252; }

        .el-footer { margin-top: auto; padding-top: 40px; text-align: center; font-size: 12.5px; color: #8A8798; line-height: 1.7; }
        .el-footer a { color: #2E1252; font-weight: 600; }
        .el-footer strong { color: #2E1252; font-weight: 800; }

        @keyframes el-ic-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.12); }
        }
        @keyframes el-flow {
          0%   { transform: translate3d(-8%, -6%, 0) rotate(0deg); }
          50%  { transform: translate3d(6%, 4%, 0) rotate(10deg) scale(1.05); }
          100% { transform: translate3d(-3%, 7%, 0) rotate(-6deg); }
        }
        .el-sr { opacity: 0; transform: translateY(18px); animation: el-rise .7s cubic-bezier(.22,.8,.24,1) forwards; }
        .el-d0 { animation-delay: .14s; } .el-d1 { animation-delay: .2s; } .el-d2 { animation-delay: .26s; }
        .el-d3 { animation-delay: .32s; } .el-d4 { animation-delay: .38s; }
        @keyframes el-rise { to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .el-sr { animation: none; opacity: 1; transform: none; }
          .el-lnk.el-main::before, .el-bg::before, .el-lnk.el-main .el-ic, .el-bubble { animation: none; opacity: 0; }
        }
        @media (max-width: 400px) { .el-body { padding-top: 40px; } .el-logo { width: 180px; } }
      `}</style>

      <div className="el-bg" aria-hidden="true" />
      <div className="el-bubbles" aria-hidden="true">
        {EL_BURBUJAS.map((b, i) => (
          <span
            key={i}
            className="el-bubble"
            style={{
              top: b.top, left: b.left, width: b.size * 2, height: b.size * 2, background: b.color,
              ["--dur" as string]: `${b.duracion}s`,
              ["--delay" as string]: `${b.delay}s`,
              ["--drift" as string]: `${b.drift}px`,
            }}
          />
        ))}
      </div>
      <main className="el-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ultranet-logo-color.svg" alt="Ultranet — Internet a Ultra Velocidad" className="el-logo el-sr" />
        <p className="el-lead el-sr">
          Elegí qué <b>querés hacer</b>
        </p>
        <ul className="el-list">
          {ENLACES.map((e, i) => (
            <li key={e.label} className={`el-sr el-d${i}`}>
              <a
                className={`el-lnk ${e.destacado ? "el-main" : ""}`}
                href={e.href}
                target={e.externo ? "_blank" : undefined}
                rel={e.externo ? "noopener noreferrer" : undefined}
              >
                <span className="el-ic">{e.icon}</span>
                <span className="el-tx">
                  <b>{e.label}</b>
                  <small>{e.sublabel}</small>
                </span>
                <span className="el-chev" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="M6.5 4.5 10 8l-3.5 3.5" />
                  </svg>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </main>
      <footer className="el-footer">
        Atención al cliente <a href="tel:08001990008">0800-199-0008 (int. 1)</a>
        <br />
        © {new Date().getFullYear()} <strong>ULTRANET</strong> · Catamarca, Argentina
      </footer>
    </div>
  );
}
