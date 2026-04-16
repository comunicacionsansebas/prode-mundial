"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { calculateStandings, getOutcomeFromScore, getUserName } from "@/lib/scoring";
import {
  getInitialData,
  loadGroupStageFixtures,
  updateMatch,
  updateMatchResults,
  upsertMatches,
} from "@/lib/storage";
import type { AppData, Match, MatchOutcome } from "@/lib/types";

const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN || "admin123";

function formatDateTimeLocal(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseResultsCsv(csv: string, matches: Match[]) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLines = lines[0]?.toLowerCase().includes("local") ? lines.slice(1) : lines;
  const errors: string[] = [];
  const updatedMatches: Match[] = [];

  dataLines.forEach((line, index) => {
    const [homeTeam, awayTeam, homeScoreRaw, awayScoreRaw] = parseCsvLine(line);
    const rowNumber = index + 1;
    const homeScore = Number(homeScoreRaw);
    const awayScore = Number(awayScoreRaw);

    if (!homeTeam || !awayTeam || !Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
      errors.push(`Fila ${rowNumber}: formato invalido.`);
      return;
    }

    const match = matches.find(
      (item) => normalizeText(item.homeTeam) === normalizeText(homeTeam) && normalizeText(item.awayTeam) === normalizeText(awayTeam),
    );

    if (!match) {
      errors.push(`Fila ${rowNumber}: no se encontro ${homeTeam} vs ${awayTeam}.`);
      return;
    }

    updatedMatches.push({
      ...match,
      result: {
        outcome: getOutcomeFromScore(homeScore, awayScore),
        homeScore,
        awayScore,
      },
    });
  });

  return { errors, updatedMatches };
}

function parseBoolean(value: string | undefined): boolean {
  const normalized = normalizeText(value ?? "");
  if (!normalized) return true;
  return ["true", "si", "sí", "1", "visible", "x"].includes(normalized);
}

function parseDateTime(dateValue: string, timeValue: string): string | null {
  const date = dateValue.trim();
  const time = timeValue.trim();
  if (!date || !time) return null;

  const dateParts = date.includes("/") ? date.split("/") : date.split("-");
  if (dateParts.length !== 3) return null;

  const [first, second, third] = dateParts.map(Number);
  const year = first > 1900 ? first : third;
  const month = first > 1900 ? second : second;
  const day = first > 1900 ? third : first;
  const [hour, minute = 0] = time.split(":").map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day, hour, minute).toISOString();
}

function parseFixtureCsv(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dataLines = lines[0]?.toLowerCase().includes("local") ? lines.slice(1) : lines;
  const errors: string[] = [];
  const matches: Match[] = [];

  dataLines.forEach((line, index) => {
    const [date, time, phase, homeTeam, awayTeam, visible] = parseCsvLine(line);
    const rowNumber = index + 1;
    const startsAt = parseDateTime(date, time);

    if (!startsAt || !phase || !homeTeam || !awayTeam) {
      errors.push(`Fila ${rowNumber}: formato invalido.`);
      return;
    }

    matches.push({
      id: `match-${Date.now().toString(36)}-${index}`,
      dateLabel: phase,
      dateVisible: parseBoolean(visible),
      startsAt,
      homeTeam,
      awayTeam,
    });
  });

  return { errors, matches };
}

function toGoogleSheetsCsvUrl(url: string, gid?: string): string {
  const trimmed = url.trim();
  if (!trimmed.includes("docs.google.com/spreadsheets")) return trimmed;
  if (trimmed.includes("output=csv")) return trimmed;
  const baseUrl = trimmed.replace("/pubhtml", "/pub").split("?")[0];
  return `${baseUrl}?output=csv${gid?.trim() ? `&gid=${gid.trim()}` : ""}`;
}

export default function AdminPage() {
  const [data, setData] = useState<AppData | null>(null);
  const [isAllowed, setIsAllowed] = useState(false);
  const [message, setMessage] = useState("");
  const standings = useMemo(() => (data ? calculateStandings(data) : []), [data]);

  useEffect(() => {
    getInitialData()
      .then(setData)
      .catch(() => setMessage("No se pudo conectar con Supabase. Revisá las variables de entorno."));
  }, []);

  function handleAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pin = String(form.get("pin") ?? "");
    if (pin === adminPin) {
      setIsAllowed(true);
      setMessage("Acceso administrador habilitado.");
    } else {
      setMessage("PIN incorrecto.");
    }
  }

  async function handleLoadGroupStageFixtures() {
    setData(await loadGroupStageFixtures());
    setMessage("Fase de grupos del Mundial 2026 cargada. Se limpiaron resultados y pronosticos anteriores.");
  }

  async function handleMatchSave(match: Match) {
    if (!data) return;
    setData(await updateMatch(data, match));
    setMessage("Partido actualizado y puntajes recalculados automaticamente.");
  }

  async function handleBulkResultsImport(csv: string) {
    if (!data) return;
    if (!csv.trim()) {
      setMessage("Pegá al menos una fila de resultados para importar.");
      return;
    }

    const { errors, updatedMatches } = parseResultsCsv(csv, data.matches);

    if (!updatedMatches.length) {
      setMessage(errors.length ? errors.join(" ") : "No se encontraron resultados para importar.");
      return;
    }

    setData(await updateMatchResults(updatedMatches));
    setMessage(
      `Resultados importados: ${updatedMatches.length}. ${
        errors.length ? `Filas con error: ${errors.join(" ")}` : "Ranking actualizado."
      }`,
    );
  }

  async function handleGoogleSheetsImport(url: string) {
    if (!data) return;
    if (!url.trim()) {
      setMessage("Pegá la URL publicada de Google Sheets para sincronizar.");
      return;
    }

    try {
      const csvUrl = toGoogleSheetsCsvUrl(url);
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets respondio con estado ${response.status}.`);
      }
      const csv = await response.text();
      const { errors, updatedMatches } = parseResultsCsv(csv, data.matches);

      if (!updatedMatches.length) {
        setMessage(errors.length ? errors.join(" ") : "No se encontraron resultados para importar desde Google Sheets.");
        return;
      }

      setData(await updateMatchResults(updatedMatches));
      setMessage(
        `Resultados sincronizados desde Google Sheets: ${updatedMatches.length}. ${
          errors.length ? `Filas con error: ${errors.join(" ")}` : "Ranking actualizado."
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer Google Sheets.");
    }
  }

  async function handleFixtureGoogleSheetsImport(url: string, gid: string) {
    if (!data) return;
    if (!url.trim()) {
      setMessage("Pegá la URL publicada de Google Sheets para sincronizar el fixture.");
      return;
    }

    try {
      const csvUrl = toGoogleSheetsCsvUrl(url, gid);
      const response = await fetch(csvUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets respondio con estado ${response.status}.`);
      }
      const csv = await response.text();
      const { errors, matches } = parseFixtureCsv(csv);

      if (!matches.length) {
        setMessage(errors.length ? errors.join(" ") : "No se encontraron partidos para importar desde Google Sheets.");
        return;
      }

      setData(await upsertMatches(matches));
      setMessage(
        `Partidos sincronizados desde Google Sheets: ${matches.length}. ${
          errors.length ? `Filas con error: ${errors.join(" ")}` : "Fixture actualizado."
        }`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo leer el fixture desde Google Sheets.");
    }
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="page">
        <section className="panel">
          <div className="panel-content">
            <h1 className="section-title">Panel administrador</h1>
            <p className="section-copy">
              Carga resultados, edita partidos y administra la visualizacion de fechas.
            </p>
            {message ? <div className="message message-success">{message}</div> : null}

            {!isAllowed ? (
              <form className="stack" onSubmit={handleAccess}>
                <div className="field">
                  <label htmlFor="pin">PIN administrador</label>
                  <input id="pin" name="pin" type="password" placeholder="admin123" />
                </div>
                <button className="button button-primary" type="submit">
                  Ingresar al admin
                </button>
              </form>
            ) : null}
          </div>
        </section>

        {isAllowed && data ? (
          <section className="admin-grid" style={{ marginTop: 18 }}>
            <aside className="panel">
              <div className="panel-content stack">
                <h2 className="section-title">Acciones</h2>
                <button className="button button-primary" type="button" onClick={handleLoadGroupStageFixtures}>
                  Cargar fase de grupos Mundial 2026
                </button>
                <div className="message">
                  Los puntajes se recalculan al guardar resultados. Desempate: mayor cantidad de aciertos.
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Pts</th>
                        <th>Aciertos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.slice(0, 5).map((standing) => (
                        <tr key={standing.user.id}>
                          <td>{getUserName(standing.user)}</td>
                          <td>{standing.points}</td>
                          <td>{standing.hits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </aside>

            <section className="stack">
              <BulkResultsImporter onGoogleSheetsImport={handleGoogleSheetsImport} onImport={handleBulkResultsImport} />
              <FixtureImporter onGoogleSheetsImport={handleFixtureGoogleSheetsImport} />
              {data.matches.map((match) => (
                <AdminMatchForm key={match.id} match={match} onSave={handleMatchSave} />
              ))}
            </section>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function FixtureImporter({
  onGoogleSheetsImport,
}: {
  onGoogleSheetsImport: (url: string, gid: string) => void;
}) {
  const [sheetUrl, setSheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQuUWO3K_eJDPCF5exR7XEHPB2kHDAjYvjfGXT0wu7cV9Hq-WYLJy4gqgAW3SKWzM9vExc4h7Wclp4R/pubhtml",
  );
  const [gid, setGid] = useState("");

  return (
    <section className="panel">
      <div className="panel-content stack">
        <div>
          <h2 className="section-title">Importar nuevos partidos</h2>
          <p className="section-copy">
            Usalo para octavos, cuartos, semifinales y final. La hoja debe tener columnas: fecha, hora, fase, local,
            visitante y visible.
          </p>
        </div>
        <div className="field">
          <label htmlFor="fixtureSheetUrl">URL publicada de Google Sheets</label>
          <input id="fixtureSheetUrl" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="fixtureGid">GID de la hoja opcional</label>
          <input id="fixtureGid" placeholder="Ejemplo: 123456789" value={gid} onChange={(event) => setGid(event.target.value)} />
        </div>
        <div className="message">
          Formato esperado: <strong>fecha, hora, fase, local, visitante, visible</strong>. Ejemplo:
          2026-06-29,16:00,Octavos,Argentina,Dinamarca,true.
        </div>
        <button className="button button-primary" type="button" onClick={() => onGoogleSheetsImport(sheetUrl, gid)}>
          Sincronizar fixture desde Google Sheets
        </button>
      </div>
    </section>
  );
}

function BulkResultsImporter({
  onGoogleSheetsImport,
  onImport,
}: {
  onGoogleSheetsImport: (url: string) => void;
  onImport: (csv: string) => void;
}) {
  const [csv, setCsv] = useState("");
  const [sheetUrl, setSheetUrl] = useState(
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQuUWO3K_eJDPCF5exR7XEHPB2kHDAjYvjfGXT0wu7cV9Hq-WYLJy4gqgAW3SKWzM9vExc4h7Wclp4R/pubhtml",
  );
  const example = "local,visitante,goles_local,goles_visitante\nMexico,Sudafrica,2,1\nArgentina,Argelia,1,1";

  return (
    <section className="panel">
      <div className="panel-content stack">
        <div>
          <h2 className="section-title">Importar resultados</h2>
          <p className="section-copy">
            Sincronizá desde Google Sheets o pegá resultados en formato CSV. La app busca el partido por local y
            visitante, guarda los goles y actualiza el ranking.
          </p>
        </div>
        <div className="field">
          <label htmlFor="sheetUrl">URL publicada de Google Sheets</label>
          <input id="sheetUrl" value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} />
        </div>
        <button className="button button-primary" type="button" onClick={() => onGoogleSheetsImport(sheetUrl)}>
          Sincronizar desde Google Sheets
        </button>
        <div className="field">
          <label htmlFor="resultsCsv">CSV de resultados</label>
          <textarea
            className="textarea"
            id="resultsCsv"
            placeholder={example}
            rows={6}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
          />
        </div>
        <div className="message">
          Formato esperado: <strong>local, visitante, goles_local, goles_visitante</strong>. Podés incluir o no la fila
          de encabezados.
        </div>
        <button className="button button-primary" type="button" onClick={() => onImport(csv)}>
          Importar resultados y recalcular ranking
        </button>
      </div>
    </section>
  );
}

function AdminMatchForm({ match, onSave }: { match: Match; onSave: (match: Match) => void }) {
  const [homeTeam, setHomeTeam] = useState(match.homeTeam);
  const [awayTeam, setAwayTeam] = useState(match.awayTeam);
  const [dateLabel, setDateLabel] = useState(match.dateLabel);
  const [startsAt, setStartsAt] = useState(formatDateTimeLocal(match.startsAt));
  const [dateVisible, setDateVisible] = useState(match.dateVisible);
  const [homeScore, setHomeScore] = useState(match.result?.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(match.result?.awayScore?.toString() ?? "");
  const [manualOutcome, setManualOutcome] = useState<MatchOutcome>(match.result?.outcome ?? "home");

  useEffect(() => {
    setHomeTeam(match.homeTeam);
    setAwayTeam(match.awayTeam);
    setDateLabel(match.dateLabel);
    setStartsAt(formatDateTimeLocal(match.startsAt));
    setDateVisible(match.dateVisible);
    setHomeScore(match.result?.homeScore?.toString() ?? "");
    setAwayScore(match.result?.awayScore?.toString() ?? "");
    setManualOutcome(match.result?.outcome ?? "home");
  }, [match]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedHomeScore = homeScore === "" ? undefined : Number(homeScore);
    const parsedAwayScore = awayScore === "" ? undefined : Number(awayScore);
    const hasBothScores = parsedHomeScore !== undefined && parsedAwayScore !== undefined;
    const outcome = hasBothScores ? getOutcomeFromScore(parsedHomeScore, parsedAwayScore) : manualOutcome;

    onSave({
      ...match,
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      dateLabel: dateLabel.trim(),
      startsAt: fromDateTimeLocal(startsAt),
      dateVisible,
      result:
        homeScore === "" && awayScore === ""
          ? undefined
          : {
              outcome,
              homeScore: parsedHomeScore,
              awayScore: parsedAwayScore,
            },
    });
  }

  return (
    <form className="panel admin-match" onSubmit={handleSubmit}>
      <div className="match-top">
        <div className="teams">
          <strong>
            {match.homeTeam} vs {match.awayTeam}
          </strong>
          <span className="match-time">{match.dateLabel}</span>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={dateVisible} onChange={(event) => setDateVisible(event.target.checked)} />
          Fecha visible
        </label>
      </div>

      <div className="admin-row">
        <div className="field">
          <label>Local</label>
          <input value={homeTeam} onChange={(event) => setHomeTeam(event.target.value)} required />
        </div>
        <div className="field">
          <label>Visitante</label>
          <input value={awayTeam} onChange={(event) => setAwayTeam(event.target.value)} required />
        </div>
        <div className="field">
          <label>Fecha</label>
          <input value={dateLabel} onChange={(event) => setDateLabel(event.target.value)} required />
        </div>
        <div className="field">
          <label>Inicio</label>
          <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
        </div>
      </div>

      <div className="admin-row">
        <div className="field">
          <label>Goles local</label>
          <input min="0" type="number" value={homeScore} onChange={(event) => setHomeScore(event.target.value)} />
        </div>
        <div className="field">
          <label>Goles visitante</label>
          <input min="0" type="number" value={awayScore} onChange={(event) => setAwayScore(event.target.value)} />
        </div>
        <div className="field">
          <label>Resultado sin marcador</label>
          <select value={manualOutcome} onChange={(event) => setManualOutcome(event.target.value as MatchOutcome)}>
            <option value="home">Gana local</option>
            <option value="draw">Empate</option>
            <option value="away">Gana visitante</option>
          </select>
        </div>
        <button className="button button-primary" type="submit">
          Guardar partido
        </button>
      </div>
    </form>
  );
}
