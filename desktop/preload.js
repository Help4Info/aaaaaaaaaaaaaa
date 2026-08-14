// Pont sécurisé entre le processus de rendu (interface web) et Electron.
// Actuellement minimal ; sert de point d'extension pour les fonctionnalités
// bureau (ex. collage global du texte dans l'application active).
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("flowwhisper", {
  isDesktop: true,
  platform: process.platform,
  version: "1.0.0",
});
