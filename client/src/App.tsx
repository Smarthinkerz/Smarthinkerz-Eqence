import { Switch, Route, Redirect } from "wouter";
import { I18nProvider } from "./contexts/I18nContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Inbox from "./pages/app/Inbox";
import SignIn from "./pages/app/SignIn";
import ResetPassword from "./pages/app/ResetPassword";
import Connections from "./pages/app/Connections";
import BrandVoice from "./pages/app/BrandVoice";
import Billing, { BillingReturn } from "./pages/app/Billing";
import { captureRef } from "./lib/ref";

// Keep a trainee referral code (?ref=CODE) for the Hub checkout.
captureRef();

// Old entry points lead into the product.
const retiredPaths: Record<string, string> = {
  "/login": "/app/sign-in", "/register": "/app/sign-in?mode=up", "/waitlist": "/app/sign-in?mode=up",
  "/payment": "/app/billing", "/dashboard": "/app", "/forgot-password": "/app/sign-in", "/reset-password": "/app/sign-in",
};

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/app" component={Inbox} />
      <Route path="/app/sign-in" component={SignIn} />
      <Route path="/app/reset-password" component={ResetPassword} />
      <Route path="/app/connections" component={Connections} />
      <Route path="/app/brand-voice" component={BrandVoice} />
      <Route path="/app/billing" component={Billing} />
      <Route path="/app/billing/return" component={BillingReturn} />
      {Object.entries(retiredPaths).map(([path, to]) => (
        <Route key={path} path={path}>
          <Redirect to={to} replace />
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
