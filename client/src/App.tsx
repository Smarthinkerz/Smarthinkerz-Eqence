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
import AdminContent from "./pages/app/AdminContent";
import AdminDashboard from "./pages/app/AdminDashboard";
import AdminUsers from "./pages/app/AdminUsers";
import { AdminAudit, AdminSecurity, AdminSystem } from "./pages/app/AdminOps";
import Account from "./pages/app/Account";
import Sequences from "./pages/app/Sequences";
import Comments from "./pages/app/Comments";
import Leads from "./pages/app/Leads";
import Customers from "./pages/app/Customers";
import AdminBlog, { AdminBlogEdit } from "./pages/app/AdminBlog";
import Blog, { BlogPost } from "./pages/Blog";
import Legal from "./pages/Legal";
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
      {/* The negative-review alert email links here. */}
      <Route path="/app/inbox" component={Inbox} />
      <Route path="/app/sign-in" component={SignIn} />
      <Route path="/app/reset-password" component={ResetPassword} />
      <Route path="/app/connections" component={Connections} />
      <Route path="/app/brand-voice" component={BrandVoice} />
      <Route path="/app/comments" component={Comments} />
      <Route path="/app/leads" component={Leads} />
      <Route path="/app/customers" component={Customers} />
      <Route path="/app/sequences" component={Sequences} />
      <Route path="/app/account" component={Account} />
      <Route path="/app/billing" component={Billing} />
      <Route path="/app/billing/return" component={BillingReturn} />
      <Route path="/app/admin" component={AdminDashboard} />
      <Route path="/app/admin/content" component={AdminContent} />
      <Route path="/app/admin/blog" component={AdminBlog} />
      <Route path="/app/admin/users" component={AdminUsers} />
      <Route path="/app/admin/audit" component={AdminAudit} />
      <Route path="/app/admin/security" component={AdminSecurity} />
      <Route path="/app/admin/system" component={AdminSystem} />
      <Route path="/app/admin/blog/:id" component={AdminBlogEdit} />
      <Route path="/blog" component={Blog} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/privacy" component={Legal} />
      <Route path="/terms" component={Legal} />
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
