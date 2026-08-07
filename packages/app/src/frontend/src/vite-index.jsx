import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Renderer crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            padding: 24,
            color: "#111827",
            background: "#f9fafb",
            fontFamily: "Arial, sans-serif",
          }}
        >
          <h1 style={{ marginBottom: 12, fontSize: 22 }}>
            Renderer error
          </h1>
          <p style={{ marginBottom: 12 }}>
            The frontend crashed while loading.
          </p>
          <pre
            style={{
              maxWidth: "100%",
              overflow: "auto",
              padding: 16,
              background: "#111827",
              color: "#f9fafb",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error?.stack || this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
