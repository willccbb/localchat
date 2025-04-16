import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./App.css";

// Apply base styles directly
// document.documentElement.classList.add('dark'); // Removed forced dark mode
document.body.classList.add('font-sans', 'bg-background', 'text-foreground');

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
