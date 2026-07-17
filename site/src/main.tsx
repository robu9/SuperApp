import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import { track } from "@vercel/analytics";
import "./styles.css";

const RELEASE_ROOT = "https://github.com/robu9/SuperApp/releases/latest/download";
const DOWNLOADS = {
  mac: `${RELEASE_ROOT}/SuperApp-universal.dmg`,
  linux: `${RELEASE_ROOT}/SuperApp-x86_64.AppImage`,
};

type Platform = keyof typeof DOWNLOADS;

function detectedPlatform(): Platform {
  if (typeof navigator === "undefined") return "mac";
  return /Linux/i.test(navigator.userAgent) ? "linux" : "mac";
}

function DownloadLink({ platform, primary = false }: { platform: Platform; primary?: boolean }) {
  const label = platform === "mac" ? "download for macOS" : "download for Linux";
  return (
    <a
      className={primary ? "button button-primary" : "button"}
      href={DOWNLOADS[platform]}
      onClick={() => track("download", { platform, artifact: DOWNLOADS[platform].split("/").at(-1) ?? "unknown" })}
    >
      {label}
      <span aria-hidden="true">↓</span>
    </a>
  );
}

function App() {
  const platform = detectedPlatform();
  const alternate: Platform = platform === "mac" ? "linux" : "mac";

  return (
    <>
      <header className="nav shell">
        <a href="#top" className="brand" aria-label="SuperApp home">
          <img src="/logo.png" alt="" />
          <span>SuperApp</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#how">how it works</a>
          <a href="#privacy">privacy</a>
          <a href="https://github.com/robu9/SuperApp">github</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero shell">
          <div className="eyebrow">local ai workspace / 01</div>
          <h1>Your context.<br /><em>Connected.</em></h1>
          <p className="hero-copy">
            SuperApp captures the work happening on your screen and in your meetings,
            then turns it into context you can search, chat with, and act on.
          </p>
          <div className="download-row">
            <DownloadLink platform={platform} primary />
            <DownloadLink platform={alternate} />
          </div>
          <p className="fine-print">macOS universal · Linux x64 · Supermemory installs automatically</p>
        </section>

        <section className="product shell" aria-label="SuperApp product preview">
          <div className="product-bar"><span>SUPERAPP / BRAIN</span><span>LOCAL • READY</span></div>
          <div className="product-body">
            <aside>
              {['chat', 'timeline', 'pipes', 'meetings', 'brain'].map((item) => (
                <div className={item === 'brain' ? 'active' : ''} key={item}>{item}</div>
              ))}
            </aside>
            <div className="memory-preview">
              <span className="node n1">meeting</span><span className="line l1" />
              <span className="node n2">decision</span><span className="line l2" />
              <span className="node n3">project</span><span className="line l3" />
              <span className="node n4">memory</span>
              <p>YOUR WORK BECOMES A MEMORY GRAPH</p>
            </div>
          </div>
        </section>

        <section id="how" className="section shell">
          <div className="section-number">02 / HOW IT WORKS</div>
          <div className="steps">
            <article><b>01</b><h2>Capture</h2><p>Screen, audio, active windows, meetings, and the text inside your work.</p></article>
            <article><b>02</b><h2>Remember</h2><p>Supermemory runs locally and connects moments into durable context.</p></article>
            <article><b>03</b><h2>Act</h2><p>Search the timeline, ask questions, and trigger workflows from what happened.</p></article>
          </div>
        </section>

        <section id="privacy" className="privacy shell">
          <div className="section-number">03 / PRIVATE BY DEFAULT</div>
          <div>
            <h2>The memory stays<br />on your machine.</h2>
            <p>SuperApp and Supermemory run as one managed local experience. Captured data is stored on your device. Download analytics record only the selected platform and artifact—never captured content.</p>
          </div>
        </section>

        <section className="install shell">
          <div><span>macOS</span><p>Open the DMG, drag SuperApp to Applications, and launch it. Gatekeeper-compatible signed releases are published here.</p></div>
          <div><span>Linux</span><p>Download the AppImage, run <code>chmod +x SuperApp-x86_64.AppImage</code>, then open it.</p></div>
        </section>

        <section className="final-cta shell">
          <h2>Remember more.<br />Repeat less.</h2>
          <DownloadLink platform={platform} primary />
        </section>
      </main>

      <footer className="shell"><span>© {new Date().getFullYear()} SUPERAPP</span><span>BUILT FOR LOCAL CONTEXT</span></footer>
      <Analytics />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
