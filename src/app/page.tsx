"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { calculateStandings, getOutcomeFromScore, getUserName, isMatchClosed, outcomeLabels } from "@/lib/scoring";
import {
  getCurrentUserId,
  getInitialData,
  registerUser,
  setCurrentUserId,
  upsertPrediction,
} from "@/lib/storage";
import type { AppData, Match, Prediction, User } from "@/lib/types";

type ActiveTab = "fixture" | "ranking" | "rules";

const tournamentName = "Prode Mundial 2026";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function groupMatches(matches: Match[]): Array<[string, Match[]]> {
  const groups = new Map<string, Match[]>();
  matches
    .filter((match) => match.dateVisible)
    .forEach((match) => {
      const current = groups.get(match.dateLabel) ?? [];
      groups.set(match.dateLabel, [...current, match]);
    });
  return Array.from(groups.entries());
}

export default function HomePage() {
  const [data, setData] = useState<AppData | null>(null);
  const [currentUserId, setCurrentUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("fixture");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      const initialData = await getInitialData();
      setData(initialData);
      setCurrentUser(getCurrentUserId() ?? initialData.users[0]?.id ?? null);
    }

    loadData().catch(() => {
      setMessage("No se pudo conectar con la base de datos. Revisá las variables de Supabase.");
    });
  }, []);

  const currentUser = useMemo(
    () => data?.users.find((user) => user.id === currentUserId) ?? null,
    [data, currentUserId],
  );
  const standings = useMemo(() => (data ? calculateStandings(data) : []), [data]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;

    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const area = String(form.get("area") ?? "").trim();

    if (!firstName || !lastName || !email) {
      setMessage("Completá nombre, apellido y email para continuar.");
      return;
    }

    const result = await registerUser(data, { firstName, lastName, email, area });
    setData(result.data);
    setCurrentUser(result.user.id);
    setMessage(`Listo, ${result.user.firstName}. Ya podés cargar tus pronosticos.`);
    setActiveTab("fixture");
  }

  async function handlePrediction(match: Match, homeScore: number, awayScore: number) {
    if (!data || !currentUser) return;

    if (isMatchClosed(match)) {
      setMessage("Este partido ya cerro. Los pronosticos se pueden editar hasta un minuto antes del inicio.");
      return;
    }

    setData(await upsertPrediction(data, currentUser.id, match.id, homeScore, awayScore));
    setMessage("Pronostico guardado.");
  }

  function handleUserChange(userId: string) {
    setCurrentUser(userId);
    setCurrentUserId(userId);
    setMessage("");
  }

  if (!data) {
    return (
      <div className="app-shell">
        <Header />
        <main className="page">
          <div className="message">Cargando prode...</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header />
      <main className="page">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-main">
            <div>
              <Logo size="large" />
              <h1 id="hero-title">{tournamentName}</h1>
              <p>Un prode interno simple, claro y listo para seguir el Mundial entre equipos de la empresa.</p>
            </div>
            <button className="button button-secondary" type="button" onClick={() => setActiveTab("fixture")}>
              Ingresar al prode
            </button>
          </div>

          <section className="panel" aria-labelledby="register-title">
            <div className="panel-content">
              <h2 className="section-title" id="register-title">
                Registro / acceso
              </h2>
              <p className="section-copy">
                Ingresá con tu email. Si ya existe, recuperamos tu usuario automaticamente.
              </p>
              <form className="stack" onSubmit={handleRegister}>
                <div className="grid-two">
                  <div className="field">
                    <label htmlFor="firstName">Nombre</label>
                    <input id="firstName" name="firstName" autoComplete="given-name" required />
                  </div>
                  <div className="field">
                    <label htmlFor="lastName">Apellido</label>
                    <input id="lastName" name="lastName" autoComplete="family-name" required />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="field">
                  <label htmlFor="area">Area / equipo / sector opcional</label>
                  <input id="area" name="area" />
                </div>
                <button className="button button-primary" type="submit">
                  Ingresar o registrarme
                </button>
              </form>
            </div>
          </section>
        </section>

        {message ? <div className="message message-success">{message}</div> : null}

        <section className="panel">
          <div className="panel-content">
            <div className="grid-two">
              <div>
                <h2 className="section-title">Panel participante</h2>
                <p className="section-copy">
                  {currentUser
                    ? `Estas jugando como ${getUserName(currentUser)}.`
                    : "Seleccioná o registrá un participante para cargar pronosticos."}
                </p>
              </div>
              <div className="field">
                <label htmlFor="currentUser">Participante activo</label>
                <select
                  id="currentUser"
                  value={currentUserId ?? ""}
                  onChange={(event) => handleUserChange(event.target.value)}
                >
                  {data.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserName(user)} {user.area ? `- ${user.area}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="tabs" role="tablist" aria-label="Secciones del prode">
              {[
                ["fixture", "Fixture"],
                ["ranking", "Ranking"],
                ["rules", "Reglas"],
              ].map(([tab, label]) => (
                <button
                  key={tab}
                  className={`tab ${activeTab === tab ? "tab-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab as ActiveTab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "fixture" ? (
              <Fixture data={data} currentUser={currentUser} onPredict={handlePrediction} />
            ) : null}
            {activeTab === "ranking" ? <Ranking standings={standings} /> : null}
            {activeTab === "rules" ? <Rules /> : null}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Fixture({
  data,
  currentUser,
  onPredict,
}: {
  data: AppData;
  currentUser: User | null;
  onPredict: (match: Match, homeScore: number, awayScore: number) => void;
}) {
  const groups = groupMatches(data.matches);

  if (!groups.length) {
    return <div className="message">No hay fechas visibles por ahora.</div>;
  }

  return (
    <div className="stack">
      {groups.map(([dateLabel, matches]) => (
        <section className="date-group" key={dateLabel}>
          <h3 className="date-heading">{dateLabel}</h3>
          {matches.map((match) => {
            const closed = isMatchClosed(match);
            const prediction = data.predictions.find(
              (item) => item.userId === currentUser?.id && item.matchId === match.id,
            );

            return (
              <article className="panel match-card" key={match.id}>
                <div className="match-top">
                  <div className="teams">
                    <strong>
                      {match.homeTeam} vs {match.awayTeam}
                    </strong>
                    <span className="match-time">{formatDateTime(match.startsAt)}</span>
                  </div>
                  <span className={`badge ${closed ? "badge-closed" : "badge-ok"}`}>
                    {closed ? "Cerrado" : "Abierto"}
                  </span>
                </div>

                <PredictionScoreForm
                  closed={closed}
                  currentUser={currentUser}
                  match={match}
                  onPredict={onPredict}
                  prediction={prediction}
                />
                {closed ? (
                  <div className="message message-warning">
                    Este partido ya cerro. El pronostico se podia editar hasta un minuto antes del inicio.
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function PredictionScoreForm({
  closed,
  currentUser,
  match,
  onPredict,
  prediction,
}: {
  closed: boolean;
  currentUser: User | null;
  match: Match;
  onPredict: (match: Match, homeScore: number, awayScore: number) => void;
  prediction?: Prediction;
}) {
  const [homeScore, setHomeScore] = useState(prediction?.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(prediction?.awayScore?.toString() ?? "");

  useEffect(() => {
    setHomeScore(prediction?.homeScore?.toString() ?? "");
    setAwayScore(prediction?.awayScore?.toString() ?? "");
  }, [prediction]);

  const parsedHomeScore = homeScore === "" ? null : Number(homeScore);
  const parsedAwayScore = awayScore === "" ? null : Number(awayScore);
  const hasValidScores =
    parsedHomeScore !== null &&
    parsedAwayScore !== null &&
    Number.isInteger(parsedHomeScore) &&
    Number.isInteger(parsedAwayScore) &&
    parsedHomeScore >= 0 &&
    parsedAwayScore >= 0;
  const canSave = Boolean(currentUser && !closed && hasValidScores);
  const previewOutcome =
    hasValidScores
      ? outcomeLabels[getOutcomeFromScore(parsedHomeScore, parsedAwayScore)]
      : "Completá ambos goles";

  return (
    <form
      className="score-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || parsedHomeScore === null || parsedAwayScore === null) return;
        onPredict(match, parsedHomeScore, parsedAwayScore);
      }}
    >
      <div className="score-inputs">
        <label className="score-field">
          <span>{match.homeTeam}</span>
          <input
            disabled={!currentUser || closed}
            min="0"
            step="1"
            type="number"
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
          />
        </label>
        <span className="score-separator">-</span>
        <label className="score-field">
          <span>{match.awayTeam}</span>
          <input
            disabled={!currentUser || closed}
            min="0"
            step="1"
            type="number"
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
          />
        </label>
      </div>
      <div className="score-actions">
        <span className="badge">{previewOutcome}</span>
        <button className="button button-primary" disabled={!canSave} type="submit">
          Guardar pronostico
        </button>
      </div>
    </form>
  );
}

function Ranking({ standings }: { standings: ReturnType<typeof calculateStandings> }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Posicion</th>
            <th>Participante</th>
            <th>Area / equipo</th>
            <th>Puntos</th>
            <th>Aciertos</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => (
            <tr key={standing.user.id}>
              <td>
                <span className="ranking-position">{index + 1}</span>
              </td>
              <td>{getUserName(standing.user)}</td>
              <td>{standing.user.area || "-"}</td>
              <td>
                <strong>{standing.points}</strong>
              </td>
              <td>{standing.hits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rules() {
  return (
    <div className="rules-section">
      <div>
        <h3 className="section-title">Reglas del prode</h3>
        <p className="section-copy">
          Cada participante pronostica el marcador de los partidos habilitados. Los puntos se calculan cuando el
          administrador carga el resultado final.
        </p>
      </div>

      <div className="rules-grid">
        <article className="rule-card">
          <span className="rule-points">12 pts</span>
          <h4>Marcador exacto</h4>
          <p>Acierto del resultado y de la cantidad de goles de ambos equipos.</p>
        </article>

        <article className="rule-card">
          <span className="rule-points">5 pts</span>
          <h4>Resultado correcto</h4>
          <p>Acierto de ganador o empate, aunque el marcador no sea exacto.</p>
        </article>

        <article className="rule-card">
          <span className="rule-points">2 pts</span>
          <h4>Goles de un equipo</h4>
          <p>Acierto de la cantidad de goles de uno de los equipos.</p>
        </article>
      </div>

      <div className="message">
        <strong>Cierre de pronosticos:</strong> se pueden cargar y modificar hasta un minuto antes del comienzo del
        partido. Una vez cerrado, el partido no permite cambios.
      </div>

      <div className="message">
        <strong>Ejemplo:</strong> si el resultado real es Argentina 2 - 1 Argelia y una persona pronostico 2 - 0,
        suma 5 puntos por acertar ganador y 2 puntos por acertar los goles de Argentina.
      </div>
    </div>
  );
}
