import { Switch, Route, Redirect } from "wouter";
import { I18nProvider } from "./contexts/I18nContext";
import Home from "./pages/Home";
import Waitlist from "./pages/Waitlist";
import NotFound from "./pages/NotFound";

// Eqence is pre-launch: accounts, payment and the dashboard do not exist yet,
// so every old entry point leads to the waitlist.
const retiredPaths = ["/login", "/register", "/payment", "/dashboard", "/forgot-password", "/reset-password"];

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/waitlist" component={Waitlist} />
      {retiredPaths.map((path) => (
        <Route key={path} path={path}>
          <Redirect to="/waitlist" replace />
        </Route>
      ))}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <I18nProvider>
      <Router />
    </I18nProvider>
  );
}

export default App;
