export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__copyright">
        <span>© {year} SQLi Academy. All rights reserved.</span>
        <span>Created by Navaf PT.</span>
      </div>
      <div className="footer__links" aria-label="Author profiles">
        <a href="https://github.com/navaf-pt" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://www.linkedin.com/in/navaf-pt/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </footer>
  );
}
