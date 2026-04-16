import Link from "next/link";
import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          <Logo />
          <div className="brand-copy">
            <p className="brand-title">Prode Mundial</p>
            <p className="brand-subtitle">Uso interno de la empresa</p>
          </div>
        </Link>
        <nav className="header-actions" aria-label="Navegacion principal">
          <Link className="button button-secondary" href="/">
            Participantes
          </Link>
          <Link className="button button-soft" href="/admin">
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
