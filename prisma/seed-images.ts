/**
 * Generates the demo screenshots (a travel website homepage and checkout) as
 * SVG and renders them to PNG with sharp, so the seed needs no binary assets.
 */
import sharp from "sharp";

const W = 1440;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function text(x: number, y: number, value: string, size: number, opts: { weight?: number; fill?: string; anchor?: string } = {}) {
  return `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? "#0f172a"}" text-anchor="${opts.anchor ?? "start"}">${esc(value)}</text>`;
}

function nav(accent: string) {
  return `
    <rect x="0" y="0" width="${W}" height="88" fill="#ffffff"/>
    <rect x="0" y="87" width="${W}" height="1" fill="#e2e8f0"/>
    <circle cx="96" cy="44" r="18" fill="${accent}"/>
    ${text(126, 53, "Skyline Travel", 26, { weight: 700 })}
    ${text(820, 52, "Destinations", 18, { fill: "#475569" })}
    ${text(960, 52, "Deals", 18, { fill: "#475569" })}
    ${text(1040, 52, "Stories", 18, { fill: "#475569" })}
    ${text(1130, 52, "Help", 18, { fill: "#475569" })}
    <rect x="1220" y="26" width="140" height="36" rx="18" fill="none" stroke="#cbd5e1"/>
    ${text(1290, 50, "Sign in", 16, { anchor: "middle", fill: "#334155" })}`;
}

function card(x: number, y: number, title: string, price: string, hue: number) {
  return `
    <rect x="${x}" y="${y}" width="400" height="360" rx="20" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="${x}" y="${y}" width="400" height="220" rx="20" fill="hsl(${hue} 70% 62%)"/>
    <rect x="${x}" y="${y + 200}" width="400" height="20" fill="hsl(${hue} 70% 62%)"/>
    <circle cx="${x + 320}" cy="${y + 70}" r="34" fill="hsl(${hue} 90% 85%)" opacity="0.8"/>
    <path d="M${x} ${y + 220} L${x + 130} ${y + 120} L${x + 220} ${y + 190} L${x + 300} ${y + 130} L${x + 400} ${y + 220} Z" fill="hsl(${hue} 50% 40%)" opacity="0.55"/>
    ${text(x + 28, y + 268, title, 24, { weight: 700 })}
    ${text(x + 28, y + 304, "7 nights · flights included", 16, { fill: "#64748b" })}
    ${text(x + 28, y + 338, price, 20, { weight: 700, fill: "#0f766e" })}`;
}

export type HomepageVariant = 1 | 2 | 3;

export function homepageSvg(variant: HomepageVariant) {
  const accent = variant === 1 ? "#64748b" : "#ea580c";
  const headline = variant === 1 ? "Travel the world" : variant === 2 ? "Your next escape starts here" : "Your next escape starts here";
  const sub =
    variant === 1
      ? "Find trips and hotels for every budget."
      : "Hand-picked trips with flights, stays and local guides — all in one booking.";
  const button =
    variant === 1
      ? `<rect x="120" y="470" width="150" height="44" rx="6" fill="#94a3b8"/>${text(195, 498, "Book now", 16, { anchor: "middle", fill: "#ffffff" })}`
      : `<rect x="120" y="470" width="260" height="64" rx="32" fill="#ea580c"/>${text(250, 511, "Book Now", 22, { anchor: "middle", fill: "#ffffff", weight: 700 })}`;
  const priceHint = variant === 3 ? text(120, 570, "From $899 per person · free cancellation", 17, { fill: "#475569" }) : "";
  const search =
    variant === 1
      ? ""
      : `<rect x="120" y="610" width="760" height="76" rx="16" fill="#ffffff" stroke="#e2e8f0"/>
         ${text(150, 656, "Where to?", 18, { fill: "#94a3b8" })}
         <rect x="400" y="630" width="1" height="36" fill="#e2e8f0"/>
         ${text(430, 656, "Dates", 18, { fill: "#94a3b8" })}
         <rect x="620" y="630" width="1" height="36" fill="#e2e8f0"/>
         ${text(650, 656, "2 travellers", 18, { fill: "#94a3b8" })}`;
  const footerTone = variant === 3 ? "#0f172a" : "#1e293b";
  const height = 1700;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
    <rect width="${W}" height="${height}" fill="#f8fafc"/>
    ${nav(accent)}
    <rect x="0" y="88" width="${W}" height="680" fill="${variant === 1 ? "#e2e8f0" : "#fff7ed"}"/>
    <circle cx="1120" cy="400" r="230" fill="${variant === 1 ? "#cbd5e1" : "#fdba74"}"/>
    <circle cx="1220" cy="300" r="90" fill="${variant === 1 ? "#94a3b8" : "#fb923c"}"/>
    <path d="M880 700 L1050 470 L1160 600 L1260 500 L1440 700 Z" fill="${variant === 1 ? "#94a3b8" : "#c2410c"}" opacity="0.6"/>
    ${text(120, 330, headline, variant === 1 ? 56 : 64, { weight: 800 })}
    ${text(120, 400, sub, 22, { fill: "#475569" })}
    ${button}
    ${priceHint}
    ${search}
    ${text(120, 880, "Popular this season", 34, { weight: 700 })}
    ${card(120, 930, "Lisbon & Porto", "from $899", 200)}
    ${card(520, 930, "Kyoto in autumn", "from $1,749", 20)}
    ${card(920, 930, "Bali retreat", "from $1,190", 150)}
    <rect x="0" y="1400" width="${W}" height="300" fill="${footerTone}"/>
    ${text(120, 1480, "Skyline Travel", 24, { weight: 700, fill: "#ffffff" })}
    ${text(120, 1520, "Trips worth taking since 2012.", 16, { fill: "#94a3b8" })}
    ${text(720, 1480, "Company", 16, { weight: 700, fill: "#ffffff" })}
    ${text(720, 1515, "About · Careers · Press", 15, { fill: "#94a3b8" })}
    ${text(1000, 1480, "Support", 16, { weight: 700, fill: "#ffffff" })}
    ${text(1000, 1515, "Help centre · Contact", 15, { fill: "#94a3b8" })}
  </svg>`;
}

export function checkoutSvg(variant: 1 | 2) {
  const height = 1200;
  const field = (x: number, y: number, label: string, value: string, w = 560) => `
    ${text(x, y, label, 15, { fill: "#475569", weight: 600 })}
    <rect x="${x}" y="${y + 12}" width="${w}" height="52" rx="10" fill="#ffffff" stroke="#cbd5e1"/>
    ${text(x + 16, y + 45, value, 17, { fill: "#0f172a" })}`;
  const payButton =
    variant === 1
      ? `<rect x="120" y="980" width="560" height="56" rx="10" fill="#334155"/>${text(400, 1015, "Continue", 18, { anchor: "middle", fill: "#fff", weight: 700 })}`
      : `<rect x="120" y="980" width="560" height="60" rx="30" fill="#ea580c"/>${text(400, 1018, "Pay $1,618 securely", 19, { anchor: "middle", fill: "#fff", weight: 700 })}`;
  const trust = variant === 2 ? text(120, 1075, "Secure payment · Free cancellation up to 14 days before departure", 15, { fill: "#475569" }) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
    <rect width="${W}" height="${height}" fill="#f8fafc"/>
    ${nav("#ea580c")}
    ${text(120, 170, "Checkout", 40, { weight: 800 })}
    ${text(120, 210, "Lisbon & Porto · 7 nights · 2 travellers", 18, { fill: "#64748b" })}
    ${field(120, 270, "Full name", "Sara Ahmed")}
    ${field(120, 370, "Email", "sara@example.com")}
    ${field(120, 470, "Card number", "4242 4242 4242 4242")}
    ${field(120, 570, "Expiry", "12 / 28", 260)}
    ${field(420, 570, "CVC", "•••", 260)}
    ${variant === 2 ? field(120, 670, "Promo code (optional)", "SUMMER10") : ""}
    <rect x="860" y="250" width="460" height="${variant === 2 ? 470 : 400}" rx="20" fill="#ffffff" stroke="#e2e8f0"/>
    ${text(900, 305, "Order summary", 22, { weight: 700 })}
    ${text(900, 360, "Trip package × 2", 17, { fill: "#475569" })}${text(1280, 360, "$1,798", 17, { anchor: "end" })}
    ${text(900, 400, "Taxes & fees", 17, { fill: "#475569" })}${text(1280, 400, variant === 2 ? "Included" : "$212", 17, { anchor: "end" })}
    ${variant === 2 ? `${text(900, 440, "Promo SUMMER10", 17, { fill: "#0f766e" })}${text(1280, 440, "−$180", 17, { anchor: "end", fill: "#0f766e" })}` : ""}
    <rect x="900" y="${variant === 2 ? 470 : 430}" width="380" height="1" fill="#e2e8f0"/>
    ${text(900, variant === 2 ? 520 : 480, "Total", 20, { weight: 700 })}${text(1280, variant === 2 ? 520 : 480, variant === 2 ? "$1,618" : "$2,010", 20, { anchor: "end", weight: 700 })}
    ${payButton}
    ${trust}
  </svg>`;
}

export async function renderPng(svg: string) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
