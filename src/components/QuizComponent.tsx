import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, ChevronLeft, ChevronRight, Send, AlertTriangle, X } from 'lucide-react';
import { Examen, Pregunta } from '../types';
import Swal from 'sweetalert2';

interface QuizComponentProps {
  examen: Examen;
  onComplete: (respuestas: number[]) => void;
  onExit: () => void;
  onBloqueo: () => void;
}

export const QuizComponent: React.FC<QuizComponentProps> = ({ examen, onComplete, onExit, onBloqueo }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [respuestas, setRespuestas] = useState<number[]>(new Array(examen.preguntas.length).fill(-1));
  const [timeLeft, setTimeLeft] = useState(examen.tiempoLimite * 60);
  const [showWarning, setShowWarning] = useState(false);
  const [exitCount, setExitCount] = useState(0);

  const handleSubmit = useCallback(() => {
    onComplete(respuestas);
  }, [onComplete, respuestas]);

  const handleFinalize = async () => {
    const unansweredIndices = respuestas
      .map((r, i) => (r === -1 ? i + 1 : null))
      .filter((i) => i !== null) as number[];

    if (unansweredIndices.length > 0) {
      const result = await Swal.fire({
        title: 'Evaluación Incompleta',
        html: `
          <div class="text-slate-600 text-sm">
            <p class="mb-4">Tienes <strong>${unansweredIndices.length}</strong> preguntas sin responder:</p>
            <div class="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-700 font-mono font-bold mb-4">
              Preguntas: ${unansweredIndices.join(', ')}
            </div>
            <p>¿Estás seguro de que deseas finalizar la evaluación ahora?</p>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'Sí, finalizar',
        cancelButtonText: 'Seguir respondiendo',
        background: '#ffffff',
        customClass: {
          popup: 'rounded-3xl',
          confirmButton: 'rounded-xl px-6 py-3 font-bold',
          cancelButton: 'rounded-xl px-6 py-3 font-bold'
        }
      });

      if (result.isConfirmed) {
        handleSubmit();
      }
    } else {
      handleSubmit();
    }
  };

  // Tab close warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleExitClick = async () => {
    const result = await Swal.fire({
      title: '¿Abandonar examen?',
      text: "Si sales ahora, perderás todo tu progreso en esta evaluación.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, abandonar',
      cancelButtonText: 'Continuar examen',
      background: '#ffffff',
      customClass: {
        confirmButton: 'rounded-xl px-6 py-3 font-bold',
        cancelButton: 'rounded-xl px-6 py-3 font-bold'
      }
    });

    if (result.isConfirmed) {
      onExit();
    }
  };

  // Timer logic
  useEffect(() => {
    if (timeLeft <= 0) {
      handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, handleSubmit]);

  // Tab visibility logic
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const nextCount = exitCount + 1;
        setExitCount(nextCount);
        
        if (nextCount === 1) {
          setShowWarning(true);
        } else if (nextCount === 2) {
          setShowWarning(true);
          // Auto trigger specialized warning if hidden long enough or just use the UI warning
        } else if (nextCount >= 3) {
          await Swal.fire({
            title: '¡Evaluación Bloqueada!',
            text: 'Has salido de la ventana 3 veces. La evaluación se ha finalizado y bloqueado automáticamente por seguridad.',
            icon: 'error',
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Entendido',
            background: '#ffffff',
            allowOutsideClick: false,
            customClass: {
              popup: 'rounded-3xl',
              confirmButton: 'rounded-xl px-6 py-3 font-bold',
            }
          });
          onBloqueo();
          handleSubmit();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [exitCount, onBloqueo, handleSubmit]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelect = (optionIdx: number) => {
    const newRespuestas = [...respuestas];
    newRespuestas[currentIdx] = optionIdx;
    setRespuestas(newRespuestas);
  };

  const currentPregunta = examen.preguntas[currentIdx];
  const isLast = currentIdx === examen.preguntas.length - 1;

  const getWarningMessage = () => {
    if (exitCount === 1) {
      return "¡Atención! Se detectó que saliste de la pestaña. Por favor, mantente enfocado en el examen para evitar la anulación.";
    }
    if (exitCount === 2) {
      return "¡ADVERTENCIA FINAL! Si sales una vez más, la evaluación se cerrará y bloqueará automáticamente.";
    }
    return "";
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-xl border border-slate-100">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleExitClick}
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
            title="Salir del examen"
          >
            <X size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{examen.titulo}</h2>
            <p className="text-slate-500">Pregunta {currentIdx + 1} de {examen.preguntas.length}</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold ${timeLeft < 60 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
          <Timer size={20} />
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Warning Alert */}
      <AnimatePresence>
        {showWarning && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-6 p-4 border rounded-lg flex items-center gap-3 ${exitCount === 2 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
          >
            <AlertTriangle className="shrink-0" />
            <p className="text-sm font-medium">
              {getWarningMessage()}
            </p>
            <button 
              onClick={() => setShowWarning(false)}
              className="ml-auto text-xs font-bold uppercase tracking-wider hover:underline"
            >
              Entendido
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question Content */}
      <div className="min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <h3 className="text-xl font-medium text-slate-800 mb-6">
              {currentPregunta.pregunta}
            </h3>
            <div className="grid gap-3">
              {currentPregunta.opciones.map((opcion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    respuestas[currentIdx] === idx
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      respuestas[currentIdx] === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    {opcion}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="mt-10 flex justify-between items-center">
        <button
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(currentIdx - 1)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={20} />
          Anterior
        </button>

        {isLast ? (
          <button
            onClick={handleFinalize}
            className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform hover:scale-105"
          >
            Finalizar Examen
            <Send size={20} />
          </button>
        ) : (
          <button
            onClick={() => setCurrentIdx(currentIdx + 1)}
            className="flex items-center gap-2 px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all"
          >
            Siguiente
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mt-8 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-indigo-600"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIdx + 1) / examen.preguntas.length) * 100}%` }}
        />
      </div>

      {/* Question Picker */}
      <div className="mt-10 pt-8 border-t border-slate-50">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em]">Navegación de Preguntas</p>
          <div className="flex items-center gap-4 text-[10px] uppercase font-bold">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
              <span className="text-slate-500">Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-indigo-50 border border-indigo-200 rounded-full"></div>
              <span className="text-slate-500">Respondida</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 bg-slate-50 border border-slate-200 rounded-full"></div>
              <span className="text-slate-500">Pendiente</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {examen.preguntas.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all transform hover:scale-105 active:scale-95 ${
                currentIdx === i 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-4 ring-indigo-50' 
                  : respuestas[i] !== -1 
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 font-black' 
                    : 'bg-slate-50 text-slate-400 border border-slate-100'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
