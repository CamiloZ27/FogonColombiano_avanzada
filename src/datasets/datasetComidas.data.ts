export interface ComidaTipica {
  id: string;
  nombre: string;
  categoria: "Platos Fuertes" | "Sopas Tradicionales" | "Antojos & Amasijos" | "Postres";
  precio: number;
  descripcion: string;
  tiempoMin: number;
  imagen: string;
  imagenSecundaria: string;
  colorGradiente: string;
  svgFallback: string;
}

function crearSvgPlato(titulo: string, emoji: string, bg1: string, bg2: string, categoria: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380">
    <defs>
      <linearGradient id="g-${titulo.replace(/\s+/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg1}" />
        <stop offset="100%" stop-color="${bg2}" />
      </linearGradient>
    </defs>
    <rect width="600" height="380" fill="url(#g-${titulo.replace(/\s+/g, '')})" />
    <circle cx="300" cy="165" r="105" fill="rgba(255,255,255,0.06)" stroke="rgba(221,161,94,0.35)" stroke-width="3" stroke-dasharray="6,4" />
    <circle cx="300" cy="165" r="85" fill="rgba(0,0,0,0.3)" />
    <text x="300" y="190" font-size="64" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <rect x="40" y="295" width="520" height="55" rx="10" fill="rgba(26,17,8,0.92)" stroke="rgba(244,233,216,0.18)" stroke-width="1" />
    <text x="300" y="322" font-family="'Sora', system-ui, sans-serif" font-size="16" font-weight="700" fill="#F4E9D8" text-anchor="middle">${titulo}</text>
    <text x="300" y="340" font-family="'JetBrains Mono', monospace" font-size="11" fill="#DDA15E" text-anchor="middle">${categoria} • Fogón Colombiano</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const COMIDAS_TIPICAS: ComidaTipica[] = [
  {
    id: "bandeja-paisa",
    nombre: "Bandeja Paisa Tradicional",
    categoria: "Platos Fuertes",
    precio: 38000,
    descripcion:
      "Frijoles cargamanto en salsa criolla, arroz blanco, chicharrón crocante de cerdo, carne molida sazonada, huevo frito, tajada de plátano maduro, chorizo artesanal, arepa paisa y aguacate.",
    tiempoMin: 15,
    imagen: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #3B170B 0%, #B5651D 100%)",
    svgFallback: crearSvgPlato("Bandeja Paisa Tradicional", "🍳", "#3B170B", "#B5651D", "Platos Fuertes"),
  },

  {
    id: "lechona-tolimense",
    nombre: "Lechona Tolimense Especial",
    categoria: "Platos Fuertes",
    precio: 30000,
    descripcion:
      "Cerdo entero horneado a la leña relleno de arvejas amarillas sazonadas y carne magra de cerdo con especias secretas, acompañado de cuero crocante y arepa blanca insulsa.",
    tiempoMin: 10,
    imagen: "https://comedera.com/wp-content/uploads/sites/9/2021/11/lechona-colombiana.jpg",
    imagenSecundaria: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS6ymcdmR8blXyxD5FKIpgUAjYZhFWH6y8wnH74gqCWUMXuT0Q8XsegGxQ&s=10",
    colorGradiente: "linear-gradient(135deg, #2A1408 0%, #DDA15E 100%)",
    svgFallback: crearSvgPlato("Lechona Tolimense Especial", "🍖", "#2A1408", "#DDA15E", "Platos Fuertes"),
  },
  {
    id: "cazuela-mariscos",
    nombre: "Cazuela de Mariscos del Caribe",
    categoria: "Platos Fuertes",
    precio: 45000,
    descripcion:
      "Selección de camarones, calamares, pulpo y filete de pescado en reducción de leche de coco, pimentón y vino blanco. Acompañada con arroz con coco y patacones fritos crujientes.",
    tiempoMin: 18,
    imagen: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/725997/pexels-photo-725997.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #0F2836 0%, #2B6B8A 100%)",
    svgFallback: crearSvgPlato("Cazuela de Mariscos del Caribe", "🦐", "#0F2836", "#2B6B8A", "Platos Fuertes"),
  },
  {
    id: "sobrebarriga-hogao",
    nombre: "Sobrebarriga en Salsa Criolla",
    categoria: "Platos Fuertes",
    precio: 36000,
    descripcion:
      "Corte de sobrebarriga desmechable y tierna, bañada en abundante hogao tradicional de tomate maduro, cebolla y ajo, con papa criolla y yuca al vapor.",
    tiempoMin: 14,
    imagen: "https://images.unsplash.com/photo-1544025162-d76694265947?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/1640772/pexels-photo-1640772.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #3A120B 0%, #A63D2E 100%)",
    svgFallback: crearSvgPlato("Sobrebarriga en Salsa Criolla", "🥩", "#3A120B", "#A63D2E", "Platos Fuertes"),
  },
  {
    id: "tamal-tolimense",
    nombre: "Tamal Tolimense Especial",
    categoria: "Platos Fuertes",
    precio: 22000,
    descripcion:
      "Masa de maíz y arroz envuelta y cocida en hoja de plátano con costilla de cerdo, tocino, pollo, huevo duro, rodajas de papa y zanahoria. Acompañado de arepa y taza de chocolate espumoso.",
    tiempoMin: 8,
    imagen: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/1603901/pexels-photo-1603901.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #1E2F18 0%, #5C7A5A 100%)",
    svgFallback: crearSvgPlato("Tamal Tolimense Especial", "🫔", "#1E2F18", "#5C7A5A", "Platos Fuertes"),
  },
  {
    id: "ajiaco-santafereno",
    nombre: "Ajiaco Santafereño",
    categoria: "Sopas Tradicionales",
    precio: 32000,
    descripcion:
      "Sopa espesa insignia de Bogotá con tres tipos de papas (criolla, pastusa y sabanera), pechuga de pollo desmechada, mazorca tierna, hojas de guasca fresca. Acompañado con alcaparras, crema de leche y aguacate.",
    tiempoMin: 12,
    imagen: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #3A2B0E 0%, #C49A45 100%)",
    svgFallback: crearSvgPlato("Ajiaco Santafereño", "🍲", "#3A2B0E", "#C49A45", "Sopas Tradicionales"),
  },
  {
    id: "sancocho-trifasico",
    nombre: "Sancocho Trifásico Campesino",
    categoria: "Sopas Tradicionales",
    precio: 35000,
    descripcion:
      "Caldo espeso y reconfortante con carne de res, cerdo y pollo de campo, cocinado lentamente con yuca, plátano verde, mazorca y cilantro fresco. Servido con arroz blanco y ensalada.",
    tiempoMin: 15,
    imagen: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/2474661/pexels-photo-2474661.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #33220E 0%, #9C6644 100%)",
    svgFallback: crearSvgPlato("Sancocho Trifásico Campesino", "🥘", "#33220E", "#9C6644", "Sopas Tradicionales"),
  },
  {
    id: "arepa-choclo",
    nombre: "Arepa de Choclo con Queso Campesino",
    categoria: "Antojos & Amasijos",
    precio: 14000,
    descripcion:
      "Arepa dulce preparada con maíz tierno dorado a la plancha, cubierta generosamente con queso campesino fresco y mantequilla de campo derretida.",
    tiempoMin: 8,
    imagen: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/1640773/pexels-photo-1640773.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #3F2C0B 0%, #E09F3E 100%)",
    svgFallback: crearSvgPlato("Arepa de Choclo con Queso", "🧀", "#3F2C0B", "#E09F3E", "Antojos & Amasijos"),
  },
  {
    id: "empanadas-antioquenas",
    nombre: "Trío de Empanadas Colombianas con Ají",
    categoria: "Antojos & Amasijos",
    precio: 12000,
    descripcion:
      "Tres empanadas de maíz crocantes rellenas de papa criolla y carne desmechada guisada, acompañadas con ají casero de cilantro y limón.",
    tiempoMin: 6,
    imagen: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/2347311/pexels-photo-2347311.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #40180B 0%, #D95D39 100%)",
    svgFallback: crearSvgPlato("Trío de Empanadas con Ají", "🥟", "#40180B", "#D95D39", "Antojos & Amasijos"),
  },
  {
    id: "postre-brevas-arequipe",
    nombre: "Brevas Caladas con Arequipe",
    categoria: "Postres",
    precio: 11000,
    descripcion:
      "Brevas enteras cocinadas en almíbar de panela y clavos, rellenas de arequipe artesanal de leche de vaca y acompañadas de queso blanco fresco.",
    tiempoMin: 5,
    imagen: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=700&auto=format&fit=crop&q=80",
    imagenSecundaria: "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=700",
    colorGradiente: "linear-gradient(135deg, #2A180E 0%, #7F5539 100%)",
    svgFallback: crearSvgPlato("Brevas Caladas con Arequipe", "🍮", "#2A180E", "#7F5539", "Postres"),
  },
];
