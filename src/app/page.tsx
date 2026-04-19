"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { calculateStandings, getOutcomeFromScore, getUserName, isMatchClosed, outcomeLabels } from "@/lib/scoring";
import { getSupabaseClient } from "@/lib/supabase";
import { clearCurrentUserId, getInitialData, upsertPrediction } from "@/lib/storage";
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
      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      const sessionEmail = sessionData.session?.user.email?.toLowerCase();
      const sessionUser = initialData.users.find((user) => user.email.toLowerCase() === sessionEmail);
      setData(initialData);
      setCurrentUser(sessionUser?.id ?? null);
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

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setMessage("Completá email y contraseña para continuar.");
      return;
    }

    const supabase = getSupabaseClient();

    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage("No pudimos iniciar sesión. Revisá email y contraseña.");
      return;
    }

    const nextData = await getInitialData();
    const user = nextData.users.find((item) => item.email.toLowerCase() === authData.user.email?.toLowerCase());
    if (!user) {
      await supabase.auth.signOut();
      setData(nextData);
      setCurrentUser(null);
      setMessage("Tu email tiene acceso, pero todavía falta cargar tu perfil del prode. Avisale al administrador.");
      return;
    }

    setData(nextData);
    setCurrentUser(user.id);
    setMessage(`Listo, ${user.firstName}. Ya podés cargar tus pronosticos.`);
    setActiveTab("fixture");
  }

  async function handlePrediction(match: Match, homeScore: number, awayScore: number): Promise<boolean> {
    if (!data || !currentUser) return false;

    if (isMatchClosed(match)) {
      setMessage("Este partido ya cerró. Los pronósticos se pueden editar hasta un minuto antes del inicio.");
      return false;
    }

    setData(await upsertPrediction(data, currentUser.id, match.id, homeScore, awayScore));
    setMessage("Pronóstico guardado.");
    return true;
  }

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    clearCurrentUserId();
    setCurrentUser(null);
    setMessage("Sesión cerrada. Ingresá con email y contraseña para jugar.");
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
              <span className="hero-kicker">Mundial 2026</span>
              <h1 id="hero-title">{tournamentName}</h1>
              <p>¡Bienvenidos al prode mundial 2026 para los empleados del Barrio San Sebastián!</p>
            </div>
            <div className="hero-year" aria-hidden="true">
              <span>20</span>
              <span>26</span>
            </div>
            <button className="button button-secondary" type="button" onClick={() => setActiveTab("fixture")}>
              Ingresar al prode
            </button>
          </div>

          <section className="panel" aria-labelledby="register-title">
            <div className="panel-content">
              <h2 className="section-title" id="register-title">
                Acceso de participantes
              </h2>
              <p className="section-copy">
                Ingresá con el email y la contraseña asignados por la empresa.
              </p>
              <form className="stack" onSubmit={handleAuth}>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="field">
                  <label htmlFor="password">Contraseña</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <button className="button button-primary" type="submit">
                  Ingresar
                </button>
              </form>
            </div>
          </section>
        </section>

        {message ? <div className="message message-success">{message}</div> : null}

        <section className="panel">
          <div className="panel-content">
            <ParticipantStatus currentUser={currentUser} onSignOut={handleSignOut} />

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

function ParticipantStatus({
  currentUser,
  onSignOut,
}: {
  currentUser: User | null;
  onSignOut: () => void;
}) {
  if (!currentUser) {
    return (
      <div className="participant-status participant-status-empty">
        <div>
          <h2 className="section-title">Ingresá para jugar</h2>
          <p className="section-copy">
            Usá el email y la contraseña asignados por la empresa para cargar y modificar tus pronósticos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="participant-status">
      <div>
        <span className="badge badge-ok">Participante activo</span>
        <h2 className="section-title">{getUserName(currentUser)}</h2>
        <p className="section-copy">
          {currentUser.area ? `${currentUser.area} · ` : ""}
          {currentUser.email}
        </p>
      </div>
      <button className="button button-secondary" type="button" onClick={onSignOut}>
        Cerrar sesión
      </button>
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
  onPredict: (match: Match, homeScore: number, awayScore: number) => Promise<boolean>;
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
                    Este partido ya cerró. El pronóstico se podía editar hasta un minuto antes del inicio.
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
  onPredict: (match: Match, homeScore: number, awayScore: number) => Promise<boolean>;
  prediction?: Prediction;
}) {
  const [homeScore, setHomeScore] = useState(prediction?.homeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(prediction?.awayScore?.toString() ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

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
  const canSave = Boolean(currentUser && !closed && hasValidScores && saveStatus !== "saving" && saveStatus !== "saved");
  const previewOutcome =
    hasValidScores
      ? outcomeLabels[getOutcomeFromScore(parsedHomeScore, parsedAwayScore)]
      : "Completá ambos goles";
  const buttonLabel = saveStatus === "saving" ? "Guardando..." : saveStatus === "saved" ? "Guardado" : "Guardar pronóstico";

  function handleScoreChange(setScore: (value: string) => void, value: string) {
    setScore(value);
    setSaveStatus("idle");
  }

  return (
    <form
      className="score-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || parsedHomeScore === null || parsedAwayScore === null) return;
        setSaveStatus("saving");
        const wasSaved = await onPredict(match, parsedHomeScore, parsedAwayScore);
        setSaveStatus(wasSaved ? "saved" : "idle");
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
            onChange={(event) => handleScoreChange(setHomeScore, event.target.value)}
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
            onChange={(event) => handleScoreChange(setAwayScore, event.target.value)}
          />
        </label>
      </div>
      <div className="score-actions">
        <span className="badge">{previewOutcome}</span>
        <button className={`button button-primary ${saveStatus === "saved" ? "button-saved" : ""}`} disabled={!canSave} type="submit">
          {buttonLabel}
        </button>
      </div>
      {saveStatus === "saved" ? (
        <p className="save-feedback" role="status">
          Cambios guardados para este partido.
        </p>
      ) : null}
    </form>
  );
}

function Ranking({ standings }: { standings: ReturnType<typeof calculateStandings> }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Posición</th>
            <th>Participante</th>
            <th>Área / equipo</th>
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
        <strong>Cierre de pronósticos:</strong> se pueden cargar y modificar hasta un minuto antes del comienzo del
        partido. Una vez cerrado, el partido no permite cambios.
      </div>

      <div className="message">
        <strong>Ejemplo:</strong> si el resultado real es Argentina 2 - 1 Argelia y una persona pronosticó 2 - 0,
        suma 5 puntos por acertar ganador y 2 puntos por acertar los goles de Argentina.
      </div>
    </div>
  );
}
