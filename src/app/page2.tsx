"use client";
import { useState, useEffect } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "@/lib/firebase"; 

const PAISES = [
    { code: "+57", flag: "🇨🇴", name: "Colombia" }, { code: "+52", flag: "🇲🇽", name: "México" },
    { code: "+54", flag: "🇦🇷", name: "Argentina" }, { code: "+56", flag: "🇨🇱", name: "Chile" },
    { code: "+51", flag: "🇵🇪", name: "Perú" }, { code: "+593", flag: "🇪🇨", name: "Ecuador" },
    { code: "+507", flag: "🇵🇦", name: "Panamá" }, { code: "+58", flag: "🇻🇪", name: "Venezuela" },
    { code: "+1", flag: "🇺🇸", name: "USA" }, { code: "+34", flag: "🇪🇸", name: "España" },
];

type OpcionVariante = { nombre: string; imagenUrl?: string; };
type GrupoVariante = { nombre: string; opciones: OpcionVariante[]; };
type Producto = { 
  nombre: string; descripcion: string; precio: string; tipoPrecio: "fijo" | "cotizar"; 
  frecuencia: string; tienePromo: boolean; detallePromo: string; variantes: GrupoVariante[]; 
  duracion: string; detallesIA: string; disponibilidad: string; requiereReserva: boolean; imagenPrincipal?: string;
};
type Categoria = { nombre: string; items: Producto[] };
type Campana = { palabraClave: string; contexto: string; vigencia: string };
type Promocion = { nombre: string; servicioAsociado: string; detalle: string; precioEspecial: string; vigencia: string };
type Faq = { pregunta: string; respuesta: string };

const initialState = {
  nombre: "", sector: "", tipo: "Servicios", descripcion: "", telefonoTwilio: "", 
  adminIndicativo: "+57", adminNumero: "", atencionIndicativo: "+57", atencionNumero: "", 
  redes: { instagram: "", tiktok: "", facebook: "", web: "" },
  horarios: {
    Lunes: { abierto: true, inicio: "08:00", fin: "18:00" }, Martes: { abierto: true, inicio: "08:00", fin: "18:00" },
    Miércoles: { abierto: true, inicio: "08:00", fin: "18:00" }, Jueves: { abierto: true, inicio: "08:00", fin: "18:00" },
    Viernes: { abierto: true, inicio: "08:00", fin: "18:00" }, Sábado: { abierto: true, inicio: "09:00", fin: "13:00" },
    Domingo: { abierto: false, inicio: "00:00", fin: "00:00" },
  },
  aceptaReservas: false, metodoReserva: "WhatsApp", reglasReserva: "",
  catalogo: [] as Categoria[],
  personalidadIA: "Amigable", instruccionesAdicionales: "", mensajeBienvenida: "", 
  temasProhibidos: "", manejoClientesDificiles: "",
  campanas: [] as Campana[], promociones: [] as Promocion[],
  terminosCondiciones: "", mediosPago: [] as string[], instruccionesPago: "", faqs: [] as Faq[]
};

// Comprimir imagen: max 1200px ancho, JPEG calidad 0.8
function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("No canvas")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        blob ? resolve(blob) : reject(new Error("Blob error"));
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Img error")); };
    img.src = url;
  });
}

export default function ProfessionalDashboard() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [numeros, setNumeros] = useState<any[]>([]);
  const [loadingNumeros, setLoadingNumeros] = useState(true);
  const [telefonoBusqueda, setTelefonoBusqueda] = useState("");
  const [loadingBusqueda, setLoadingBusqueda] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setLoadingNumeros(true);
    fetch('/api/admin/numeros', { cache: 'no-store' }).then(r => r.json()).then(d => { setNumeros(Array.isArray(d) ? d : []); setLoadingNumeros(false); }).catch(e => { console.error(e); setLoadingNumeros(false); });
  }, []);

  const cargarDatos = async () => {
    if (!telefonoBusqueda) return alert("Escribe el número del bot.");
    setLoadingBusqueda(true);
    try {
        const res = await fetch(`/api/empresa?telefono=${encodeURIComponent(telefonoBusqueda)}`);
        if (!res.ok) { alert("❌ No encontré datos."); setLoadingBusqueda(false); return; }
        const datosRecibidos = await res.json();
        let adminInd = "+57"; let adminNum = "";
        if (datosRecibidos.telefonoAdmin) {
            const match = PAISES.find(p => datosRecibidos.telefonoAdmin.includes(p.code));
            if (match) { adminInd = match.code; adminNum = datosRecibidos.telefonoAdmin.replace('whatsapp:', '').replace(match.code, ''); } 
            else { adminNum = datosRecibidos.telefonoAdmin.replace('whatsapp:', ''); }
        }
        const catalogoFormateado = (datosRecibidos.catalogo || []).map((cat:any) => ({
            ...cat, items: cat.items.map((prod:any) => {
                let variantesRecuperadas: GrupoVariante[] = [];
                if (Array.isArray(prod.variantes) && typeof prod.variantes[0] === 'object') {
                    variantesRecuperadas = prod.variantes.map((g: any) => ({ nombre: g.nombre, opciones: Array.isArray(g.opciones) ? g.opciones.map((op: any) => typeof op === 'string' ? { nombre: op, imagenUrl: "" } : op) : [] }));
                } 
                return { ...prod, variantes: variantesRecuperadas, tipoPrecio: prod.precio === "A cotizar" ? "cotizar" : "fijo", requiereReserva: prod.requiereReserva === true, imagenPrincipal: prod.imagenPrincipal || "" };
            })
        }));
        setData(prev => ({ ...prev, ...datosRecibidos, adminIndicativo: adminInd, adminNumero: adminNum, redes: { ...prev.redes, ...(datosRecibidos.redes || {}) }, horarios: { ...prev.horarios, ...(datosRecibidos.horarios || {}) }, catalogo: catalogoFormateado, campanas: datosRecibidos.campanas || [], promociones: datosRecibidos.promociones || [], faqs: datosRecibidos.faqs || [], mediosPago: datosRecibidos.mediosPago || [] }));
        alert("✅ Datos cargados.");
    } catch (e) { console.error(e); alert("Error al cargar."); }
    setLoadingBusqueda(false);
  };

  const handleChange = (f: string, v: any) => setData({ ...data, [f]: v });
  const handleNested = (parent: string, key: string, val: any) => setData({ ...data, [parent]: { ...(data as any)[parent], [key]: val } });

  const uploadToFirebase = async (file: File, botPhone: string): Promise<string> => {
      const storage = getStorage(app); 
      const folderId = botPhone.replace(/[^0-9]/g, ''); 
      
      // Comprimir antes de subir
      console.log(`Comprimiendo ${file.name} (${(file.size/1024/1024).toFixed(2)}MB)...`);
      const compressedBlob = await compressImage(file);
      console.log(`Comprimida: ${(compressedBlob.size/1024/1024).toFixed(2)}MB`);
      
      const nombreLimpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^/.]+$/, "");
      const nombreFinal = `${Date.now()}_${nombreLimpio}.jpg`;
      const storageRef = ref(storage, `${folderId}/productos/${nombreFinal}`);
      const metadata = { contentType: 'image/jpeg' }; 
      
      await uploadBytes(storageRef, compressedBlob, metadata);
      const url = await getDownloadURL(storageRef);
      console.log(`Subida OK: ${(compressedBlob.size/1024/1024).toFixed(2)}MB -> ${url.substring(0, 60)}...`);
      return url;
  };

  const handleImageUpload = async (cI: number, pI: number, file: File) => {
      if(!file) return;
      if(!data.telefonoTwilio) return alert("Primero selecciona el Número del Bot (Paso 1).");
      setUploading(true);
      try { const url = await uploadToFirebase(file, data.telefonoTwilio); updateProd(cI, pI, 'imagenPrincipal', url); } 
      catch (err) { alert("Error subiendo imagen."); console.error(err); }
      setUploading(false);
  };

  const handleVariantImageUpload = async (cI: number, pI: number, gI: number, oI: number, file: File) => {
      if(!file) return;
      if(!data.telefonoTwilio) return alert("Primero selecciona el Número del Bot (Paso 1).");
      setUploading(true);
      try { const url = await uploadToFirebase(file, data.telefonoTwilio); const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes[gI].opciones[oI].imagenUrl = url; setData({...data, catalogo: newCat}); } 
      catch (err) { alert("Error imagen variante."); }
      setUploading(false);
  };

  const addCat = () => setData({...data, catalogo: [...data.catalogo, { nombre: "Nueva Categoría", items: [] }]});
  const addProd = (cIdx: number) => { const newCat = [...data.catalogo]; newCat[cIdx].items.push({ nombre: "", descripcion: "", precio: "", tipoPrecio: "fijo", frecuencia: "Pago Único", tienePromo: false, detallePromo: "", variantes: [], duracion: "", detallesIA: "", disponibilidad: "Siempre", requiereReserva: false, imagenPrincipal: "" }); setData({...data, catalogo: newCat}); };
  const updateProd = (cI: number, pI: number, f: string, v: any) => { const newCat = [...data.catalogo]; (newCat[cI].items[pI] as any)[f] = v; setData({...data, catalogo: newCat}); };
  const addGrupoVariante = (cI: number, pI: number) => { const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes.push({ nombre: "", opciones: [] }); setData({...data, catalogo: newCat}); };
  const updateNombreGrupo = (cI: number, pI: number, gI: number, val: string) => { const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes[gI].nombre = val; setData({...data, catalogo: newCat}); };
  const addOpcionToGrupo = (cI: number, pI: number, gI: number, val: string) => { if(!val.trim()) return; const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes[gI].opciones.push({ nombre: val.trim(), imagenUrl: "" }); setData({...data, catalogo: newCat}); };
  const removeOpcionFromGrupo = (cI: number, pI: number, gI: number, oI: number) => { const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes[gI].opciones = newCat[cI].items[pI].variantes[gI].opciones.filter((_, i) => i !== oI); setData({...data, catalogo: newCat}); };
  const removeGrupo = (cI: number, pI: number, gI: number) => { const newCat = [...data.catalogo]; newCat[cI].items[pI].variantes = newCat[cI].items[pI].variantes.filter((_, i) => i !== gI); setData({...data, catalogo: newCat}); };
  const addCampana = () => setData({...data, campanas: [...data.campanas, { palabraClave: "", contexto: "", vigencia: "Válido por tiempo limitado" }]});
  const removeCampana = (index: number) => { setData({ ...data, campanas: data.campanas.filter((_, i) => i !== index) }); };
  const expirarCampana = (index: number) => { const c = [...data.campanas]; c[index].vigencia = "EXPIRADO"; setData({ ...data, campanas: c }); };
  const updateCampana = (i: number, f: string, v: string) => { const c = [...data.campanas]; (c[i] as any)[f] = v; setData({...data, campanas: c}); };
  const addPromocion = () => setData({...data, promociones: [...data.promociones, { nombre: "", servicioAsociado: "", detalle: "", precioEspecial: "", vigencia: "" }]});
  const updatePromocion = (i: number, f: string, v: string) => { const c = [...data.promociones]; (c[i] as any)[f] = v; setData({...data, promociones: c}); };
  const addFaq = () => setData({...data, faqs: [...data.faqs, { pregunta: "", respuesta: "" }]});
  const updateFaq = (i: number, f: string, v: string) => { const c = [...data.faqs]; (c[i] as any)[f] = v; setData({...data, faqs: c}); };
  const getProductList = () => { let list: string[] = []; data.catalogo.forEach(c => c.items.forEach(i => { if(i.nombre) list.push(i.nombre) })); return list; };

  const handleSubmit = async () => {
    setLoading(true);
    if (!data.telefonoTwilio) { setLoading(false); return alert("Falta seleccionar el número del bot."); }
    if (!data.adminNumero) { setLoading(false); return alert("Falta el número del dueño."); }
    if (!data.descripcion) { setLoading(false); return alert("La descripción de empresa es obligatoria."); }
    const catalogoParaGuardar = data.catalogo.map(cat => ({ ...cat, items: cat.items.map(prod => ({ ...prod, precio: prod.tipoPrecio === "cotizar" ? "A cotizar" : prod.precio, variantes: prod.variantes, requiereReserva: data.aceptaReservas ? prod.requiereReserva : false })) }));
    const payload = { ...data, catalogo: catalogoParaGuardar, telefonoAdmin: `whatsapp:${data.adminIndicativo}${data.adminNumero}`, telefonoAtencion: data.atencionNumero ? `whatsapp:${data.atencionIndicativo}${data.atencionNumero}` : "" };
    try {
        const res = await fetch("/api/empresa", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" } });
        if (res.ok) { alert("✅ Bot actualizado!"); } else { alert("Error al guardar."); }
    } catch(e) { alert("Error de conexión"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      <div className="bg-gradient-to-r from-indigo-900 to-blue-900 p-6 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div><h1 className="text-2xl font-bold">Configuración Maestra IA</h1><p className="text-indigo-200 text-xs">Sistema Profesional Completo</p></div>
            <div className="flex gap-2 bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/20">
                <input className="bg-transparent text-white placeholder-indigo-200 outline-none px-2 w-40 text-sm font-mono" placeholder="Buscar Teléfono..." value={telefonoBusqueda} onChange={e => setTelefonoBusqueda(e.target.value)} />
                <button onClick={cargarDatos} disabled={loadingBusqueda} className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1 rounded transition-colors">{loadingBusqueda ? "..." : "CARGAR"}</button>
            </div>
            <div className="flex gap-2">{[1,2,3,4,5,6].map(n => (<button key={n} onClick={() => setStep(n)} className={`w-8 h-8 rounded-full font-bold text-sm transition-all ${step===n ? 'bg-green-400 text-indigo-900 scale-110' : 'bg-indigo-800 text-indigo-400'}`}>{n}</button>))}</div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto mt-8 p-4">
        {step === 1 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-8 animate-fadeIn">
                <section>
                    <h2 className="text-xl font-bold text-indigo-900 mb-4">1. Línea de WhatsApp (Bot)</h2>
                    {loadingNumeros ? <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-indigo-600 font-bold animate-pulse">Cargando líneas...</div> : numeros.length === 0 ? <div className="p-4 bg-red-50 text-red-600 rounded border border-red-200 text-center">No hay números disponibles.</div> : (
                        <div className="grid md:grid-cols-3 gap-4">
                            {numeros.map(n => (<div key={n.id} onClick={() => handleChange('telefonoTwilio', n.id)} className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${data.telefonoTwilio === n.id ? 'border-green-500 bg-green-50' : (n.asignado ? 'border-orange-200 bg-orange-50 opacity-60' : 'border-slate-100 hover:border-indigo-200')}`}><div className="text-3xl">🤖</div><div><p className="font-bold">{n.numero}</p><p className="text-xs uppercase text-gray-400">{n.pais} {n.asignado ? '(Ocupado)' : ''}</p></div></div>))}
                        </div>
                    )}
                </section>
                <section className="grid md:grid-cols-2 gap-6">
                    <div><label className="label">Nombre Empresa</label><input className="input" value={data.nombre} onChange={e=>handleChange('nombre',e.target.value)} /></div>
                    <div><label className="label">Industria/Sector</label><input className="input" placeholder="Ej: Agencia Web, Ropa..." value={data.sector} onChange={e=>handleChange('sector',e.target.value)} /></div>
                    <div className="col-span-2">
                        <label className="label text-red-600 font-bold">Descripción de la Empresa (Contexto)</label>
                        <p className="text-xs text-gray-500 mb-2">Explica quiénes son, su estilo y propuesta de valor.</p>
                        <textarea className="input border-red-200 bg-red-50" rows={4} placeholder="Ej: Somos una tienda de gorras importadas..." value={data.descripcion} onChange={e=>handleChange('descripcion',e.target.value)} />
                    </div>
                    <div className="col-span-2 grid md:grid-cols-4 gap-2 bg-slate-50 p-4 rounded border"><input className="input text-xs" placeholder="Instagram" value={data.redes.instagram} onChange={e=>handleNested('redes','instagram',e.target.value)} /><input className="input text-xs" placeholder="TikTok" value={data.redes.tiktok} onChange={e=>handleNested('redes','tiktok',e.target.value)} /><input className="input text-xs" placeholder="Facebook" value={data.redes.facebook} onChange={e=>handleNested('redes','facebook',e.target.value)} /><input className="input text-xs" placeholder="Web" value={data.redes.web} onChange={e=>handleNested('redes','web',e.target.value)} /></div>
                </section>
                <section className="grid md:grid-cols-2 gap-6 bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                    <div><h3 className="font-bold text-indigo-900 mb-2">Tu Contacto (Dueño)</h3><div className="flex gap-2 items-center"><select className="h-10 px-2 rounded-md border border-slate-300 bg-white text-sm font-bold w-24 flex-none" value={data.adminIndicativo} onChange={e=>handleChange('adminIndicativo',e.target.value)}>{PAISES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}</select><input className="input flex-1" type="number" placeholder="300 123 4567" value={data.adminNumero} onChange={e=>handleChange('adminNumero',e.target.value)} /></div></div>
                    <div><h3 className="font-bold text-indigo-900 mb-2">Atención al Cliente</h3><div className="flex gap-2 items-center"><select className="h-10 px-2 rounded-md border border-slate-300 bg-white text-sm font-bold w-24 flex-none" value={data.atencionIndicativo} onChange={e=>handleChange('atencionIndicativo',e.target.value)}>{PAISES.map(p => <option key={p.code} value={p.code}>{p.flag} {p.code}</option>)}</select><input className="input flex-1" type="number" placeholder="Opcional" value={data.atencionNumero} onChange={e=>handleChange('atencionNumero',e.target.value)} /></div></div>
                </section>
            </div>
        )}
        {step === 2 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900">Horarios y Reservas</h2>
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-2">{Object.entries(data.horarios).map(([dia, val]) => (<div key={dia} className="flex items-center gap-2 text-sm border-b pb-2"><span className="w-24 font-bold">{dia}</span><input type="checkbox" checked={val.abierto} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, abierto: e.target.checked}}})} />{val.abierto ? <><input type="time" className="border rounded px-1" value={val.inicio} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, inicio: e.target.value}}})} /> - <input type="time" className="border rounded px-1" value={val.fin} onChange={e=> setData({...data, horarios: {...data.horarios, [dia]: {...val, fin: e.target.value}}})} /></> : <span className="text-gray-400">CERRADO</span>}</div>))}</div>
                    <div className="bg-yellow-50 p-4 rounded border border-yellow-200 h-fit"><label className="font-bold flex items-center gap-2 mb-2"><input type="checkbox" checked={data.aceptaReservas} onChange={e=>handleChange('aceptaReservas',e.target.checked)} />¿Acepta Reservas?</label>{data.aceptaReservas && (<div className="space-y-2"><input className="input bg-white" placeholder="Método" value={data.metodoReserva} onChange={e=>handleChange('metodoReserva',e.target.value)} /><textarea className="input bg-white" rows={3} placeholder="Reglas" value={data.reglasReserva} onChange={e=>handleChange('reglasReserva',e.target.value)} /></div>)}</div>
                </div>
            </div>
        )}
        {step === 3 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center border-b pb-4"><h2 className="text-xl font-bold text-indigo-900">Productos</h2><button onClick={addCat} className="btn-primary text-sm">+ Categoría</button></div>
                {data.catalogo.map((cat, cI) => (
                    <div key={cI} className="border rounded-xl p-4 mb-4 bg-slate-50">
                        <input className="text-lg font-bold bg-transparent w-full mb-4 border-b border-slate-300 outline-none" placeholder="Nombre Categoría" value={cat.nombre} onChange={e=> {const c=[...data.catalogo]; c[cI].nombre=e.target.value; setData({...data, catalogo: c})}} />
                        {cat.items.map((prod, pI) => (
                            <div key={pI} className="bg-white p-4 rounded shadow-sm mb-4 border border-slate-200">
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-3">
                                        <div><label className="label-xs">Nombre</label><input className="input font-bold" placeholder="Ej: Corte Clásico" value={prod.nombre} onChange={e=>updateProd(cI, pI, 'nombre', e.target.value)} /></div>
                                        <div><label className="label-xs">Precio</label><div className="flex gap-2 mb-2"><button onClick={() => updateProd(cI, pI, 'tipoPrecio', 'fijo')} className={`text-xs px-3 py-1 rounded-full border ${prod.tipoPrecio === 'fijo' ? 'bg-green-100 border-green-500 text-green-700 font-bold' : 'bg-slate-100'}`}>Precio Fijo</button><button onClick={() => updateProd(cI, pI, 'tipoPrecio', 'cotizar')} className={`text-xs px-3 py-1 rounded-full border ${prod.tipoPrecio === 'cotizar' ? 'bg-blue-100 border-blue-500 text-blue-700 font-bold' : 'bg-slate-100'}`}>A Cotizar</button></div>{prod.tipoPrecio === 'fijo' ? (<div className="flex gap-2"><input className="input w-1/2" placeholder="$ Precio" type="text" value={prod.precio} onChange={e=>updateProd(cI, pI, 'precio', e.target.value)} /><select className="input w-1/2 text-sm" value={prod.frecuencia} onChange={e=>updateProd(cI, pI, 'frecuencia', e.target.value)}><option>Pago Único</option><option>Mensual</option><option>Por Hora</option></select></div>) : (<div className="p-2 bg-blue-50 text-blue-700 text-xs rounded border">La IA indicará que el precio depende.</div>)}</div>
                                        <div><label className="label-xs">Duración</label><input className="input text-sm" placeholder="Ej: 45 mins" value={prod.duracion} onChange={e=>updateProd(cI, pI, 'duracion', e.target.value)} /></div>
                                        <div className="flex flex-col gap-1">
                                            <label className="label-xs text-blue-600">Foto Principal <span className="text-gray-400 normal-case">(se comprime auto)</span></label>
                                            <div className="flex items-center gap-2">
                                                <input type="file" accept="image/*" className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700" onChange={(e) => e.target.files && handleImageUpload(cI, pI, e.target.files[0])} />
                                                {uploading && <span className="text-xs animate-pulse text-orange-500 font-bold">Subiendo...</span>}
                                                {prod.imagenPrincipal && <img src={prod.imagenPrincipal} alt="Preview" className="h-8 w-8 object-cover rounded border" />}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div><div className="flex justify-between items-center mb-1"><label className="label-xs text-indigo-700">Variantes</label><button onClick={() => addGrupoVariante(cI, pI)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 border border-indigo-200">+ Grupo (Ej: Tallas)</button></div><div className="space-y-2 border border-slate-100 rounded bg-slate-50 p-2 max-h-48 overflow-y-auto">{prod.variantes.map((grupo, gI) => (<div key={gI} className="bg-white border rounded p-2 shadow-sm"><div className="flex gap-2 mb-2 border-b pb-1"><input className="flex-1 text-xs font-bold outline-none text-indigo-800 placeholder-indigo-300" placeholder="Grupo (Ej: Color)" value={grupo.nombre} onChange={(e) => updateNombreGrupo(cI, pI, gI, e.target.value)} /><button onClick={() => removeGrupo(cI, pI, gI)} className="text-red-400 hover:text-red-600 font-bold text-xs">X</button></div><div className="flex gap-1 mb-2"><input id={`opt-${cI}-${pI}-${gI}`} className="flex-1 text-xs border rounded px-1 h-6" placeholder="Opción (Ej: Rojo)" onKeyDown={(e) => { if(e.key === 'Enter') { const val = (e.target as HTMLInputElement).value; addOpcionToGrupo(cI, pI, gI, val); (e.target as HTMLInputElement).value = ''; } }} /><button onClick={() => { const el = document.getElementById(`opt-${cI}-${pI}-${gI}`) as HTMLInputElement; addOpcionToGrupo(cI, pI, gI, el.value); el.value = ''; }} className="bg-indigo-500 text-white text-xs px-2 rounded">+</button></div><div className="flex flex-col gap-1">{grupo.opciones.map((op, oI) => (<div key={oI} className="flex items-center gap-2 bg-gray-50 p-1 rounded border"><span className="text-[10px] font-bold w-12 truncate">{op.nombre}</span><input type="file" accept="image/*" className="w-20 text-[8px] file:mr-0 file:py-0 file:px-2 file:rounded file:border-0 file:bg-gray-200 file:text-gray-600" onChange={(e) => e.target.files && handleVariantImageUpload(cI, pI, gI, oI, e.target.files[0])} />{op.imagenUrl && <img src={op.imagenUrl} className="h-4 w-4 rounded-full object-cover border" alt="v" />}<button onClick={() => removeOpcionFromGrupo(cI, pI, gI, oI)} className="text-red-400 text-xs font-bold px-1">x</button></div>))}</div></div>))}</div></div>
                                        <div><label className="label-xs">Descripción</label><textarea className="input text-sm" rows={2} placeholder="Qué incluye..." value={prod.descripcion} onChange={e=>updateProd(cI, pI, 'descripcion', e.target.value)} /></div>
                                    </div>
                                    <div className="space-y-3">
                                        <div><label className="label-xs text-orange-600">Contexto IA</label><textarea className="input bg-orange-50 text-xs border-orange-200" rows={4} placeholder="Detalles técnicos..." value={prod.detallesIA} onChange={e=>updateProd(cI, pI, 'detallesIA', e.target.value)} /></div>
                                        <div className="bg-slate-50 p-2 rounded border mt-2 space-y-2"><div className="flex items-center gap-2"><input type="checkbox" checked={prod.tienePromo} onChange={e=>updateProd(cI, pI, 'tienePromo', e.target.checked)} /><span className="text-xs font-bold text-green-700">Promoción?</span></div>{prod.tienePromo && <input className="input text-xs border-green-300" placeholder="Detalle..." value={prod.detallePromo} onChange={e=>updateProd(cI, pI, 'detallePromo', e.target.value)} />}{data.aceptaReservas && (<div className="flex items-center gap-2 border-t pt-2 mt-2"><input type="checkbox" checked={prod.requiereReserva} onChange={e=>updateProd(cI, pI, 'requiereReserva', e.target.checked)} /><span className="text-xs font-bold text-purple-700">Requiere Reserva?</span></div>)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={()=>addProd(cI)} className="w-full py-2 border-2 border-dashed border-slate-300 text-slate-500 rounded font-bold hover:bg-slate-200">+ Producto</button>
                    </div>
                ))}
            </div>
        )}
        {step === 4 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900">Personalidad</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    <div><label className="label">Modo</label><select className="input" value={data.personalidadIA} onChange={e=>handleChange('personalidadIA', e.target.value)}><option value="Vender">Vendedor</option><option value="Amigable">Amigable</option><option value="Serio">Serio</option></select></div>
                    <div><label className="label">Bienvenida</label><input className="input" value={data.mensajeBienvenida} onChange={e=>handleChange('mensajeBienvenida', e.target.value)} /></div>
                    <div className="col-span-2"><label className="label text-indigo-600">Instrucciones</label><textarea className="input bg-indigo-50 border-indigo-200" rows={3} placeholder="Instrucciones extra..." value={data.instruccionesAdicionales} onChange={e=>handleChange('instruccionesAdicionales', e.target.value)} /></div>
                    <div className="col-span-2 grid md:grid-cols-2 gap-6"><div><label className="label text-red-600">Temas Prohibidos</label><textarea className="input bg-red-50 border-red-100" rows={3} value={data.temasProhibidos} onChange={e=>handleChange('temasProhibidos', e.target.value)} /></div><div><label className="label text-orange-600">Clientes Difíciles</label><textarea className="input bg-orange-50 border-orange-100" rows={3} value={data.manejoClientesDificiles} onChange={e=>handleChange('manejoClientesDificiles', e.target.value)} /></div></div>
                </div>
            </div>
        )}
        {step === 5 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-8 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900">Marketing</h2>
                <div><div className="flex justify-between mb-2"><h3 className="font-bold">Campañas</h3><button onClick={addCampana} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">+ Campaña</button></div>{data.campanas.map((c, i) => (<div key={i} className="grid md:grid-cols-4 gap-2 mb-2 bg-slate-50 p-2 rounded border items-center"><input className="input text-sm" placeholder="Clave" value={c.palabraClave} onChange={e=>updateCampana(i,'palabraClave',e.target.value)} /><input className="input text-sm" placeholder="Contexto" value={c.contexto} onChange={e=>updateCampana(i,'contexto',e.target.value)} /><input className="input text-sm" placeholder="Vigencia" value={c.vigencia} onChange={e=>updateCampana(i,'vigencia',e.target.value)} /><div className="flex gap-1"><button onClick={() => expirarCampana(i)} className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded">Expirar</button><button onClick={() => removeCampana(i)} className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">Borrar</button></div></div>))}</div>
                <div className="bg-green-50 p-4 rounded border border-green-200"><div className="flex justify-between mb-2"><h3 className="font-bold text-green-800">Promociones</h3><button onClick={addPromocion} className="text-xs bg-white text-green-700 px-2 py-1 rounded border border-green-300">+ Promo</button></div>{data.promociones.map((p, i) => (<div key={i} className="grid md:grid-cols-5 gap-2 mb-2"><input className="input text-sm" placeholder="Nombre" value={p.nombre} onChange={e=>updatePromocion(i,'nombre',e.target.value)} /><select className="input text-sm" value={p.servicioAsociado} onChange={e=>updatePromocion(i,'servicioAsociado',e.target.value)}><option value="">- Producto -</option>{getProductList().map(pn => <option key={pn} value={pn}>{pn}</option>)}</select><input className="input text-sm" placeholder="Detalle" value={p.detalle} onChange={e=>updatePromocion(i,'detalle',e.target.value)} /><input className="input text-sm" placeholder="Precio" value={p.precioEspecial} onChange={e=>updatePromocion(i,'precioEspecial',e.target.value)} /><input className="input text-sm" placeholder="Vigencia" value={p.vigencia} onChange={e=>updatePromocion(i,'vigencia',e.target.value)} /></div>))}</div>
            </div>
        )}
        {step === 6 && (
            <div className="bg-white rounded-xl shadow-sm p-8 space-y-6 animate-fadeIn">
                <h2 className="text-xl font-bold text-indigo-900">Legal y Pagos</h2>
                <div className="grid md:grid-cols-2 gap-6"><div><h3 className="font-bold mb-2">Términos</h3><textarea className="input text-sm" rows={5} value={data.terminosCondiciones} onChange={e=>handleChange('terminosCondiciones',e.target.value)} /></div><div><h3 className="font-bold mb-2">Pagos</h3><div className="flex gap-2 mb-2"><input id="newP" className="input" placeholder="Método" /><button onClick={()=>{const v=(document.getElementById('newP') as HTMLInputElement).value; if(v) { setData({...data, mediosPago: [...data.mediosPago, v]}); (document.getElementById('newP') as HTMLInputElement).value=''; }}} className="btn-primary">+</button></div><div className="flex flex-wrap gap-2 mb-2">{data.mediosPago.map(p=><span key={p} className="bg-slate-200 px-2 rounded text-xs">{p}</span>)}</div><textarea className="input text-sm" rows={2} placeholder="Instrucciones..." value={data.instruccionesPago} onChange={e=>handleChange('instruccionesPago',e.target.value)} /></div></div>
                <div className="bg-slate-50 p-4 rounded border"><div className="flex justify-between mb-2"><h3 className="font-bold">FAQs</h3><button onClick={addFaq} className="text-xs text-indigo-600 font-bold">+ Pregunta</button></div>{data.faqs.map((f, i) => (<div key={i} className="flex gap-2 mb-2"><input className="input text-sm w-1/3" placeholder="Pregunta" value={f.pregunta} onChange={e=>updateFaq(i,'pregunta',e.target.value)} /><input className="input text-sm w-2/3" placeholder="Respuesta" value={f.respuesta} onChange={e=>updateFaq(i,'respuesta',e.target.value)} /></div>))}</div>
                <div className="pt-6 border-t text-center"><button onClick={handleSubmit} disabled={loading} className="px-10 py-4 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 text-xl">{loading ? "Guardando..." : "ACTIVAR BOT AHORA"}</button></div>
            </div>
        )}
      </div>
      <style jsx>{` .label { font-weight: 700; font-size: 0.85rem; color: #1e293b; margin-bottom: 0.25rem; display: block; } .label-xs { font-weight: 700; font-size: 0.7rem; color: #64748b; text-transform: uppercase; display: block; } .input { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; outline: none; transition: all 0.2s; } .input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); } .btn-primary { background: #4f46e5; color: white; padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-weight: bold; } `}</style>
    </div>
  );
}