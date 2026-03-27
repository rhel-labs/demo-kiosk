// Shim: import PDF.js as an ES module and expose it as a classic-script global.
// This file is loaded as <script type="module"> so it can use ES module import syntax.
// It runs before the core app module (modules execute in document order).
import * as pdfjsLib from './pdf.min.mjs';
window.pdfjsLib = pdfjsLib;
