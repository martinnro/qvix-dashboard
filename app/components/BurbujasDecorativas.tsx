// Circulitos decorativos de los heroes públicos (Solicitud, Enlaces) — suben como burbujas
// (sensación de estar sumergido) y se desvanecen antes de volver a arrancar desde abajo.
export default function BurbujasDecorativas() {
  const puntos = [
    { top: "55%", left: "6%", size: 10, duracion: 8, delay: 0, drift: 10 }, { top: "70%", left: "34%", size: 7, duracion: 10, delay: 2 },
    { top: "80%", left: "16%", size: 9, duracion: 9, delay: 4, drift: -8 }, { top: "60%", left: "88%", size: 8, duracion: 7, delay: 1, drift: -12 },
    { top: "75%", left: "92%", size: 11, duracion: 11, delay: 3, drift: 14 }, { top: "90%", left: "94%", size: 6, duracion: 8.5, delay: 5, drift: -6 },
    { top: "85%", left: "62%", size: 8, duracion: 9.5, delay: 1.8, drift: 8 }, { top: "65%", left: "60%", size: 6, duracion: 7.5, delay: 3.6, drift: -10 },
    { top: "95%", left: "24%", size: 6, duracion: 6.5, delay: 2.4, drift: 6 }, { top: "68%", left: "46%", size: 9, duracion: 10.5, delay: 0.5, drift: -9 },
    { top: "88%", left: "76%", size: 7, duracion: 8, delay: 4.5, drift: 11 }, { top: "72%", left: "3%", size: 8, duracion: 9, delay: 2.9, drift: -7 },
    { top: "82%", left: "55%", size: 10, duracion: 7.5, delay: 1.3, drift: 9 }, { top: "60%", left: "20%", size: 6, duracion: 11.5, delay: 3.2, drift: -11 },
    { top: "92%", left: "40%", size: 8, duracion: 6.8, delay: 0.8, drift: 7 }, { top: "78%", left: "98%", size: 6, duracion: 9.2, delay: 5.4, drift: -6 },
    { top: "66%", left: "70%", size: 7, duracion: 10, delay: 1.6, drift: 10 }, { top: "98%", left: "10%", size: 9, duracion: 8.3, delay: 3.8, drift: -13 },
    // Tanda extra generada con una fórmula fija (no Math.random, para no romper la hidratación
    // SSR/cliente) — solo para sumar densidad sin tener que tipear cada punto a mano.
    ...Array.from({ length: 20 }, (_, i) => ({
      top: `${55 + ((i * 13) % 42)}%`,
      left: `${(i * 17 + 4) % 96}%`,
      size: 5 + (i % 5),
      duracion: 6.5 + (i % 6) * 0.8,
      delay: (i % 7) * 0.7,
      drift: (i % 2 === 0 ? 1 : -1) * (6 + (i % 6)),
    })),
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {puntos.map((p, i) => (
        <div key={i} className="absolute rounded-full bg-white/10" style={{
          top: p.top, left: p.left, width: p.size * 2, height: p.size * 2,
          animation: `float-globito ${p.duracion}s ease-in infinite`,
          animationDelay: `${p.delay}s`,
          ["--drift" as string]: `${p.drift ?? 8}px`,
        }} />
      ))}
    </div>
  );
}
