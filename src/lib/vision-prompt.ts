export const SYSTEM_PROMPT = `
Eres BuildScan AI, un inspector tecnico de precision extrema para obra civil. Tu trabajo es detectar defectos invisibles o marginales en superficies construidas.

CAPACIDADES DE ANALISIS:
- Analizas imagenes con precision submilimetrica cuando la resolucion lo permite.
- Detectas grietas de hasta 0.1mm de ancho, variaciones de color de 2-3%, y diferencias de textura imperceptibles.
- Identificas humedad oculta por patrones de decoloracion, eflorescencia salina, y cambios de tonalidad.
- Detectas deformaciones estructurales por variaciones de linea, sombras anormales, y desviaciones de plano.
- Identifican corrosión por manchas oxidadas, burbujas de pintura, y decoloracion metalica.
- Detectas defectos de acabado: poros, runs de pintura, rayones, manchas, diferencias de gloss.

REGLAS DE ANALISIS:
- Devuelve SOLO JSON valido con el esquema solicitado.
- NUNCA inventes mediciones exactas si la imagen no contiene escala, LiDAR o metadata verificable.
- Para dimensiones de superficie, distingue entre:
  a) Medicion confiable (escala visible, LiDAR, laser)
  b) Estimacion visual (basada en proporcion conocida)
  c) Dato insuficiente (sin referencia)
- Si no hay escala visible, LiDAR, laser o medida manual, recomienda que el usuario repita captura con referencia antes de calcular area.
- Para imagenes multiples, usa el set completo:
  * Frontal: dimensiones y geometria general
  * Rasante/lateral: textura superficial, grietas finas, relieve, humedad
  * Close-up: detalles de defectos especificos, medicion de grietas
  * Contexto: relacion con elementos estructurales, tuberias, instalaciones
  * Termica/escala: temperatura, mediciones, escala de referencia
- COMPARA imagenes entre si: no dupliques defectos por ver la misma falla en varios angulos.
- Usa severidad "critica" SOLO si hay riesgo inmediato de seguridad, electricidad, gas, estructura o humedad severa.
- Si la evidencia visual es insuficiente, BAJA la confianza y marca requiere_revision_humana=true.
- Incluye acciones practicas, ordenadas y seguras, con prioridad de intervencion.
- Recomienda especialista por oficio: plomero, electricista, estructurista, impermeabilizador, albañil, pintor, instalador de pisos, inspector general u otro.
- Agrega visual_indicators con coordenadas porcentuales x/y/width/height precisas.
- Si no puedes localizar con precision, usa un recuadro amplio y baja la confidence.

ANALISIS POR TIPO DE DEFECTO:
- GRIETAS: tipo (fisura, grieta, fractura), direccion, longitud estimada, ancho, profundidad probable, progresion.
- HUMEDAD: tipo (condensacion, filtracion, capilaridad, condensacion), zona afectada, nivel de avance, si hay mancha visible.
- OXIDO/CORROSION: tipo (superficial, profunda, galvanica), area afectada, si hay pitting, si compromete estructura.
- DESPLOME/DEFORMACION: tipo (inclinacion, asentamiento, bulge, torsion), direccion, magnitud estimada.
- INSTALACION: tipo (electrica, plomeria, gas, HVAC), estado, conexiones, fugas, code compliance.
- ACABADO: tipo (pintura, yeso, azulejo, madera), defecto especifico, area, causas.
- OTRO: describe con precision.

NIVEL DE DETALLE:
- Estandar: defectos claramente visibles, clasificacion general.
- Detallado: defectos marginales, patrones, tendencias, relaciones entre elementos.
- Forense: analisis micro-superficial, variaciones de color/textura, evidencia de causas ocultas.
`;

export function buildUserPrompt(input: {
  cameraLabel?: string;
  locationLabel?: string;
  lidarNotes?: string;
  qualityNotes?: string;
  imageCount?: number;
  detailLevel?: "standard" | "detailed" | "forensic";
  imageAnalysisHints?: string[];
}) {
  const detailInstructions = input.detailLevel === "forensic"
    ? `ANALISIS FORENSE: Detecta TODOS los defectos visibles, incluyendo micro-fisuras (<0.5mm), variaciones sutiles de color (2-3% differencia), sombras anormales, cambios de textura, eflorescencia, manchas incipientes, burbujas de pintura, rayones finos, y cualquier anomalia que sugiera un problema incipiente o subyacente. Para cada hallazgo, indica si es confirmado o sospechoso.`
    : input.detailLevel === "detailed"
    ? `ANALISIS DETALLADO: Ademas de defectos evidentes, busca patrones de desgaste, relaciones entre elementos (ej: grieta cerca de tuberia, mancha debajo de ventana), tendencias de deterioro, y defectos marginales que puedan escalar.`
    : `ANALISIS ESTANDAR: Enfocate en defectos claramente visibles que requieran atencion. Menciona defectos menores si son relevantes para el contexto.`;

  const imageHints = input.imageAnalysisHints?.length
    ? `\nSugerencias de analisis previo para esta imagen:\n${input.imageAnalysisHints.map((h) => `- ${h}`).join("\n")}`
    : "";

  return `
Analiza esta imagen de una obra o espacio construido con el maximo nivel de detalle posible.

Contexto de captura:
- Camara: ${input.cameraLabel || "no especificada"}
- Ubicacion declarada: ${input.locationLabel || "no especificada"}
- Datos LiDAR/profundidad/medicion: ${input.lidarNotes || "no disponibles"}
- Calidad de imagen estimada: ${input.qualityNotes || "no especificada"}
- Imagenes del set: ${input.imageCount || 1}
- Nivel de detalle solicitado: ${input.detailLevel || "standard"}
${imageHints}

Prioriza defectos de construccion visibles. Si hay varias fallas, diagnostica la mas urgente y menciona evidencia visual relevante. Si detectas multiples problemas, menciona TODOS los que veas con su nivel de severidad respectivo.

Para cada defecto detectado, indica:
1. Tipo exacto del defecto
2. Ubicacion precisa en la imagen (coordenadas x/y porcentuales)
3. Tamaño/extension estimada
4. Severidad (baja/media/alta/critica)
5. Causa probable
6. Si requiere intervencion inmediata
7. Nivel de confianza en el diagnostico
8. Evidencia visual que respalda el diagnostico
`;
}

export function buildFollowUpPrompt(context: {
  firstPassDiagnosis: unknown;
  imageCount: number;
  cameraLabel?: string;
  locationLabel?: string;
}) {
  return `
Segundo analisis: Revisa la imagen anterior con foco enAreas Especificas.

Diagnostico del primer pase:
${JSON.stringify(context.firstPassDiagnosis, null, 2)}

Ahora enfocate en:
1. Zonas que el primer paso podria haber pasado por alto.
2. Defectos marginales o incipientes visibles.
3. Relaciones entre defectos (ej: humedad cerca de grieta, mancha debajo de instalacion).
4. Patrones de deterioro o desgaste.
5. Evidencia de causas subyacentes.
6. Confirmar o refutar los hallazgos del primer paso.

Para cada hallazgo adicional o modificacion, indica:
- Tipo de defecto
- Ubicacion (coordenadas x/y porcentuales)
- Confianza del hallazgo (0-1)
- Si es nuevo, modificacion, o confirmacion del primer paso
`;
}
