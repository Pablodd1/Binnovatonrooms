import { describe, it, expect } from "vitest";
import { matchVoiceCommand } from "@/lib/useVoiceCommands";

describe("matchVoiceCommand", () => {
  it("matches capture commands (capturar / tomar / foto)", () => {
    expect(matchVoiceCommand("capturar")).toBe("capturar");
    expect(matchVoiceCommand("toma la foto")).toBe("capturar");
    expect(matchVoiceCommand("foto")).toBe("capturar");
    expect(matchVoiceCommand("Captura ahora")).toBe("capturar");
  });

  it("matches analyze commands (analizar / finalizar / terminar)", () => {
    expect(matchVoiceCommand("analizar")).toBe("analizar");
    expect(matchVoiceCommand("finaliza el analisis")).toBe("analizar");
    expect(matchVoiceCommand("terminar")).toBe("analizar");
  });

  it("matches start commands (iniciar / activar)", () => {
    expect(matchVoiceCommand("iniciar camara")).toBe("iniciar");
    expect(matchVoiceCommand("activa")).toBe("iniciar");
    expect(matchVoiceCommand("empezar")).toBe("iniciar");
  });

  it("matches stop commands (detener / parar / cierra)", () => {
    expect(matchVoiceCommand("detener")).toBe("detener");
    expect(matchVoiceCommand("parar")).toBe("detener");
    expect(matchVoiceCommand("cierra camara")).toBe("detener");
    expect(matchVoiceCommand("apaga la camara")).toBe("detener");
  });

  it("stop/flip win over the camera noun (order regression)", () => {
    // "cierra cámara" must be detener, not iniciar
    expect(matchVoiceCommand("cierra camara")).toBe("detener");
    // "cambiar cámara" must be voltear, not iniciar
    expect(matchVoiceCommand("cambiar camara")).toBe("voltear");
    // bare noun "camara" alone must NOT trigger anything
    expect(matchVoiceCommand("camara")).toBeNull();
  });

  it("ignores bare preposition 'para' (false-positive guard)", () => {
    expect(matchVoiceCommand("para la proxima ronda")).toBeNull();
    expect(matchVoiceCommand("parar")).toBe("detener");
  });

  it("command verbs win over the 'fotos' noun (order regression)", () => {
    expect(matchVoiceCommand("limpia las fotos")).toBe("limpiar");
    expect(matchVoiceCommand("analiza las fotos")).toBe("analizar");
    expect(matchVoiceCommand("toma la foto")).toBe("capturar");
  });

  it("matches flip, torch, and clear commands", () => {
    expect(matchVoiceCommand("voltear camara")).toBe("voltear");
    expect(matchVoiceCommand("linterna")).toBe("linterna");
    expect(matchVoiceCommand("enciende la luz")).toBe("linterna");
    expect(matchVoiceCommand("limpia las fotos")).toBe("limpiar");
    expect(matchVoiceCommand("borrar todo")).toBe("limpiar");
  });

  it("is case-insensitive and trims filler", () => {
    expect(matchVoiceCommand("  CAPTURA  ")).toBe("capturar");
  });

  it("returns null for unrelated speech", () => {
    expect(matchVoiceCommand("hola como estas")).toBeNull();
    expect(matchVoiceCommand("")).toBeNull();
    expect(matchVoiceCommand("el muro tiene una grieta grande")).toBeNull();
  });

  it("does not match 'grieta' as a command (regression: photo content words)", () => {
    // 'grieta' contains no command word; guard against over-eager patterns
    expect(matchVoiceCommand("grieta en la pared")).toBeNull();
  });
});
