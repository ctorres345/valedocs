# Changelog / Historial de cambios

Todas las versiones de Valedocs, de la más nueva a la más antigua. All Valedocs versions, newest first.
The format follows [Keep a Changelog](https://keepachangelog.com) and the versions follow
[Semantic Versioning](https://semver.org). How to publish one: [docs/RELEASING.md](docs/RELEASING.md).

## [1.0.0] - 2026-10-26

### Español

Primera versión pública y de código abierto (licencia Apache-2.0). Valedocs nació para ayudar a mi madre a
registrar notas; ahora puede usarlo cualquier docente.

**Qué trae**

- **Importar alumnos** desde el Excel de un profesor: solo los nombres, rápido, sin cargar imágenes ni archivos
  lentos. Eliges qué hojas (clases) te tocan.
- **Cuatro reportes** con el mismo diseño que los de papel:
  - Reporte de conducta (AD, A, B, C) con nota especial por alumno (por ejemplo, traslado).
  - Asistencia mensual (A, T, F, J, U), con resumen en Observaciones y taller por alumno.
  - Normas mensuales: un documento Word o PDF por alumno y mes, con los párrafos editables.
  - Normas del trimestre: tres tiras por hoja A4 con la nota sugerida desde el promedio mensual.
- **Consolidado de faltas y tardanzas** calculado solo con la asistencia que ya marcaste.
- **Exportar** a Excel, PDF o Word. Hojas en blanco para anotar a mano durante el trimestre.
- **Pensado para quien no es técnico:** botones grandes, guía de 3 pasos, textos en español sencillo, letra
  grande y modo noche, teclado en el escritorio y botones táctiles en el celular.
- **Tus datos no salen de tu dispositivo.** Se guardan solos en el navegador; copia de seguridad y restaurar.
- **Paquete del colegio:** guarda y carga el nombre del colegio, los textos y los logos de tu reporte en un
  archivo, sin alumnos.
- **Logo nuevo:** la huella de Vale (la perrita del autor) sobre una hoja de reporte, con íconos para el celular
  y vista previa al compartir el enlace.

**Cambios al preparar el código abierto**

- Los textos por defecto son genéricos y la versión pública no incluye logos de ningún colegio.
- Documentación en español e inglés, capturas de pantalla, guía para contribuir, política de seguridad y
  documentos de arquitectura y diseño.
- Pruebas automáticas y revisión de reglas de importación en cada cambio (Node 16 y 22).

**Si usabas Valedocs antes:** tus datos y logos siguen en tu navegador. Abre la aplicación una vez en cada
dispositivo, y mantén la misma dirección web.

### English

First public, open source release (Apache-2.0 licence). Valedocs started as a tool to help my mother register
grades; now any teacher can use it.

**What it does**

- **Import students** from a teacher's Excel file: names only, fast, no images or slow files loaded. You pick
  which sheets (classes) are yours.
- **Four reports** that match the paper ones:
  - Conduct report (AD, A, B, C) with a per-student special note (for example, a transfer).
  - Monthly attendance (A, T, F, J, U), with an Observaciones summary and a workshop per student.
  - Monthly norms: one Word or PDF document per student and month, with editable paragraphs.
  - Quarter norms: three strips per A4 sheet with the grade suggested from the monthly average.
- **Consolidated absences and tardies** computed only from the attendance you already marked.
- **Export** to Excel, PDF or Word. Blank sheets to annotate by hand during the term.
- **Built for non-technical users:** big buttons, a 3-step guide, plain Spanish, larger text and night mode,
  keyboard on desktop and touch buttons on phones.
- **Your data never leaves your device.** It autosaves in the browser; backup and restore.
- **School pack:** save and load your school name, texts and logos in one file, without students.
- **New logo:** the paw of Vale (the author's dog) on a report sheet, with phone icons and a link preview image.

**Changes while preparing the open source release**

- Default texts are generic and the public build bundles no school logos.
- Documentation in Spanish and English, screenshots, contributing guide, security policy, architecture and
  design documents.
- Automated tests and import-rule checks on every change (Node 16 and 22).

**If you used Valedocs before:** your data and logos stay in your browser. Open the app once on each device and
keep using the same web address.

[1.0.0]: https://github.com/ctorres345/valedocs/releases/tag/v1.0.0
