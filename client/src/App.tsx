import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Redirect } from "wouter";
import { I18nProvider } from "./contexts/I18nContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
// The signed-in app and the admin pages load on demand, so visitors to the public
// site do not download them.
const page = <T extends Record<string, ComponentType<any>>>(load: () => Promise<T>, name: keyof T) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const appPages = () => import("./pages/app/pages");
const Inbox = page(appPages, "Inbox");
const SignIn = page(appPages, "SignIn");
const ResetPassword = page(appPages, "ResetPassword");
const Connections = page(appPages, "Connections");
const BrandVoice = page(appPages, "BrandVoice");
const Billing = page(appPages, "Billing");
const BillingReturn = page(appPages, "BillingReturn");
const Account = page(appPages, "Account");
const Sequences = page(appPages, "Sequences");
const Comments = page(appPages, "Comments");
const Leads = page(appPages, "Leads");
const Customers = page(appPages, "Customers");
const adminPages = () => import("./pages/app/adminPages");
const AdminContent = page(adminPages, "AdminContent");
const AdminDashboard = page(adminPages, "AdminDashboard");
const AdminUsers = page(adminPages, "AdminUsers");
const AdminAudit = page(adminPages, "AdminAudit");
const AdminSecurity = page(adminPages, "AdminSecurity");
const AdminSystem = page(adminPages, "AdminSystem");
const AdminBlog = page(adminPages, "AdminBlog");
const AdminBlogEdit = page(adminPages, "AdminBlogEdit");
import Blog, { BlogPost } from "./pages/Blog";
import Legal from "./pages/Legal";
import { About, Contact, Demo, Faq } from "./pages/InfoPages";
import { usePageMeta } from "./lib/pageMeta";
import { captureRef } from "./lib/ref";

// Keep a trainee referral code (?ref=CODE) for the Hub checkout.
captureRef();

// Old entry points lead into the product.
const retiredPaths: Record<string, string> = {
  "/login": "/app/sign-in", "/register": "/app/sign-in?mode=up", "/waitlist": "/app/sign-in?mode=up",
  "/payment": "/app/billing", "/dashboard": "/app", "/forgot-password": "/app/sign-in", "/reset-password": "/app/sign-in",
};

function Router() {
  usePageMeta();
  return (
    <Suspense fallback={<div className="min-h-screen" aria-busy="true" />}>
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
      {/* /pricing opens the home page at its plans, so the prices live in one place. */}
      <Route path="/pricing"><Home section="pricing" /></Route>
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/demo" component={Demo} />
      <Route path="/faq" component={Faq} />
      {Object.entries(retiredPaths).map(([path, to]) => (
        <Route key={path} path={path}>
          <Redirect to={to} replace />
        </Route>
      ))}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
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
