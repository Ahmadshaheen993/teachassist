import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import GeneratePlan from "./pages/GeneratePlan";
import MyPlans from "./pages/MyPlans";
import Selections from "./pages/Selections";
import Resources from "./pages/Resources";
import Referrals from "./pages/Referrals";
import Subscription from "./pages/Subscription";
import Admin from "./pages/Admin";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/generate"} component={GeneratePlan} />
      <Route path={"/my-plans"} component={MyPlans} />
      <Route path={"/selections"} component={Selections} />
      <Route path={"/resources"} component={Resources} />
      <Route path={"/referrals"} component={Referrals} />
      <Route path={"/subscription"} component={Subscription} />
      <Route path={"/admin"} component={Admin} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-center" dir="rtl" />
          <DashboardLayout>
            <Router />
          </DashboardLayout>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
