import React, { useState, useEffect, useRef } from 'react';
import { Examen, Pregunta } from '../types';
import * as XLSX from 'xlsx';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  AlertCircle,
  Loader2,
  Download,
  Upload
} from 'lucide-react';
import { motion } from 'motion/react';

interface AdminExamEditorProps {
  examen?: Examen | null;
  onSave: (examen: Omit<Examen, 'id'> & { id?: string }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export function AdminExamEditor({ examen, onSave, onCancel, loading }: AdminExamEditorProps) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tiempoLimite, setTiempoLimite] = useState(15);
  const [calificacionMinima, setCalificacionMinima] = useState(80);
  const [preguntas, setPreguntas] = useState<Pregunta[]>([
    { pregunta: '', opciones: ['', '', '', ''], respuestaCorrecta: 0 }
  ]);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (examen) {
      setTitulo(examen.titulo);
      setDescripcion(examen.descripcion);
      setTiempoLimite(examen.tiempoLimite);
      setCalificacionMinima(examen.calificacionMinima);
      setPreguntas(examen.preguntas);
    }
  }, [examen]);

  const handleAddQuestion = () => {
    setPreguntas([...preguntas, { pregunta: '', opciones: ['', '', '', ''], respuestaCorrecta: 0 }]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (preguntas.length <= 1) return;
    const newPreguntas = [...preguntas];
    newPreguntas.splice(index, 1);
    setPreguntas(newPreguntas);
  };

  const handleQuestionChange = (index: number, field: keyof Pregunta, value: any) => {
    const newPreguntas = [...preguntas];
    newPreguntas[index] = { ...newPreguntas[index], [field]: value };
    setPreguntas(newPreguntas);
  };

  const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
    const newPreguntas = [...preguntas];
    const newOpciones = [...newPreguntas[qIndex].opciones];
    newOpciones[oIndex] = value;
    newPreguntas[qIndex].opciones = newOpciones;
    setPreguntas(newPreguntas);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Pregunta': '¿Cuál es la norma de seguridad?',
        'Opción 1': 'Norma A',
        'Opción 2': 'Norma B',
        'Opción 3': 'Norma C',
        'Opción 4': 'Norma D',
        'Respuesta Correcta (1-4)': 1
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "Plantilla_Evaluacion.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const importedPreguntas: Pregunta[] = data.map((row: any) => ({
          pregunta: row['Pregunta'] || '',
          opciones: [
            row['Opción 1'] || '',
            row['Opción 2'] || '',
            row['Opción 3'] || '',
            row['Opción 4'] || ''
          ],
          respuestaCorrecta: (parseInt(row['Respuesta Correcta (1-4)']) || 1) - 1
        })).filter(q => q.pregunta);

        if (importedPreguntas.length > 0) {
          setPreguntas(prev => [...prev, ...importedPreguntas]);
          setError('');
        } else {
          setError('No se encontraron preguntas válidas en el archivo.');
        }
      } catch (err) {
        setError('Error al procesar el archivo de Excel.');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!titulo || !descripcion || preguntas.length === 0) {
      setError('Por favor completa todos los campos básicos.');
      return;
    }

    // Basic validation for questions
    for (let i = 0; i < preguntas.length; i++) {
      const q = preguntas[i];
      if (!q.pregunta || q.opciones.some(o => !o)) {
        setError(`La pregunta ${i + 1} está incompleta.`);
        return;
      }
    }

    try {
      await onSave({
        id: examen?.id,
        titulo,
        descripcion,
        tiempoLimite,
        calificacionMinima,
        preguntas
      });
    } catch (err) {
      setError('Error al guardar el examen.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-2xl font-black text-slate-800">
              {examen ? 'Editar Evaluación' : 'Nueva Evaluación'}
            </h2>
            <p className="text-sm text-slate-500">Configura los detalles y preguntas del examen.</p>
          </div>
          <button 
            onClick={onCancel}
            className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400"
          >
            <X size={24} />
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <form id="exam-form" onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Título del Examen</label>
                <input 
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-slate-800"
                  placeholder="Ej. Seguridad Industrial Básica"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Descripción</label>
                <textarea 
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[100px]"
                  placeholder="Describe brevemente de qué trata esta evaluación..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Tiempo Límite (minutos)</label>
                <input 
                  type="number"
                  value={tiempoLimite}
                  onChange={(e) => setTiempoLimite(parseInt(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  min="1"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Calificación Mínima (%)</label>
                <input 
                  type="number"
                  value={calificacionMinima}
                  onChange={(e) => setCalificacionMinima(parseInt(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  min="1"
                  max="100"
                  required
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-800">Preguntas ({preguntas.length})</h3>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all text-sm"
                    title="Descargar Plantilla"
                  >
                    <Download size={18} />
                    Plantilla
                  </button>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm"
                    title="Importar desde Excel"
                  >
                    <Upload size={18} />
                    Importar Excel
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".xlsx, .xls"
                    className="hidden"
                  />
                  <button 
                    type="button"
                    onClick={handleAddQuestion}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all text-sm"
                  >
                    <Plus size={18} />
                    Agregar Pregunta
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {preguntas.map((q, qIndex) => (
                  <motion.div 
                    layout
                    key={qIndex}
                    className="p-6 bg-slate-50 rounded-2xl border border-slate-200 relative group"
                  >
                    <button 
                      type="button"
                      onClick={() => handleRemoveQuestion(qIndex)}
                      className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Eliminar Pregunta"
                    >
                      <Trash2 size={18} />
                    </button>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pregunta {qIndex + 1}</label>
                        <input 
                          type="text"
                          value={q.pregunta}
                          onChange={(e) => handleQuestionChange(qIndex, 'pregunta', e.target.value)}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                          placeholder="Escribe el enunciado de la pregunta..."
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {q.opciones.map((opt, oIndex) => (
                          <div key={oIndex} className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                              <input 
                                type="radio"
                                name={`correct-${qIndex}`}
                                checked={q.respuestaCorrecta === oIndex}
                                onChange={() => handleQuestionChange(qIndex, 'respuestaCorrecta', oIndex)}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                              />
                            </div>
                            <input 
                              type="text"
                              value={opt}
                              onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                              className={`w-full pl-10 pr-4 py-2 bg-white border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm ${
                                q.respuestaCorrecta === oIndex ? 'border-indigo-300 ring-1 ring-indigo-300' : 'border-slate-200'
                              }`}
                              placeholder={`Opción ${oIndex + 1}`}
                              required
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                <AlertCircle size={20} />
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-4">
          <button 
            type="button"
            onClick={onCancel}
            className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button 
            type="submit"
            form="exam-form"
            disabled={loading}
            className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {examen ? 'Guardar Cambios' : 'Crear Examen'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
