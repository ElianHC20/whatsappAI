"use client";
import { useState, useEffect } from "react";

// Mapeo de códigos de país para fácil acceso
const PREFIJOS: Record<string, string> = {
    "USA": "+1",
    "Colombia": "+57",
    "Mexico": "+52",
    "España": "+34"
};

export default function AdminPanel() {
  const [numeros, setNumeros] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Formulario nuevo número
  const [nuevoNumero, setNuevoNumero] = useState("");
  const [pais, setPais] = useState("USA");
  const [bandera, setBandera] = useState("🇺🇸");

  // Cargar lista al iniciar
  const cargarInventario = async () => {
    try {
        const res = await fetch('/api/admin/numeros');
        const data = await res.json();
        setNumeros(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargarInventario(); }, []);

  // Manejar cambio de país
  const handlePais = (e: any) => {
    const p = e.target.value;
    setPais(p);
    if(p === "USA") setBandera("🇺🇸");
    if(p === "Colombia") setBandera("🇨🇴");
    if(p === "Mexico") setBandera("🇲🇽");
    if(p === "España") setBandera("🇪🇸");
  };

  // --- FUNCIÓN CORREGIDA ---
  const handleAgregar = async () => {
    if(!nuevoNumero) return alert("Falta el número");
    setLoading(true);

    // 1. Obtenemos el prefijo según el país seleccionado (Ej: +57)
    const prefijo = PREFIJOS[pais] || "+1"; 

    // 2. Limpiamos lo que escribió el usuario (quitamos espacios, guiones o símbolos raros)
    // Solo dejamos los números puros.
    const numeroLimpio = nuevoNumero.replace(/\D/g, ''); 

    // 3. Unimos todo: Prefijo + Número Limpio (Ej: +573001234567)
    const numFinal = `${prefijo}${numeroLimpio}`;

    await fetch('/api/admin/numeros', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            numero: numFinal, 
            pais, 
            bandera 
        })
    });
    
    setNuevoNumero("");
    await cargarInventario(); 
    setLoading(false);
  };

  // BORRAR NÚMERO
  const handleBorrar = async (id: string) => {
    if(!confirm("¿Seguro que quieres borrar este número del inventario?")) return;
    await fetch('/api/admin/numeros', {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id })
    });
    cargarInventario();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-10 font-sans">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-10 border-b border-gray-700 pb-5">
            <div>
                <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                    Panel de Control (CEO) 🚀
                </h1>
                <p className="text-gray-400 mt-1">Gestiona tu inventario de líneas de WhatsApp</p>
            </div>
            <div className="bg-blue-900 px-4 py-2 rounded-lg text-sm font-bold border border-blue-500">
                Total Líneas: {numeros.length}
            </div>
        </div>

        {/* 1. AGREGAR NUEVO */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 shadow-2xl mb-10">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                ➕ Agregar Nueva Línea (Comprada en Twilio)
            </h2>
            <div className="grid md:grid-cols-4 gap-4">
                
                {/* SELECTOR DE PAÍS */}
                <select className="bg-gray-700 border border-gray-600 p-3 rounded text-white" value={pais} onChange={handlePais}>
                    <option value="USA">🇺🇸 USA (+1)</option>
                    <option value="Colombia">🇨🇴 Colombia (+57)</option>
                    <option value="Mexico">🇲🇽 México (+52)</option>
                    <option value="España">🇪🇸 España (+34)</option>
                </select>

                {/* INPUT DE NÚMERO CON PREFIJO VISUAL */}
                <div className="col-span-2 relative">
                    {/* Mostramos el prefijo visualmente dentro del input para que el usuario sepa que ya está puesto */}
                    <span className="absolute left-3 top-3.5 text-gray-400 select-none">
                        {PREFIJOS[pais]}
                    </span>
                    <input 
                        className="w-full bg-gray-700 border border-gray-600 p-3 pl-12 rounded text-white focus:outline-none focus:border-blue-500 font-mono" 
                        placeholder="300 123 4567" 
                        value={nuevoNumero}
                        onChange={e => setNuevoNumero(e.target.value)}
                        type="number" // Forzamos teclado numérico en móvil
                    />
                </div>

                <button 
                    onClick={handleAgregar} 
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-500 text-white font-bold p-3 rounded transition-all shadow-lg flex justify-center items-center gap-2"
                >
                    {loading ? "..." : "💾 GUARDAR"}
                </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">* Solo escribe el número. El código de país (+57, +1, etc) se agrega automáticamente.</p>
        </div>

        {/* 2. LISTA DE NÚMEROS */}
        <h2 className="text-xl font-bold mb-4">📚 Inventario Actual</h2>
        <div className="grid gap-3">
            {numeros.map((num) => (
                <div key={num.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 flex justify-between items-center hover:bg-gray-750 transition-colors">
                    <div className="flex items-center gap-4">
                        <span className="text-2xl">{num.display ? num.display.split(' ')[0] : '📱'}</span>
                        <div>
                            <p className="font-bold text-lg font-mono">{num.numero}</p>
                            <p className="text-xs text-gray-400">{num.pais}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* ESTADO */}
                        {num.asignado ? (
                            <span className="bg-red-900 text-red-200 px-3 py-1 rounded-full text-xs font-bold border border-red-700">
                                🔴 OCUPADO
                            </span>
                        ) : (
                            <span className="bg-green-900 text-green-200 px-3 py-1 rounded-full text-xs font-bold border border-green-700">
                                🟢 LIBRE
                            </span>
                        )}

                        {/* ACCIONES */}
                        <button 
                            onClick={() => handleBorrar(num.id)}
                            className="text-gray-500 hover:text-red-500 font-bold p-2 hover:bg-gray-700 rounded transition-all"
                            title="Eliminar del inventario"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            ))}

            {numeros.length === 0 && (
                <p className="text-center text-gray-500 py-10">No hay números en el inventario.</p>
            )}
        </div>

      </div>
    </div>
  );
}