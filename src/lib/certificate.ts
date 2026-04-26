import { jsPDF } from 'jspdf';
import { Resultado, Usuario, Examen } from '../types';
import { transformGoogleDriveUrl } from './utils';

/**
 * Loads an image and converts it to a DataURL.
 * Tries several strategies to bypass CORS and caching issues.
 */
const loadImageAsDataURL = async (url: string): Promise<{ data: string, width: number, height: number }> => {
  const loadWithProxy = (targetUrl: string, useCrossOrigin: boolean = true): Promise<{ data: string, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (useCrossOrigin) img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas context error');
          ctx.drawImage(img, 0, 0);
          const data = canvas.toDataURL('image/png');
          resolve({ data, width: img.width, height: img.height });
        } catch (err) {
          reject(err);
        }
      };
      
      img.onerror = () => reject(new Error(`Failed to load ${targetUrl}`));
      img.src = targetUrl;
    });
  };

  try {
    // Strategy 1: Direct with cache buster
    const cacheBuster = `cb=${new Date().getTime()}`;
    const sep = url.includes('?') ? '&' : '?';
    return await loadWithProxy(`${url}${sep}${cacheBuster}`);
  } catch (err) {
    console.warn('Strategy 1 failed, trying Strategy 2 (no buster)...', err);
    try {
      // Strategy 2: Direct without cache buster
      return await loadWithProxy(url);
    } catch (err2) {
      console.warn('Strategy 2 failed, trying Strategy 3 (uc endpoint)...', err2);
      try {
        // Strategy 3: Try the uc endpoint as some IDs might prefer it
        const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const ucUrl = `https://docs.google.com/uc?id=${fileIdMatch[1]}&export=download`;
          return await loadWithProxy(ucUrl);
        }
        throw err2;
      } catch (err3) {
        throw new Error(`Critical: Could not load image from ${url}. check permissions.`);
      }
    }
  }
};

const drawImageCentered = (doc: jsPDF, imgData: { data: string, width: number, height: number }, centerX: number, y: number, maxWidth: number, maxHeight: number) => {
  const ratio = imgData.width / imgData.height;
  let width = maxWidth;
  let height = width / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const x = centerX - (width / 2);
  // Using 'PNG' alias and 'FAST' compression for best balance
  doc.addImage(imgData.data, 'PNG', x, y, width, height, undefined, 'FAST');
  return { width, height };
};

const drawImageRightAligned = (doc: jsPDF, imgData: { data: string, width: number, height: number }, rightX: number, y: number, maxWidth: number, maxHeight: number) => {
  const ratio = imgData.width / imgData.height;
  let width = maxWidth;
  let height = width / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  const x = rightX - width;
  doc.addImage(imgData.data, 'PNG', x, y, width, height, undefined, 'FAST');
  return { width, height };
};

export const generateCertificate = async (
  resultado: Resultado, 
  usuario: Usuario, 
  logoUrl?: string, 
  firmaUrl?: string,
  secondaryLogoUrl?: string,
  nombreEvaluador?: string,
  plantillaUrl?: string
) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Background Template
  if (plantillaUrl) {
    try {
      const transformedPlantillaUrl = transformGoogleDriveUrl(plantillaUrl);
      const plantillaImg = await loadImageAsDataURL(transformedPlantillaUrl);
      // Draw template to cover the entire page
      doc.addImage(plantillaImg.data, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    } catch (e) {
      console.error('Error loading template for certificate:', e);
      // Fallback to border if template fails
      doc.setDrawColor(44, 62, 80);
      doc.setLineWidth(2);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
    }
  } else {
    // Standard Border if no template
    doc.setDrawColor(44, 62, 80);
    doc.setLineWidth(2);
    doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
  }
  
  // 2. Logos (Only if NO template is present to avoid overlap)
  if (!plantillaUrl) {
    // Principal Logo (Centered)
    if (logoUrl) {
      try {
        const transformedUrl = transformGoogleDriveUrl(logoUrl);
        const imgData = await loadImageAsDataURL(transformedUrl);
        drawImageCentered(doc, imgData, pageWidth / 2, 15, 60, 40);
      } catch (e) {
        console.error('Error loading logo for certificate:', e);
      }
    }

    // Secondary Logo (Top Right)
    if (secondaryLogoUrl) {
      try {
        const transformedSecondaryUrl = transformGoogleDriveUrl(secondaryLogoUrl);
        const secondaryImgData = await loadImageAsDataURL(transformedSecondaryUrl);
        drawImageRightAligned(doc, secondaryImgData, pageWidth - 20, 15, 45, 35);
      } catch (e) {
        console.error('Error loading secondary logo:', e);
      }
    }
  }

  // 3. Texts and Data
  // If there is a template, we might need to adjust Y positions or font colors
  // But for now let's keep the current standard layout as user can design template around it
  doc.setTextColor(44, 62, 80);

  // Header - CONSTANCIA DE APROBACIÓN
  doc.setFontSize(30);
  doc.text('CONSTANCIA DE APROBACIÓN', pageWidth / 2, 60, { align: 'center' });

  doc.setFontSize(16);
  doc.text('Se otorga la presente a:', pageWidth / 2, 75, { align: 'center' });

  // Name
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(usuario.nombreCompleto.toUpperCase(), pageWidth / 2, 95, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('Por haber acreditado satisfactoriamente la evaluación de:', pageWidth / 2, 110, { align: 'center' });

  // Exam Title - With wrapping and 3cm margins
  const marginX = 30; // 3cm margins
  const maxTitleWidth = pageWidth - (marginX * 2);
  
  // Dynamic font size for title
  let titleFontSize = 22;
  doc.setFontSize(titleFontSize);
  doc.setFont('helvetica', 'bold');
  
  let titleLines = doc.splitTextToSize(resultado.examenTitulo.toUpperCase(), maxTitleWidth);
  
  // If still too long (more than 2 lines), reduce font size
  if (titleLines.length > 2) {
    titleFontSize = 18;
    doc.setFontSize(titleFontSize);
    titleLines = doc.splitTextToSize(resultado.examenTitulo.toUpperCase(), maxTitleWidth);
  }

  // Draw the lines centered
  const titleY = 125;
  doc.text(titleLines, pageWidth / 2, titleY, { align: 'center' });

  // Adjust score position based on title height (if 2 lines, push it down slightly)
  const scoreY = titleLines.length > 1 ? titleY + (titleFontSize * 0.5) + 8 : titleY + 12;

  // Score
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Calificación obtenida: ${resultado.puntaje}%`, pageWidth / 2, scoreY, { align: 'center' });

  // Signature Area
  const signatureLineY = 170;
  const signatureLineWidth = 80;

  // Signature Image (Centered strictly above the Evaluator name)
  if (firmaUrl) {
    try {
      const transformedFirmaUrl = transformGoogleDriveUrl(firmaUrl);
      const firmaImgData = await loadImageAsDataURL(transformedFirmaUrl);
      // Place signature exactly above the line
      drawImageCentered(doc, firmaImgData, pageWidth / 2, 143, 65, 25);
    } catch (e) {
      console.error('Error loading signature for certificate:', e);
    }
  }

  // Signatures Line and Names
  doc.setDrawColor(44, 62, 80);
  doc.setLineWidth(0.5);
  doc.line(pageWidth / 2 - (signatureLineWidth / 2), signatureLineY, pageWidth / 2 + (signatureLineWidth / 2), signatureLineY);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(nombreEvaluador?.toUpperCase() || 'EVALUADOR / ADMINISTRADOR', pageWidth / 2, signatureLineY + 6, { align: 'center' });
  
  if (nombreEvaluador) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Evaluador / Administrador', pageWidth / 2, signatureLineY + 11, { align: 'center' });
  }

  // Footer
  doc.setFontSize(8);
  doc.text('Este documento es una constancia digital generada automáticamente por EduTest Pro.', pageWidth / 2, 196, { align: 'center' });

  doc.save(`Certificado_${usuario.curp}_${resultado.examenTitulo.replace(/\s+/g, '_')}.pdf`);
};

export const generateEvaluationPDF = async (resultado: Resultado, usuario: Usuario, examen: Examen) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let yPos = 15;

  // Header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('EVIDENCIA DE EVALUACIÓN', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  // User details box - More compact
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(250, 251, 252);
  doc.rect(margin, yPos, pageWidth - (margin * 2), 22, 'FD');
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL ALUMNO', margin + 4, yPos + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Nombre: ${usuario.nombreCompleto}`, margin + 4, yPos + 12);
  doc.text(`CURP: ${usuario.curp}`, margin + 4, yPos + 18);

  const rightSideX = pageWidth / 2 + 5;
  doc.text(`Examen: ${resultado.examenTitulo}`, rightSideX, yPos + 12);
  
  const statusColor = resultado.aprobado ? [0, 120, 0] : [180, 0, 0];
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Resultado: ${resultado.puntaje}% - ${resultado.aprobado ? 'APROBADO' : 'REPROBADO'}`, rightSideX, yPos + 18);
  
  doc.setTextColor(0, 0, 0);
  yPos += 28;

  // Questions - Much more compact
  examen.preguntas.forEach((p, idx) => {
    // Page break fallback but we aim for 1 page
    if (yPos > 270) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const questionLines = doc.splitTextToSize(`${idx + 1}. ${p.pregunta}`, pageWidth - (margin * 2));
    doc.text(questionLines, margin, yPos);
    yPos += (questionLines.length * 4.5);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    p.opciones.forEach((opt, oIdx) => {
      const isUserChoice = oIdx === resultado.respuestasUsuario[idx];
      const isCorrectChoice = oIdx === p.respuestaCorrecta;

      // Color coding for options (text only)
      if (isUserChoice) {
        if (isCorrectChoice) {
          doc.setTextColor(0, 120, 0); // Green if correct
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(180, 0, 0); // Red if wrong
          doc.setFont('helvetica', 'bold');
        }
      } else if (isCorrectChoice) {
        doc.setTextColor(100, 100, 100); // Gray for correct not chosen
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'normal');
      }

      const mark = isUserChoice ? (isCorrectChoice ? '[X]' : '[X]') : (isCorrectChoice ? '[ ]' : '[ ]');
      const optText = `${mark} ${opt}`;
      const optLines = doc.splitTextToSize(optText, pageWidth - (margin * 2) - 10);
      
      doc.text(optLines, margin + 4, yPos);
      
      // Indicators - Aligned to the right to avoid overlapping
      doc.setFontSize(6);
      if (isUserChoice) {
        const tag = isCorrectChoice ? '(Correcto)' : '(Tu respuesta - Incorrecto)';
        doc.text(tag, pageWidth - margin, yPos, { align: 'right' });
      } else if (isCorrectChoice) {
        doc.text('(Respuesta Correcta)', pageWidth - margin, yPos, { align: 'right' });
      }
      doc.setFontSize(8);

      yPos += (optLines.length * 3.5) + 0.5;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    });

    yPos += 3; // Spacing between questions
  });

  // Footer / Signatures
  yPos = Math.max(yPos + 5, 260); // Ensure it's at the bottom but not overlapping if content is too long
  
  if (yPos > 280) {
    doc.addPage();
    yPos = 30;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(margin + 10, yPos, margin + 65, yPos);
  doc.line(pageWidth - margin - 65, yPos, pageWidth - margin - 10, yPos);
  
  yPos += 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Firma del Alumno', margin + 37.5, yPos, { align: 'center' });
  doc.text('Firma del Evaluador', pageWidth - margin - 37.5, yPos, { align: 'center' });
  
  yPos += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(usuario.nombreCompleto, margin + 37.5, yPos, { align: 'center' });
  doc.text('Administrador', pageWidth - margin - 37.5, yPos, { align: 'center' });

  const safeUserName = usuario.nombreCompleto.replace(/\s+/g, '_');
  const safeExamTitle = resultado.examenTitulo.replace(/\s+/g, '_');
  doc.save(`Evaluacion_${safeUserName}_${safeExamTitle}.pdf`);
};
