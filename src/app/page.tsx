"use client";
import { useState, useEffect } from "react";

// --- CONSTANTES Y TIPOS ---
const PAISES = [
    { code: "+57", flag: "🇨🇴", name: "Colombia" },
    { code: "+52", flag: "🇲🇽", name: "México" },
    { code: "+54", flag: "🇦🇷", name: "Argentina" },
    { code: "+56", flag: "🇨🇱", name: "Chile" },
    { code: "+51", flag: "🇵🇪", name: "Perú" },
    { code: "+593", flag: "🇪🇨", name: "Ecuador" },
    { code: "+507", flag: "🇵🇦", name: "Panamá" },
    { code: "+58", flag: "🇻🇪", name: "Venezuela" },
    { code: "+1", flag: "🇺🇸", name: "USA" },
    { code: "+34", flag: "🇪🇸", name: "España" },
];

type Producto = { 
  nombre: string; descripcion: string; precio: string; 
  frecuencia: string; 
  tienePromo: boolean; detallePromo: string;
  variantes: string; duracion: string; detallesIA: string; 
  disponibilidad: string; 
};
type Categoria = { nombre: string; items: Producto[] };
type Campana = { palabraClave: string; contexto: string; vigencia: string };
type Promocion = { nombre: string; servicioAsociado: string; detalle: string; precioEspecial: string; vigencia: string };
type Faq = { pregunta: string; respuesta: string };

const initialState = {
  // 1. Identidad
  nombre: "", sector: "", tipo: "Servicios", descripcion: "",
  telefonoTwilio: "", 
  
  // Contactos (Separados con indicativo)
  adminIndicativo: "+57", adminNumero: "",
  atencionIndicativo: "+57", atencionNumero: "", 
  redes: { instagram: "", tiktok: "", facebook: "", web: "" },
  
  // 2. Horarios
  horarios: {
    Lunes: { abierto: true, inicio: "08:00", fin: "18:00" },
    Martes: { abierto: true, inicio: "08:00", fin: "18:00" },
    Miércoles: { abierto: true, inicio: "08:00", fin: "18:00" },
    Jueves: { abierto: true, inicio: "08:00", fin: "18:00" },
    Viernes: { abierto: true, inicio: "08:00", fin: "18:00" },
    Sábado: { abierto: true, inicio: "09:00", fin: "13:00" },
    Domingo: { abierto: false, inicio: "00:00", fin: "00:00" },
  },
  aceptaReservas: false, metodoReserva: "WhatsApp", reglasReserva: "",

  // 3. Catálogo
  catalogo: [] as Categoria[],

  // 4. IA & Reglas
  personalidadIA: "Amigable",
  instruccionesAdicionales: "",
  mensajeBienvenida: "", 
  temasProhibidos: "",
  manejoClientesDificiles: "",

  // 5. Estrategia
  campanas: [] as Campana[],
  promociones: [] as Promocion[],

  // 6. Legal & Soporte
  terminosCondiciones: "", mediosPago: [] as string[], instruccionesPago: "", 
  faqs: [] as Faq[]
};

export default function ProfessionalDashboard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(initialState);
  const [loading, setLoading] = useState(false);
  
  // ESTADOS DE CARGA DE NÚMEROS Y BÚSQUEDA
  const [numeros, setNumeros] = useState<any[]>([]);
  const [loadingNumeros, setLoadingNumeros] = useState(true);
  
  // --- NUEVO: ESTADOS PARA BUSCAR Y EDITAR ---
  const [telefonoBusqueda, setTelefonoBusqueda] = useState("");
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);

  useEffect(() => {
    setLoadingNumeros(true);
    fetch('/api/admin/numeros', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
          setNumeros(Array.isArray(d) ? d : []); // Quitamos el filtro para que aparezcan todos
          setLoadingNumeros(false);
      })
      .catch(e => {
          console.error(e);
          setLoadingNumeros(false);
      });
  }, []);

  // --- FUNCIÓN PARA CARGAR DATOS EXISTENTES ---
  const cargarDatos = async () => {
    if (!telefonoBusqueda) return alert("Escribe el número del bot para buscar (ej: +57300...)");
    setLoadingBusqueda(true);
    
    try {
        const res = await fetch(`/api/empresa?telefono=${encodeURIComponent(telefonoBusqueda)}`);
        
        if (!res.ok) {
            alert("❌ No encontré datos con ese número. Asegúrate de escribirlo igual (con o sin +).");
            setLoadingBusqueda(false);
            return;
        }

        const datosRecibidos = await res.json();
        
        // RECONSTRUIR EL ESTADO CON LOS DATOS RECIBIDOS
        let adminInd = "+57";
        let adminNum = "";
        
        if (datosRecibidos.telefonoAdmin) {
            const match = PAISES.find(p => datosRecibidos.telefonoAdmin.includes(p.code));
            if (match) {
                adminInd = match.code;
                adminNum = datosRecibidos.telefonoAdmin.replace('whatsapp:', '').replace(match.code, '');
            } else {
                adminNum = datosRecibidos.telefonoAdmin.replace('whatsapp:', '');
            }
        }

        setData(prev => ({
            ...prev,
            ...datosRecibidos,
            adminIndicativo: adminInd,
            adminNumero: adminNum,
            // Asegurar que objetos anidados no se rompan
            redes: { ...prev.redes, ...(datosRecibidos.redes || {}) },
            horarios: { ...prev.horarios, ...(datosRecibidos.horarios || {}) },
            catalogo: datosRecibidos.catalogo || [],
            campanas: datosRecibidos.campanas || [],
            promociones: datosRecibidos.promociones || [],
            faqs: datosRecibidos.faqs || [],
            mediosPago: datosRecibidos.mediosPago || []
        }));
        
        alert("✅ Datos cargados. Puedes editar y volver a guardar.");
    } catch (e) {
        console.error(e);
        alert("Error al cargar.");
    }
    setLoadingBusqueda(false);
  };

  // --- HANDLERS ---
  const handleChange = (f: string, v: any) => setData({ ...data, [f]: v });
  const handleNested = (parent: string, key: string, val: any) => setData({ ...data, [parent]: { ...(data as any)[parent], [key]: val } });

  // Helpers Arrays
  const addCat = () => setData({...data, catalogo: [...data.catalogo, { nombre: "Nueva Categoría", items: [] }]});
  const addProd = (cIdx: number) => {
      const newCat = [...data.catalogo];
      newCat[cIdx].items.push({
          nombre: "", descripcion: "", precio: "", frecuencia: "Pago Único", 
          tienePromo: false, detallePromo: "", variantes: "", duracion: "",
          detallesIA: "", disponibilidad: "Siempre"
      });
      setData({...data, catalogo: newCat});
  };
  const updateProd = (cI: number, pI: number, f: string, v: any) => {
      const newCat = [...data.catalogo]; (newCat[cI].items[pI] as any)[f] = v;
      setData({...data, catalogo: newCat});
  };

  // --- LÓGICA DE CAMPAÑAS MEJORADA ---
  const addCampana = () => setData({...data, campanas: [...data.campanas, { palabraClave: "", contexto: "", vigencia: "Válido por tiempo limitado" }]});
  
  // Función para borrar campaña (esto "mata" el cupón al guardar)
  const removeCampana = (index: number) => {
      const nuevasCampanas = data.campanas.filter((_, i) => i !== index);
      setData({ ...data, campanas: nuevasCampanas });
  };

  // Función para marcar como vencida (sin borrar)
  const expirarCampana = (index: number) => {
      const nuevasCampanas = [...data.campanas];
      nuevasCampanas[index].vigencia = "EXPIRADO - YA NO VÁLIDO";
      nuevasCampanas[index].contexto = "Esta promoción ha finalizado.";
      setData({ ...data, campanas: nuevasCampanas });
  };

  const updateCampana = (i: number, f: string, v: string) => { const c = [...data.campanas]; (c[i] as any)[f] = v; setData({...data, campanas: c}); };

  const addPromocion = () => setData({...data, promociones: [...data.promociones, { nombre: "", servicioAsociado: "", detalle: "", precioEspecial: "", vigencia: "" }]});
  const updatePromocion = (i: number, f: string, v: string) => { const c = [...data.promociones]; (c[i] as any)[f] = v; setData({...data, promociones: c}); };

  const addFaq = () => setData({...data, faqs: [...data.faqs, { pregunta: "", respuesta: "" }]});
  const updateFaq = (i: number, f: string, v: string) => { const c = [...data.faqs]; (c[i] as any)[f] = v; setData({...data, faqs: c}); };

  const getProductList = () => {
      let list: string[] = [];
      data.catalogo.forEach(c => c.items.forEach(i => { if(i.nombre) list.push(i.nombre) }));
      return list;
  };

  // ENVÍO
  const handleSubmit = async () => {
    setLoading(true);
    if (!data.telefonoTwilio) { setLoading(false); return alert("⚠️ Falta seleccionar el número del bot."); }
    if (!data.adminNumero) { setLoading(false); return alert("⚠️ Falta el número del dueño."); }

    const payload = {
        ...data,
        telefonoAdmin: `whatsapp:${data.adminIndicativo}${data.adminNumero}`,
        telefonoAtencion: data.atencionNumero ? `whatsapp:${data.atencionIndicativo}${data.atencionNumero}` : ""
    };

    const res = await fetch("/api/empresa", { 
        method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } 
    });

    if (res.ok) {
        alert("✅ ¡CEREBRO ACTUALIZADO Y GUARDADO!");
    } else {
        alert("❌ Error al guardar.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-900 to-blue-900 p-6 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 className="text-2xl font-bold">Configuración Maestra IA</h1>
                <p className="text-indigo-200 text-xs">Sistema Profesional Completo</p>
            </div>
            
            {/* --- BARRA DE BÚSQUEDA INTEGRADA --- */}
            <div className="flex gap-2 bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/20">
                <input 
                    className="bg-transparent text-white placeholder-indigo-200 outline-none px-2 w-40 text-sm font-mono"
                    placeholder="Buscar Teléfono..."
                    value={telefonoBusqueda}
                    onChange={e => setTelefonoBusqueda(e.target.value)}
                />
                <button 
                    onClick={cargarDatos}
                    disabled={loadingBusqueda}
                    className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1 rounded transition-colors"
                >
                    {loadingBusqueda ? "..." : "CARGAR DATOS"}
                </button>
            </div>

            <div className="flex gap-2">
                {[1,2,3,4,5,6].map(n => (
                    <button key={n} onClick={() => setStep(n)} 
                        className={`w-8 h-8 rounded-full font-bold text-sm transition-all ${step===n ? 'bg-green-400 text-indigo-900 scale-110' : 'bg-indigo-800 text-indigo-400'}`}>
                        {n}
                    </button>
                ))}
            </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-8 p-4">
        
        {/* PASO 1: IDENTIDAD Y NÚMEROS */}
        {step === 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-8 animate-fadeIn">
                <section>
                    <h2 className="text-xl font-bold text-indigo-900 mb-4">1. Línea de WhatsApp (Bot)</h2>
                    
                    {loadingNumeros ? (
                        <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-indigo-600 font-bold animate-pulse">
                            ⏳ Cargando líneas disponibles...
                        </div>
                    ) : numeros.length === 0 ? (
                        <div className="p-4 bg-red-50 text-red-600 rounded border border-red-200 text-center">
                            No hay números disponibles en inventario.
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-3 gap-4">
                            {numeros.map(n => (
                                <div key={n.id} onClick={() => handleChange('telefonoTwilio', n.id)}
                                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${data.telefonoTwilio === n.id ? 'border-green-500 bg-green-50' : (n.asignado ? 'border-orange-200 bg-orange-50 opacity-60' : 'border-slate-100 hover:border-indigo-200')}`}>
                                    <div className="text-3xl">🤖</div>
                                    <div>
                                        <p className="font-bold">{n.numero}</p>
                                        <p className="text-xs uppercase text-gray-400">{n.pais} {n.asignado ? '(Ocupado)' : ''}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="grid md:grid-cols-2 gap-6">
                    <div><label className="label">Nombre Empresa</label><input className="input" value={data.nombre} onChange={e=>handleChange('nombre',e.target.value)} /></div>
                    <div><label className="label">Industria</label><input className="input" value={data.sector} onChange={e=>handleChange('sector',e.target.value)} /></div>
                    <div className="col-span-2"><label className="label">Descripción</label><textarea className="input" rows={2} value={data.descripcion} onChange={e=>handleChange('descripcion',e.target.value)} /></div>
                    
                    <div className="col-span-2 grid md:grid-cols-4 gap-2 bg-slate-50 p-4 rounded border">
                        <input className="input text-xs" placeholder="Instagram" value={data.redes.instagram} onChange={e=>handleNested('redes','instagram',e.target.value)} />
                        <input className="input text-xs" placeholder="TikTok" value={data.redes.tiktok} onChange={e=>handleNested('redes','tiktok',e.target.value)} />
                        <input className="input text-xs" placeholder="Facebook" value={data.redes.facebook} onChange={e=>handleNested('redes','facebook',e.target.value)} />
                        <input className="input text-xs" placeholder="Web" value={data.redes.web} onChange={e=>handleNested('redes','web',e.target.value)} />
                    </div>
                </section>

                <section className="grid md:grid-cols-2 gap-6 bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <div>
                        <h3 className="font-bold text-indigo-900 mb-2">📞 Tu Contacto (Dueño)</h3>
                        <div className="flex gap-2 items-center">
                            <select 
                                className="h-10 px-2 rounded-md border border-slate-300 bg-white text-sm font-bold w-24 flex-none focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={data.adminIndicativo} 
                                onChange={e=>handleChange('adminIndicativo',e.target.value)}
                            >
                                {PAISES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}
                            </select>
                            <input 
                                className="input flex-1" 
                                type="number" 
                                placeholder="300 123 4567" 
                                value={data.adminNumero} 
                                onChange={e=>handleChange('adminNumero',e.target.value)} 
                            />
                        </div>
                        <p className="text-[10px] text-indigo-400 mt-1">Recibe alertas aquí.</p>
                    </div>
                    
                    <div>
                        <h3 className="font-bold text-indigo-900 mb-2">🎧 Atención al Cliente (Humano)</h3>
                        <div className="flex gap-2 items-center">
                             <select 
                                className="h-10 px-2 rounded-md border border-slate-300 bg-white text-sm font-bold w-24 flex-none focus:ring-2 focus:ring-indigo-500 outline-none"
                                value={data.atencionIndicativo} 
                                onChange={e=>handleChange('atencionIndicativo',e.target.value)}
                            >
                                {PAISES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}
                            </select>
                            <input 
                                className="input flex-1" 
                                type="number" 
                                placeholder="Opcional" 
                                value={data.atencionNumero} 
                                onChange={e=>handleChange('atencionNumero',e.target.value)} 
                            />
                        </div>
                    </div>
                </section>
            </div>
        )}

        {/* PASO 2: HORARIOS */}
        {step === 2 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900">🕒 Horarios y Reservas</h2>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        {Object.entries(data.horarios).map(([dia, val]) => (
                            <div key={dia} className="flex items-center gap-2 text-sm border-b pb-2">
                                <span className="w-24 font-bold">{dia}</span>
                                <input type="checkbox" checked={val.abierto} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, abierto: e.target.checked}}})} />
                                {val.abierto ? <><input type="time" className="border rounded px-1" value={val.inicio} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, inicio: e.target.value}}})} /> - <input type="time" className="border rounded px-1" value={val.fin} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, fin: e.target.value}}})} /></> : <span className="text-gray-400">CERRADO</span>}
                            </div>
                        ))}
                    </div>
                    <div className="bg-yellow-50 p-4 rounded border border-yellow-200 h-fit">
                        <label className="font-bold flex items-center gap-2 mb-2">
                            <input type="checkbox" checked={data.aceptaReservas} onChange={e=>handleChange('aceptaReservas',e.target.checked)} />
                            ¿Acepta Reservas?
                        </label>
                        {data.aceptaReservas && (
                            <div className="space-y-2">
                                <input className="input bg-white" placeholder="Método (WhatsApp/Web)" value={data.metodoReserva} onChange={e=>handleChange('metodoReserva',e.target.value)} />
                                <textarea className="input bg-white" rows={3} placeholder="Reglas (Cancelaciones, anticipos...)" value={data.reglasReserva} onChange={e=>handleChange('reglasReserva',e.target.value)} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* PASO 3: CATÁLOGO */}
        {step === 3 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center border-b pb-4">
                    <h2 className="text-xl font-bold text-indigo-900">📦 Productos y Servicios</h2>
                    <button onClick={addCat} className="btn-primary text-sm">+ Categoría</button>
                </div>
                {data.catalogo.map((cat, cI) => (
                    <div key={cI} className="border rounded-xl p-4 mb-4 bg-slate-50">
                        <input className="text-lg font-bold bg-transparent w-full mb-4 border-b border-slate-300 outline-none" placeholder="Nombre Categoría" value={cat.nombre} onChange={e=> {const c=[...data.catalogo]; c[cI].nombre=e.target.value; setData({...data, catalogo: c})}} />
                        {cat.items.map((prod, pI) => (
                            <div key={pI} className="bg-white p-4 rounded shadow-sm mb-4 border border-slate-200">
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <input className="input font-bold" placeholder="Nombre Producto" value={prod.nombre} onChange={e=>updateProd(cI, pI, 'nombre', e.target.value)} />
                                        
                                        <div className="flex gap-2">
                                            <input className="input w-1/2" placeholder="Precio" value={prod.precio} onChange={e=>updateProd(cI, pI, 'precio', e.target.value)} />
                                            <select className="input w-1/2 text-sm" value={prod.frecuencia} onChange={e=>updateProd(cI, pI, 'frecuencia', e.target.value)}>
                                                <option>Pago Único</option>
                                                <option>Mensual</option>
                                                <option>Anual</option>
                                                <option>Semanal</option>
                                                <option>Diario</option>
                                                <option>Por Hora</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <textarea className="input text-sm" rows={2} placeholder="Descripción Cliente" value={prod.descripcion} onChange={e=>updateProd(cI, pI, 'descripcion', e.target.value)} />
                                        <input className="input text-sm" placeholder="Variantes (Tallas/Colores)" value={prod.variantes} onChange={e=>updateProd(cI, pI, 'variantes', e.target.value)} />
                                        <input className="input text-sm" placeholder="Duración (Ej: 1h)" value={prod.duracion} onChange={e=>updateProd(cI, pI, 'duracion', e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <textarea className="input bg-yellow-50 text-xs border-yellow-200" rows={3} placeholder="🧠 DETALLES INTERNOS PARA IA (Ingredientes, cómo se hace, tips técnicos...)" value={prod.detallesIA} onChange={e=>updateProd(cI, pI, 'detallesIA', e.target.value)} />
                                        
                                        <div className="flex items-center gap-2 border p-1 rounded bg-slate-50">
                                            <input type="checkbox" checked={prod.tienePromo} onChange={e=>updateProd(cI, pI, 'tienePromo', e.target.checked)} /> 
                                            <span className="text-xs font-bold text-slate-600">¿Promo Activa?</span>
                                        </div>
                                        {prod.tienePromo && <input className="input text-xs border-green-300" placeholder="Detalle Promo (Ej: 2x1)" value={prod.detallePromo} onChange={e=>updateProd(cI, pI, 'detallePromo', e.target.value)} />}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={()=>addProd(cI)} className="w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded font-bold hover:bg-slate-200">+ Producto</button>
                    </div>
                ))}
            </div>
        )}

        {/* PASO 4: CEREBRO IA */}
        {step === 4 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900 border-b pb-2">🧠 Personalidad y Reglas</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <div>
                        <label className="label">Modo Personalidad</label>
                        <select className="input" value={data.personalidadIA} onChange={e=>handleChange('personalidadIA', e.target.value)}>
                            <option value="Vender">🤑 Vendedor (Cierre Rápido)</option>
                            <option value="Amigable">😊 Amigable (Emojis)</option>
                            <option value="Serio">👔 Serio (Corporativo)</option>
                        </select>
                    </div>
                    <div>
                        <label className="label">Mensaje Bienvenida</label>
                        <input className="input" value={data.mensajeBienvenida} onChange={e=>handleChange('mensajeBienvenida', e.target.value)} />
                    </div>

                    <div className="col-span-2">
                        <label className="label text-indigo-600">🧠 Instrucciones Adicionales para la IA</label>
                        <textarea 
                            className="input bg-indigo-50 border-indigo-200" 
                            rows={3} 
                            placeholder="Ej: Trata a todos de 'estimado', nunca uses jergas, si preguntan por el dueño di que está en reunión..." 
                            value={data.instruccionesAdicionales} 
                            onChange={e=>handleChange('instruccionesAdicionales', e.target.value)} 
                        />
                    </div>

                    <div className="col-span-2 grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="label text-red-600">🚫 Temas Prohibidos</label>
                            <textarea className="input bg-red-50 border-red-100" rows={3} placeholder="Política, religión, competencia..." value={data.temasProhibidos} onChange={e=>handleChange('temasProhibidos', e.target.value)} />
                        </div>
                        <div>
                            <label className="label text-orange-600">🛡️ Manejo Clientes Difíciles</label>
                            <textarea className="input bg-orange-50 border-orange-100" rows={3} placeholder="Cómo responder a insultos..." value={data.manejoClientesDificiles} onChange={e=>handleChange('manejoClientesDificiles', e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* PASO 5: ESTRATEGIA (MARKETING + PROMOS) MEJORADA */}
        {step === 5 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-8 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900 border-b pb-2">📈 Marketing y Ofertas</h2>
                
                <div>
                    <div className="flex justify-between mb-2">
                        <h3 className="font-bold">📢 Campañas de Marketing</h3>
                        <button onClick={addCampana} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">+ Campaña</button>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">Define palabras clave. Ej: Si dicen "BlackFriday", la IA sabe el contexto.</p>
                    {data.campanas.map((c, i) => (
                        <div key={i} className="grid md:grid-cols-4 gap-2 mb-2 bg-slate-50 p-2 rounded border items-center">
                            <input className="input text-sm" placeholder="Palabra Clave (Ej: Verano2026)" value={c.palabraClave} onChange={e=>updateCampana(i,'palabraClave',e.target.value)} />
                            <input className="input text-sm" placeholder="Contexto (Ej: Descuentos de temporada)" value={c.contexto} onChange={e=>updateCampana(i,'contexto',e.target.value)} />
                            <input className="input text-sm" placeholder="Vigencia (Ej: Válido hasta el 30/12)" value={c.vigencia} onChange={e=>updateCampana(i,'vigencia',e.target.value)} />
                            
                            {/* BOTONES DE GESTIÓN (NUEVO) */}
                            <div className="flex gap-1">
                                <button 
                                    onClick={() => expirarCampana(i)} 
                                    className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded hover:bg-orange-200"
                                    title="Marcar como expirado"
                                >
                                    ⛔ Expirar
                                </button>
                                <button 
                                    onClick={() => removeCampana(i)} 
                                    className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200"
                                    title="Eliminar campaña"
                                >
                                    🗑️ Borrar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-green-50 p-4 rounded border border-green-200">
                    <div className="flex justify-between mb-2">
                        <h3 className="font-bold text-green-800">🔥 Promociones Específicas</h3>
                        <button onClick={addPromocion} className="text-xs bg-white text-green-700 px-2 py-1 rounded border border-green-300">+ Promo</button>
                    </div>
                    {data.promociones.map((p, i) => (
                        <div key={i} className="grid md:grid-cols-5 gap-2 mb-2">
                            <input className="input text-sm" placeholder="Nombre (Ej: 2x1)" value={p.nombre} onChange={e=>updatePromocion(i,'nombre',e.target.value)} />
                            <select className="input text-sm" value={p.servicioAsociado} onChange={e=>updatePromocion(i,'servicioAsociado',e.target.value)}>
                                <option value="">- Producto -</option>
                                {getProductList().map(pn => <option key={pn} value={pn}>{pn}</option>)}
                            </select>
                            <input className="input text-sm" placeholder="Condición/Detalle" value={p.detalle} onChange={e=>updatePromocion(i,'detalle',e.target.value)} />
                            <input className="input text-sm" placeholder="Precio Promo" value={p.precioEspecial} onChange={e=>updatePromocion(i,'precioEspecial',e.target.value)} />
                            <input className="input text-sm" placeholder="Vigencia" value={p.vigencia} onChange={e=>updatePromocion(i,'vigencia',e.target.value)} />
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* PASO 6: LEGAL Y SOPORTE */}
        {step === 6 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900 border-b pb-2">⚖️ Legal y Ayuda</h2>
                
                <div className="grid md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-bold mb-2">📜 Términos</h3>
                        <textarea className="input text-sm" rows={5} placeholder="Políticas de uso..." value={data.terminosCondiciones} onChange={e=>handleChange('terminosCondiciones',e.target.value)} />
                    </div>
                    <div>
                        <h3 className="font-bold mb-2">💳 Pagos</h3>
                        <div className="flex gap-2 mb-2"><input id="newP" className="input" placeholder="Método" /><button onClick={()=>{const v=(document.getElementById('newP') as HTMLInputElement).value; if(v) setData({...data, mediosPago: [...data.mediosPago, v]})}} className="btn-primary">+</button></div>
                        <div className="flex flex-wrap gap-2 mb-2">{data.mediosPago.map(p=><span key={p} className="bg-slate-200 px-2 rounded text-xs">{p}</span>)}</div>
                        <textarea className="input text-sm" rows={2} placeholder="Instrucciones..." value={data.instruccionesPago} onChange={e=>handleChange('instruccionesPago',e.target.value)} />
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded border">
                    <div className="flex justify-between mb-2">
                        <h3 className="font-bold">❓ Preguntas Frecuentes (FAQs)</h3>
                        <button onClick={addFaq} className="text-xs text-indigo-600 font-bold">+ Agregar Pregunta</button>
                    </div>
                    {data.faqs.map((f, i) => (
                        <div key={i} className="flex gap-2 mb-2">
                            <input className="input text-sm w-1/3" placeholder="Pregunta" value={f.pregunta} onChange={e=>updateFaq(i,'pregunta',e.target.value)} />
                            <input className="input text-sm w-2/3" placeholder="Respuesta" value={f.respuesta} onChange={e=>updateFaq(i,'respuesta',e.target.value)} />
                        </div>
                    ))}
                </div>

                <div className="pt-6 border-t text-center">
                    <button onClick={handleSubmit} disabled={loading} className="px-10 py-4 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 text-xl">
                        {loading ? "Guardando..." : "ACTIVAR BOT AHORA"}
                    </button>
                </div>
            </div>
        )}

      </div>
      <style jsx>{`
        .label { font-weight: 700; font-size: 0.85rem; color: #1e293b; margin-bottom: 0.25rem; display: block; }
        .label-xs { font-weight: 700; font-size: 0.7rem; color: #64748b; text-transform: uppercase; display: block; }
        .input { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; outline: none; transition: all 0.2s; }
        .input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
        .btn-primary { background: #4f46e5; color: white; padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-weight: bold; }
      `}</style>
    </div>
  );
}