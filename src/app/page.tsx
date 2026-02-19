import { Nunito } from 'next/font/google'
import { Bot, CalendarDays, MessageSquare, ShoppingCart, Zap, Users, Rocket, ArrowRight, CheckCircle2 } from 'lucide-react'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '600', '700', '800', '900'] })

export default function LandingPage() {
  return (
    <div className={`min-h-screen bg-black text-white selection:bg-[#7C3AED] selection:text-white ${nunito.className}`}>
      
      {/* Resplandor Ambiental de Fondo (Igual que en la App) */}
      <div className="fixed top-[-20%] left-[-10%] w-[70vw] h-[70vh] rounded-full bg-[radial-gradient(circle,_rgba(26,16,60,1)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[60vw] h-[60vh] rounded-full bg-[radial-gradient(circle,_rgba(79,70,229,0.15)_0%,_rgba(0,0,0,0)_70%)] pointer-events-none z-0" />

      {/* NAVBAR */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12 lg:px-24">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] flex items-center justify-center shadow-[0_4px_15px_rgba(124,58,237,0.3)]">
            <Bot size={24} className="text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight">Sloty<span className="text-[#7C3AED]">.</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-white/60 font-bold">
          <a href="#features" className="hover:text-white transition-colors">Funciones</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">¿Cómo funciona?</a>
          <a href="#pricing" className="hover:text-white transition-colors">Planes</a>
        </div>
        <div className="flex items-center gap-4">
          <button className="hidden md:block font-bold text-white/70 hover:text-white transition-colors">
            Iniciar Sesión
          </button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-2.5 rounded-full font-bold transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            Probar Gratis
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-24 pb-32 text-center md:pt-32 md:pb-40">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7C3AED]/10 border border-[#7C3AED]/30 mb-8 backdrop-blur-md">
          <span className="flex w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
          <span className="text-sm font-bold text-[#A78BFA]">Vende 24/7 por WhatsApp</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.1] max-w-5xl mb-8">
          Tu negocio en <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4F46E5] to-[#A78BFA]">piloto automático</span> con IA
        </h1>
        
        <p className="text-lg md:text-xl text-white/60 font-semibold max-w-2xl mb-12 leading-relaxed">
          Atiende clientes, vende productos de tu catálogo y agenda reservas sin mover un dedo. Interviene en cualquier momento con nuestro exclusivo <span className="text-white">Modo Humano</span>.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] font-black text-lg flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(124,58,237,0.4)] hover:scale-105 transition-transform duration-300">
            Crear mi Bot ahora <Rocket size={20} />
          </button>
          <button className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 transition-colors backdrop-blur-sm">
            Ver demostración
          </button>
        </div>
      </main>

      {/* FEATURES GRID */}
      <section id="features" className="relative z-10 px-6 py-24 md:px-12 lg:px-24 bg-black/50 border-y border-white/5 backdrop-blur-xl">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-black mb-4">Todo lo que necesitas en una app</h2>
          <p className="text-white/50 font-semibold text-lg max-w-2xl mx-auto">Diseñado con una estética de cristal premium, pensado para conversiones.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          <FeatureCard 
            icon={<Bot size={28} className="text-[#A78BFA]" />}
            title="IA con Personalidad"
            desc="Configura cómo responde tu bot. Haz que suene amigable, directo, o enfocado en cerrar ventas."
            color="#7C3AED"
          />
          <FeatureCard 
            icon={<Users size={28} className="text-[#FCD34D]" />}
            title="Modo Humano"
            desc="Toma el control del chat al instante. El bot se pausa automáticamente para que tú cierres el trato."
            color="#F59E0B"
          />
          <FeatureCard 
            icon={<ShoppingCart size={28} className="text-[#34D399]" />}
            title="Catálogo Integrado"
            desc="Carga tus productos con fotos, precios y detalles. El bot los ofrecerá inteligentemente."
            color="#10B981"
          />
          <FeatureCard 
            icon={<CalendarDays size={28} className="text-[#60A5FA]" />}
            title="Reservas Automáticas"
            desc="Sincroniza tus horarios. El bot agendará citas y reuniones sin cruzar disponibilidad."
            color="#3B82F6"
          />
          <FeatureCard 
            icon={<MessageSquare size={28} className="text-[#F472B6]" />}
            title="Campañas y Palabras Clave"
            desc="Crea promociones ocultas. Si el cliente escribe 'PROMO24', el bot aplica el descuento."
            color="#EC4899"
          />
          <FeatureCard 
            icon={<Zap size={28} className="text-[#A78BFA]" />}
            title="Dashboard en Tiempo Real"
            desc="Revisa todos los chats, ajusta tu catálogo y cambia la personalidad desde tu celular."
            color="#7C3AED"
          />
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative z-10 px-6 py-24 md:px-12 lg:px-24">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-black mb-4">Planes que crecen contigo</h2>
          <p className="text-white/50 font-semibold text-lg max-w-2xl mx-auto">Cancela cuando quieras. Sin contratos ocultos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Basico */}
          <PricingCard 
            name="Básico"
            emoji="🌱"
            price="49.900"
            color="#10B981"
            features={[
              '1,000 mensajes bot/mes',
              'Panel de chats básico',
              'Catálogo (5 categorías)',
              'Sin fotos de productos'
            ]}
          />
          {/* Pro */}
          <PricingCard 
            name="Pro"
            emoji="🚀"
            price="99.900"
            color="#4F46E5"
            isPopular={true}
            features={[
              '5,000 mensajes bot/mes',
              'Catálogo Ilimitado + Fotos',
              'Reservas automáticas',
              'Campañas y Promociones',
              'Instrucciones IA Avanzadas'
            ]}
          />
          {/* Premium */}
          <PricingCard 
            name="Premium"
            emoji="👑"
            price="199.900"
            color="#7C3AED"
            features={[
              'Mensajes Ilimitados',
              'Soporte prioritario 24/7',
              'Múltiples administradores',
              'Funciones exclusivas beta'
            ]}
          />
        </div>
      </section>

      {/* CTA BOTTOM */}
      <section className="relative z-10 px-6 py-24 text-center">
        <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 rounded-[3rem] p-12 md:p-20 backdrop-blur-lg overflow-hidden relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.2)_0%,_rgba(0,0,0,0)_60%)] pointer-events-none" />
          <h2 className="text-4xl md:text-6xl font-black mb-6 relative z-10">Lleva tu negocio al futuro</h2>
          <p className="text-xl text-white/60 mb-10 font-semibold max-w-2xl mx-auto relative z-10">
            Únete a cientos de emprendedores que ya automatizaron sus ventas.
          </p>
          <button className="px-10 py-5 rounded-full bg-white text-black font-black text-lg hover:scale-105 transition-transform duration-300 relative z-10 flex items-center justify-center gap-3 mx-auto">
            Comenzar 7 días gratis <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t border-white/10 pt-16 pb-8 px-6 md:px-12 lg:px-24">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-[#A78BFA]" />
            <span className="text-xl font-black">Sloty.</span>
          </div>
          <p className="text-white/40 font-semibold text-sm">
            © {new Date().getFullYear()} Sloty AI. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}

// ── COMPONENTES REUTILIZABLES ──

function FeatureCard({ icon, title, desc, color }: { icon: React.ReactNode, title: string, desc: string, color: string }) {
  return (
    <div className="group bg-white/5 border border-white/5 hover:border-white/10 rounded-3xl p-8 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1">
      <div 
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
      >
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-white/50 font-semibold leading-relaxed text-sm">{desc}</p>
    </div>
  )
}

function PricingCard({ name, emoji, price, color, features, isPopular = false }: { name: string, emoji: string, price: string, color: string, features: string[], isPopular?: boolean }) {
  return (
    <div className={`relative bg-white/5 border rounded-[2rem] p-8 md:p-10 backdrop-blur-md transition-all duration-300 ${isPopular ? 'border-[#4F46E5]/60 shadow-[0_10px_40px_rgba(79,70,229,0.2)] scale-100 md:scale-105 z-10' : 'border-white/10'}`}>
      
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] px-4 py-1 rounded-full text-[10px] font-black tracking-widest text-white shadow-lg">
          ⭐ MÁS POPULAR
        </div>
      )}

      <div className="flex items-center gap-4 mb-8">
        <span className="text-4xl">{emoji}</span>
        <h3 className="text-2xl font-black text-white">{name}</h3>
      </div>

      <div className="flex items-end gap-1 mb-8">
        <span className="text-xl font-black" style={{ color }}>$</span>
        <span className="text-5xl font-black tracking-tight text-white leading-none">{price}</span>
        <span className="text-white/40 font-bold mb-1">/mes</span>
      </div>

      <div className="h-px w-full bg-white/10 mb-8" />

      <ul className="space-y-4 mb-10">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 size={18} style={{ color }} className="mt-0.5 shrink-0" />
            <span className="text-white/70 font-semibold text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      <button 
        className="w-full py-4 rounded-2xl font-black text-sm transition-transform hover:scale-105"
        style={{ 
          backgroundColor: isPopular ? color : 'rgba(255,255,255,0.05)', 
          color: 'white',
          border: isPopular ? 'none' : '1px solid rgba(255,255,255,0.1)'
        }}
      >
        {isPopular ? 'Comenzar con Pro' : `Elegir ${name}`}
      </button>
    </div>
  )
}