"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { calculateStandings, getOutcomeFromScore, getUserName, isMatchClosed, outcomeLabels, scorePrediction } from "@/lib/scoring";
import { getSupabaseClient } from "@/lib/supabase";
import { clearCurrentUserId, getInitialData, upsertPrediction } from "@/lib/storage";
import type { AppData, Match, Prediction, User } from "@/lib/types";

type ActiveTab = "fixture" | "ranking" | "rules" | "prizes";
type FixtureFilter = "all" | "pending";

const tournamentName = "Prode Mundial 2026";
const finishedNotice =
  "¡Este prode ya finalizó! Pronto nos estaremos contactando con los ganadores. ¡Muchas gracias por participar!";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFinalResult(match: Match): string | null {
  if (!match.result || match.result.homeScore === undefined || match.result.awayScore === undefined) {
    return null;
  }

  return `${match.homeTeam} ${match.result.homeScore} - ${match.result.awayScore} ${match.awayTeam}`;
}

function formatPredictionScore(prediction: Prediction): string | null {
  if (prediction.homeScore === undefined || prediction.awayScore === undefined) {
    return null;
  }

  return `${prediction.homeScore} - ${prediction.awayScore}`;
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getDateLabelSuffix(label: string): string {
  const separator = " - ";
  const index = label.indexOf(separator);
  if (index >= 0) return label.slice(index);

  const normalized = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["fase de grupos", "grupos", "octavos", "cuartos", "semis", "semifinales", "final"].includes(normalized)) {
    return ` - ${label}`;
  }

  return "";
}

function isRoundOf16Match(match: Match): boolean {
  const normalized = match.dateLabel
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized.includes("16vos");
}

function filterFinishedTournamentData(data: AppData): AppData {
  const matches = data.matches.filter((match) => !isRoundOf16Match(match));
  const matchIds = new Set(matches.map((match) => match.id));

  return {
    users: data.users,
    matches,
    predictions: data.predictions.filter((prediction) => matchIds.has(prediction.matchId)),
  };
}

function formatGroupDateLabel(match: Match): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Buenos_Aires",
  }).formatToParts(new Date(match.startsAt));

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const suffix = getDateLabelSuffix(match.dateLabel);

  return `${toTitleCase(weekday)} ${day} de ${month}${suffix}`;
}

function groupMatches(matches: Match[]): Array<[string, Match[]]> {
  const groups = new Map<string, Match[]>();
  matches
    .filter((match) => match.dateVisible)
    .forEach((match) => {
      const dateLabel = formatGroupDateLabel(match);
      const current = groups.get(dateLabel) ?? [];
      groups.set(dateLabel, [...current, match]);
    });
  return Array.from(groups.entries());
}

export default function HomePage() {
  const [data, setData] = useState<AppData | null>(null);
  const [currentUserId, setCurrentUser] = useState<string | null>(null);
  const [hasChangedPassword, setHasChangedPassword] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("fixture");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function loadData() {
      const initialData = await getInitialData();
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionEmail = sessionData.session?.user.email?.toLowerCase();
      const sessionUser = initialData.users.find((user) => user.email.toLowerCase() === sessionEmail);
      setData(initialData);
      setCurrentUser(sessionUser?.id ?? null);
      setHasChangedPassword(Boolean(sessionData.session?.user.user_metadata?.passwordChanged));

      const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event !== "PASSWORD_RECOVERY") return;

        const nextData = await getInitialData();
        const recoveryEmail = session?.user.email?.toLowerCase();
        const recoveryUser = nextData.users.find((user) => user.email.toLowerCase() === recoveryEmail);
        setData(nextData);
        setCurrentUser(recoveryUser?.id ?? null);
        setHasChangedPassword(Boolean(session?.user.user_metadata?.passwordChanged));
        setIsPasswordRecovery(true);
        setMessage("Ingresá una nueva contraseña para recuperar tu acceso.");
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    }

    loadData().catch(() => {
      setMessage("No se pudo conectar con la base de datos. Revisá las variables de Supabase.");
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const currentUser = useMemo(
    () => data?.users.find((user) => user.id === currentUserId) ?? null,
    [data, currentUserId],
  );
  const visibleData = useMemo(() => (data ? filterFinishedTournamentData(data) : null), [data]);
  const standings = useMemo(() => (visibleData ? calculateStandings(visibleData) : []), [visibleData]);

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
    setHasChangedPassword(Boolean(authData.user.user_metadata?.passwordChanged));
    setMessage(`Listo, ${user.firstName}. Ya podés revisar tus pronósticos.`);
    setActiveTab("fixture");
  }

  async function handleForgotPassword() {
    const email = loginEmail.trim();
    if (!email) {
      setMessage("Ingresá tu email y después tocá Olvidé mi contraseña.");
      return;
    }

    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) {
      setMessage("No pudimos enviar el mail de recuperación. Revisá el email ingresado.");
      return;
    }

    setMessage("Te enviamos un email para recuperar tu contraseña.");
  }

  async function handlePrediction(match: Match, homeScore: number, awayScore: number): Promise<boolean> {
    if (!data || !currentUser) return false;

    if (isMatchClosed(match)) {
      setMessage("Este partido ya cerró. Los pronósticos se podían editar hasta un minuto antes del inicio.");
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
    setHasChangedPassword(false);
    setIsPasswordRecovery(false);
    setMessage("Sesión cerrada. Ingresá con email y contraseña para consultar tu cuenta.");
  }

  async function handlePasswordChange(newPassword: string): Promise<boolean> {
    if (newPassword.length < 6) {
      return false;
    }

    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: {
        ...(userData.user?.user_metadata ?? {}),
        passwordChanged: true,
      },
    });
    if (error) {
      return false;
    }

    setHasChangedPassword(true);
    setIsPasswordRecovery(false);
    return true;
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
        <section className={`hero ${currentUser ? "hero-authenticated" : ""}`} aria-labelledby="hero-title">
          <div className="hero-main">
            <div>
              <span className="hero-kicker">Mundial 2026</span>
              <h1 id="hero-title">{tournamentName}</h1>
              <p>¡Bienvenidos al prode mundial 2026 para los empleados del Barrio San Sebastián!</p>
            </div>
            {!currentUser ? (
              <button className="button button-secondary" type="button" onClick={() => setActiveTab("fixture")}>
                Ingresar al prode
              </button>
            ) : null}
          </div>

          {!currentUser ? (
            <section className="panel" aria-labelledby="register-title">
              <div className="panel-content">
                <h2 className="section-title" id="register-title">
                  Acceso de participantes
                </h2>
                <p className="section-copy">Ingresá con el email y la contraseña asignados por la empresa.</p>
                <form className="stack" onSubmit={handleAuth}>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      required
                    />
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
                  <button className="link-button" type="button" onClick={handleForgotPassword}>
                    Olvidé mi contraseña
                  </button>
                </form>
              </div>
            </section>
          ) : null}
        </section>

        <div className="message message-success">
          <strong>{finishedNotice}</strong>
        </div>

        {message ? <div className="message message-success">{message}</div> : null}

        <section className="panel">
          <div className="panel-content">
            <ParticipantStatus
              currentUser={currentUser}
              hasChangedPassword={hasChangedPassword}
              isPasswordRecovery={isPasswordRecovery}
              onPasswordChange={handlePasswordChange}
              onSignOut={handleSignOut}
            />

            <div className="tabs" role="tablist" aria-label="Secciones del prode">
              {[
                ["fixture", "Fixture"],
                ["ranking", "Ranking"],
                ["rules", "Reglas"],
                ["prizes", "Premios"],
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

            {activeTab === "fixture" && visibleData ? (
              <Fixture data={visibleData} currentUser={currentUser} onPredict={handlePrediction} />
            ) : null}
            {activeTab === "ranking" ? <Ranking standings={standings} /> : null}
            {activeTab === "rules" ? <Rules /> : null}
            {activeTab === "prizes" ? <Prizes /> : null}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ParticipantStatus({
  currentUser,
  hasChangedPassword,
  isPasswordRecovery,
  onPasswordChange,
  onSignOut,
}: {
  currentUser: User | null;
  hasChangedPassword: boolean;
  isPasswordRecovery: boolean;
  onPasswordChange: (newPassword: string) => Promise<boolean>;
  onSignOut: () => void;
}) {
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (isPasswordRecovery) {
      setIsChangingPassword(true);
      setPasswordMessage("");
      setPasswordStatus("idle");
    }
  }, [isPasswordRecovery]);

  if (!currentUser) {
    return (
      <div className="participant-status participant-status-empty">
        <div>
          <h2 className="section-title">El prode ya finalizó</h2>
          <p className="section-copy">
            Usá tu email y la contraseña asignados por la empresa para revisar tu cuenta, el ranking final y los
            resultados del fixture.
          </p>
          <ul className="intro-list">
            <li>El torneo cerró con la fase de grupos.</li>
            <li>Ya no se pueden cargar ni modificar pronósticos.</li>
            <li>En Ranking podés ver la tabla final.</li>
            <li>En Premios podés consultar lo definido para los ganadores.</li>
          </ul>
          <p className="section-copy">Gracias por haber participado y compartido esta experiencia con todo el equipo.</p>
        </div>
      </div>
    );
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const repeatPassword = String(form.get("repeatPassword") ?? "");

    if (newPassword.length < 6) {
      setPasswordMessage("La contraseña debe tener al menos 6 caracteres.");
      setPasswordStatus("idle");
      return;
    }

    if (newPassword !== repeatPassword) {
      setPasswordMessage("Las contraseñas no coinciden.");
      setPasswordStatus("idle");
      return;
    }

    setPasswordStatus("saving");
    setPasswordMessage("");
    const wasChanged = await onPasswordChange(newPassword);
    if (wasChanged) {
      event.currentTarget.reset();
      setPasswordMessage("Contraseña cambiada correctamente.");
      setPasswordStatus("saved");
    } else {
      setPasswordMessage("No pudimos cambiar la contraseña. Intentá nuevamente.");
      setPasswordStatus("idle");
    }
  }

  function resetPasswordEdition() {
    setIsChangingPassword(false);
    setPasswordMessage("");
    setPasswordStatus("idle");
  }

  function handlePasswordInputChange() {
    if (passwordStatus !== "idle") {
      setPasswordStatus("idle");
      setPasswordMessage("");
    }
  }

  return (
    <div className="participant-card">
      <div className="participant-status">
        <div>
          <span className="badge badge-ok">Participante activo</span>
          <h2 className="section-title">{getUserName(currentUser)}</h2>
          <p className="section-copy">
            {currentUser.area ? `${currentUser.area} · ` : ""}
            {currentUser.email}
          </p>
        </div>
        <div className="participant-actions">
          {!hasChangedPassword || isPasswordRecovery ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setIsChangingPassword((value) => !value);
                setPasswordMessage("");
                setPasswordStatus("idle");
              }}
            >
              {isPasswordRecovery ? "Crear nueva contraseña" : "Cambiar contraseña"}
            </button>
          ) : (
            <span className="badge badge-ok">Contraseña actualizada</span>
          )}
          <button className="button button-secondary" type="button" onClick={onSignOut}>
            Cerrar sesión
          </button>
        </div>
      </div>
      {isChangingPassword && (!hasChangedPassword || isPasswordRecovery) ? (
        <form className="password-panel" onSubmit={handlePasswordSubmit}>
          <div className="grid-two">
            <div className="field">
              <label htmlFor="newPassword">Nueva contraseña</label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                onChange={handlePasswordInputChange}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="repeatPassword">Repetir contraseña</label>
              <input
                id="repeatPassword"
                name="repeatPassword"
                type="password"
                autoComplete="new-password"
                onChange={handlePasswordInputChange}
                required
              />
            </div>
          </div>
          <div className="password-actions">
            <button
              className={`button button-primary ${passwordStatus === "saved" ? "button-saved" : ""}`}
              disabled={passwordStatus === "saving" || passwordStatus === "saved"}
              type="submit"
            >
              {passwordStatus === "saving"
                ? "Guardando..."
                : passwordStatus === "saved"
                  ? "Guardado"
                  : "Guardar nueva contraseña"}
            </button>
            <button className="button button-secondary" type="button" onClick={resetPasswordEdition}>
              Cancelar
            </button>
          </div>
          {passwordMessage ? <p className="save-feedback">{passwordMessage}</p> : null}
        </form>
      ) : null}
      {!isChangingPassword && passwordMessage ? <p className="save-feedback">{passwordMessage}</p> : null}
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
  const [fixtureFilter, setFixtureFilter] = useState<FixtureFilter>("all");
  const visibleMatches = data.matches.filter((match) => match.dateVisible);
  const groups = groupMatches(visibleMatches);
  const userPredictions = currentUser
    ? data.predictions.filter(
        (prediction) =>
          prediction.userId === currentUser.id && visibleMatches.some((match) => match.id === prediction.matchId),
      )
    : [];
  const predictedCount = userPredictions.length;
  const filteredGroups =
    fixtureFilter === "pending" && currentUser
      ? groups
          .map(
            ([dateLabel, matches]) =>
              [
                dateLabel,
                matches.filter(
                  (match) =>
                    !data.predictions.some(
                      (prediction) => prediction.userId === currentUser.id && prediction.matchId === match.id,
                    ),
                ),
              ] as [string, Match[]],
          )
          .filter(([, matches]) => matches.length > 0)
      : groups;

  return (
    <div className="stack">
      <div className="message">
        <strong>Prode finalizado:</strong> el torneo cerró con la fase de grupos. El fixture y el ranking quedan
        disponibles solo como consulta.
      </div>
      <div className="fixture-summary">
        <div>
          <h3 className="section-title">Tus pronósticos</h3>
          <p className="section-copy">
            {currentUser
              ? `Cargaste ${predictedCount} de ${visibleMatches.length}.`
              : "Ingresá para ver tus pronósticos cargados."}
          </p>
        </div>
        <div className="filter-tabs" aria-label="Filtro de partidos">
          <button
            className={`tab ${fixtureFilter === "all" ? "tab-active" : ""}`}
            type="button"
            onClick={() => setFixtureFilter("all")}
          >
            Todos
          </button>
          <button
            className={`tab ${fixtureFilter === "pending" ? "tab-active" : ""}`}
            disabled={!currentUser}
            type="button"
            onClick={() => setFixtureFilter("pending")}
          >
            Pendientes
          </button>
        </div>
      </div>

      {!groups.length ? (
        <div className="message">No hay fechas visibles por ahora.</div>
      ) : !filteredGroups.length ? (
        <div className="message message-success">No tenés partidos pendientes para pronosticar.</div>
      ) : null}

      {filteredGroups.map(([dateLabel, matches]) => (
        <section className="date-group" key={dateLabel}>
          <h3 className="date-heading">{dateLabel}</h3>
          {matches.map((match) => {
            const closed = isMatchClosed(match);
            const prediction = data.predictions.find(
              (item) => item.userId === currentUser?.id && item.matchId === match.id,
            );
            const finalResult = formatFinalResult(match);
            const predictionScore = prediction ? formatPredictionScore(prediction) : null;
            const earnedPoints = prediction && match.result ? scorePrediction(prediction, match) : null;

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
                  {prediction ? <span className="badge badge-ok">Ya pronosticado</span> : null}
                </div>

                {finalResult ? (
                  <div className="message">
                    <strong>Resultado final:</strong> {finalResult}
                    {predictionScore ? (
                      <>
                        <br />
                        <strong>Tu pronóstico:</strong> {predictionScore}
                      </>
                    ) : null}
                    {earnedPoints !== null ? (
                      <>
                        <br />
                        <strong>Puntos obtenidos:</strong> {earnedPoints}
                      </>
                    ) : null}
                  </div>
                ) : null}

                <PredictionScoreForm
                  closed={closed}
                  currentUser={currentUser}
                  match={match}
                  onPredict={onPredict}
                  prediction={prediction}
                />
                <div className="message message-warning">
                  Este prode ya finalizó. Los pronósticos quedaron cerrados y se muestran solo como referencia.
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function PredictionScoreForm({
  currentUser,
  match,
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
  const previewOutcome =
    hasValidScores
      ? outcomeLabels[getOutcomeFromScore(parsedHomeScore, parsedAwayScore)]
      : prediction
        ? "Pronóstico cargado"
        : "Sin pronóstico";

  return (
    <form className="score-form" onSubmit={(event) => event.preventDefault()}>
      <div className="score-inputs">
        <label className="score-field">
          <span>{match.homeTeam}</span>
          <input
            disabled
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
            disabled
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
        <button className="button button-secondary" disabled type="button">
          Prode finalizado
        </button>
      </div>
    </form>
  );
}

function Ranking({ standings }: { standings: ReturnType<typeof calculateStandings> }) {
  return (
    <div className="stack">
      <div className="message">
        La posición en el ranking se define primero por <strong>puntos totales</strong>. Si dos participantes tienen
        los mismos puntos, queda arriba quien tenga más <strong>aciertos</strong> (partidos en los que sumó puntos).
      </div>
      <div className="message message-success">
        <strong>Ranking final del prode:</strong> esta tabla corresponde al cierre de la fase de grupos.
      </div>
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
    </div>
  );
}

function Rules() {
  return (
    <div className="rules-section">
      <div>
        <h3 className="section-title">Reglas del prode</h3>
        <p className="section-copy">
          El prode finalizó con la fase de grupos. Esta sección queda disponible como referencia sobre cómo se calculó
          el ranking final.
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
        <strong>Cierre de pronósticos:</strong> se podían cargar y modificar hasta un minuto antes del comienzo del
        partido.
      </div>

      <div className="message">
        <strong>Ejemplo:</strong> si el resultado real era Argentina 2 - 1 Argelia y una persona pronosticó 2 - 0,
        sumaba 5 puntos por acertar ganador y 2 puntos por acertar los goles de Argentina.
      </div>
    </div>
  );
}

function Prizes() {
  return (
    <div className="rules-section">
      <div>
        <h3 className="section-title">Premios</h3>
        <p className="section-copy">Estos fueron los premios definidos para el prode.</p>
      </div>

      <div className="rules-grid">
        <article className="rule-card">
          <span className="rule-points">1° premio</span>
          <h4>Camiseta titular de Argentina + pelota del Mundial 2026</h4>
          <p>Para quien termine en el primer puesto del ranking general.</p>
        </article>

        <article className="rule-card">
          <span className="rule-points">2° premio</span>
          <h4>Camiseta titular de Argentina</h4>
          <p>Para quien termine en el segundo puesto del ranking general.</p>
        </article>

        <article className="rule-card">
          <span className="rule-points">3° premio</span>
          <h4>Camiseta suplente de Argentina</h4>
          <p>Para quien termine en el tercer puesto del ranking general.</p>
        </article>
      </div>

      <div className="message">Gracias a todo el equipo por haber participado en esta edición del prode.</div>
    </div>
  );
}
